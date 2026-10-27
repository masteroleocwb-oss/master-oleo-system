// Camada de serviço: toda leitura sensível e toda escrita passam por aqui.
// Ela aplica as permissões (não basta esconder botões), registra a trilha de
// auditoria e é o lugar que, no produto final, vira Security Rules + funções de servidor.
import { SERVICOS } from '../domain/catalogo';
import { fotosAtivasDoItem, novoChecklist, pendenciasParaConcluir, registrarItem, validarItem, type DadosItem, type Pendencia } from '../domain/checklist';
import { aprovarVersao, descartarRascunho, proporVersao, transicaoOcorrencia, type AcaoOcorrencia } from '../domain/gestao';
import { exigir, ErroPermissao, pode } from '../domain/permissions';
import type {
  Cambio, Checklist, Cliente, DB, EstadoItem, Evento, ItemInspecaoDef, Meta, Ocorrencia, OrdemServico, OrigemIntervalo,
  Role, ServicoKey, ServicoOS, SituacaoOportunidade, Usuario, Veiculo,
} from '../domain/types';
import { addDias, agoraISO, diaKey, fmtPlaca, hojeKey, novoId, novoToken, normalizarPlaca, placaValida, primeiroNome } from '../domain/util';
import { getDB, mutarSemLatencia, transacao } from './store';

export class ErroValidacao extends Error {
  constructor(msg: string, public pendencias: Pendencia[] = []) { super(msg); this.name = 'ErroValidacao'; }
}

const evento = (d: DB, por: string, tipo: string, entidade: string, entidadeId: string, resumo: string, extra: Partial<Evento> = {}) => {
  d.eventos.push({ id: novoId('evt'), em: agoraISO(), por, tipo, entidade, entidadeId, resumo, ...extra });
};

const osPorId = (d: DB, id: string) => { const o = d.os.find(x => x.id === id); if (!o) throw new ErroValidacao('OS não encontrada.'); return o; };
const ckPorId = (d: DB, id: string) => { const c = d.checklists.find(x => x.id === id); if (!c) throw new ErroValidacao('Checklist não encontrado.'); return c; };
const veicPorId = (d: DB, id: string) => { const v = d.veiculos.find(x => x.id === id); if (!v) throw new ErroValidacao('Veículo não encontrado.'); return v; };

const exigirExecutor = (u: Usuario, os: OrdemServico) => {
  exigir(u, 'os.executar');
  if (os.mecanicoId !== u.id) throw new ErroPermissao('os.executar', 'Só o mecânico que assumiu esta OS pode registrar a inspeção e a execução.');
};

// ───────────────────────── Busca ─────────────────────────

export const buscarVeiculosEClientes = (u: Usuario, termo: string) => {
  exigir(u, 'veiculo.ver');
  const d = getDB();
  const t = termo.trim().toLowerCase();
  if (t.length < 2) return [];
  const tPlaca = normalizarPlaca(termo);
  const num = Number(t.replace('#', ''));
  const verContato = pode(u, 'cliente.ver_contato');
  return d.veiculos
    .map(v => {
      const c = d.clientes.find(x => x.id === v.clienteId);
      const placas = [v.placa, ...v.placasAnteriores.map(p => p.placa)].map(normalizarPlaca);
      const porPlaca = tPlaca.length >= 3 && placas.some(p => p.includes(tPlaca));
      const porNome = !!c && c.nome.toLowerCase().includes(t);
      const porTel = verContato && !!c?.telefone && t.replace(/\D/g, '').length >= 4 && c.telefone.replace(/\D/g, '').includes(t.replace(/\D/g, ''));
      const porOS = !Number.isNaN(num) && num > 0 && d.os.some(o => o.veiculoId === v.id && o.numero === num);
      if (!(porPlaca || porNome || porTel || porOS)) return null;
      const visitas = d.os.filter(o => o.veiculoId === v.id && o.status === 'concluido').length;
      return { veiculo: v, cliente: c ? { id: c.id, nome: c.nome, telefone: verContato ? c.telefone : undefined } : undefined, visitas, motivo: porOS ? `OS #${num}` : porPlaca ? 'placa' : porNome ? 'nome' : 'telefone' };
    })
    .filter(Boolean)
    .slice(0, 12) as { veiculo: Veiculo; cliente?: { id: string; nome: string; telefone?: string }; visitas: number; motivo: string }[];
};

// ───────────────────────── Abertura ─────────────────────────

export interface NovaOSInput {
  veiculoId?: string;
  novoVeiculo?: { placa: string; marca: string; modelo: string; ano: number; motor: string; cambio: Cambio; combustivel: Veiculo['combustivel'] };
  clienteId?: string;
  novoCliente?: { nome: string; telefone?: string };
  vendedorId: string;
  servicos: ServicoOS[];
  valorInicial: number;
  abertaEm?: string;
  naoFazerTesteFreio?: boolean;
  naoFazerTesteCambio?: boolean;
}

export const validarNovaOS = (i: NovaOSInput): string[] => {
  const e: string[] = [];
  if (!i.veiculoId && !i.novoVeiculo) e.push('Escolha um veículo ou cadastre um novo.');
  if (i.novoVeiculo && !placaValida(i.novoVeiculo.placa)) e.push('Placa inválida (padrão antigo ou Mercosul).');
  if (i.novoVeiculo && (!i.novoVeiculo.marca || !i.novoVeiculo.modelo)) e.push('Informe marca e modelo.');
  if (!i.veiculoId && !i.clienteId && !i.novoCliente?.nome?.trim()) e.push('Informe o cliente.');
  if (!i.vendedorId) e.push('Selecione o vendedor.');
  if (!i.servicos.length) e.push('Selecione pelo menos um serviço.');
  if (!(i.valorInicial > 0)) e.push('Informe o valor da venda inicial.');
  return e;
};

export async function abrirOS(u: Usuario, i: NovaOSInput) {
  exigir(u, 'os.abrir');
  const erros = validarNovaOS(i);
  if (erros.length) throw new ErroValidacao(erros.join(' '));
  return transacao(d => {
    let veiculo: Veiculo;
    if (i.veiculoId) veiculo = veicPorId(d, i.veiculoId);
    else {
      const placa = normalizarPlaca(i.novoVeiculo!.placa);
      // Evita duplicar: se a placa já existe, reaproveita o veículo.
      const existente = d.veiculos.find(v => normalizarPlaca(v.placa) === placa);
      if (existente) veiculo = existente;
      else {
        let clienteId = i.clienteId;
        if (!clienteId) {
          const c: Cliente = { id: novoId('c'), nome: i.novoCliente!.nome.trim(), telefone: i.novoCliente!.telefone?.trim() || undefined, tipo: 'particular' };
          d.clientes.push(c);
          clienteId = c.id;
          evento(d, u.id, 'cliente.criado', 'cliente', c.id, `Cliente ${c.nome} cadastrado`);
        }
        veiculo = { id: novoId('v'), ...i.novoVeiculo!, placa, placasAnteriores: [], clienteId };
        d.veiculos.push(veiculo);
        evento(d, u.id, 'veiculo.criado', 'veiculo', veiculo.id, `Veículo ${fmtPlaca(placa)} cadastrado`);
      }
    }
    // Numeração dentro da transação: dois cadastros simultâneos nunca recebem o mesmo número.
    const numero = Math.max(d.contadorOS, ...d.os.map(o => o.numero)) + 1;
    d.contadorOS = numero;
    const os: OrdemServico = {
      id: novoId('os'), numero, status: 'aguardando', veiculoId: veiculo.id, clienteId: veiculo.clienteId, vendedorId: i.vendedorId,
      abertaEm: i.abertaEm || agoraISO(), servicos: i.servicos.map(s => ({ ...s, origem: 'balcao', executado: false })), valorInicial: i.valorInicial,
      naoFazerTesteFreio: i.naoFazerTesteFreio, naoFazerTesteCambio: i.naoFazerTesteCambio, criadaPor: u.id,
    };
    d.os.push(os);
    evento(d, u.id, 'os.aberta', 'os', os.id, `OS #${numero} aberta para ${fmtPlaca(veiculo.placa)}`);
    return os;
  });
}

// ───────────────────────── Fila e rodízio ─────────────────────────

/**
 * Fila do rodízio (mesma regra do sistema atual): entre os mecânicos disponíveis e sem OS em andamento,
 * a vez é de quem começou a última OS há mais tempo hoje (quem ainda não pegou nenhuma vem primeiro).
 * Almoço e ausência tiram da fila sem mudar a posição; o motivo fica registrado.
 */
export const filaRodizio = (d: DB) => {
  const hoje = hojeKey();
  const status = d.rodizio.dia === hoje ? d.rodizio.status : {};
  return d.usuarios
    .filter(x => x.role === 'mecanico' && x.ativo)
    .map(m => {
      const doDia = d.os.filter(o => o.mecanicoId === m.id && o.iniciadaEm && diaKey(o.iniciadaEm) === hoje);
      const ultima = doDia.map(o => o.iniciadaEm!).sort().at(-1);
      const ocupado = d.os.some(o => o.mecanicoId === m.id && o.status === 'andamento');
      return { mecanico: m, status: status[m.id] || 'disponivel', ultima, carrosHoje: doDia.length, ocupado };
    })
    .sort((a, b) => (a.ultima || '').localeCompare(b.ultima || '') || a.mecanico.nome.localeCompare(b.mecanico.nome));
};

export const proximoDaFila = (d: DB) => filaRodizio(d).find(x => x.status === 'disponivel' && !x.ocupado)?.mecanico;

/** Retorno vai para o mesmo mecânico da OS original, fora do rodízio (regra do playbook). */
export const mecanicoDoRetorno = (d: DB, os: OrdemServico) =>
  os.retornoDeOsId ? d.os.find(o => o.id === os.retornoDeOsId)?.mecanicoId : undefined;

export async function iniciarOS(u: Usuario, osId: string, mecanicoId: string, motivoForaDaFila = '') {
  exigir(u, 'os.iniciar');
  if (u.role === 'mecanico' && mecanicoId !== u.id) throw new ErroPermissao('os.iniciar', 'O mecânico só assume OS para si mesmo.');
  return transacao(d => {
    const os = osPorId(d, osId);
    if (os.status !== 'aguardando') throw new ErroValidacao('Esta OS já foi iniciada.');
    const mec = d.usuarios.find(x => x.id === mecanicoId && x.role === 'mecanico' && x.ativo);
    if (!mec) throw new ErroValidacao('Mecânico inválido ou inativo.');
    if (d.os.some(o => o.status === 'andamento' && o.mecanicoId === mecanicoId)) {
      throw new ErroValidacao(`${primeiroNome(mec.nome)} já tem uma OS em andamento.`);
    }
    const doRetorno = mecanicoDoRetorno(d, os);
    const proximo = proximoDaFila(d);
    let foraDaFila = false;
    if (doRetorno) {
      if (doRetorno !== mecanicoId && u.role === 'mecanico') throw new ErroValidacao('Retorno vai para o mecânico que fez o serviço original.');
      foraDaFila = doRetorno !== mecanicoId;
    } else if (proximo?.id !== mecanicoId) {
      // Anti-burla: o mecânico não "pula" a fila; a liderança pode designar, com motivo registrado.
      if (u.role === 'mecanico') throw new ErroValidacao(`Não é a sua vez no rodízio. Próximo: ${primeiroNome(proximo?.nome) || 'ninguém disponível'}.`);
      foraDaFila = true;
    }
    if (foraDaFila && !motivoForaDaFila.trim()) throw new ErroValidacao('Informe o motivo para designar fora da ordem do rodízio.');
    const v = veicPorId(d, os.veiculoId);
    os.status = 'andamento';
    os.mecanicoId = mecanicoId;
    os.iniciadaEm = agoraISO();
    const c = novoChecklist(novoId('ck'), os, v, d.catalogo);
    d.checklists.push(c);
    os.checklistId = c.id;
    evento(d, u.id, 'os.iniciada', 'os', os.id, `OS #${os.numero} iniciada por ${primeiroNome(mec.nome)}${doRetorno ? ' (retorno, fora do rodízio)' : foraDaFila ? ' (fora da ordem)' : ''}`, {
      depois: { mecanicoId, rodizio: d.rodizio.dia === hojeKey() ? d.rodizio.status[mecanicoId] || 'disponivel' : 'disponivel', retorno: !!doRetorno },
      motivo: foraDaFila ? motivoForaDaFila.trim() : undefined,
    });
    return c.id;
  });
}

export async function setStatusRodizio(u: Usuario, mecanicoId: string, status: 'disponivel' | 'almoco' | 'ausente') {
  const proprio = u.id === mecanicoId && status !== 'ausente';
  if (!(proprio && pode(u, 'rodizio.almoco_proprio')) && !pode(u, 'rodizio.gerenciar')) {
    throw new ErroPermissao('rodizio.gerenciar', 'Você só pode marcar o seu próprio almoço.');
  }
  return transacao(d => {
    const hoje = hojeKey();
    if (d.rodizio.dia !== hoje) d.rodizio = { dia: hoje, status: {} };
    const antes = d.rodizio.status[mecanicoId] || 'disponivel';
    d.rodizio.status[mecanicoId] = status;
    // Mudar status nunca altera a posição na fila (regra anti-burla do sistema atual).
    evento(d, u.id, 'rodizio.status', 'usuario', mecanicoId, `Rodízio: ${antes} → ${status}`, { antes, depois: status });
  });
}

// ───────────────────────── Checklist ─────────────────────────

export async function registrarItemChecklist(u: Usuario, checklistId: string, defId: string, estado: EstadoItem, dados: DadosItem) {
  return transacao(d => {
    const c = ckPorId(d, checklistId);
    const os = osPorId(d, c.osId);
    exigirExecutor(u, os);
    const emCorrecao = c.correcaoSolicitada && !c.correcaoSolicitada.resolvidaEm && c.correcaoSolicitada.itens.includes(defId);
    if ((c.status === 'concluido' || c.status === 'excecao_autorizada') && !emCorrecao) {
      throw new ErroValidacao('Checklist já concluído. Alterações só com correção solicitada pela liderança.');
    }
    const def = c.defs.find(x => x.id === defId)!;
    const erros = validarItem(def, estado, dados, fotosAtivasDoItem(c.itens[defId], d.evidencias));
    if (erros.length) throw new ErroValidacao(erros.join(' '));
    const antes = c.itens[defId].estado;
    const novo = registrarItem(c, defId, estado, dados, u.id, agoraISO(), emCorrecao ? `Correção solicitada: ${c.correcaoSolicitada!.motivo}` : undefined);
    Object.assign(c, novo);
    const reg = c.itens[defId];
    // Oportunidade para o comercial: registrar a inspeção não é vender.
    const existente = d.oportunidades.find(o => o.osId === os.id && o.itemDefId === defId);
    if ((estado === 'atencao' || estado === 'prioritario') && def.permiteRecomendacao) {
      if (existente) {
        existente.estadoItem = estado; existente.recomendacao = reg.recomendacao || existente.recomendacao; existente.evidenciaIds = reg.evidenciaIds;
      } else {
        const op = {
          id: novoId('op'), osId: os.id, veiculoId: os.veiculoId, itemDefId: defId, estadoItem: estado,
          recomendacao: reg.recomendacao || `Avaliar ${def.nome.toLowerCase()}`, evidenciaIds: reg.evidenciaIds,
          situacao: (os.naoOferecer ? 'nao_oferecer' : 'nova') as SituacaoOportunidade, servicoKey: def.servicoRelacionado, criadaPor: u.id, criadaEm: agoraISO(),
          historico: [{ situacao: 'nova' as SituacaoOportunidade, por: u.id, em: agoraISO(), obs: os.naoOferecer ? `Não oferecer: alinhado com ${os.naoOferecer.alinhadoCom}` : undefined }],
        };
        d.oportunidades.push(op);
        reg.oportunidadeId = op.id;
      }
    } else if (existente && existente.situacao === 'nova') {
      d.oportunidades = d.oportunidades.filter(o => o !== existente);
      reg.oportunidadeId = undefined;
    }
    evento(d, u.id, emCorrecao ? 'checklist.item_corrigido' : 'checklist.item', 'checklist', c.id, `${def.nome}: ${antes} → ${estado}`, { antes, depois: estado, motivo: emCorrecao ? c.correcaoSolicitada!.motivo : undefined });
  });
}

export async function adicionarEvidencia(u: Usuario, checklistId: string, defId: string, foto: { url: string; demo: boolean; legenda?: string }) {
  return transacao(d => {
    const c = ckPorId(d, checklistId);
    const os = osPorId(d, c.osId);
    exigirExecutor(u, os);
    const emCorrecao = c.correcaoSolicitada && !c.correcaoSolicitada.resolvidaEm && c.correcaoSolicitada.itens.includes(defId);
    if ((c.status === 'concluido' || c.status === 'excecao_autorizada') && !emCorrecao) throw new ErroValidacao('Checklist já concluído.');
    const ev = {
      id: novoId('ev'), osId: os.id, veiculoId: os.veiculoId, checklistId, itemDefId: defId, url: foto.url, demo: foto.demo,
      legenda: foto.legenda?.trim() || undefined, capturadaPor: u.id, em: agoraISO(), visivelCliente: true,
    };
    d.evidencias.push(ev);
    c.itens[defId].evidenciaIds = [...c.itens[defId].evidenciaIds, ev.id];
    const op = d.oportunidades.find(o => o.osId === os.id && o.itemDefId === defId);
    if (op) op.evidenciaIds = c.itens[defId].evidenciaIds;
    evento(d, u.id, 'evidencia.adicionada', 'evidencia', ev.id, `Foto em ${c.defs.find(x => x.id === defId)?.nome}`);
    return ev.id;
  });
}

export async function removerEvidencia(u: Usuario, evidenciaId: string, motivo: string) {
  return transacao(d => {
    const ev = d.evidencias.find(e => e.id === evidenciaId);
    if (!ev) throw new ErroValidacao('Foto não encontrada.');
    const c = ckPorId(d, ev.checklistId);
    exigirExecutor(u, osPorId(d, c.osId));
    if (c.status === 'concluido' || c.status === 'excecao_autorizada') throw new ErroValidacao('Fotos de checklist concluído não podem ser removidas.');
    // Remoção lógica: a foto continua no histórico, marcada como removida.
    ev.removida = { por: u.id, em: agoraISO(), motivo: motivo || 'Substituída pelo mecânico' };
    evento(d, u.id, 'evidencia.removida', 'evidencia', ev.id, 'Foto marcada como removida', { motivo });
  });
}

export async function concluirChecklist(u: Usuario, checklistId: string) {
  return transacao(d => {
    const c = ckPorId(d, checklistId);
    exigirExecutor(u, osPorId(d, c.osId));
    const pend = pendenciasParaConcluir(c, d.evidencias);
    if (pend.length) throw new ErroValidacao(`Faltam ${pend.length} pendência(s) no checklist.`, pend);
    c.status = 'concluido';
    c.concluidoEm = agoraISO();
    c.concluidoPor = u.id;
    evento(d, u.id, 'checklist.concluido', 'checklist', c.id, 'Checklist concluído com todos os itens verificados');
  });
}

export async function solicitarExcecao(u: Usuario, checklistId: string, motivo: string) {
  if (!motivo.trim()) throw new ErroValidacao('Explique o motivo da exceção.');
  return transacao(d => {
    const c = ckPorId(d, checklistId);
    exigirExecutor(u, osPorId(d, c.osId));
    if (c.solicitacaoExcecao?.status === 'pendente') throw new ErroValidacao('Já existe uma solicitação aguardando a liderança.');
    c.solicitacaoExcecao = { motivo: motivo.trim(), solicitadoPor: u.id, em: agoraISO(), status: 'pendente' };
    evento(d, u.id, 'checklist.excecao_solicitada', 'checklist', c.id, `Exceção solicitada: ${motivo.trim()}`);
  });
}

export async function decidirExcecao(u: Usuario, checklistId: string, aprovar: boolean, obs: string) {
  exigir(u, 'checklist.autorizar_excecao');
  return transacao(d => {
    const c = ckPorId(d, checklistId);
    if (c.solicitacaoExcecao?.status !== 'pendente') throw new ErroValidacao('Não há solicitação pendente.');
    c.solicitacaoExcecao = { ...c.solicitacaoExcecao, status: aprovar ? 'aprovada' : 'negada', decididoPor: u.id, decididoEm: agoraISO(), obsDecisao: obs.trim() || undefined };
    if (aprovar) { c.status = 'excecao_autorizada'; c.concluidoEm = agoraISO(); c.concluidoPor = u.id; }
    evento(d, u.id, aprovar ? 'checklist.excecao_aprovada' : 'checklist.excecao_negada', 'checklist', c.id, `Exceção ${aprovar ? 'autorizada' : 'negada'}${obs ? `: ${obs}` : ''}`);
  });
}

export async function enviarCorrecao(u: Usuario, checklistId: string) {
  return transacao(d => {
    const c = ckPorId(d, checklistId);
    exigirExecutor(u, osPorId(d, c.osId));
    const cs = c.correcaoSolicitada;
    if (!cs || cs.resolvidaEm) throw new ErroValidacao('Não há correção pendente.');
    const corrigidos = cs.itens.every(id => c.itens[id].historico.some(h => h.em > cs.em));
    if (!corrigidos) throw new ErroValidacao('Revise todos os itens indicados pela liderança antes de enviar.');
    cs.resolvidaEm = agoraISO();
    const au = d.auditorias.find(a => a.id === cs.auditoriaId);
    if (au) au.resolvidaEm = cs.resolvidaEm;
    evento(d, u.id, 'auditoria.correcao_enviada', 'checklist', c.id, 'Correção enviada para a liderança');
  });
}

// ───────────────────────── Execução e finalização ─────────────────────────

export interface ProximaInput {
  servicoKey?: ServicoKey;
  itemDefId?: string;
  descricao: string;
  regraId?: string;
  origem: OrigemIntervalo;
  fonte: string;
  kmPrevisto?: number;
  dataPrevista?: string;
}

export interface FinalizarInput {
  km: number | null;
  servicos: { key: ServicoKey; executado: boolean; quantidadeExecutada?: string }[];
  obsInterna?: string;
  obsCliente?: string;
  proximas: ProximaInput[];
}

export const pendenciasFinalizacao = (d: DB, os: OrdemServico, f: FinalizarInput): string[] => {
  const p: string[] = [];
  const c = d.checklists.find(x => x.id === os.checklistId);
  if (!c || (c.status !== 'concluido' && c.status !== 'excecao_autorizada')) {
    p.push(c?.solicitacaoExcecao?.status === 'pendente' ? 'Checklist aguardando autorização de exceção da liderança' : 'Concluir o checklist');
  }
  if (f.km == null || !(f.km > 0)) p.push('Confirmar a quilometragem');
  const v = d.veiculos.find(x => x.id === os.veiculoId);
  if (f.km != null && v?.kmAtual != null && f.km < v.kmAtual) p.push(`KM menor que o último registrado (${v.kmAtual.toLocaleString('pt-BR')})`);
  if (!f.servicos.some(s => s.executado)) p.push('Marcar ao menos um serviço como executado');
  return p;
};

export async function finalizarOS(u: Usuario, osId: string, f: FinalizarInput) {
  return transacao(d => {
    const os = osPorId(d, osId);
    exigirExecutor(u, os);
    if (os.status !== 'andamento') throw new ErroValidacao('A OS não está em andamento.');
    const pend = pendenciasFinalizacao(d, os, f);
    if (pend.length) throw new ErroValidacao(pend.join(' · '));
    const v = veicPorId(d, os.veiculoId);
    const agora = agoraISO();
    os.servicos = os.servicos.map(s => {
      const x = f.servicos.find(y => y.key === s.key);
      return x ? { ...s, executado: x.executado, quantidadeExecutada: x.quantidadeExecutada ?? s.quantidade } : s;
    });
    os.km = f.km!;
    os.obsInterna = f.obsInterna?.trim() || undefined;
    os.obsCliente = f.obsCliente?.trim() || undefined;
    os.status = 'concluido';
    os.concluidaEm = agora;
    const kmAntes = v.kmAtual;
    v.kmAtual = f.km!;
    v.kmAtualEm = agora;
    for (const p of f.proximas) {
      d.manutencoes
        .filter(m => m.veiculoId === v.id && !m.concluidaPorOsId && ((p.servicoKey && m.servicoKey === p.servicoKey) || (p.itemDefId && m.itemDefId === p.itemDefId)))
        .forEach(m => { m.concluidaPorOsId = os.id; });
      d.manutencoes.push({
        id: novoId('mp'), veiculoId: v.id, osOrigemId: os.id, descricao: p.descricao, servicoKey: p.servicoKey, itemDefId: p.itemDefId, regraId: p.regraId,
        origem: p.origem, fonte: p.fonte, ultimaExecucao: p.servicoKey ? { data: agora, km: f.km! } : undefined,
        kmPrevisto: p.kmPrevisto, dataPrevista: p.dataPrevista, registradoPor: u.id, registradoEm: agora,
      });
    }
    evento(d, u.id, 'os.concluida', 'os', os.id, `OS #${os.numero} concluída · ${f.km!.toLocaleString('pt-BR')} km`, { antes: { kmVeiculo: kmAntes }, depois: { km: f.km } });
  });
}

export async function cancelarOS(u: Usuario, osId: string, motivo: string) {
  exigir(u, 'os.cancelar');
  if (!motivo.trim()) throw new ErroValidacao('Informe o motivo do cancelamento.');
  return transacao(d => {
    const os = osPorId(d, osId);
    if (os.status === 'concluido') throw new ErroValidacao('OS concluída não pode ser cancelada.');
    const antes = os.status;
    // Cancelamento lógico: a OS continua no histórico (hoje o sistema apaga o documento).
    os.status = 'cancelada';
    os.canceladaMotivo = motivo.trim();
    evento(d, u.id, 'os.cancelada', 'os', os.id, `OS #${os.numero} cancelada: ${motivo.trim()}`, { antes, depois: 'cancelada', motivo });
  });
}

export const valoresOS = (os: OrdemServico) => {
  const upsell = os.servicos.filter(s => s.origem === 'checklist' && s.executado).reduce((a, s) => a + (s.valor || 0), 0);
  return { inicial: os.valorInicial, upsell, total: os.valorInicial + upsell };
};

// ───────────────────────── Comercial ─────────────────────────

export async function tratarOportunidade(u: Usuario, id: string, situacao: SituacaoOportunidade, extra: { valor?: number; obs?: string } = {}) {
  exigir(u, 'oportunidade.tratar');
  return transacao(d => {
    const op = d.oportunidades.find(o => o.id === id);
    if (!op) throw new ErroValidacao('Oportunidade não encontrada.');
    if (op.situacao === 'nao_oferecer') throw new ErroValidacao('Veículo de frota com instrução de não oferecer.');
    if (situacao === 'aceita' && !(extra.valor! > 0)) throw new ErroValidacao('Informe o valor contratado.');
    const os = osPorId(d, op.osId);
    if (situacao === 'aceita' && op.servicoKey) {
      if (os.status === 'concluido') throw new ErroValidacao('A OS já foi concluída: abra uma nova OS para o serviço.');
      if (!os.servicos.some(s => s.oportunidadeId === op.id)) {
        os.servicos.push({ key: op.servicoKey, origem: 'checklist', executado: false, valor: extra.valor, oportunidadeId: op.id });
      }
    }
    op.situacao = situacao;
    if (extra.valor) op.valor = extra.valor;
    op.historico.push({ situacao, por: u.id, em: agoraISO(), obs: extra.obs });
    evento(d, u.id, 'oportunidade.' + situacao, 'oportunidade', op.id, `Oportunidade OS #${os.numero}: ${situacao}`);
  });
}

// ───────────────────────── Relatório do cliente ─────────────────────────

export async function gerarLink(u: Usuario, osId: string, dias: number) {
  exigir(u, 'relatorio.gerar_link');
  return transacao(d => {
    const os = osPorId(d, osId);
    if (os.status !== 'concluido') throw new ErroValidacao('O relatório fica pronto quando a OS é concluída.');
    const sh = { id: novoId('sh'), osId, token: novoToken(), criadoPor: u.id, criadoEm: agoraISO(), expiraEm: dias > 0 ? addDias(agoraISO(), dias) : undefined, acessos: 0 };
    d.compartilhamentos.push(sh);
    evento(d, u.id, 'link.criado', 'compartilhamento', sh.id, `Link do relatório da OS #${os.numero} criado (${dias > 0 ? `${dias} dias` : 'sem validade'})`);
    return sh;
  });
}

export async function revogarLink(u: Usuario, shId: string, motivo: string) {
  exigir(u, 'relatorio.revogar');
  return transacao(d => {
    const sh = d.compartilhamentos.find(s => s.id === shId);
    if (!sh) throw new ErroValidacao('Link não encontrado.');
    if (sh.revogadoEm) throw new ErroValidacao('Link já revogado.');
    sh.revogadoEm = agoraISO();
    sh.revogadoPor = u.id;
    sh.motivoRevogacao = motivo.trim() || undefined;
    evento(d, u.id, 'link.revogado', 'compartilhamento', sh.id, `Link revogado${motivo ? `: ${motivo}` : ''}`);
  });
}

export async function registrarCompartilhamento(u: Usuario, shId: string, canal: 'copiar' | 'whatsapp') {
  exigir(u, 'relatorio.gerar_link');
  return transacao(d => { evento(d, u.id, 'link.compartilhado', 'compartilhamento', shId, `Link compartilhado via ${canal}`); }, { latencia: false });
}

export const estadoLink = (sh: { revogadoEm?: string; expiraEm?: string }) =>
  sh.revogadoEm ? 'revogado' : sh.expiraEm && sh.expiraEm < agoraISO() ? 'expirado' : 'ativo';

/** Projeção pública: SÓ estes campos saem para o cliente. Sem telefone, valores, metas, notas internas. */
export interface RelatorioPublico {
  numero: number;
  data: string;
  km?: number;
  atualizadoEm?: string;
  veiculo: { placa: string; marca: string; modelo: string; ano: number; motor: string };
  clientePrimeiroNome: string;
  tecnico: string;
  servicos: { nome: string; detalhe?: string }[];
  itens: { grupo: string; nome: string; estado: EstadoItem; recomendacao?: string }[];
  checklistStatus: Checklist['status'] | 'sem_checklist';
  fotos: { url: string; legenda: string; item: string; demo: boolean }[];
  observacao?: string;
  proximas: { descricao: string; kmPrevisto?: number; dataPrevista?: string; origem: OrigemIntervalo }[];
}

export type ResultadoPublico = { estado: 'ok'; relatorio: RelatorioPublico } | { estado: 'expirado' | 'revogado' | 'indisponivel' };

export function obterRelatorioPublico(token: string): ResultadoPublico {
  const d = getDB();
  // Busca exata pelo token (128 bits). Número de OS ou placa na URL não dão acesso a nada.
  const sh = d.compartilhamentos.find(s => s.token === token);
  if (!sh) return { estado: 'indisponivel' };
  const est = estadoLink(sh);
  if (est !== 'ativo') return { estado: est };
  const os = d.os.find(o => o.id === sh.osId);
  if (!os || os.status !== 'concluido') return { estado: 'indisponivel' };
  mutarSemLatencia(x => {
    const s = x.compartilhamentos.find(y => y.id === sh.id)!;
    s.acessos += 1; s.ultimoAcessoEm = agoraISO();
    x.eventos.push({ id: novoId('evt'), em: agoraISO(), por: 'cliente (link)', tipo: 'link.acessado', entidade: 'compartilhamento', entidadeId: sh.id, resumo: `Relatório da OS #${os.numero} aberto pelo link` });
  });
  return { estado: 'ok', relatorio: projetarRelatorio(d, os) };
}

export function projetarRelatorio(d: DB, os: OrdemServico): RelatorioPublico {
  const v = d.veiculos.find(x => x.id === os.veiculoId)!;
  const c = d.checklists.find(x => x.id === os.checklistId);
  const cli = d.clientes.find(x => x.id === os.clienteId);
  const mec = d.usuarios.find(x => x.id === os.mecanicoId);
  const itens = c ? c.defs.filter(df => c.itens[df.id].estado !== 'nao_verificado').map(df => ({
    grupo: df.grupo, nome: df.nome, estado: c.itens[df.id].estado, recomendacao: c.itens[df.id].recomendacao,
  })) : [];
  const fotos = d.evidencias
    .filter(e => e.osId === os.id && !e.removida && e.visivelCliente)
    .map(e => ({ url: e.url, legenda: e.legenda || '', item: c?.defs.find(x => x.id === e.itemDefId)?.nome || '', demo: e.demo }));
  const ultimaAlteracao = c ? Object.values(c.itens).flatMap(i => i.historico.map(h => h.em)).filter(em => os.concluidaEm && em > os.concluidaEm).sort().at(-1) : undefined;
  return {
    numero: os.numero,
    data: os.concluidaEm || os.abertaEm,
    km: os.km,
    atualizadoEm: ultimaAlteracao,
    veiculo: { placa: fmtPlaca(v.placa), marca: v.marca, modelo: v.modelo, ano: v.ano, motor: v.motor },
    clientePrimeiroNome: primeiroNome(cli?.nome),
    tecnico: primeiroNome(mec?.nome) || 'Equipe técnica',
    servicos: os.servicos.filter(s => s.executado).map(s => ({ nome: SERVICOS[s.key].nome, detalhe: [s.marca, s.quantidadeExecutada || s.quantidade ? `${s.quantidadeExecutada || s.quantidade} L` : null, s.codigo].filter(Boolean).join(' · ') || undefined })),
    itens,
    checklistStatus: c?.status || 'sem_checklist',
    fotos,
    observacao: os.obsCliente,
    proximas: d.manutencoes.filter(m => m.osOrigemId === os.id && !m.concluidaPorOsId).map(m => ({ descricao: m.descricao, kmPrevisto: m.kmPrevisto, dataPrevista: m.dataPrevista, origem: m.origem })),
  };
}

// ───────────────────────── Liderança ─────────────────────────

export async function auditarChecklist(u: Usuario, checklistId: string, resultado: 'aprovado' | 'reprovado' | 'correcao_solicitada', inconsistencias: { itemDefId: string; descricao: string }[], justificativa: string) {
  exigir(u, 'checklist.auditar');
  if (resultado !== 'aprovado' && !justificativa.trim()) throw new ErroValidacao('Justifique a reprovação ou a correção.');
  if (resultado === 'correcao_solicitada' && !inconsistencias.length) throw new ErroValidacao('Marque ao menos um item para correção.');
  return transacao(d => {
    const c = ckPorId(d, checklistId);
    const os = osPorId(d, c.osId);
    if (os.mecanicoId === u.id) throw new ErroPermissao('checklist.auditar', 'Ninguém audita a própria inspeção.');
    const au = { id: novoId('au'), checklistId, osId: os.id, mecanicoId: os.mecanicoId!, auditorId: u.id, em: agoraISO(), resultado, inconsistencias, justificativa: justificativa.trim() };
    d.auditorias.push(au);
    if (resultado === 'correcao_solicitada') c.correcaoSolicitada = { auditoriaId: au.id, itens: inconsistencias.map(i => i.itemDefId), motivo: justificativa.trim(), em: au.em, por: u.id };
    // A auditoria NÃO altera a inspeção: só o mecânico corrige, com trilha.
    evento(d, u.id, 'auditoria.' + resultado, 'checklist', c.id, `Auditoria da OS #${os.numero}: ${resultado}`, { motivo: justificativa });
  });
}

export async function declararDiaExcecao(u: Usuario, data: string, motivo: string) {
  exigir(u, 'excecao.declarar');
  if (!motivo.trim()) throw new ErroValidacao('Informe o motivo.');
  return transacao(d => {
    if (d.diasExcecao.some(x => x.data === data)) throw new ErroValidacao('Este dia já está declarado como exceção.');
    d.diasExcecao.push({ data, declaradoPor: u.id, motivo: motivo.trim(), em: agoraISO() });
    evento(d, u.id, 'excecao.dia', 'dia', data, `Dia de exceção declarado: ${motivo.trim()}`);
  });
}

export async function marcarNaoOferecer(u: Usuario, osId: string, alinhadoCom: string) {
  exigir(u, 'excecao.declarar');
  if (!alinhadoCom.trim()) throw new ErroValidacao('Informe com quem foi alinhado no comercial.');
  return transacao(d => {
    const os = osPorId(d, osId);
    os.naoOferecer = { alinhadoCom: alinhadoCom.trim(), marcadoPor: u.id, em: agoraISO() };
    d.oportunidades.filter(o => o.osId === osId && o.situacao === 'nova').forEach(o => { o.situacao = 'nao_oferecer'; o.historico.push({ situacao: 'nao_oferecer', por: u.id, em: agoraISO() }); });
    evento(d, u.id, 'excecao.nao_oferecer', 'os', os.id, `OS #${os.numero}: não oferecer (alinhado com ${alinhadoCom.trim()})`);
  });
}

export async function registrarOcorrencia(u: Usuario, o: Pick<Ocorrencia, 'tipo' | 'profissionalId' | 'categoria' | 'descricao' | 'osId' | 'regra' | 'efeitoProposto'>) {
  exigir(u, 'ocorrencia.registrar');
  if (o.profissionalId === u.id) throw new ErroPermissao('ocorrencia.registrar', 'A liderança não registra ocorrência na própria bancada.');
  if (!o.descricao.trim()) throw new ErroValidacao('Descreva o fato de forma objetiva.');
  return transacao(d => {
    const nova: Ocorrencia = { ...o, id: novoId('oc'), dataHora: agoraISO(), evidencias: [], registradaPor: u.id, status: 'registrada', historico: [{ status: 'registrada', por: u.id, em: agoraISO() }] };
    d.ocorrencias.push(nova);
    evento(d, u.id, 'ocorrencia.registrada', 'ocorrencia', nova.id, `${o.tipo === 'desconto' ? 'Ocorrência' : 'Reconhecimento'}: ${o.categoria}`);
    return nova.id;
  });
}

export async function acaoOcorrencia(u: Usuario, id: string, acao: AcaoOcorrencia, obs = '') {
  if (acao === 'contestar' && !obs.trim()) throw new ErroValidacao('Escreva sua manifestação.');
  if ((acao === 'aprovar' || acao === 'rejeitar') && !obs.trim()) throw new ErroValidacao('Registre a justificativa da decisão.');
  return transacao(d => {
    const o = d.ocorrencias.find(x => x.id === id);
    if (!o) throw new ErroValidacao('Ocorrência não encontrada.');
    const novo = transicaoOcorrencia(o, acao, u);
    o.status = novo;
    o.historico.push({ status: novo, por: u.id, em: agoraISO(), obs: obs.trim() || undefined });
    if (acao === 'contestar') o.manifestacao = { texto: obs.trim(), em: agoraISO() };
    if (acao === 'aprovar' || acao === 'rejeitar') { o.validadaPor = u.id; o.decisaoEm = agoraISO(); }
    if (acao === 'rejeitar' || acao === 'aplicar') o.obsEncerramento = obs.trim() || o.obsEncerramento;
    evento(d, u.id, 'ocorrencia.' + acao, 'ocorrencia', o.id, `Ocorrência "${o.categoria}": ${novo}`, { motivo: obs || undefined });
  });
}

export async function registrarPlanoAcao(u: Usuario, p: { profissionalId: string; assunto: string; combinados: string; prazo: string }) {
  exigir(u, 'plano_acao.registrar');
  if (!p.assunto.trim() || !p.combinados.trim()) throw new ErroValidacao('Preencha assunto e combinados.');
  return transacao(d => {
    const id = novoId('pa');
    d.planosAcao.push({ id, ...p, data: agoraISO(), status: 'aberto', registradoPor: u.id });
    evento(d, u.id, 'plano_acao.registrado', 'plano', id, `Conversa de performance: ${p.assunto}`);
  });
}

export async function concluirPlanoAcao(u: Usuario, id: string) {
  exigir(u, 'plano_acao.registrar');
  return transacao(d => {
    const p = d.planosAcao.find(x => x.id === id)!;
    p.status = 'concluido'; p.concluidoEm = agoraISO();
    evento(d, u.id, 'plano_acao.concluido', 'plano', id, `Plano de ação concluído: ${p.assunto}`);
  });
}

// ───────────────────────── Metas ─────────────────────────

export async function criarMeta(u: Usuario, m: Omit<Meta, 'id' | 'versoes'> & { alvo: number; inicio: string; justificativa: string }) {
  exigir(u, 'metas.propor');
  if (!m.nome.trim()) throw new ErroValidacao('Dê um nome à meta.');
  if (m.inicio < hojeKey()) throw new ErroValidacao('A vigência não pode começar no passado.');
  return transacao(d => {
    const { alvo, inicio, justificativa, ...resto } = m;
    const meta: Meta = { ...resto, id: novoId('mt'), versoes: [{ versao: 1, alvo, vigenciaInicio: inicio, status: 'rascunho', definidaPor: u.id, definidaEm: agoraISO(), justificativa: justificativa.trim() || 'Criação da meta' }] };
    d.metas.push(meta);
    evento(d, u.id, 'meta.criada', 'meta', meta.id, `Meta "${meta.nome}" criada como rascunho (alvo ${alvo})`);
    return meta.id;
  });
}

export async function ajustarMeta(u: Usuario, metaId: string, alvo: number, inicio: string, justificativa: string) {
  exigir(u, 'metas.propor');
  return transacao(d => {
    const i = d.metas.findIndex(m => m.id === metaId);
    const antes = d.metas[i];
    d.metas[i] = proporVersao(antes, alvo, inicio, justificativa, u.id, agoraISO(), hojeKey());
    evento(d, u.id, 'meta.versao_proposta', 'meta', metaId, `Nova versão proposta: alvo ${alvo} a partir de ${inicio}`, { motivo: justificativa });
  });
}

export async function decidirMeta(u: Usuario, metaId: string, aprovar: boolean) {
  exigir(u, 'metas.aprovar');
  return transacao(d => {
    const i = d.metas.findIndex(m => m.id === metaId);
    d.metas[i] = aprovar ? aprovarVersao(d.metas[i], u.id, agoraISO()) : descartarRascunho(d.metas[i]);
    evento(d, u.id, aprovar ? 'meta.aprovada' : 'meta.rascunho_descartado', 'meta', metaId, aprovar ? 'Versão aprovada; versão anterior encerrada sem perder o histórico' : 'Rascunho descartado');
  });
}

export async function marcarMetaComunicada(u: Usuario, metaId: string) {
  exigir(u, 'metas.propor');
  return transacao(d => {
    const m = d.metas.find(x => x.id === metaId)!;
    m.comunicadaEm = agoraISO();
    evento(d, u.id, 'meta.comunicada', 'meta', metaId, `Meta "${m.nome}" comunicada ao time`);
  });
}

// ───────────────────────── Administração ─────────────────────────

export async function salvarItemCatalogo(u: Usuario, def: ItemInspecaoDef) {
  exigir(u, 'admin.catalogo');
  if (!def.nome.trim() || !def.instrucao.trim()) throw new ErroValidacao('Nome e instrução são obrigatórios.');
  return transacao(d => {
    const i = d.catalogo.findIndex(x => x.id === def.id);
    const antes = i >= 0 ? d.catalogo[i] : undefined;
    const novo = { ...def, versao: (antes?.versao || 0) + 1 };
    if (i >= 0) d.catalogo[i] = novo; else d.catalogo.push(novo);
    // Checklists existentes guardam a cópia das definições: nada muda retroativamente.
    evento(d, u.id, antes ? 'catalogo.alterado' : 'catalogo.criado', 'item', def.id, `${def.nome} (v${novo.versao})`, { antes, depois: novo });
  });
}

export async function salvarUsuario(u: Usuario, x: { id?: string; nome: string; role: Role; ativo: boolean; nivel?: string }) {
  exigir(u, 'admin.usuarios');
  if (!x.nome.trim()) throw new ErroValidacao('Informe o nome.');
  if (x.id === u.id && !x.ativo) throw new ErroValidacao('Você não pode desativar o próprio acesso.');
  return transacao(d => {
    if (x.id) {
      const i = d.usuarios.findIndex(y => y.id === x.id);
      const antes = d.usuarios[i];
      d.usuarios[i] = { ...antes, ...x, nome: x.nome.trim() };
      evento(d, u.id, 'usuario.alterado', 'usuario', x.id, `${x.nome}: ${antes.role}/${antes.ativo ? 'ativo' : 'inativo'} → ${x.role}/${x.ativo ? 'ativo' : 'inativo'}`, { antes, depois: d.usuarios[i] });
    } else {
      const novo: Usuario = { id: novoId('u'), nome: x.nome.trim(), role: x.role, ativo: x.ativo, nivel: x.nivel, criadoEm: agoraISO() };
      d.usuarios.push(novo);
      evento(d, u.id, 'usuario.criado', 'usuario', novo.id, `Usuário ${novo.nome} criado (${novo.role})`);
    }
  });
}

export async function corrigirPlaca(u: Usuario, veiculoId: string, novaPlaca: string, motivo: string) {
  exigir(u, 'veiculo.corrigir_cadastro');
  if (!placaValida(novaPlaca)) throw new ErroValidacao('Placa inválida.');
  if (!motivo.trim()) throw new ErroValidacao('Informe o motivo da alteração.');
  return transacao(d => {
    const v = veicPorId(d, veiculoId);
    const p = normalizarPlaca(novaPlaca);
    if (d.veiculos.some(x => x.id !== v.id && normalizarPlaca(x.placa) === p)) throw new ErroValidacao('Já existe outro veículo com essa placa.');
    v.placasAnteriores.push({ placa: v.placa, ate: agoraISO(), motivo: motivo.trim() });
    const antes = v.placa;
    v.placa = p;
    // As OS antigas continuam ligadas ao mesmo veículo: o histórico não se perde.
    evento(d, u.id, 'veiculo.placa_alterada', 'veiculo', v.id, `Placa ${fmtPlaca(antes)} → ${fmtPlaca(p)}`, { antes, depois: p, motivo });
  });
}

export async function salvarRegraIntervalo(u: Usuario, regraId: string, mudancas: { km?: number; meses?: number; validada: boolean; fonte: string }) {
  exigir(u, 'admin.catalogo');
  if (mudancas.validada && !mudancas.fonte.trim()) throw new ErroValidacao('Regra validada precisa de fonte.');
  return transacao(d => {
    const r = d.regrasIntervalo.find(x => x.id === regraId)!;
    const antes = { ...r };
    Object.assign(r, mudancas, { validadaPor: mudancas.validada ? u.id : undefined });
    evento(d, u.id, 'regra_intervalo.alterada', 'regra', r.id, `Regra ${r.nome} alterada`, { antes, depois: { ...r } });
  });
}

export async function definirVisibilidadeFoto(u: Usuario, evidenciaId: string, visivel: boolean) {
  exigir(u, 'relatorio.revogar');
  return transacao(d => {
    const e = d.evidencias.find(x => x.id === evidenciaId)!;
    e.visivelCliente = visivel;
    evento(d, u.id, 'evidencia.visibilidade', 'evidencia', e.id, `Foto ${visivel ? 'visível' : 'oculta'} no relatório do cliente`);
  });
}

export const nomeDe = (d: DB, id?: string) => d.usuarios.find(x => x.id === id)?.nome || (id === 'sistema' ? 'Sistema' : id || '—');
export { pendenciasParaConcluir, diaKey };
