// Camada de serviço: toda leitura sensível e toda escrita passam por aqui.
// Ela aplica as permissões (não basta esconder botões), registra a trilha de
// auditoria e é o lugar que, no produto final, vira Security Rules + funções de servidor.
import { SERVICOS, MOTIVO_PAUSA, servicoAplicavel } from '../domain/catalogo';
import { defsAplicaveis, fotosAtivasDoItem, naoSeAplicaAprendido, novoChecklist, pendenciasParaConcluir, registrarItem, validarItem, type DadosItem, type Pendencia } from '../domain/checklist';
import { aprovarVersao, descartarRascunho, proporVersao, transicaoOcorrencia, type AcaoOcorrencia } from '../domain/gestao';
import { atendeOS, exigir, ErroPermissao, pode, podeAtenderCarros } from '../domain/permissions';
import type {
  AtendimentoRetorno, Cambio, Checklist, Cliente, DB, EstadoItem, EstadoRecomendado, Evento, ItemInspecaoDef, ManutencaoPrevista, Meta, Ocorrencia, Oportunidade, OrdemServico, OrigemIntervalo,
  Pausa, Role, ServicoKey, ServicoOS, SituacaoOportunidade, Usuario, Veiculo,
} from '../domain/types';
import { addDias, agoraISO, diaKey, fmtPlaca, hojeKey, novoId, novoToken, normalizarPlaca, placaValida, primeiroNome, telefoneValido } from '../domain/util';
import { idCliente, idVeiculo } from './legado';
import { MODO_REAL } from './modo';
import { definirProjetor } from './nuvem';
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
  if (os.status === 'pausada') throw new ErroValidacao('OS pausada. Retome a OS para continuar.');
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
      const pedido = t.length >= 3 ? d.os.find(o => o.veiculoId === v.id && o.pedidoOlist?.toLowerCase() === t) : undefined;
      if (!(porPlaca || porNome || porTel || porOS || pedido)) return null;
      const visitas = d.os.filter(o => o.veiculoId === v.id && o.status === 'concluido').length;
      return { veiculo: v, cliente: c ? { id: c.id, nome: c.nome, telefone: verContato ? c.telefone : undefined } : undefined, visitas, motivo: pedido ? `pedido Olist ${pedido.pedidoOlist} (OS #${pedido.numero})` : porOS ? `OS #${num}` : porPlaca ? 'placa' : porNome ? 'nome' : 'telefone' };
    })
    .filter(Boolean)
    .slice(0, 12) as { veiculo: Veiculo; cliente?: { id: string; nome: string; telefone?: string }; visitas: number; motivo: string }[];
};

// ───────────────────────── Abertura ─────────────────────────

/** Dados do cliente exigidos na abertura de OS. */
export interface CadastroCliente { telefone: string; comoConheceu: string; comoConheceuDetalhe?: string; cidade: string; bairro: string }

export interface NovaOSInput {
  veiculoId?: string;
  novoVeiculo?: { placa: string; marca: string; modelo: string; ano: number; motor: string; cambio: Cambio; combustivel: Veiculo['combustivel'] };
  /** Quanto o carro roda por mês (obrigatório: ajuda a prever a próxima troca e a recompra). */
  kmPorMes?: number;
  /** Carro de loja (revenda): não tem uso definido, então o km por mês fica zerado. */
  carroDeLoja?: boolean;
  clienteId?: string;
  novoCliente?: { nome: string } & CadastroCliente;
  /** Cliente já cadastrado: completa (ou corrige) telefone, como conheceu, cidade e bairro. */
  completarCliente?: Partial<CadastroCliente>;
  /** Número do pedido do cliente no Olist (opcional; pode ser informado depois). */
  pedidoOlist?: string;
  /** OS de retorno: liga à OS original e registra o problema relatado pelo cliente. */
  retornoDeOsId?: string;
  problemaRelatado?: string;
  vendedorId: string;
  servicos: ServicoOS[];
  valorInicial: number;
  abertaEm?: string;
  naoFazerTesteFreio?: boolean;
  naoFazerTesteCambio?: boolean;
}

const preenchido = (x?: string) => (x?.trim() ? x.trim() : undefined);

/** Junta o cadastro atual do cliente com o que foi digitado na abertura (o digitado vence). */
export const cadastroFinal = (atual: Partial<Cliente> | undefined, novo: Partial<CadastroCliente> | undefined): Partial<CadastroCliente> => ({
  telefone: preenchido(novo?.telefone) ?? atual?.telefone,
  comoConheceu: preenchido(novo?.comoConheceu) ?? atual?.comoConheceu,
  comoConheceuDetalhe: preenchido(novo?.comoConheceuDetalhe) ?? atual?.comoConheceuDetalhe,
  cidade: preenchido(novo?.cidade) ?? atual?.cidade,
  bairro: preenchido(novo?.bairro) ?? atual?.bairro,
});

export const faltasCadastroCliente = (c: Partial<CadastroCliente>): string[] => [
  ...(!telefoneValido(c.telefone) ? ['Informe o telefone do cliente com DDD.'] : []),
  ...(!c.comoConheceu ? ['Informe como o cliente conheceu a Master Óleo.'] : c.comoConheceu === 'Outro' && !c.comoConheceuDetalhe?.trim() ? ['Como conheceu: descreva em "Outro".'] : []),
  ...(!c.cidade?.trim() ? ['Informe a cidade do cliente.'] : []),
  ...(!c.bairro?.trim() ? ['Informe o bairro do cliente.'] : []),
];

/** `clienteAtual` = cadastro do cliente do veículo escolhido (se houver). */
export const validarNovaOS = (i: NovaOSInput, clienteAtual?: Partial<Cliente>): string[] => {
  const e: string[] = [];
  const retorno = !!i.retornoDeOsId;
  if (!i.veiculoId && !i.novoVeiculo) e.push('Escolha um veículo ou cadastre um novo.');
  if (i.novoVeiculo && !placaValida(i.novoVeiculo.placa)) e.push('Placa inválida (padrão antigo ou Mercosul).');
  if (i.novoVeiculo && (!i.novoVeiculo.marca || !i.novoVeiculo.modelo)) e.push('Informe marca e modelo.');
  if (!i.veiculoId && !i.clienteId && !i.novoCliente?.nome?.trim()) e.push('Informe o cliente.');
  if (i.novoVeiculo && !i.clienteId) e.push(...faltasCadastroCliente(cadastroFinal(undefined, i.novoCliente)));
  if (i.veiculoId) e.push(...faltasCadastroCliente(cadastroFinal(clienteAtual, i.completarCliente)));
  if (!retorno && !i.pedidoOlist?.trim()) e.push('Informe o número do pedido do Olist.');
  else if (i.pedidoOlist?.trim() && !/^[\w.\-/]{1,30}$/.test(i.pedidoOlist.trim())) e.push('Número do pedido do Olist inválido.');
  if (!i.vendedorId) e.push('Selecione o vendedor.');
  if (i.carroDeLoja) { /* km por mês fica zerado */ }
  else if (!(i.kmPorMes! > 0)) e.push('Informe quantos km o carro roda por mês (ou marque "Carro de loja").');
  else if (i.kmPorMes! > 20000) e.push('Km por mês fora do normal: confira o número.');
  if (retorno && !i.problemaRelatado?.trim()) e.push('Descreva o problema que o cliente relatou.');
  if (!retorno && !i.servicos.length) e.push('Selecione pelo menos um serviço.');
  if (!retorno && !(i.valorInicial > 0)) e.push('Informe o valor da venda inicial.');
  return e;
};

export async function abrirOS(u: Usuario, i: NovaOSInput) {
  exigir(u, 'os.abrir');
  const dAtual = getDB();
  const vAtual = i.veiculoId ? dAtual.veiculos.find(v => v.id === i.veiculoId) : undefined;
  const cliAtual = vAtual ? dAtual.clientes.find(c => c.id === vAtual.clienteId) : undefined;
  const erros = validarNovaOS(i, cliAtual);
  if (erros.length) throw new ErroValidacao(erros.join(' '));
  return transacao(d => {
    let veiculo: Veiculo;
    if (i.veiculoId) {
      veiculo = veicPorId(d, i.veiculoId);
      const cli = d.clientes.find(c => c.id === veiculo.clienteId);
      if (cli) {
        const final = cadastroFinal(cli, i.completarCliente);
        const campos = (Object.keys(final) as (keyof CadastroCliente)[]).filter(k => final[k] !== cli[k]);
        if (campos.length) {
          const antes = Object.fromEntries(campos.map(k => [k, cli[k]]));
          Object.assign(cli, final);
          evento(d, u.id, 'cliente.atualizado', 'cliente', cli.id, `Cadastro de ${cli.nome} atualizado na abertura da OS`, { antes, depois: Object.fromEntries(campos.map(k => [k, final[k]])) });
        }
      }
    }
    else {
      const placa = normalizarPlaca(i.novoVeiculo!.placa);
      // Evita duplicar: se a placa já existe, reaproveita o veículo.
      const existente = d.veiculos.find(v => normalizarPlaca(v.placa) === placa);
      if (existente) veiculo = existente;
      else {
        let clienteId = i.clienteId;
        if (!clienteId) {
          const c: Cliente = { id: idCliente(placa), nome: i.novoCliente!.nome.trim(), tipo: 'particular', ...cadastroFinal(undefined, i.novoCliente) };
          d.clientes.push(c);
          clienteId = c.id;
          evento(d, u.id, 'cliente.criado', 'cliente', c.id, `Cliente ${c.nome} cadastrado`);
        }
        veiculo = { id: idVeiculo(placa), ...i.novoVeiculo!, placa, placasAnteriores: [], clienteId };
        d.veiculos.push(veiculo);
        evento(d, u.id, 'veiculo.criado', 'veiculo', veiculo.id, `Veículo ${fmtPlaca(placa)} cadastrado`);
      }
    }
    if (i.carroDeLoja) {
      if (veiculo.kmPorMes) evento(d, u.id, 'veiculo.km_mes', 'veiculo', veiculo.id, 'Carro de loja: km por mês zerado', { antes: veiculo.kmPorMes, depois: 0 });
      veiculo.kmPorMes = undefined;
    } else if (i.kmPorMes && veiculo.kmPorMes !== i.kmPorMes) {
      evento(d, u.id, 'veiculo.km_mes', 'veiculo', veiculo.id, `Roda ${i.kmPorMes.toLocaleString('pt-BR')} km por mês`, { antes: veiculo.kmPorMes, depois: i.kmPorMes });
      veiculo.kmPorMes = i.kmPorMes;
    }
    // Numeração dentro da transação: dois cadastros simultâneos nunca recebem o mesmo número.
    let origem: OrdemServico | undefined;
    if (i.retornoDeOsId) {
      origem = osPorId(d, i.retornoDeOsId);
      if (origem.veiculoId !== veiculo.id || origem.status !== 'concluido') throw new ErroValidacao('O retorno precisa apontar para uma OS concluída deste veículo.');
    }
    const numero = Math.max(d.contadorOS, ...d.os.map(o => o.numero)) + 1;
    d.contadorOS = numero;
    const os: OrdemServico = {
      id: novoId('os'), numero, status: 'aguardando', veiculoId: veiculo.id, clienteId: veiculo.clienteId, vendedorId: i.vendedorId, pedidoOlist: preenchido(i.pedidoOlist),
      abertaEm: i.abertaEm || agoraISO(), servicos: i.servicos.map(s => ({ ...s, origem: 'balcao', executado: false })), valorInicial: i.valorInicial,
      naoFazerTesteFreio: i.naoFazerTesteFreio, naoFazerTesteCambio: i.naoFazerTesteCambio, carroDeLoja: i.carroDeLoja || undefined, criadaPor: u.id,
      ...(origem ? { retornoDeOsId: origem.id, retorno: { problemaRelatado: i.problemaRelatado!.trim() } } : {}),
    };
    d.os.push(os);
    evento(d, u.id, 'os.aberta', 'os', os.id, `OS #${numero} aberta para ${fmtPlaca(veiculo.placa)}${origem ? ` (retorno da OS #${origem.numero})` : ''}`);
    return os;
  });
}

// ───────────────────────── Fila e rodízio ─────────────────────────

/**
 * Fila do rodízio (mesma regra do sistema atual): entre os mecânicos disponíveis e sem OS em andamento iniciada hoje,
 * a vez é de quem concluiu o último carro há mais tempo hoje (quem ainda não concluiu nenhum vem primeiro);
 * empate: menos carros no último dia com movimento; depois, ordem alfabética.
 * Almoço e ausência tiram da fila sem mudar a posição; o motivo fica registrado.
 */
/**
 * Situação de hoje no rodízio. Mecânico começa o dia disponível; liderança/direção que atende começa
 * fora da fila ("não estou atendendo") e entra quando for pegar carro.
 */
export const statusNoRodizio = (d: Pick<DB, 'rodizio'>, u: Pick<Usuario, 'id' | 'role'>): 'disponivel' | 'almoco' | 'ausente' =>
  (d.rodizio.dia === hojeKey() ? d.rodizio.status[u.id] : undefined) || (u.role === 'mecanico' ? 'disponivel' : 'ausente');

/** O cliente já contratou este serviço nesta OS (não é recomendação para vender). */
export const servicoNaOS = (os: Pick<OrdemServico, 'servicos'> | undefined, key: ServicoKey | undefined) =>
  !!os && !!key && os.servicos.some(s => s.key === key);

/** Recomendação que o comercial ainda precisa tratar (fora as de serviço que já está na OS). */
export const oportunidadePendente = (d: Pick<DB, 'os'>, o: Oportunidade) =>
  (o.situacao === 'nova' || o.situacao === 'apresentada') && !servicoNaOS(d.os.find(x => x.id === o.osId), o.servicoKey);

export const filaRodizio = (d: DB) => {
  const hoje = hojeKey();
  const diaDa = (o: OrdemServico) => diaKey(o.concluidaEm || o.abertaEm);
  const conta = (o: OrdemServico) => o.status === 'andamento' || o.status === 'concluido' || o.status === 'pausada';
  const diaOntem = [...new Set(d.os.map(diaDa))].filter(x => x < hoje).sort().at(-1);
  return d.usuarios
    .filter(x => atendeOS(x) && x.ativo)
    .map(m => {
      const minhas = d.os.filter(o => o.mecanicoId === m.id);
      const doDia = minhas.filter(o => diaDa(o) === hoje);
      const ultima = doDia.filter(o => o.status === 'concluido' && o.concluidaEm).map(o => o.concluidaEm!).sort().at(-1);
      // "Em atendimento" só conta OS iniciada HOJE (OS esquecida aberta de outro dia não trava).
      const ocupado = minhas.some(o => o.status === 'andamento' && diaKey(o.iniciadaEm || o.abertaEm) === hoje);
      const carrosOntem = diaOntem ? minhas.filter(o => diaDa(o) === diaOntem && conta(o)).length : 0;
      const pausadas = minhas.filter(o => o.status === 'pausada').length;
      return { mecanico: m, status: statusNoRodizio(d, m), ultima, carrosHoje: doDia.filter(conta).length, carrosOntem, ocupado, pausadas };
    })
    .sort((a, b) => (a.ultima || '').localeCompare(b.ultima || '') || a.carrosOntem - b.carrosOntem || a.mecanico.nome.localeCompare(b.mecanico.nome));
};

export const proximoDaFila = (d: DB) => filaRodizio(d).find(x => x.status === 'disponivel' && !x.ocupado)?.mecanico;

/** Fila de OS aguardando na ordem de chegada (é a ordem de atendimento). */
export const filaAguardando = (d: DB) =>
  d.os.filter(o => o.status === 'aguardando').sort((a, b) => a.abertaEm.localeCompare(b.abertaEm));

/**
 * Previsão de quem pega cada OS aguardando, só para informação: retorno vai para o mecânico original;
 * as demais seguem a ordem do rodízio entre os mecânicos disponíveis e livres. OS além do número de
 * mecânicos livres ficam "aguardando mecânico livre". Ninguém fica preso à previsão: outro mecânico pode assumir, com motivo.
 */
export const previsaoFila = (d: DB) => {
  const livres = filaRodizio(d).filter(x => x.status === 'disponivel' && !x.ocupado).map(x => x.mecanico.id);
  const fila = filaAguardando(d);
  const reservados = new Set(fila.map(o => mecanicoDoRetorno(d, o)).filter(Boolean) as string[]);
  const ordem = livres.filter(id => !reservados.has(id));
  const prev = new Map<string, { posicao: number; mecanicoId?: string }>();
  let i = 0;
  fila.forEach((o, pos) => {
    const ret = mecanicoDoRetorno(d, o);
    prev.set(o.id, { posicao: pos + 1, mecanicoId: ret || ordem[i++] });
  });
  return prev;
};

/** Retorno vai para o mesmo mecânico da OS original, fora do rodízio (regra do playbook). */
export const mecanicoDoRetorno = (d: DB, os: OrdemServico) =>
  os.retornoDeOsId ? d.os.find(o => o.id === os.retornoDeOsId)?.mecanicoId : undefined;

export async function iniciarOS(u: Usuario, osId: string, mecanicoId: string, motivoForaDaFila = '') {
  exigir(u, 'os.iniciar');
  if (u.role === 'mecanico' && mecanicoId !== u.id) throw new ErroPermissao('os.iniciar', 'O mecânico só assume OS para si mesmo.');
  return transacao(d => {
    const os = osPorId(d, osId);
    if (os.status !== 'aguardando') throw new ErroValidacao('Esta OS já foi iniciada.');
    const mec = d.usuarios.find(x => x.id === mecanicoId && atendeOS(x) && x.ativo);
    if (!mec) throw new ErroValidacao('Mecânico inválido ou inativo.');
    if (d.os.some(o => o.status === 'andamento' && o.mecanicoId === mecanicoId)) {
      throw new ErroValidacao(`${primeiroNome(mec.nome)} já tem uma OS em andamento.`);
    }
    const doRetorno = mecanicoDoRetorno(d, os);
    if ((u.role === 'mecanico' || mecanicoId === u.id) && statusNoRodizio(d, mec) !== 'disponivel') {
      throw new ErroValidacao('Marque que voltou (almoço/ausência) antes de assumir uma OS.');
    }
    if (doRetorno && doRetorno !== mecanicoId && u.role === 'mecanico') throw new ErroValidacao('Retorno vai para o mecânico que fez o serviço original. Se ele não puder, a liderança designa outro.');
    // Previsão da fila: qualquer mecânico pode assumir (o previsto pode estar ocupado ou indisponível),
    // mas sair da previsão exige motivo, que fica no histórico e no painel da liderança.
    const previsto = previsaoFila(d).get(os.id)?.mecanicoId;
    const foraDaFila = previsto !== mecanicoId;
    if (foraDaFila && !motivoForaDaFila.trim()) {
      throw new ErroValidacao(`Esta OS estava prevista para ${primeiroNome(d.usuarios.find(x => x.id === previsto)?.nome) || 'outro mecânico'}. Informe o motivo para assumir fora da ordem.`);
    }
    const v = veicPorId(d, os.veiculoId);
    os.status = 'andamento';
    os.mecanicoId = mecanicoId;
    os.iniciadaEm = agoraISO();
    fecharAjudasDe(d, mecanicoId, os.iniciadaEm, u.id);
    if (foraDaFila) os.foraDaOrdem = { previsto, motivo: motivoForaDaFila.trim() };
    // Retorno não refaz o checklist completo: o atendimento foca no problema relatado.
    let ckId: string | undefined;
    if (!os.retornoDeOsId) {
      const c = novoChecklist(novoId('ck'), os, v, d.catalogo, naoSeAplicaAprendido(d.checklists, d.veiculos, v, defsAplicaveis(d.catalogo, v)), os.iniciadaEm);
      d.checklists.push(c);
      os.checklistId = c.id;
      ckId = c.id;
    }
    evento(d, u.id, 'os.iniciada', 'os', os.id, `OS #${os.numero} iniciada por ${primeiroNome(mec.nome)}${doRetorno ? ' (retorno)' : ''}${foraDaFila ? ' (fora da ordem prevista)' : ''}`, {
      depois: { mecanicoId, previsto, retorno: !!doRetorno },
      motivo: foraDaFila ? motivoForaDaFila.trim() : undefined,
    });
    return ckId || os.id;
  });
}

/**
 * OS iniciada pelo sistema atual chega aqui em andamento, mas sem checklist: cria na hora em que o
 * mecânico vai fazer (ou a liderança abre). Retorno não tem checklist.
 */
export async function garantirChecklist(u: Usuario, osId: string) {
  return transacao(d => {
    const os = osPorId(d, osId);
    if (os.retornoDeOsId) throw new ErroValidacao('OS de retorno não tem checklist: use o atendimento do retorno.');
    const atual = os.checklistId && d.checklists.find(c => c.id === os.checklistId);
    if (atual) return atual.id;
    if (os.mecanicoId !== u.id && !pode(u, 'rodizio.gerenciar')) throw new ErroPermissao('os.executar', 'Só o mecânico desta OS (ou a liderança) abre o checklist.');
    if (os.status !== 'andamento') throw new ErroValidacao(os.status === 'pausada' ? 'OS pausada. Retome a OS para continuar.' : 'A OS não está em andamento.');
    const vc = veicPorId(d, os.veiculoId);
    const c = novoChecklist(novoId('ck'), os, vc, d.catalogo, naoSeAplicaAprendido(d.checklists, d.veiculos, vc, defsAplicaveis(d.catalogo, vc)), agoraISO());
    d.checklists.push(c);
    os.checklistId = c.id;
    evento(d, u.id, 'checklist.criado', 'os', os.id, `Checklist criado para a OS #${os.numero} (iniciada no sistema atual)`);
    return c.id;
  });
}

// ───────────────────────── Assistência ─────────────────────────

/** Fim do atendimento (concluída, pausada, cancelada): quem estava ajudando para de contar. */
const fecharAjudasDaOS = (os: OrdemServico, quando: string, por: string) =>
  os.assistencias?.forEach(a => { if (!a.fim) { a.fim = quando; a.encerradoPor = por; } });

/** Quem assume um carro (ou vai ajudar em outro) para de ajudar onde estava. */
const fecharAjudasDe = (d: DB, mecanicoId: string, quando: string, por: string) =>
  d.os.forEach(o => o.assistencias?.forEach(a => { if (a.mecanicoId === mecanicoId && !a.fim) { a.fim = quando; a.encerradoPor = por; } }));

/** Ajudante atual de cada mecânico (OS em que está ajudando agora). */
export const ajudandoEm = (d: DB, mecanicoId: string) =>
  d.os.find(o => o.status === 'andamento' && o.assistencias?.some(a => a.mecanicoId === mecanicoId && !a.fim));

/** O mecânico da OS (ou a liderança) registra quem veio ajudar. Não muda comissão nem rodízio. */
export async function chamarAjuda(u: Usuario, osId: string, ajudanteId: string) {
  return transacao(d => {
    const os = osPorId(d, osId);
    if (!(os.mecanicoId === u.id && pode(u, 'os.executar')) && !pode(u, 'rodizio.gerenciar')) throw new ErroPermissao('os.executar', 'Só o mecânico da OS ou a liderança registra ajuda.');
    if (os.status !== 'andamento') throw new ErroValidacao('Só dá para registrar ajuda em OS em andamento.');
    const aj = d.usuarios.find(x => x.id === ajudanteId && atendeOS(x) && x.ativo);
    if (!aj) throw new ErroValidacao('Escolha um mecânico ativo.');
    if (aj.id === os.mecanicoId) throw new ErroValidacao('Quem atende a OS não pode ser o ajudante.');
    if (os.assistencias?.some(a => a.mecanicoId === aj.id && !a.fim)) throw new ErroValidacao(`${primeiroNome(aj.nome)} já está ajudando nesta OS.`);
    const propria = d.os.find(o => o.status === 'andamento' && o.mecanicoId === aj.id);
    if (propria) throw new ErroValidacao(`${primeiroNome(aj.nome)} está com a OS #${propria.numero} em andamento.`);
    const st = statusNoRodizio(d, aj);
    if (st !== 'disponivel') throw new ErroValidacao(`${primeiroNome(aj.nome)} está marcado como ${st === 'almoco' ? 'almoço' : 'ausente'} no rodízio.`);
    const agora = agoraISO();
    fecharAjudasDe(d, aj.id, agora, u.id);
    os.assistencias = [...(os.assistencias || []), { mecanicoId: aj.id, inicio: agora, chamadoPor: u.id }];
    evento(d, u.id, 'os.ajuda_inicio', 'os', os.id, `${primeiroNome(aj.nome)} começou a ajudar na OS #${os.numero}`, { depois: { ajudante: aj.id } });
  });
}

/** Fim da ajuda: o mecânico da OS, o próprio ajudante ou a liderança. */
export async function encerrarAjuda(u: Usuario, osId: string, ajudanteId: string) {
  return transacao(d => {
    const os = osPorId(d, osId);
    if (os.mecanicoId !== u.id && ajudanteId !== u.id && !pode(u, 'rodizio.gerenciar')) throw new ErroPermissao('os.executar', 'Só o mecânico da OS, o ajudante ou a liderança encerra a ajuda.');
    const a = os.assistencias?.find(x => x.mecanicoId === ajudanteId && !x.fim);
    if (!a) throw new ErroValidacao('Esta ajuda já foi encerrada.');
    a.fim = agoraISO(); a.encerradoPor = u.id;
    evento(d, u.id, 'os.ajuda_fim', 'os', os.id, `${primeiroNome(d.usuarios.find(x => x.id === ajudanteId)?.nome)} parou de ajudar na OS #${os.numero}`);
  });
}

/** Pausa a OS (ex.: aguardando peça). O mecânico fica livre para assumir outra OS enquanto isso. */
export async function pausarOS(u: Usuario, osId: string, motivo: Pausa['motivo'], detalhe = '') {
  if (motivo === 'outro' && !detalhe.trim()) throw new ErroValidacao('Descreva o motivo da pausa.');
  return transacao(d => {
    const os = osPorId(d, osId);
    const lider = pode(u, 'rodizio.gerenciar');
    if (!(os.mecanicoId === u.id && pode(u, 'os.executar')) && !lider) throw new ErroPermissao('os.executar', 'Só o mecânico da OS ou a liderança pausa a OS.');
    if (os.status !== 'andamento') throw new ErroValidacao('Só OS em andamento pode ser pausada.');
    os.status = 'pausada';
    fecharAjudasDaOS(os, agoraISO(), u.id);
    os.pausas = [...(os.pausas || []), { inicio: agoraISO(), motivo, detalhe: detalhe.trim() || undefined, por: u.id }];
    evento(d, u.id, 'os.pausada', 'os', os.id, `OS #${os.numero} pausada: ${MOTIVO_PAUSA[motivo]}${detalhe.trim() ? ` — ${detalhe.trim()}` : ''}`, { motivo: detalhe.trim() || MOTIVO_PAUSA[motivo] });
  });
}

/** Retoma a OS pausada. O mecânico precisa estar sem outra OS em andamento. */
export async function retomarOS(u: Usuario, osId: string) {
  return transacao(d => {
    const os = osPorId(d, osId);
    if (os.status !== 'pausada') throw new ErroValidacao('Esta OS não está pausada.');
    if (!(os.mecanicoId === u.id && pode(u, 'os.executar')) && !pode(u, 'rodizio.gerenciar')) throw new ErroPermissao('os.executar', 'Só o mecânico da OS ou a liderança retoma a OS.');
    if (d.os.some(o => o.status === 'andamento' && o.mecanicoId === os.mecanicoId)) {
      throw new ErroValidacao(`${primeiroNome(d.usuarios.find(x => x.id === os.mecanicoId)?.nome)} está com outra OS em andamento. Finalize ou pause aquela antes de retomar esta.`);
    }
    const p = os.pausas!.at(-1)!;
    p.fim = agoraISO(); p.retomadaPor = u.id;
    os.status = 'andamento';
    evento(d, u.id, 'os.retomada', 'os', os.id, `OS #${os.numero} retomada`);
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
    const quem = d.usuarios.find(x => x.id === mecanicoId);
    const antes = quem ? statusNoRodizio(d, quem) : d.rodizio.status[mecanicoId] || 'disponivel';
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
    // Oportunidade para o comercial: registrar a inspeção não é vender. Serviço que o cliente já
    // contratou nesta OS não vira recomendação (o item e as fotos ficam no checklist e no relatório).
    const existente = d.oportunidades.find(o => o.osId === os.id && o.itemDefId === defId);
    if ((estado === 'atencao' || estado === 'prioritario') && def.permiteRecomendacao && !servicoNaOS(os, def.servicoRelacionado)) {
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
    const os = osPorId(d, ev.osId);
    exigirExecutor(u, os);
    if (ev.checklistId) {
      const c = ckPorId(d, ev.checklistId);
      if (c.status === 'concluido' || c.status === 'excecao_autorizada') throw new ErroValidacao('Fotos de checklist concluído não podem ser removidas.');
    } else if (os.status !== 'andamento') throw new ErroValidacao('Fotos de OS concluída não podem ser removidas.');
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

// ───────────────────────── Atendimento de retorno ─────────────────────────

export async function salvarRetorno(u: Usuario, osId: string, campos: Partial<Omit<AtendimentoRetorno, 'problemaRelatado'>>) {
  return transacao(d => {
    const os = osPorId(d, osId);
    exigirExecutor(u, os);
    if (!os.retorno) throw new ErroValidacao('Esta OS não é de retorno.');
    if (os.status !== 'andamento') throw new ErroValidacao('A OS não está em andamento.');
    os.retorno = { ...os.retorno, ...campos };
  }, { latencia: false });
}

export async function adicionarFotoRetorno(u: Usuario, osId: string, etapa: 'antes' | 'depois', foto: { url: string; demo: boolean; legenda?: string }) {
  return transacao(d => {
    const os = osPorId(d, osId);
    exigirExecutor(u, os);
    if (!os.retorno) throw new ErroValidacao('Esta OS não é de retorno.');
    const ev = {
      id: novoId('ev'), osId: os.id, veiculoId: os.veiculoId, itemDefId: 'retorno', etapa, url: foto.url, demo: foto.demo,
      legenda: foto.legenda?.trim() || undefined, capturadaPor: u.id, em: agoraISO(), visivelCliente: true,
    };
    d.evidencias.push(ev);
    evento(d, u.id, 'evidencia.adicionada', 'evidencia', ev.id, `Foto do retorno (${etapa === 'antes' ? 'problema' : 'solução'})`);
    return ev.id;
  });
}

// ───────────────────────── Quilometragem ─────────────────────────

export type FotoKm = { url: string; demo: boolean };

/** KM registrado no carro quando a nova leitura é menor (registro antigo errado, troca de painel...). */
export const kmAnteriorMaior = (d: DB, os: OrdemServico, km: number | null) => {
  const v = d.veiculos.find(x => x.id === os.veiculoId);
  return km != null && km > 0 && v?.kmAtual != null && km < v.kmAtual ? v.kmAtual : null;
};

const pendenciaKm = (d: DB, os: OrdemServico, km: number | null, fotoKm?: FotoKm): string | null => {
  if (km == null || !(km > 0)) return 'Confirmar a quilometragem';
  const ant = kmAnteriorMaior(d, os, km);
  return ant != null && !fotoKm ? `KM menor que o último registrado (${ant.toLocaleString('pt-BR')}): tire a foto do painel para corrigir` : null;
};

/** Corrige o KM do carro para baixo: guarda a foto do painel (só interna) e registra quem corrigiu. */
function registrarCorrecaoKm(d: DB, u: Usuario, os: OrdemServico, km: number, fotoKm?: FotoKm) {
  const ant = kmAnteriorMaior(d, os, km);
  if (ant == null || !fotoKm) return;
  const ev = {
    id: novoId('ev'), osId: os.id, veiculoId: os.veiculoId, itemDefId: 'km_painel', url: fotoKm.url, demo: fotoKm.demo,
    legenda: `Painel: ${km.toLocaleString('pt-BR')} km (registro anterior: ${ant.toLocaleString('pt-BR')})`, capturadaPor: u.id, em: agoraISO(), visivelCliente: false,
  };
  d.evidencias.push(ev);
  evento(d, u.id, 'veiculo.km_corrigido', 'os', os.id, `KM corrigido na OS #${os.numero}: ${ant.toLocaleString('pt-BR')} → ${km.toLocaleString('pt-BR')} (com foto do painel)`, { antes: ant, depois: km });
}

export const pendenciasRetorno = (d: DB, os: OrdemServico, km: number | null, fotoKm?: FotoKm): string[] => {
  const r = os.retorno;
  if (!r) return ['Esta OS não é de retorno'];
  const fotos = d.evidencias.filter(e => e.osId === os.id && e.itemDefId === 'retorno' && !e.removida);
  const p: string[] = [];
  if (!fotos.some(f => f.etapa === 'antes')) p.push('Foto do problema (antes)');
  if (!r.diagnostico?.trim()) p.push('O que foi encontrado (diagnóstico)');
  if (!r.relacaoServicoAnterior) p.push('Se o problema tem relação com o serviço anterior');
  if (!r.solucao?.trim()) p.push('O que foi feito (solução)');
  if (!fotos.some(f => f.etapa === 'depois') && !r.semFotoDepois?.trim()) p.push('Foto depois da solução, ou o motivo de não ter');
  if (!r.avisoCliente?.trim()) p.push('O que foi avisado ao cliente');
  const pk = pendenciaKm(d, os, km, fotoKm);
  if (pk) p.push(pk);
  return p;
};

export async function finalizarRetorno(u: Usuario, osId: string, km: number | null, fotoKm?: FotoKm) {
  return transacao(d => {
    const os = osPorId(d, osId);
    exigirExecutor(u, os);
    if (os.status !== 'andamento') throw new ErroValidacao('A OS não está em andamento.');
    const pend = pendenciasRetorno(d, os, km, fotoKm);
    if (pend.length) throw new ErroValidacao('Falta: ' + pend.join(' · '));
    const v = veicPorId(d, os.veiculoId);
    const agora = agoraISO();
    registrarCorrecaoKm(d, u, os, km!, fotoKm);
    os.km = km!; os.status = 'concluido'; os.concluidaEm = agora;
    fecharAjudasDaOS(os, agora, u.id);
    os.obsCliente = os.retorno!.avisoCliente;
    os.servicos = os.servicos.map(s => ({ ...s, executado: true }));
    v.kmAtual = km!; v.kmAtualEm = agora;
    evento(d, u.id, 'os.concluida', 'os', os.id, `Retorno OS #${os.numero} concluído · relação com o serviço anterior: ${os.retorno!.relacaoServicoAnterior}`);
    linkAutomatico(d, u, os);
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
  estadoItem?: EstadoRecomendado;
}

export interface AdicionalInput { key: ServicoKey; marca?: string; quantidade?: string; codigo?: string; valor?: number }

export interface FinalizarInput {
  km: number | null;
  /** Foto do painel, obrigatória quando o KM é menor que o último registrado. */
  fotoKm?: FotoKm;
  servicos: { key: ServicoKey; executado: boolean; quantidadeExecutada?: string; intervaloKm?: number }[];
  /** Serviços adicionais vendidos na bancada (aceitos pelo cliente). */
  adicionais?: AdicionalInput[];
  /** Ofertas recusadas (para a taxa de oferta). */
  recusados?: ServicoKey[];
  obsInterna?: string;
  obsCliente?: string;
  proximas: ProximaInput[];
}

export const pendenciasFinalizacao = (d: DB, os: OrdemServico, f: FinalizarInput): string[] => {
  const p: string[] = [];
  const c = d.checklists.find(x => x.id === os.checklistId);
  // Carro de loja: checklist opcional.
  if (!os.carroDeLoja && (!c || (c.status !== 'concluido' && c.status !== 'excecao_autorizada'))) {
    p.push(c?.solicitacaoExcecao?.status === 'pendente' ? 'Checklist aguardando autorização de exceção da liderança' : 'Concluir o checklist');
  }
  const pk = pendenciaKm(d, os, f.km, f.fotoKm);
  if (pk) p.push(pk);
  if (!f.servicos.some(s => s.executado) && !f.adicionais?.length) p.push('Marcar ao menos um serviço como executado');
  const oleo = f.servicos.find(s => s.key === 'oleoMotor' && s.executado);
  const regraOleo = d.regrasIntervalo.find(r => r.ativo && r.servicoKey === 'oleoMotor' && r.validada && r.opcoesKm?.length);
  if (oleo && regraOleo && !(oleo.intervaloKm && regraOleo.opcoesKm!.includes(oleo.intervaloKm))) {
    p.push(`Escolher o intervalo do óleo aplicado (${regraOleo.opcoesKm!.map(x => x / 1000).join(', ')} mil km)`);
  }
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
      return x ? { ...s, executado: x.executado, quantidadeExecutada: x.quantidadeExecutada ?? s.quantidade, intervaloKm: x.intervaloKm } : s;
    });
    // Adicionais vendidos na bancada entram como serviço executado de origem "adicional".
    for (const a of f.adicionais || []) {
      if (!servicoAplicavel(a.key, v.cambio)) throw new ErroValidacao(`${SERVICOS[a.key].nome} não se aplica a este câmbio.`);
      if (os.servicos.some(s => s.key === a.key)) continue;
      // Recomendação do checklist para este serviço: o mecânico registrou o aceite do cliente na bancada.
      const op = d.oportunidades.find(o => o.osId === os.id && o.servicoKey === a.key && o.situacao !== 'aceita' && o.situacao !== 'nao_oferecer');
      if (op) {
        op.situacao = 'aceita';
        if (a.valor && a.valor > 0) op.valor = a.valor;
        op.historico.push({ situacao: 'aceita', por: u.id, em: agoraISO(), obs: 'Cliente aceitou na bancada' });
      }
      os.servicos.push({ key: a.key, marca: a.marca?.trim() || undefined, quantidade: a.quantidade, codigo: a.codigo?.trim() || undefined, quantidadeExecutada: a.quantidade, origem: 'adicional', executado: true, valor: a.valor && a.valor > 0 ? a.valor : undefined, adicionadoPor: u.id, oportunidadeId: op?.id });
    }
    os.ofertas = [
      ...(f.adicionais || []).map(a => ({ key: a.key, resultado: 'aceito' as const, por: u.id, em: agoraISO() })),
      ...(f.recusados || []).map(k => ({ key: k, resultado: 'recusado' as const, por: u.id, em: agoraISO() })),
    ];
    registrarCorrecaoKm(d, u, os, f.km!, f.fotoKm);
    os.km = f.km!;
    os.obsInterna = f.obsInterna?.trim() || undefined;
    os.obsCliente = f.obsCliente?.trim() || undefined;
    os.status = 'concluido';
    os.concluidaEm = agora;
    fecharAjudasDaOS(os, agora, u.id);
    const kmAntes = v.kmAtual;
    v.kmAtual = f.km!;
    v.kmAtualEm = agora;
    // Recomendações antigas do checklist resolvidas nesta visita: item agora OK, ou serviço aceito e executado.
    const ckAtual = d.checklists.find(c => c.id === os.checklistId);
    d.manutencoes.filter(m => m.veiculoId === v.id && !m.concluidaPorOsId && m.itemDefId).forEach(m => {
      const itemOk = ckAtual?.itens[m.itemDefId!]?.estado === 'ok';
      const servicoDoItem = ckAtual?.defs.find(x => x.id === m.itemDefId)?.servicoRelacionado;
      const feito = os.servicos.some(s => s.executado && ((s.oportunidadeId && d.oportunidades.find(o => o.id === s.oportunidadeId)?.itemDefId === m.itemDefId) || (servicoDoItem && s.key === servicoDoItem)));
      if (itemOk || feito) m.concluidaPorOsId = os.id;
    });
    // Itens com desgaste, em mau estado ou a avaliar que não foram feitos: sempre viram recomendação,
    // mesmo que a tela não mande (o cliente pode recusar agora, mas continua recomendado).
    // Item do checklist resolvido nesta OS (serviço feito, inclusive adicional da bancada) não vira recomendação.
    const feitoNaOS = (itemDefId?: string) => {
      const sr = itemDefId && ckAtual?.defs.find(x => x.id === itemDefId)?.servicoRelacionado;
      return !!sr && os.servicos.some(sv => sv.executado && sv.key === sr);
    };
    const proximas = f.proximas.filter(p => !feitoNaOS(p.itemDefId));
    ckAtual?.defs.forEach(df => {
      const it = ckAtual.itens[df.id];
      if (!(it.estado === 'atencao' || it.estado === 'prioritario' || it.estado === 'pendente_avaliacao')) return;
      if (d.oportunidades.find(o => o.osId === os.id && o.itemDefId === df.id)?.situacao === 'aceita') return;
      if (df.servicoRelacionado && os.servicos.some(sv => sv.executado && sv.key === df.servicoRelacionado)) return; // feito nesta OS
      const ja = proximas.find(p => p.itemDefId === df.id);
      if (ja) { ja.estadoItem = it.estado; return; }
      proximas.push({
        itemDefId: df.id, estadoItem: it.estado, origem: 'profissional', fonte: `Checklist da OS #${os.numero}`,
        descricao: it.estado === 'pendente_avaliacao' ? `Avaliar ${df.nome.toLowerCase()}` : it.recomendacao || `Revisar ${df.nome.toLowerCase()}`,
      });
    });
    for (const p of proximas) {
      d.manutencoes
        .filter(m => m.veiculoId === v.id && !m.concluidaPorOsId && ((p.servicoKey && m.servicoKey === p.servicoKey) || (p.itemDefId && m.itemDefId === p.itemDefId)))
        .forEach(m => { m.concluidaPorOsId = os.id; });
      d.manutencoes.push({
        id: novoId('mp'), veiculoId: v.id, osOrigemId: os.id, descricao: p.descricao, servicoKey: p.servicoKey, itemDefId: p.itemDefId, regraId: p.regraId,
        origem: p.origem, fonte: p.fonte, ultimaExecucao: p.servicoKey ? { data: agora, km: f.km! } : undefined,
        kmPrevisto: p.kmPrevisto, dataPrevista: p.dataPrevista, registradoPor: u.id, registradoEm: agora, estadoItem: p.estadoItem,
      });
    }
    evento(d, u.id, 'os.concluida', 'os', os.id, `OS #${os.numero} concluída · ${f.km!.toLocaleString('pt-BR')} km`, { antes: { kmVeiculo: kmAntes }, depois: { km: f.km } });
    linkAutomatico(d, u, os);
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
    fecharAjudasDaOS(os, agoraISO(), u.id);
    evento(d, u.id, 'os.cancelada', 'os', os.id, `OS #${os.numero} cancelada: ${motivo.trim()}`, { antes, depois: 'cancelada', motivo });
  });
}

/** OS esquecida aberta (dia anterior): sai das filas e dos totais sem contar como serviço, igual às encerradas em massa. */
export async function encerrarOSEsquecida(u: Usuario, osId: string, motivo: string) {
  exigir(u, 'os.cancelar');
  if (!motivo.trim()) throw new ErroValidacao('Informe o motivo.');
  return transacao(d => {
    const os = osPorId(d, osId);
    if (os.status !== 'aguardando' && os.status !== 'andamento' && os.status !== 'pausada') throw new ErroValidacao('Só OS aberta pode ser encerrada.');
    if (diaKey(os.abertaEm) === hojeKey()) throw new ErroValidacao('OS aberta hoje: conclua ou cancele.');
    const antes = os.status;
    os.status = 'encerrada';
    os.concluidaEm = os.abertaEm;
    fecharAjudasDaOS(os, agoraISO(), u.id);
    os.canceladaMotivo = motivo.trim();
    evento(d, u.id, 'os.encerrada', 'os', os.id, `OS #${os.numero} encerrada sem execução: ${motivo.trim()}`, { antes, depois: 'encerrada', motivo });
  });
}

export const valoresOS = (os: OrdemServico) => {
  // Upsell = o que foi vendido além do balcão: recomendações do checklist e adicionais da bancada.
  const upsell = os.servicos.filter(s => s.origem !== 'balcao' && s.executado).reduce((a, s) => a + (s.valor || 0), 0);
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

/** Validade do link do relatório criado na finalização (cobre o intervalo da próxima troca). */
export const DIAS_LINK_AUTOMATICO = 180;

/** Ao concluir a OS, o link do relatório já fica pronto para o vendedor enviar ao cliente. */
function linkAutomatico(d: DB, u: Usuario, os: OrdemServico) {
  if (d.compartilhamentos.some(s => s.osId === os.id && estadoLink(s) === 'ativo')) return;
  const sh = { id: novoId('sh'), osId: os.id, token: novoToken(), criadoPor: u.id, criadoEm: agoraISO(), expiraEm: addDias(agoraISO(), DIAS_LINK_AUTOMATICO), acessos: 0 };
  d.compartilhamentos.push(sh);
  evento(d, u.id, 'link.criado', 'compartilhamento', sh.id, `Link do relatório da OS #${os.numero} criado na finalização (${DIAS_LINK_AUTOMATICO} dias)`);
}

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
  proximas: { descricao: string; kmPrevisto?: number; dataPrevista?: string; origem: OrigemIntervalo; estadoItem?: EstadoRecomendado; clienteAdiou?: boolean; desde?: string }[];
  /** Só em OS de retorno: o problema, o que foi feito e o que foi combinado com o cliente. */
  retorno?: { problema: string; solucao: string; aviso: string; antes: { url: string; legenda: string; demo: boolean }[]; depois: { url: string; legenda: string; demo: boolean }[] };
}

export type ResultadoPublico = { estado: 'ok'; relatorio: RelatorioPublico } | { estado: 'expirado'; placa?: string } | { estado: 'revogado' | 'indisponivel' };

export function obterRelatorioPublico(token: string): ResultadoPublico {
  const d = getDB();
  // Busca exata pelo token (128 bits). Número de OS ou placa na URL não dão acesso a nada.
  const sh = d.compartilhamentos.find(s => s.token === token);
  if (!sh) return { estado: 'indisponivel' };
  const est = estadoLink(sh);
  const os = d.os.find(o => o.id === sh.osId);
  if (est === 'expirado') return { estado: 'expirado', placa: d.veiculos.find(v => v.id === os?.veiculoId)?.placa };
  if (est !== 'ativo') return { estado: est };
  if (!os || os.status !== 'concluido') return { estado: 'indisponivel' };
  mutarSemLatencia(x => {
    const s = x.compartilhamentos.find(y => y.id === sh.id)!;
    s.acessos += 1; s.ultimoAcessoEm = agoraISO();
    x.eventos.push({ id: novoId('evt'), em: agoraISO(), por: 'cliente (link)', tipo: 'link.acessado', entidade: 'compartilhamento', entidadeId: sh.id, resumo: `Relatório da OS #${os.numero} aberto pelo link` });
  });
  return { estado: 'ok', relatorio: projetarRelatorio(d, os) };
}

// ───────────────────────── Recomendações em aberto ─────────────────────────

const ORDEM_REC: Record<EstadoRecomendado, number> = { prioritario: 0, atencao: 1, pendente_avaliacao: 2 };
/** Prioritário primeiro, depois atenção, avaliar depois e, por fim, as manutenções por intervalo. */
const ordemProxima = (m: ManutencaoPrevista) => (m.estadoItem ? ORDEM_REC[m.estadoItem] : 3);

/** O que o cliente respondeu à recomendação que originou esta manutenção (se veio do checklist). */
export const situacaoRecomendacao = (d: DB, m: ManutencaoPrevista): SituacaoOportunidade | undefined =>
  m.itemDefId ? d.oportunidades.find(o => o.osId === m.osOrigemId && o.itemDefId === m.itemDefId)?.situacao : undefined;

export interface RecomendacaoAberta { m: ManutencaoPrevista; estado: EstadoRecomendado; situacao?: SituacaoOportunidade; osNumero?: number }

/** Itens em mau estado / com desgaste / a avaliar que ainda não foram resolvidos no veículo. */
export const recomendacoesAbertas = (d: DB, veiculoId: string): RecomendacaoAberta[] =>
  d.manutencoes.filter(m => m.veiculoId === veiculoId && !m.concluidaPorOsId && m.estadoItem)
    .sort((a, b) => ordemProxima(a) - ordemProxima(b) || b.registradoEm.localeCompare(a.registradoEm))
    .map(m => ({ m, estado: m.estadoItem!, situacao: situacaoRecomendacao(d, m), osNumero: d.os.find(o => o.id === m.osOrigemId)?.numero }));

export async function definirPedidoOlist(u: Usuario, osId: string, pedido: string) {
  exigir(u, 'os.abrir');
  const p = pedido.trim();
  if (p && !/^[\w.\-/]{1,30}$/.test(p)) throw new ErroValidacao('Número do pedido do Olist inválido.');
  return transacao(d => {
    const os = osPorId(d, osId);
    if (!p && !os.retornoDeOsId) throw new ErroValidacao('O pedido do Olist é obrigatório; informe o número correto em vez de apagar.');
    const antes = os.pedidoOlist;
    os.pedidoOlist = p || undefined;
    evento(d, u.id, 'os.pedido_olist', 'os', os.id, p ? `Pedido Olist ${p} informado na OS #${os.numero}` : `Pedido Olist removido da OS #${os.numero}`, { antes, depois: os.pedidoOlist });
  });
}

export function projetarRelatorio(d: DB, os: OrdemServico): RelatorioPublico {
  const v = d.veiculos.find(x => x.id === os.veiculoId)!;
  const c = d.checklists.find(x => x.id === os.checklistId);
  const cli = d.clientes.find(x => x.id === os.clienteId);
  const mec = d.usuarios.find(x => x.id === os.mecanicoId);
  const itens = c ? c.defs.filter(df => c.itens[df.id].estado !== 'nao_verificado').map(df => ({
    grupo: df.grupo, nome: df.nome, estado: c.itens[df.id].estado, recomendacao: c.itens[df.id].recomendacao,
  })) : [];
  const visiveis = d.evidencias.filter(e => e.osId === os.id && !e.removida && e.visivelCliente);
  const fotos = visiveis.filter(e => e.itemDefId !== 'retorno')
    .map(e => ({ url: e.url, legenda: e.legenda || '', item: c?.defs.find(x => x.id === e.itemDefId)?.nome || '', demo: e.demo }));
  const fotoRet = (etapa: 'antes' | 'depois') => visiveis.filter(e => e.itemDefId === 'retorno' && e.etapa === etapa).map(e => ({ url: e.url, legenda: e.legenda || '', demo: e.demo }));
  const ultimaAlteracao = c ? Object.values(c.itens).flatMap(i => i.historico.map(h => h.em)).filter(em => os.concluidaEm && em > os.concluidaEm).sort().at(-1) : undefined;
  return {
    numero: os.numero,
    data: os.concluidaEm || os.abertaEm,
    km: os.km,
    atualizadoEm: ultimaAlteracao,
    veiculo: { placa: fmtPlaca(v.placa), marca: v.marca, modelo: v.modelo, ano: v.ano, motor: v.motor },
    clientePrimeiroNome: primeiroNome(cli?.nome),
    tecnico: primeiroNome(mec?.nome) || 'Equipe técnica',
    servicos: os.servicos.filter(s => s.executado).map(s => ({ nome: SERVICOS[s.key].nome, detalhe: [s.marca, s.quantidadeExecutada || s.quantidade ? `${s.quantidadeExecutada || s.quantidade} L${s.carter ? ' no total' : ''}` : null, s.carter ? `${s.carter} L dentro do câmbio` : null, s.codigo].filter(Boolean).join(' · ') || undefined })),
    itens,
    checklistStatus: c?.status || 'sem_checklist',
    fotos,
    observacao: os.obsCliente,
    // Desta visita + recomendações de visitas anteriores ainda em aberto (o cliente não fez, mas continua recomendado).
    proximas: [
      ...recomendacoesAbertas(d, v.id).filter(r => r.m.osOrigemId !== os.id && r.m.registradoEm <= (os.concluidaEm || os.abertaEm)).map(r => r.m),
      ...d.manutencoes.filter(m => m.osOrigemId === os.id && !m.concluidaPorOsId),
    ].sort((a, b) => ordemProxima(a) - ordemProxima(b)).map(m => {
      const sit = situacaoRecomendacao(d, m);
      return {
        descricao: m.descricao, kmPrevisto: m.kmPrevisto, dataPrevista: m.dataPrevista, origem: m.origem, estadoItem: m.estadoItem,
        clienteAdiou: sit === 'recusada' || sit === 'avaliar_depois', desde: m.osOrigemId !== os.id ? m.registradoEm : undefined,
      };
    }),
    // Diagnóstico interno e a classificação "relação com o serviço anterior" não saem para o cliente.
    ...(os.retorno ? { retorno: { problema: os.retorno.problemaRelatado, solucao: os.retorno.solucao || '', aviso: os.retorno.avisoCliente || '', antes: fotoRet('antes'), depois: fotoRet('depois') } } : {}),
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

/** Não mostrar o item para um modelo (decisão da direção a partir das sugestões de uso). Não afeta inspeções antigas. */
export async function ocultarItemPara(u: Usuario, defId: string, alvo: { marca: string; modelo: string; motor?: string }, motivo: string) {
  exigir(u, 'admin.catalogo');
  if (!motivo.trim()) throw new ErroValidacao('Registre o motivo.');
  return transacao(d => {
    const def = d.catalogo.find(x => x.id === defId);
    if (!def) throw new ErroValidacao('Item não encontrado.');
    const antes = { ...def, ocultarPara: [...(def.ocultarPara || [])] };
    def.ocultarPara = [...(def.ocultarPara || []), { ...alvo, motivo: motivo.trim(), por: u.id, em: agoraISO() }];
    def.versao += 1;
    evento(d, u.id, 'catalogo.ocultar', 'item', def.id, `${def.nome}: não mostrar para ${alvo.marca} ${alvo.modelo}${alvo.motor ? ` ${alvo.motor}` : ''} (v${def.versao})`, { antes, depois: { ...def }, motivo });
  });
}

export async function voltarAMostrarItem(u: Usuario, defId: string, indice: number) {
  exigir(u, 'admin.catalogo');
  return transacao(d => {
    const def = d.catalogo.find(x => x.id === defId)!;
    const removido = def.ocultarPara?.[indice];
    if (!removido) throw new ErroValidacao('Regra não encontrada.');
    def.ocultarPara = def.ocultarPara!.filter((_, i) => i !== indice);
    def.versao += 1;
    evento(d, u.id, 'catalogo.mostrar', 'item', def.id, `${def.nome}: volta a aparecer para ${removido.marca} ${removido.modelo} (v${def.versao})`);
  });
}

export async function salvarUsuario(u: Usuario, x: { id?: string; nome: string; role: Role; ativo: boolean; nivel?: string; nomeLegado?: string; atendeComoMecanico?: boolean }): Promise<string> {
  exigir(u, 'admin.usuarios');
  if (!x.nome.trim()) throw new ErroValidacao('Informe o nome.');
  if (x.id === u.id && !x.ativo) throw new ErroValidacao('Você não pode desativar o próprio acesso.');
  // Só os campos de cadastro: login e senha mudam por definirAcesso, e o hash nunca vai para o histórico.
  const campos = { nome: x.nome.trim(), role: x.role, ativo: x.ativo, nivel: x.nivel || undefined, ...(x.nomeLegado !== undefined ? { nomeLegado: x.nomeLegado.trim() || undefined } : {}),
    ...(x.atendeComoMecanico !== undefined ? { atendeComoMecanico: (podeAtenderCarros(x.role) && x.atendeComoMecanico) || undefined } : {}) };
  const semSegredo = ({ senha: _s, ...resto }: Usuario) => resto;
  return transacao(d => {
    if (x.id) {
      const i = d.usuarios.findIndex(y => y.id === x.id);
      const antes = d.usuarios[i];
      d.usuarios[i] = { ...antes, ...campos };
      evento(d, u.id, 'usuario.alterado', 'usuario', x.id, `${campos.nome}: ${antes.role}/${antes.ativo ? 'ativo' : 'inativo'} → ${x.role}/${x.ativo ? 'ativo' : 'inativo'}`, { antes: semSegredo(antes), depois: semSegredo(d.usuarios[i]) });
      return x.id;
    }
    const novo: Usuario = { id: novoId('u'), ...campos, criadoEm: agoraISO() };
    d.usuarios.push(novo);
    evento(d, u.id, 'usuario.criado', 'usuario', novo.id, `Usuário ${novo.nome} criado (${novo.role})`);
    return novo.id;
  });
}

export async function corrigirPlaca(u: Usuario, veiculoId: string, novaPlaca: string, motivo: string) {
  exigir(u, 'veiculo.corrigir_cadastro');
  if (MODO_REAL) throw new ErroValidacao('No piloto, a placa é corrigida no sistema atual (Editar OS).');
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

definirProjetor((d, osId) => { const os = d.os.find(o => o.id === osId); return os ? projetarRelatorio(d, os) : null; });

/** Relatório pelo link na base real: lê a cópia restrita gravada quando o link foi gerado (sem login). */
export async function obterRelatorioPublicoReal(token: string): Promise<ResultadoPublico> {
  const { lerRelatorio } = await import('./nuvem');
  const r = await lerRelatorio(token);
  if (!r || !r.relatorio) return { estado: r?.revogadoEm ? 'revogado' : 'indisponivel' };
  const est = estadoLink({ revogadoEm: r.revogadoEm || undefined, expiraEm: r.expiraEm || undefined });
  if (est === 'expirado') return { estado: 'expirado', placa: (r.relatorio as RelatorioPublico).veiculo?.placa };
  return est === 'ativo' ? { estado: 'ok', relatorio: r.relatorio as RelatorioPublico } : { estado: est };
}

export const nomeDe = (d: DB, id?: string) => d.usuarios.find(x => x.id === id)?.nome || (id === 'sistema' ? 'Sistema' : id || '—');
export { pendenciasParaConcluir, diaKey };
