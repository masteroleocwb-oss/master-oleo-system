// Base de DEMONSTRAÇÃO. Tudo é fictício: nomes, placas, telefones, valores e imagens.
// Gerada de forma determinística, relativa à data de hoje, para o protótipo sempre parecer "do dia".
import { CATALOGO_INICIAL, REGRAS_INICIAIS, SERVICOS } from '../domain/catalogo';
import { novoChecklist, pendenciasParaConcluir, registrarItem } from '../domain/checklist';
import { POLITICA_PROPOSTA_PARAMS, POLITICA_VIGENTE_PARAMS } from '../domain/gestao';
import { sugerirProxima } from '../domain/manutencao';
import type {
  Checklist, Cliente, DB, EstadoItem, Evidencia, FechamentoMensal, ManutencaoPrevista, Meta, Ocorrencia, Oportunidade,
  OrdemServico, ServicoKey, ServicoOS, Usuario, Veiculo,
} from '../domain/types';
import { addDias, agora, diaKey, mesKey } from '../domain/util';
import { fotoDemo } from './demoFotos';

const rngDe = (seed: number) => () => {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

export const MECANICOS = ['u_m1', 'u_m2', 'u_m3', 'u_m4', 'u_m5'];

const USUARIOS = (criadoEm: string): Usuario[] => [
  { id: 'u_m1', nome: 'André Costa', role: 'mecanico', ativo: true, nivel: 'N3', criadoEm },
  { id: 'u_m2', nome: 'Rafael Moura', role: 'mecanico', ativo: true, nivel: 'N2', criadoEm },
  { id: 'u_m3', nome: 'Diego Ramos', role: 'mecanico', ativo: true, nivel: 'N4', criadoEm },
  { id: 'u_m4', nome: 'Eduardo Pires', role: 'mecanico', ativo: true, nivel: 'N1', criadoEm },
  { id: 'u_m5', nome: 'Marcos Lima', role: 'mecanico', ativo: true, nivel: 'N2', criadoEm },
  { id: 'u_lid', nome: 'Fernanda Alves', role: 'lider', ativo: true, criadoEm },
  { id: 'u_dir', nome: 'Gustavo Reis', role: 'direcao', ativo: true, criadoEm },
  { id: 'u_ven', nome: 'Igor Martins', role: 'vendedor', ativo: true, criadoEm },
  { id: 'u_ven2', nome: 'Juliana Prado', role: 'vendedor', ativo: true, criadoEm },
  { id: 'u_ina', nome: 'Paulo Souza', role: 'mecanico', ativo: false, nivel: 'N1', criadoEm },
];

const NOMES = ['Mariana Exemplo', 'Carlos Fictício', 'Beatriz Demonstração', 'João Teste', 'Larissa Modelo', 'Pedro Amostra', 'Sofia Protótipo',
  'Lucas Simulado', 'Camila Exemplar', 'Rodrigo Demo', 'Fernanda Teste', 'Gabriel Exemplo', 'Patrícia Modelo', 'Thiago Fictício',
  'Aline Amostra', 'Vinícius Demo', 'Renata Simulada', 'Felipe Protótipo', 'Juliana Teste', 'Marcelo Exemplo', 'Natália Modelo',
  'Otávio Amostra', 'Priscila Demo', 'Ricardo Teste', 'Tatiane Exemplo', 'Ulisses Modelo', 'Vanessa Fictícia', 'Wagner Demo'];

// Cadastro de origem e endereço (determinístico, para não mexer na sequência aleatória da base).
const BAIRROS = ['Água Verde', 'Portão', 'Batel', 'Bigorrilho', 'Boqueirão', 'Cajuru', 'Santa Felicidade', 'Cabral', 'Juvevê', 'Xaxim', 'Centro', 'Pinheirinho'];
const COMO = ['Indicação de amigo ou parente', 'Google', 'Instagram', 'Passou em frente', 'Já era cliente', 'Google', 'Facebook', 'Indicação de amigo ou parente'];

const CARROS: [string, string, string, 'manual' | 'automatico'][] = [
  ['Chevrolet', 'Onix', '1.0', 'manual'], ['Volkswagen', 'T-Cross', '1.0 TSI', 'automatico'], ['Fiat', 'Argo', '1.3', 'manual'],
  ['Toyota', 'Corolla', '2.0', 'automatico'], ['Hyundai', 'HB20', '1.0', 'manual'], ['Jeep', 'Renegade', '1.3 T', 'automatico'],
  ['Honda', 'Civic', '2.0', 'automatico'], ['Renault', 'Kwid', '1.0', 'manual'], ['Ford', 'Ranger', '3.2', 'automatico'],
  ['Nissan', 'Kicks', '1.6', 'automatico'], ['Fiat', 'Strada', '1.3', 'manual'], ['Volkswagen', 'Polo', '1.0', 'manual'],
  ['Toyota', 'Hilux', '2.8', 'automatico'], ['Chevrolet', 'Tracker', '1.0 T', 'automatico'], ['Hyundai', 'Creta', '1.6', 'automatico'],
];

const VALOR_UPSELL: Partial<Record<ServicoKey, number>> = {
  arMotor: 72, arCondicionado: 42, filtroCombustivel: 45, aditivo: 240, fluidoFreio: 330, palhetas: 290, cambioAutomatico: 1270,
  cambioManual: 500, oleoMotor: 320, difTraseiro: 250,
};

/** Perfil de qualidade de checklist por mecânico (para os painéis terem diferenças reais). */
const PERFIL: Record<string, { completo: number; foto: number; carrosDia: number }> = {
  u_m1: { completo: 0.98, foto: 1, carrosDia: 1.5 },
  u_m2: { completo: 0.86, foto: 0.95, carrosDia: 1.3 },
  u_m3: { completo: 0.95, foto: 0.85, carrosDia: 1.4 },
  u_m4: { completo: 0.7, foto: 0.8, carrosDia: 0.9 },
  u_m5: { completo: 0.9, foto: 0.95, carrosDia: 1.2 },
};

export function gerarSeed(): DB {
  const r = rngDe(20261026);
  const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)];
  const agoraISO = agora().toISOString();
  const hoje = diaKey(agoraISO);
  const mesAtual = mesKey(agoraISO);
  const inicioMes = `${mesAtual}-01`;
  // Histórico recente: desde o dia 1º, mas nunca menos de 3 semanas (no começo do mês a base não fica vazia).
  const inicioHist = [inicioMes, diaKey(addDias(agoraISO, -24))].sort()[0];
  const criadoEm = '2026-01-05T12:00:00.000Z';

  const db: DB = {
    versao: 1, geradoEm: agoraISO, usuarios: USUARIOS(criadoEm).map(u => ({ ...u, demo: true })), clientes: [], veiculos: [], os: [], checklists: [], evidencias: [],
    oportunidades: [], catalogo: CATALOGO_INICIAL.map(d => ({ ...d })), regrasIntervalo: REGRAS_INICIAIS.map(x => ({ ...x })),
    manutencoes: [], compartilhamentos: [], metas: [], politicas: [], ocorrencias: [], auditorias: [], planosAcao: [],
    diasExcecao: [], fechamentos: [], eventos: [], acessos: [], acessoDemo: true, contadorOS: 7000, rodizio: { dia: hoje, status: {} },
  };

  // ── Clientes e veículos ──
  NOMES.forEach((nome, i) => {
    const c: Cliente = {
      id: `c${i + 1}`, nome, telefone: `(41) 90000-${String(1000 + i).slice(-4)}`, tipo: 'particular',
      comoConheceu: COMO[i % COMO.length], cidade: i % 7 === 3 ? 'São José dos Pinhais' : i % 9 === 5 ? 'Pinhais' : 'Curitiba', bairro: BAIRROS[i % BAIRROS.length],
    };
    db.clientes.push(c);
  });
  db.clientes.push({ id: 'c_frota', nome: 'Locadora Exemplo Ltda', telefone: '(41) 90000-9999', tipo: 'frota', comoConheceu: 'Frota / empresa', cidade: 'Curitiba', bairro: 'CIC' });
  // Cliente vindo do sistema antigo, sem como conheceu/cidade/bairro: a Nova OS pede para completar.
  db.clientes.push({ id: 'c_legado', nome: 'Rosa Antiga Exemplo', telefone: '(41) 90000-8888', tipo: 'particular' });

  const prefixos = ['DEM', 'TST', 'PRT', 'EXM'];
  const novoVeiculo = (i: number, placa?: string, carro = CARROS[i % CARROS.length], clienteId = db.clientes[i % NOMES.length].id): Veiculo => {
    const v: Veiculo = {
      id: `v${i + 1}`,
      placa: placa || `${prefixos[i % 4]}${(i % 9) + 1}${'ABCDEFGHJK'[i % 10]}${String(10 + i).slice(-2)}`,
      placasAnteriores: [],
      marca: carro[0], modelo: carro[1], motor: carro[2], cambio: carro[3],
      ano: 2014 + (i % 11), combustivel: carro[1] === 'Ranger' || carro[1] === 'Hilux' ? 'Diesel' : 'Flex',
      clienteId, kmAtual: 18000 + Math.floor(r() * 90000),
    };
    db.veiculos.push(v);
    return v;
  };
  // Veículo com histórico rico usado nos roteiros de demonstração
  const vDemo = novoVeiculo(0, 'DEM1A23', ['Chevrolet', 'Onix', '1.0', 'manual'], 'c1');
  vDemo.ano = 2019; vDemo.kmAtual = 52300;
  const vVencida = novoVeiculo(1, 'TST2B45', ['Volkswagen', 'T-Cross', '1.0 TSI', 'automatico'], 'c2');
  vVencida.kmAtual = 91200;
  const vFrota = novoVeiculo(2, 'PRT3C67', ['Fiat', 'Strada', '1.3', 'manual'], 'c_frota');
  for (let i = 3; i < 34; i++) novoVeiculo(i);
  novoVeiculo(34, 'EXM8L34', ['Renault', 'Sandero', '1.6', 'manual'], 'c_legado');
  vDemo.placasAnteriores = [];

  // ── Helpers de OS ──
  const numero = () => ++db.contadorOS;
  const servicosBase = (v: Veiculo): ServicoOS[] => {
    const base: ServicoOS[] = [
      { key: 'oleoMotor', marca: pick(['Mobil 5W30', 'Shell 5W30', 'Castrol 0W20', 'Lubrax 5W40']), quantidade: pick(['3,5', '4', '4,2']), origem: 'balcao', executado: false },
      { key: 'filtroOleo', codigo: pick(['PSL 55', 'WO 121', 'PH 5949']), origem: 'balcao', executado: false },
    ];
    if (v.cambio === 'automatico' && r() < 0.18) base.push({ key: 'cambioAutomatico', marca: 'ATF Dexron VI', quantidade: '6', origem: 'balcao', executado: false });
    if (r() < 0.12) base.push({ key: 'fluidoFreio', marca: 'Bosch DOT4', quantidade: '1', origem: 'balcao', executado: false });
    return base;
  };
  const vendedor = () => (r() < 0.6 ? 'u_ven' : 'u_ven2');

  type Plano = { estados: Record<string, EstadoItem>; incompleto: boolean; semFoto: boolean };
  const planoChecklist = (c: Checklist, mec: string): Plano => {
    const p = PERFIL[mec];
    const estados: Record<string, EstadoItem> = {};
    c.defs.forEach(d => {
      const x = r();
      // Diferencial só existe de fato em picape/4x4: nos demais o mecânico marca "Não se aplica" quase sempre.
      const temDif = ['Ranger', 'Hilux'].includes(db.veiculos.find(v => v.id === c.veiculoId)?.modelo || '');
      estados[d.id] = d.id === 'diferencial' && !temDif && r() < 0.93 ? 'nao_aplicavel'
        : x < 0.8 ? 'ok' : x < 0.93 ? 'atencao' : x < 0.97 ? 'prioritario' : 'pendente_avaliacao';
    });
    return { estados, incompleto: r() > p.completo, semFoto: r() > p.foto };
  };

  const preencherChecklist = (os: OrdemServico, v: Veiculo, mec: string, inicioISO: string, plano?: Partial<Plano> & { parar?: number }) => {
    let c = novoChecklist(`ck_${os.id}`, os, v, db.catalogo);
    const pl = { ...planoChecklist(c, mec), ...plano };
    const parar = plano?.parar ?? (pl.incompleto ? c.defs.length - 1 - Math.floor(r() * 3) : c.defs.length);
    let t = new Date(inicioISO).getTime() + 2 * 60000;
    c.defs.slice(0, parar).forEach((d, idx) => {
      const estado = pl.estados![d.id] || 'ok';
      t += (30 + Math.floor(r() * 50)) * 1000;
      const em = new Date(t).toISOString();
      const precisaFoto = d.fotoObrigatoriaEm.includes(estado);
      const evIds: string[] = [];
      if (precisaFoto && !(pl.semFoto && idx % 2 === 0)) {
        const ev: Evidencia = {
          id: `ev_${os.id}_${d.id}`, osId: os.id, veiculoId: v.id, checklistId: c.id, itemDefId: d.id,
          url: fotoDemo(d.id, `${d.nome} · ${estado === 'prioritario' ? 'prioritário' : 'atenção'}`, idx), demo: true,
          legenda: estado === 'prioritario' ? `${d.nome}: desgaste acentuado` : `${d.nome}: sinais de desgaste`,
          capturadaPor: mec, em, visivelCliente: true,
        };
        db.evidencias.push(ev);
        evIds.push(ev.id);
      }
      c = registrarItem(c, d.id, estado, {
        justificativa: estado === 'nao_aplicavel' ? 'Veículo sem diferencial/tração 4x4' : undefined,
        observacao: estado === 'pendente_avaliacao' ? 'Carro chegou com motor quente; avaliar na próxima visita' : undefined,
        recomendacao: estado === 'atencao' || estado === 'prioritario' ? (d.servicoRelacionado ? SERVICOS[d.servicoRelacionado].nome : `${estado === 'prioritario' ? 'Trocar' : 'Revisar'} ${d.nome.toLowerCase()}`) : undefined,
      }, mec, em);
      c.itens[d.id].evidenciaIds = evIds;
    });
    return c;
  };

  const criarOportunidades = (os: OrdemServico, c: Checklist, concluida: boolean) => {
    for (const d of c.defs) {
      const it = c.itens[d.id];
      if (!(it.estado === 'atencao' || it.estado === 'prioritario') || !d.permiteRecomendacao) continue;
      const x = r();
      const situacao: Oportunidade['situacao'] = os.naoOferecer ? 'nao_oferecer'
        : !concluida ? (x < 0.5 ? 'nova' : 'apresentada')
          : x < 0.42 ? 'aceita' : x < 0.72 ? 'recusada' : x < 0.86 ? 'avaliar_depois' : 'apresentada';
      const op: Oportunidade = {
        id: `op_${os.id}_${d.id}`, osId: os.id, veiculoId: os.veiculoId, itemDefId: d.id, estadoItem: it.estado,
        recomendacao: it.recomendacao || `Avaliar ${d.nome.toLowerCase()}`, evidenciaIds: it.evidenciaIds, situacao,
        servicoKey: d.servicoRelacionado, criadaPor: os.mecanicoId!, criadaEm: it.registradoEm!,
        historico: [{ situacao: 'nova', por: os.mecanicoId!, em: it.registradoEm! }],
      };
      if (situacao !== 'nova') op.historico.push({ situacao, por: 'u_ven', em: addDias(it.registradoEm!, 0.01) });
      if (situacao === 'aceita' && d.servicoRelacionado) {
        op.valor = VALOR_UPSELL[d.servicoRelacionado] || 120;
        os.servicos.push({ key: d.servicoRelacionado, origem: 'checklist', executado: concluida, valor: op.valor, oportunidadeId: op.id });
      }
      it.oportunidadeId = op.id;
      db.oportunidades.push(op);
    }
  };

  const concluirOS = (os: OrdemServico, v: Veiculo, fimISO: string, km: number, c?: Checklist) => {
    os.status = 'concluido';
    os.concluidaEm = fimISO;
    os.km = km;
    os.servicos.forEach(s => { s.executado = true; s.quantidadeExecutada = s.quantidade; });
    v.kmAtual = Math.max(v.kmAtual || 0, km);
    v.kmAtualEm = fimISO;
    // Próximas manutenções a partir de regras validadas
    os.servicos.forEach(s => {
      // Óleo: intervalo conforme o óleo aplicado (dado fictício: 0W20 → 10 mil, 5W30 → 7 mil, demais → 5 mil).
      if (s.key === 'oleoMotor' && !s.intervaloKm) s.intervaloKm = /0W20/.test(s.marca || '') ? 10000 : /5W30/.test(s.marca || '') ? 7000 : s.marca ? 5000 : 10000;
      const sug = sugerirProxima(s.key, SERVICOS[s.key].nome, db.regrasIntervalo, v, fimISO, km, s.intervaloKm);
      if (!sug.regra) return;
      db.manutencoes.filter(m => m.veiculoId === v.id && m.servicoKey === s.key && !m.concluidaPorOsId).forEach(m => { m.concluidaPorOsId = os.id; });
      const m: ManutencaoPrevista = {
        id: `mp_${os.id}_${s.key}`, veiculoId: v.id, osOrigemId: os.id, descricao: sug.descricao, servicoKey: s.key, regraId: sug.regra.id,
        origem: sug.confirmavel ? sug.regra.origem : 'nao_confirmada', fonte: sug.regra.fonte, ultimaExecucao: { data: fimISO, km },
        kmPrevisto: sug.kmPrevisto, dataPrevista: sug.dataPrevista, registradoPor: os.mecanicoId!, registradoEm: fimISO,
      };
      db.manutencoes.push(m);
    });
    if (!c) return;
    // Recomendações do checklist: resolvidas quando o item volta OK ou o serviço é feito; as não feitas seguem recomendadas.
    db.manutencoes.filter(m => m.veiculoId === v.id && m.itemDefId && !m.concluidaPorOsId).forEach(m => {
      const it = c.itens[m.itemDefId!];
      const feito = os.servicos.some(s => s.oportunidadeId && db.oportunidades.find(o => o.id === s.oportunidadeId)?.itemDefId === m.itemDefId);
      if (it?.estado === 'ok' || feito || it?.estado === 'atencao' || it?.estado === 'prioritario' || it?.estado === 'pendente_avaliacao') m.concluidaPorOsId = os.id;
    });
    c.defs.forEach(d => {
      const it = c.itens[d.id];
      if (!(it.estado === 'atencao' || it.estado === 'prioritario' || it.estado === 'pendente_avaliacao')) return;
      if (db.oportunidades.find(o => o.osId === os.id && o.itemDefId === d.id)?.situacao === 'aceita') return;
      if (d.servicoRelacionado && os.servicos.some(sv => sv.executado && sv.key === d.servicoRelacionado)) return; // feito nesta OS
      db.manutencoes.push({
        id: `mp_${os.id}_${d.id}`, veiculoId: v.id, osOrigemId: os.id, itemDefId: d.id, estadoItem: it.estado,
        descricao: it.estado === 'pendente_avaliacao' ? `Avaliar ${d.nome.toLowerCase()}` : it.recomendacao || `Revisar ${d.nome.toLowerCase()}`,
        origem: 'profissional', fonte: `Checklist da OS #${os.numero}`, registradoPor: os.mecanicoId!, registradoEm: fimISO,
      });
    });
  };

  const abrir = (v: Veiculo, abertaEm: string, extra: Partial<OrdemServico> = {}): OrdemServico => {
    const n = numero();
    const os: OrdemServico = {
      id: `os${db.contadorOS + 1}`, numero: n, status: 'aguardando', veiculoId: v.id, clienteId: v.clienteId, vendedorId: vendedor(),
      // Pedido fictício do Olist (obrigatório na abertura, exceto retorno em garantia).
      pedidoOlist: extra.retornoDeOsId ? undefined : String(96000 + n * 3),
      abertaEm, servicos: servicosBase(v), valorInicial: Math.round(240 + r() * 700), criadaPor: 'u_ven', ...extra,
    };
    os.naoFazerTesteFreio = os.servicos.some(s => s.key === 'fluidoFreio') || undefined;
    os.naoFazerTesteCambio = os.servicos.some(s => s.key === 'cambioAutomatico' || s.key === 'cambioManual') || undefined;
    db.os.push(os);
    return os;
  };

  const ciclo = (v: Veiculo, mec: string, abertaEm: string, opts: { concluir: boolean; plano?: Partial<Plano> & { parar?: number }; extra?: Partial<OrdemServico> } = { concluir: true }) => {
    const os = abrir(v, abertaEm, opts.extra);
    os.status = 'andamento';
    os.mecanicoId = mec;
    os.iniciadaEm = new Date(new Date(abertaEm).getTime() + (6 + Math.floor(r() * 25)) * 60000).toISOString();
    const c = preencherChecklist(os, v, mec, os.iniciadaEm, opts.plano);
    const pend = pendenciasParaConcluir(c, db.evidencias).length > 0;
    if (opts.concluir) {
      c.concluidoEm = addDias(os.iniciadaEm, 0.012);
      c.concluidoPor = mec;
      if (!pend) c.status = 'concluido';
      else {
        // Checklist que não pôde ser completado só fecha com exceção autorizada pela liderança.
        c.status = 'excecao_autorizada';
        c.solicitacaoExcecao = {
          motivo: pick(['Cliente precisou sair antes da inspeção dos freios', 'Elevador ocupado — itens de baixo não avaliados', 'Sem câmera no momento para registrar a evidência']),
          solicitadoPor: mec, em: c.concluidoEm, status: 'aprovada', decididoPor: 'u_lid', decididoEm: c.concluidoEm, obsDecisao: 'Liberado; registrar na próxima visita.',
        };
      }
    }
    os.checklistId = c.id;
    db.checklists.push(c);
    criarOportunidades(os, c, opts.concluir);
    if (opts.concluir) {
      const fim = new Date(new Date(os.iniciadaEm).getTime() + (35 + Math.floor(r() * 45)) * 60000).toISOString();
      concluirOS(os, v, fim, (v.kmAtual || 30000) + 300 + Math.floor(r() * 6000), c);
    }
    return { os, c };
  };

  // ── Histórico legado do veículo de demonstração (antes do checklist existir) ──
  const legado = (v: Veiculo, dataISO: string, km: number, mec: string, servicos: ServicoKey[]) => {
    const os: OrdemServico = {
      id: `os${db.contadorOS + 1}`, numero: numero(), status: 'concluido', veiculoId: v.id, clienteId: v.clienteId, vendedorId: 'u_ven',
      mecanicoId: mec, abertaEm: dataISO, iniciadaEm: addDias(dataISO, 0.01), concluidaEm: addDias(dataISO, 0.05), km,
      servicos: servicos.map(k => ({ key: k, origem: 'balcao', executado: true })), valorInicial: 310, criadaPor: 'u_ven',
      obsInterna: 'Registro anterior ao checklist (migrado sem inspeção item a item).',
    };
    db.os.push(os);
    v.kmAtual = km; v.kmAtualEm = os.concluidaEm;
    concluirOS(os, v, os.concluidaEm!, km);
    return os;
  };
  legado(vDemo, '2026-03-12T13:20:00.000Z', 41800, 'u_m1', ['oleoMotor', 'filtroOleo']);
  legado(vDemo, '2026-06-18T15:10:00.000Z', 46950, 'u_m3', ['oleoMotor', 'filtroOleo', 'arMotor']);
  legado(vVencida, '2026-01-20T14:00:00.000Z', 80000, 'u_m2', ['oleoMotor', 'filtroOleo']);
  vVencida.kmAtual = 91200; // informado em visita posterior, sem troca de óleo → óleo vencido por km

  // Visita de setembro do veículo de demonstração já com checklist (recomendação "avaliar depois")
  const set = ciclo(vDemo, 'u_m1', '2026-09-05T12:40:00.000Z', {
    concluir: true, plano: { incompleto: false, semFoto: false, estados: { filtro_cabine: 'atencao', coxim_cambio: 'ok' } },
  });
  set.os.km = 52300; vDemo.kmAtual = 52300;
  db.manutencoes.filter(m => m.osOrigemId === set.os.id && m.servicoKey).forEach(m => {
    m.ultimaExecucao = { data: set.os.concluidaEm!, km: 52300 };
    if (m.servicoKey === 'oleoMotor') m.kmPrevisto = 52300 + 10000;
  });
  db.oportunidades.filter(o => o.osId === set.os.id).forEach(o => { o.situacao = 'avaliar_depois'; o.historico.push({ situacao: 'avaliar_depois', por: 'u_ven', em: set.os.concluidaEm!, obs: 'Cliente pediu para avaliar na próxima troca' }); });
  // Manutenção "próxima" por km
  const vProx = db.veiculos[5];
  legado(vProx, '2026-05-12T13:00:00.000Z', 60000, 'u_m5', ['oleoMotor', 'filtroOleo']);
  vProx.kmAtual = 69400;

  // ── Últimas semanas (desde o dia 1º, no mínimo 3 semanas): OS concluídas até ontem ──
  const diaExc = (() => { // um sábado anterior do mês, se houver
    for (let d = new Date(inicioHist + 'T15:00:00Z'); diaKey(d) < hoje; d = new Date(d.getTime() + 864e5)) if (d.getUTCDay() === 6) return diaKey(d);
    return null;
  })();
  if (diaExc) db.diasExcecao.push({ data: diaExc, declaradoPor: 'u_lid', motivo: 'Oficina lotada — ação de frota agendada', em: `${diaExc}T11:00:00.000Z` });

  let vi = 6;
  for (let d = new Date(inicioHist + 'T12:00:00Z'); diaKey(d) < hoje; d = new Date(d.getTime() + 864e5)) {
    if (d.getUTCDay() === 0) continue;
    const dia = diaKey(d);
    for (const mec of MECANICOS) {
      const n = Math.floor(PERFIL[mec].carrosDia + r());
      for (let k = 0; k < n; k++) {
        const v = db.veiculos[6 + (vi++ % (db.veiculos.length - 6))];
        const hora = 11 + Math.floor(r() * 9) + k; // 08h–17h BRT ≈ 11h–20h UTC
        ciclo(v, mec, `${dia}T${String(Math.min(hora, 20)).padStart(2, '0')}:${String(Math.floor(r() * 59)).padStart(2, '0')}:00.000Z`);
      }
    }
  }

  // ── Hoje ──
  const hojeAs = (h: number, m: number) => `${hoje}T${String(h + 3).padStart(2, '0')}:${String(m).padStart(2, '0')}:00.000Z`;
  const horaAgoraBRT = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hour12: false }).format(agora())) % 24;
  const hBase = Math.max(8, Math.min(horaAgoraBRT - 3, 14));
  ciclo(db.veiculos[10], 'u_m1', hojeAs(8, 5));
  ciclo(db.veiculos[11], 'u_m3', hojeAs(8, 20));
  ciclo(db.veiculos[12], 'u_m2', hojeAs(9, 0));
  ciclo(db.veiculos[13], 'u_m5', hojeAs(9, 40));
  const comLink = ciclo(db.veiculos[14], 'u_m1', hojeAs(Math.min(hBase, 12), 10), {
    concluir: true, plano: { incompleto: false, semFoto: false, estados: { filtro_ar_motor: 'atencao', coxim_cambio: 'prioritario', oleo_motor: 'ok', filtro_cabine: 'ok' } },
  });
  comLink.os.obsCliente = 'Coxim do câmbio com rachaduras na borracha. Recomendamos a troca o quanto antes.';
  // Em andamento: André com checklist pela metade; Diego com checklist completo e execução pendente
  const andA = ciclo(db.veiculos[15], 'u_m1', hojeAs(hBase + 1, 0), { concluir: false, plano: { parar: 7 } });
  andA.c.status = 'em_andamento';
  const andD = ciclo(db.veiculos[16], 'u_m3', hojeAs(hBase + 1, 15), { concluir: false, plano: { incompleto: false, semFoto: false } });
  andD.c.status = 'concluido'; andD.c.concluidoEm = addDias(andD.os.iniciadaEm!, 0.01); andD.c.concluidoPor = 'u_m3';
  // Aguardando
  const ag1 = abrir(vDemo, hojeAs(hBase + 1, 30));
  if (!ag1.servicos.some(s => s.key === 'fluidoFreio')) ag1.servicos.push({ key: 'fluidoFreio', marca: 'Bosch DOT4', quantidade: '1', origem: 'balcao', executado: false });
  ag1.naoFazerTesteFreio = true;
  abrir(vFrota, hojeAs(hBase + 1, 40), { naoOferecer: { alinhadoCom: 'Igor Martins (balcão)', marcadoPor: 'u_lid', em: hojeAs(hBase + 1, 41) } });
  abrir(db.veiculos[17], hojeAs(hBase + 1, 50));
  // Retorno: carro concluído no mês volta com problema → mesmo mecânico (regra do rodízio)
  const veiculosHoje = new Set(db.os.filter(o => o.abertaEm.slice(0, 10) === hoje).map(o => o.veiculoId));
  const recentesRafael = db.os.filter(o => o.status === 'concluido' && o.mecanicoId === 'u_m2' && o.abertaEm >= inicioHist);
  const origRet = recentesRafael.find(o => !veiculosHoje.has(o.veiculoId)) || recentesRafael[0];
  const ret = abrir(db.veiculos.find(v => v.id === origRet.veiculoId)!, hojeAs(hBase + 2, 0), { retornoDeOsId: origRet.id, valorInicial: 0, retorno: { problemaRelatado: 'Gotejamento de óleo embaixo do carro desde a troca.' } });
  ret.servicos = [];
  ret.naoFazerTesteFreio = undefined; ret.naoFazerTesteCambio = undefined;
  // Pausada: Eduardo aguardando peça (fica livre para outro carro enquanto isso)
  const pausada = ciclo(db.veiculos[18], 'u_m4', hojeAs(Math.max(8, hBase - 1), 10), { concluir: false, plano: { parar: 5 } });
  pausada.os.status = 'pausada';
  pausada.os.pausas = [{ inicio: addDias(pausada.os.iniciadaEm!, 0.015), motivo: 'peca', detalhe: 'Filtro de combustível — fornecedor entrega à tarde', por: 'u_m4' }];

  // ── Compartilhamentos: ativo, revogado e expirado ──
  db.compartilhamentos.push(
    { id: 'sh_ativo', osId: comLink.os.id, token: 'Dm0Ativo7xQ2pL9vR4tY1w', criadoPor: 'u_ven', criadoEm: comLink.os.concluidaEm!, expiraEm: addDias(comLink.os.concluidaEm!, 30), acessos: 1, ultimoAcessoEm: comLink.os.concluidaEm },
  );
  const osRev = db.os.filter(o => o.status === 'concluido' && o.checklistId).at(-12)!;
  db.compartilhamentos.push({ id: 'sh_revogado', osId: osRev.id, token: 'Dm0Revog3kP8sN2bV6cX0z', criadoPor: 'u_ven2', criadoEm: osRev.concluidaEm!, expiraEm: addDias(osRev.concluidaEm!, 30), revogadoEm: addDias(osRev.concluidaEm!, 1), revogadoPor: 'u_lid', motivoRevogacao: 'Enviado para o contato errado', acessos: 2 });
  const osExp = db.os.filter(o => o.status === 'concluido' && o.checklistId)[3];
  db.compartilhamentos.push({ id: 'sh_expirado', osId: osExp.id, token: 'Dm0Expir5mQ1wE7rT3yU9i', criadoPor: 'u_ven', criadoEm: osExp.concluidaEm!, expiraEm: addDias(osExp.concluidaEm!, 2), acessos: 4 });
  db.compartilhamentos.push({ id: 'sh_demo', osId: set.os.id, token: 'Dm0Histo4aZ6sX8dC2fV5g', criadoPor: 'u_ven', criadoEm: set.os.concluidaEm!, expiraEm: addDias(agoraISO, 20), acessos: 3 });

  // ── Metas ──
  const meta = (m: Meta) => db.metas.push(m);
  meta({ id: 'mt_checklist', nome: 'Checklist completo', descricao: 'Percentual das OS concluídas com checklist completo, sem exceção.', indicador: 'checklist_completo_pct', unidade: '%',
    regraCalculo: 'OS concluídas com checklist completo ÷ OS concluídas no período. Exceção autorizada não conta como completo e aparece separada.', elegibilidade: 'Todos os mecânicos ativos',
    escopo: { tipo: 'coletiva' }, responsavelId: 'u_lid', comunicadaEm: '2026-09-01T12:00:00.000Z',
    versoes: [
      { versao: 1, alvo: 90, vigenciaInicio: '2026-09-01', vigenciaFim: '2026-09-30', status: 'encerrada', definidaPor: 'u_lid', definidaEm: '2026-08-28T12:00:00.000Z', aprovadaPor: 'u_dir', aprovadaEm: '2026-08-29T12:00:00.000Z', justificativa: 'Piloto do checklist em setembro.' },
      { versao: 2, alvo: 95, vigenciaInicio: '2026-10-01', status: 'aprovada', definidaPor: 'u_lid', definidaEm: '2026-09-29T12:00:00.000Z', aprovadaPor: 'u_dir', aprovadaEm: '2026-09-30T12:00:00.000Z', justificativa: 'Piloto atingiu 91%; meta sobe para 95%.' },
    ] });
  meta({ id: 'mt_evid', nome: 'Evidência nos itens com recomendação', descricao: 'Itens marcados Atenção/Prioritário com foto quando a regra do item exige.', indicador: 'evidencias_pct', unidade: '%',
    regraCalculo: 'Itens com foto obrigatória que têm foto ÷ itens com foto obrigatória.', elegibilidade: 'Todos os mecânicos ativos', escopo: { tipo: 'coletiva' }, responsavelId: 'u_lid', comunicadaEm: '2026-10-01T12:00:00.000Z',
    versoes: [{ versao: 1, alvo: 100, vigenciaInicio: '2026-10-01', status: 'aprovada', definidaPor: 'u_dir', definidaEm: '2026-09-30T12:00:00.000Z', aprovadaPor: 'u_dir', aprovadaEm: '2026-09-30T12:00:00.000Z', justificativa: 'Sem foto não há como auditar a recomendação.' }] });
  const alvos: Record<string, number> = { u_m1: 30, u_m2: 22, u_m3: 32, u_m4: 12, u_m5: 22 };
  MECANICOS.forEach(mec => meta({
    id: `mt_itens_${mec}`, nome: 'Itens realizados no mês', descricao: 'Itens identificados no checklist e realizados (aceitos pelo cliente e executados).', indicador: 'itens_realizados', unidade: 'itens',
    regraCalculo: 'Serviços com origem "checklist" executados em OS concluídas do mecânico no mês.', elegibilidade: 'Mecânico ativo, mês completo',
    escopo: { tipo: 'individual', usuarioId: mec }, responsavelId: 'u_lid', comunicadaEm: '2026-10-01T12:00:00.000Z',
    versoes: [{ versao: 1, alvo: alvos[mec], vigenciaInicio: '2026-10-01', status: 'aprovada', definidaPor: 'u_lid', definidaEm: '2026-09-30T12:00:00.000Z', aprovadaPor: 'u_dir', aprovadaEm: '2026-09-30T13:00:00.000Z', justificativa: 'Meta de demonstração (valores fictícios).' }],
  }));
  const mM5 = db.metas.find(m => m.id === 'mt_itens_u_m5')!;
  mM5.versoes.push({ versao: 2, alvo: 26, vigenciaInicio: addDias(agoraISO, 5).slice(0, 10), status: 'rascunho', definidaPor: 'u_lid', definidaEm: addDias(agoraISO, -1), justificativa: 'Marcos está acima do ritmo; proposta de subir a meta na reta final.' });

  // ── Políticas ──
  db.politicas.push(
    { id: 'pol_vigente', nome: 'Comissão por upsell (sistema atual)', status: 'vigente', versao: 1, vigenciaInicio: '2026-06-30', fonte: 'index.html · FAIXAS_COMISSAO e calcularComissaoLub',
      descricao: 'Faixas 0/3/5/7% sobre o upsell do período com fator de ajuste; câmbio com teto de R$ 50 por OS; ajustes manuais subtraídos.', parametros: POLITICA_VIGENTE_PARAMS },
    { id: 'pol_playbook', nome: 'Remuneração por faturamento da bancada (Playbook)', status: 'proposta_em_teste', versao: 1, fonte: 'Playbook de Remuneração da Operação, 07/10/2026 — "percentuais são proposta de backtest, não política final"',
      descricao: 'Variável = faturamento × (taxa da faixa + acelerador por itens) × (1 + fator do score). Fixo por nível fora do cálculo.', parametros: POLITICA_PROPOSTA_PARAMS },
  );

  // ── Ocorrências ──
  const oc = (o: Ocorrencia) => db.ocorrencias.push(o);
  oc({ id: 'oc1', tipo: 'desconto', profissionalId: 'u_m2', dataHora: addDias(agoraISO, -6), categoria: 'Carro voltou com problema', descricao: 'Cliente voltou relatando gotejamento após troca de óleo; arruela do bujão não substituída.',
    osId: origRet.id, evidencias: [], regra: 'Playbook · Retrabalho/cliente', efeitoProposto: -3, registradaPor: 'u_lid', status: 'aplicada', validadaPor: 'u_dir', decisaoEm: addDias(agoraISO, -4),
    obsEncerramento: 'Conversa feita; combinado checar arruela em todas as trocas.',
    historico: [
      { status: 'registrada', por: 'u_lid', em: addDias(agoraISO, -6) }, { status: 'em_revisao', por: 'u_lid', em: addDias(agoraISO, -6) },
      { status: 'aprovada', por: 'u_dir', em: addDias(agoraISO, -4) }, { status: 'aplicada', por: 'u_dir', em: addDias(agoraISO, -4), obs: 'Entra no score de execução (proposta em teste).' },
    ] });
  oc({ id: 'oc2', tipo: 'desconto', profissionalId: 'u_m4', dataHora: addDias(agoraISO, -1), categoria: 'Ferramenta fora do lugar', descricao: 'Torquímetro deixado na bancada 3 ao fim do turno.',
    evidencias: [], regra: 'Playbook · Bancada', efeitoProposto: -2, registradaPor: 'u_lid', status: 'em_revisao',
    historico: [{ status: 'registrada', por: 'u_lid', em: addDias(agoraISO, -1) }, { status: 'em_revisao', por: 'u_lid', em: addDias(agoraISO, -1) }] });
  oc({ id: 'oc3', tipo: 'reconhecimento', profissionalId: 'u_m1', dataHora: addDias(agoraISO, -9), categoria: 'Trouxe a solução', descricao: 'Organizou o estoque de filtros por código, reduzindo tempo de busca.',
    evidencias: [], regra: 'Playbook · Recuperação', efeitoProposto: 1, registradaPor: 'u_lid', status: 'aplicada', validadaPor: 'u_dir', decisaoEm: addDias(agoraISO, -8),
    historico: [{ status: 'registrada', por: 'u_lid', em: addDias(agoraISO, -9) }, { status: 'em_revisao', por: 'u_lid', em: addDias(agoraISO, -9) }, { status: 'aprovada', por: 'u_dir', em: addDias(agoraISO, -8) }, { status: 'aplicada', por: 'u_dir', em: addDias(agoraISO, -8) }] });

  // ── Auditorias ──
  const ckMes = db.checklists.filter(c => c.status === 'concluido' && db.os.find(o => o.id === c.osId)?.status === 'concluido');
  ckMes.filter((_, i) => i % 9 === 0).slice(0, 10).forEach((c, i) => {
    const os = db.os.find(o => o.id === c.osId)!;
    db.auditorias.push({ id: `au${i}`, checklistId: c.id, osId: os.id, mecanicoId: os.mecanicoId!, auditorId: 'u_lid', em: addDias(os.concluidaEm!, 1), resultado: 'aprovado', inconsistencias: [], justificativa: 'Itens e fotos coerentes.' });
  });
  const ckDiego = ckMes.find(c => db.os.find(o => o.id === c.osId)?.mecanicoId === 'u_m3' && Object.values(c.itens).some(i => i.evidenciaIds.length))!;
  const itemFoto = Object.values(ckDiego.itens).find(i => i.evidenciaIds.length)!;
  db.auditorias.push({ id: 'au_corr', checklistId: ckDiego.id, osId: ckDiego.osId, mecanicoId: 'u_m3', auditorId: 'u_lid', em: addDias(agoraISO, -2), resultado: 'correcao_solicitada',
    inconsistencias: [{ itemDefId: itemFoto.defId, descricao: 'Foto não mostra o item com clareza; refazer a observação.' }], justificativa: 'Evidência insuficiente para sustentar a recomendação.' });
  ckDiego.correcaoSolicitada = { auditoriaId: 'au_corr', itens: [itemFoto.defId], motivo: 'Foto não mostra o item com clareza', em: addDias(agoraISO, -2), por: 'u_lid' };

  // ── Planos de ação ──
  db.planosAcao.push(
    { id: 'pa1', profissionalId: 'u_m4', data: addDias(agoraISO, -3), assunto: 'Checklist incompleto', combinados: 'Acompanhar 5 OS com a liderança; revisar instrução dos itens de freio.', prazo: addDias(agoraISO, 7).slice(0, 10), status: 'aberto', registradoPor: 'u_lid' },
    { id: 'pa2', profissionalId: 'u_m2', data: addDias(agoraISO, -6), assunto: 'Retorno por vazamento', combinados: 'Trocar arruela do bujão em toda troca; dupla checagem antes de liberar.', prazo: addDias(agoraISO, -1).slice(0, 10), status: 'concluido', registradoPor: 'u_lid', concluidoEm: addDias(agoraISO, -2) },
  );

  // ── Fechamentos mensais imutáveis dos meses anteriores ──
  const meses: string[] = [];
  for (let k = 5; k >= 1; k--) { const d = new Date(agoraISO); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - k); meses.push(mesKey(d)); }
  MECANICOS.forEach((mec, j) => meses.forEach((mes, k) => {
    const carros = Math.round(PERFIL[mec].carrosDia * 24 + (r() - 0.5) * 8);
    const piloto = k === meses.length - 1;
    const f: FechamentoMensal = {
      mes, usuarioId: mec, carros, checklistCompletoPct: piloto ? Math.round(PERFIL[mec].completo * 100 - 4 + r() * 4) : null,
      evidencias: piloto ? Math.round(carros * 0.5) : 0, itensRealizados: Math.round(carros * (0.25 + j * 0.02 + r() * 0.08)),
      faturamento: Math.round(carros * (780 + r() * 120)), upsell: Math.round(carros * (95 + r() * 40)), retornos: r() < 0.25 ? 1 : 0,
      politicaVersao: 'pol_vigente@1', fechadoEm: `${mes}-28T23:00:00.000Z`,
    };
    db.fechamentos.push(f);
  }));

  // ── Rodízio do dia ──
  db.rodizio = { dia: hoje, status: { u_m1: 'disponivel', u_m2: 'disponivel', u_m3: 'disponivel', u_m4: 'disponivel', u_m5: 'almoco' } };

  db.eventos.push({ id: 'ev_seed', em: agoraISO, por: 'sistema', tipo: 'demo.gerada', entidade: 'db', entidadeId: 'demo', resumo: 'Base de demonstração gerada (dados fictícios)' });
  return db;
}
