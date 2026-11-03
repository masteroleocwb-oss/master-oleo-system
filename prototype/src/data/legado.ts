// Ponte com o sistema atual (index.html na main): as OS continuam na coleção `orders`, no formato dele.
// Assim comissões, faturamento, Consulta e o painel do chefe do sistema atual seguem corretos, e a
// oficina pode voltar para o sistema atual a qualquer momento sem perder nada.
// O que o sistema atual não tem (checklist, pausas, ofertas, quem fez o quê) vai num mapa `plataforma`
// dentro da própria OS, que o sistema atual simplesmente ignora.
import { SERVICO_KEYS } from '../domain/catalogo';
import type { Cliente, OrdemServico, ServicoKey, ServicoOS, Usuario, Veiculo } from '../domain/types';
import { normalizarPlaca, primeiroNome, TZ } from '../domain/util';

export type DocLegado = Record<string, unknown>;

/** Campos de detalhe de cada serviço no documento do sistema atual. */
export const CAMPOS_LEGADO: Record<ServicoKey, { marca?: string; quantidade?: string; codigo?: string; extras?: Record<string, unknown> }> = {
  oleoMotor: { marca: 'oleoMarca', quantidade: 'oleoQuantidade' },
  fluidoFreio: { marca: 'fluidoFreioMarca', quantidade: 'fluidoFreioQuantidade' },
  filtroOleo: { codigo: 'filtroOleoTipo' },
  arMotor: { codigo: 'arMotorCodigo' },
  arCondicionado: { codigo: 'arCondicionadoCodigo' },
  filtroCombustivel: { codigo: 'filtroCombustivelCodigo' },
  cambioManual: { marca: 'cambioManualMarca', quantidade: 'cambioManualQuantidade' },
  cambioAutomatico: { marca: 'cambioAutomaticoMarca', quantidade: 'cambioAutomaticoQuantidade', extras: { cambioAutomaticoTemFiltro: false, cambioAutomaticoFiltroCodigo: '', cambioAutomaticoFluidoCarter: '' } },
  difDianteiro: { marca: 'difDianteiroMarca', quantidade: 'difDianteiroQuantidade' },
  difTraseiro: { marca: 'difTraseiroMarca', quantidade: 'difTraseiroQuantidade' },
  caixaTransferencia: { marca: 'caixaTransferenciaMarca', quantidade: 'caixaTransferenciaQuantidade' },
  higienizacaoAC: { extras: { higienizacaoACGratis: false } },
  palhetas: { codigo: 'palhetasCodigo' },
  militec: {},
  aditivo: { marca: 'aditivoQual' },
  flush: { marca: 'flushDescricao' },
};

// ───────────────────────── Datas ─────────────────────────

/** "DD/MM/AAAA, HH:mm:ss" no horário de Brasília, igual ao sistema atual (inicio/fim). */
export const brDeISO = (iso: string) => new Date(iso).toLocaleString('pt-BR', {
  timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
});

/** Lê o "DD/MM/AAAA, HH:mm:ss" do sistema atual (Brasília, sem horário de verão desde 2019). */
export const isoDeBR = (s: unknown): string | undefined => {
  if (typeof s !== 'string' || !s.trim()) {
    const t = s as { toDate?: () => Date } | null;
    return t && typeof t.toDate === 'function' ? t.toDate().toISOString() : undefined;
  }
  const m = s.replace(',', '').trim().match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) { const d = new Date(s); return Number.isNaN(d.getTime()) ? undefined : d.toISOString(); }
  const [, dia, mes, ano, h, min, seg = '00'] = m;
  return new Date(`${ano}-${mes}-${dia}T${h}:${min}:${seg}-03:00`).toISOString();
};

/** "1h 5min", como o sistema atual grava tempoEspera/tempoServico. */
export const duracaoLegado = (deISO?: string, ateISO?: string) => {
  if (!deISO || !ateISO) return 'N/A';
  const ms = Date.parse(ateISO) - Date.parse(deISO);
  if (!(ms >= 0)) return 'N/A';
  const min = Math.floor(ms / 60000);
  return `${Math.floor(min / 60)}h ${min % 60}min`;
};

// ───────────────────────── Nomes ─────────────────────────

/** Mesma regra do sistema atual para agrupar variações do nome do mecânico. */
export const normalizarLubrificador = (nome: unknown): string | null => {
  if (typeof nome !== 'string' || !nome.trim()) return 'Sem lubrificador';
  const n = nome.trim().toLowerCase();
  if (['leo', 'léo', 'lep'].includes(n)) return 'Leo';
  if (n.includes('pedro')) return 'Pedro';
  if (n.includes('caio')) return 'Caio';
  if (n.includes('luis') || n.includes('luís') || n.includes('luiz')) return 'Luis';
  if (n.includes('joilson') || n.includes('joelson') || n.includes('joulson')) return 'Joilson';
  if (n.includes('thiago') || n.includes('tiago') || n.includes('thyago') || n.includes('tyago')) return 'Thiago';
  if (n.includes('maciel')) return 'Maciel';
  if (n.includes('jackson') || n.includes('jakson')) return 'Jackson';
  if (n.includes('italo') || n.includes('ítalo')) return 'Italo';
  if (n === 'bruno') return null;
  const l = nome.trim();
  return l.charAt(0).toUpperCase() + l.slice(1).toLowerCase();
};

/** Nome com que a pessoa aparece no sistema atual (vendedor/lubrificador). A direção pode ajustar. */
export const nomeLegadoDe = (u: Pick<Usuario, 'nome' | 'nomeLegado'>) =>
  u.nomeLegado?.trim() || normalizarLubrificador(primeiroNome(u.nome)) || primeiroNome(u.nome);

const chaveNome = (s: string) => s.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Liga os nomes do sistema atual às contas de login. Nomes sem conta viram "pessoas do sistema atual" inativas. */
export class MapaNomes {
  private porChave = new Map<string, string>();
  readonly semConta = new Map<string, Usuario>();
  constructor(private usuarios: Usuario[]) {
    for (const u of usuarios) this.porChave.set(chaveNome(nomeLegadoDe(u)), u.id);
  }
  /** Id da conta para um nome do sistema atual (mecânico usa a normalização do sistema atual). */
  id(nome: unknown, papel: 'mecanico' | 'vendedor'): string | undefined {
    if (typeof nome !== 'string' || !nome.trim() || nome === '—') return undefined;
    const base = papel === 'mecanico' ? normalizarLubrificador(nome) : nome.trim();
    if (!base || base === 'Sem lubrificador') return undefined;
    const achado = this.porChave.get(chaveNome(base));
    if (achado) return achado;
    const id = `legado:${base}`;
    if (!this.semConta.has(id)) this.semConta.set(id, { id, nome: base, role: papel, ativo: false, criadoEm: '2020-01-01T00:00:00.000Z', nomeLegado: base });
    return id;
  }
  nome(id: string | undefined): string {
    if (!id) return '';
    const u = this.usuarios.find(x => x.id === id) || this.semConta.get(id);
    return u ? nomeLegadoDe(u) : '';
  }
}

// ───────────────────────── Veículo e cliente ─────────────────────────

export const idVeiculo = (placa: string) => `v_${normalizarPlaca(placa)}`;
export const idCliente = (placa: string) => `c_${normalizarPlaca(placa)}`;

const txt = (x: unknown) => (typeof x === 'string' ? x.trim() : x == null ? '' : String(x).trim());
const num = (x: unknown) => { const n = typeof x === 'number' ? x : parseFloat(String(x ?? '').replace(/\./g, '').replace(',', '.')); return Number.isFinite(n) ? n : undefined; };
/** valorInicial/valorUpsell vêm como texto ("250.00") ou número. */
const valor = (x: unknown) => { const n = typeof x === 'number' ? x : parseFloat(String(x ?? '')); return Number.isFinite(n) ? n : 0; };

const cambioDe = (x: unknown): Veiculo['cambio'] => (/auto/i.test(txt(x)) ? 'automatico' : 'manual');
const COMBUSTIVEIS: Veiculo['combustivel'][] = ['Flex', 'Gasolina', 'Diesel', 'GNV'];
const combustivelDe = (x: unknown): Veiculo['combustivel'] => COMBUSTIVEIS.find(c => c.toLowerCase() === txt(x).toLowerCase()) || 'Flex';

/** Momento de referência da OS para ordenar o histórico. */
const quando = (o: DocLegado) => isoDeBR(o.fim) || txt(o.dataHora) || '';

/** Veículos e clientes saem das OS: o cadastro mais recente de cada placa vence. */
export function derivarCadastros(orders: [string, DocLegado][]): { veiculos: Veiculo[]; clientes: Cliente[] } {
  const porPlaca = new Map<string, DocLegado[]>();
  for (const [, o] of orders) {
    const p = normalizarPlaca(txt(o.placa));
    if (!p) continue;
    (porPlaca.get(p) || porPlaca.set(p, []).get(p)!).push(o);
  }
  const veiculos: Veiculo[] = [];
  const clientes: Cliente[] = [];
  for (const [placa, lista] of porPlaca) {
    lista.sort((a, b) => quando(a).localeCompare(quando(b)));
    const ultimo = <K extends string>(campo: K) => { for (let i = lista.length - 1; i >= 0; i--) { const v = txt(lista[i][campo]); if (v) return v; } return undefined; };
    const comKm = lista.filter(o => o.status === 'concluido' && num(o.km) != null);
    const kmUlt = comKm.at(-1);
    const kmPorMes = num(ultimo('kmPorMes'));
    veiculos.push({
      id: idVeiculo(placa), placa, placasAnteriores: [],
      marca: ultimo('marca') || '', modelo: ultimo('modelo') || '', ano: num(ultimo('ano')) || 0, motor: ultimo('motor') || '',
      cambio: cambioDe(ultimo('cambio')), combustivel: combustivelDe(ultimo('combustivel')), clienteId: idCliente(placa),
      kmAtual: kmUlt ? num(kmUlt.km) : undefined, kmAtualEm: kmUlt ? quando(kmUlt) : undefined,
      ...(kmPorMes ? { kmPorMes } : {}),
    });
    clientes.push({
      id: idCliente(placa), nome: ultimo('cliente') || 'Cliente sem nome', telefone: ultimo('tel'), tipo: 'particular',
      comoConheceu: ultimo('comoConheceu'), comoConheceuDetalhe: ultimo('comoConheceuDetalhe'), cidade: ultimo('cidade'), bairro: ultimo('bairro'),
    });
  }
  return { veiculos, clientes };
}

// ───────────────────────── OS: sistema atual → sistema novo ─────────────────────────

/** O que só o sistema novo sabe sobre a OS (o sistema atual ignora este mapa). */
export interface Plataforma {
  vendedorId?: string;
  mecanicoId?: string;
  criadaPor?: string;
  /** Serviços fora do balcão (recomendação do checklist e adicionais da bancada). */
  extras?: ServicoOS[];
  /** Execução dos serviços de balcão. */
  execucao?: Partial<Record<ServicoKey, { executado: boolean; quantidadeExecutada?: string; intervaloKm?: number }>>;
  ofertas?: OrdemServico['ofertas'];
  pausas?: OrdemServico['pausas'];
  foraDaOrdem?: OrdemServico['foraDaOrdem'];
  checklistId?: string;
  naoOferecer?: OrdemServico['naoOferecer'];
  retornoDeOsId?: string;
  atendimentoRetorno?: OrdemServico['retorno'];
  canceladaMotivo?: string;
  obsCliente?: string;
  /** Horários exatos (o sistema atual guarda só até o segundo). Valem enquanto baterem com inicio/fim. */
  iniciadaEm?: string;
  concluidaEm?: string;
}

const STATUS_VALIDOS = new Set(['aguardando', 'andamento', 'concluido', 'encerrada', 'cancelada']);

export function osDeLegado(id: string, o: DocLegado, nomes: MapaNomes): OrdemServico {
  const p = (o.plataforma || {}) as Plataforma;
  const placa = normalizarPlaca(txt(o.placa));
  const statusBase = STATUS_VALIDOS.has(txt(o.status)) ? (txt(o.status) as OrdemServico['status']) : 'aguardando';
  const pausada = statusBase === 'andamento' && !!p.pausas?.length && !p.pausas.at(-1)!.fim;
  const concluida = statusBase === 'concluido' || statusBase === 'encerrada';
  const mecanicoId = p.mecanicoId || nomes.id(o.lubrificador, 'mecanico');
  // Horário exato do sistema novo, se o sistema atual não tiver editado o horário depois.
  const exato = (preciso: string | undefined, br: unknown) => (preciso && typeof br === 'string' && brDeISO(preciso) === br ? preciso : isoDeBR(br));
  const concluidaEm = exato(p.concluidaEm, o.fim);

  const servicos: ServicoOS[] = [];
  for (const key of SERVICO_KEYS) {
    if (o[key] !== true) continue;
    const c = CAMPOS_LEGADO[key];
    const ex = p.execucao?.[key];
    servicos.push({
      key, origem: 'balcao',
      marca: c.marca ? txt(o[c.marca]) || undefined : undefined,
      quantidade: c.quantidade ? txt(o[c.quantidade]) || undefined : undefined,
      codigo: c.codigo ? txt(o[c.codigo]) || undefined : undefined,
      executado: ex ? ex.executado : concluida,
      ...(ex?.quantidadeExecutada ? { quantidadeExecutada: ex.quantidadeExecutada } : {}),
      ...(ex?.intervaloKm ? { intervaloKm: ex.intervaloKm } : {}),
    });
  }
  const upsells = (o.upsells || {}) as Record<string, { aceito?: string; valor?: unknown }>;
  if (p.extras) servicos.push(...p.extras.filter(s => !servicos.some(x => x.key === s.key)));
  else {
    for (const [k, u] of Object.entries(upsells)) {
      if (u?.aceito !== 'sim' || !SERVICO_KEYS.includes(k as ServicoKey) || servicos.some(x => x.key === k)) continue;
      servicos.push({ key: k as ServicoKey, origem: 'adicional', executado: true, valor: valor(u.valor) || undefined });
    }
  }
  const ofertas = p.ofertas ?? Object.entries(upsells)
    .filter(([k, u]) => SERVICO_KEYS.includes(k as ServicoKey) && (u?.aceito === 'sim' || u?.aceito === 'nao' || u?.aceito === 'sem-estoque'))
    .map(([k, u]) => ({ key: k as ServicoKey, resultado: u.aceito === 'sim' ? 'aceito' as const : 'recusado' as const, por: mecanicoId || '', em: concluidaEm || txt(o.dataHora) }));

  const os: OrdemServico = {
    id,
    numero: typeof o.numeroOrdem === 'number' ? o.numeroOrdem : num(o.numeroOrdem) || 0,
    status: pausada ? 'pausada' : statusBase,
    veiculoId: idVeiculo(placa),
    clienteId: idCliente(placa),
    vendedorId: p.vendedorId || nomes.id(o.vendedor, 'vendedor') || '',
    abertaEm: txt(o.dataHora) || isoDeBR(o.createdAt) || new Date(0).toISOString(),
    servicos,
    valorInicial: valor(o.valorInicial),
    criadaPor: p.criadaPor || 'sistema',
    naoFazerTesteFreio: o.execFreioSemQuestionar !== false,
    naoFazerTesteCambio: o.execCambioSemQuestionar !== false,
  };
  const opc: Partial<OrdemServico> = {
    pedidoOlist: txt(o.pedidoOlist) || undefined,
    mecanicoId,
    iniciadaEm: exato(p.iniciadaEm, o.inicio),
    concluidaEm,
    km: num(o.km),
    obsInterna: txt(o.obsCarro) || undefined,
    obsCliente: p.obsCliente,
    pausas: p.pausas,
    ofertas: ofertas.length ? ofertas : undefined,
    foraDaOrdem: p.foraDaOrdem,
    checklistId: p.checklistId,
    naoOferecer: p.naoOferecer,
    retornoDeOsId: p.retornoDeOsId,
    retorno: p.atendimentoRetorno,
    canceladaMotivo: p.canceladaMotivo,
  };
  for (const [k, v] of Object.entries(opc)) if (v !== undefined) (os as unknown as Record<string, unknown>)[k] = v;
  return os;
}

// ───────────────────────── OS: sistema novo → sistema atual ─────────────────────────

const limpar = <T,>(x: T): T => JSON.parse(JSON.stringify(x ?? null)) ?? undefined;

/**
 * Documento completo da OS no formato do sistema atual (sem numeroOrdem/createdAt, que só nascem na criação).
 * Campos de finalização só aparecem quando a OS está concluída, como no sistema atual.
 */
export function legadoDeOS(os: OrdemServico, v: Veiculo | undefined, c: Cliente | undefined, nomes: MapaNomes): DocLegado {
  const d: DocLegado = {
    status: os.status === 'pausada' ? 'andamento' : os.status,
    dataHora: os.abertaEm,
    vendedor: nomes.nome(os.vendedorId),
    lubrificador: nomes.nome(os.mecanicoId),
    cliente: c?.nome || '',
    tel: c?.telefone || '',
    placa: v ? normalizarPlaca(v.placa) : '',
    marca: v?.marca || '',
    modelo: v?.modelo || '',
    motor: v?.motor || '',
    ano: v?.ano ? String(v.ano) : '',
    cambio: v?.cambio === 'automatico' ? 'Automático' : 'Manual',
    combustivel: v?.combustivel || 'Flex',
    valorInicial: os.valorInicial.toFixed(2),
    execFreioSemQuestionar: !!os.naoFazerTesteFreio,
    execCambioSemQuestionar: !!os.naoFazerTesteCambio,
    km: os.km != null ? String(os.km) : '',
    obsCarro: os.obsInterna || '',
  };
  // Cadastro que o sistema atual não pede: fica na OS, como o resto do cadastro do cliente.
  if (os.pedidoOlist) d.pedidoOlist = os.pedidoOlist;
  if (c?.comoConheceu) d.comoConheceu = c.comoConheceu;
  if (c?.comoConheceuDetalhe) d.comoConheceuDetalhe = c.comoConheceuDetalhe;
  if (c?.cidade) d.cidade = c.cidade;
  if (c?.bairro) d.bairro = c.bairro;
  if (v?.kmPorMes) d.kmPorMes = v.kmPorMes;
  if (os.iniciadaEm) d.inicio = brDeISO(os.iniciadaEm);
  if (os.concluidaEm && (os.status === 'concluido' || os.status === 'encerrada')) d.fim = brDeISO(os.concluidaEm);

  const balcao = os.servicos.filter(s => s.origem === 'balcao');
  for (const key of SERVICO_KEYS) {
    const s = balcao.find(x => x.key === key);
    const c2 = CAMPOS_LEGADO[key];
    d[key] = !!s;
    if (c2.marca) d[c2.marca] = s?.marca || '';
    if (c2.quantidade) d[c2.quantidade] = s?.quantidade || '';
    if (c2.codigo) d[c2.codigo] = s?.codigo || '';
  }

  const extras = os.servicos.filter(s => s.origem !== 'balcao');
  const execucao: Plataforma['execucao'] = {};
  for (const s of balcao) execucao[s.key] = { executado: s.executado, ...(s.quantidadeExecutada ? { quantidadeExecutada: s.quantidadeExecutada } : {}), ...(s.intervaloKm ? { intervaloKm: s.intervaloKm } : {}) };
  const plataforma: Plataforma = {
    vendedorId: os.vendedorId, mecanicoId: os.mecanicoId, criadaPor: os.criadaPor, extras, execucao,
    ofertas: os.ofertas, pausas: os.pausas, foraDaOrdem: os.foraDaOrdem, checklistId: os.checklistId, naoOferecer: os.naoOferecer,
    retornoDeOsId: os.retornoDeOsId, atendimentoRetorno: os.retorno, canceladaMotivo: os.canceladaMotivo, obsCliente: os.obsCliente,
    iniciadaEm: os.iniciadaEm, concluidaEm: os.status === 'concluido' || os.status === 'encerrada' ? os.concluidaEm : undefined,
  };
  d.plataforma = limpar(plataforma);

  if (os.status === 'concluido') {
    // Upsell = vendido além do balcão e executado (mesma conta da comissão do sistema atual).
    const aceitos = extras.filter(s => s.executado);
    const upsells: Record<string, { oferecido: boolean; aceito: string; valor: string; origem?: string }> = {};
    for (const s of aceitos) upsells[s.key] = { oferecido: true, aceito: 'sim', valor: (s.valor || 0).toFixed(2), origem: s.origem };
    for (const of of os.ofertas || []) if (of.resultado === 'recusado' && !upsells[of.key]) upsells[of.key] = { oferecido: true, aceito: 'nao', valor: '0.00' };
    const valorUpsell = aceitos.reduce((a, s) => a + (s.valor || 0), 0);
    const ofertasFeitas = Object.keys(upsells).length;
    d.upsells = upsells;
    d.valorUpsell = valorUpsell;
    d.valorTotal = os.valorInicial + valorUpsell;
    d.fezUpsell = aceitos.length > 0;
    d.quantidadeItensUpsell = aceitos.length;
    d.totalOfertasFeitas = ofertasFeitas;
    d.clienteAptoRecebeuOferta = ofertasFeitas > 0;
    d.taxaConversaoOferta = ofertasFeitas ? (aceitos.length / ofertasFeitas) * 100 : 0;
    d.tempoEspera = duracaoLegado(os.abertaEm, os.iniciadaEm);
    d.tempoServico = duracaoLegado(os.iniciadaEm, os.concluidaEm);
    d.obsOferta = '';
  }
  return d;
}

/** Campos que o sistema atual sempre grava na criação e que o novo não usa: ficam com o valor padrão. */
export const PADRAO_CRIACAO: DocLegado = {
  cpf: '', dataNascimento: '',
  ...Object.assign({}, ...Object.values(CAMPOS_LEGADO).map(c => c.extras || {})),
};

/** Campos que mudaram entre duas versões (comparação por valor). */
export const camposAlterados = (a: DocLegado, b: DocLegado) =>
  [...new Set([...Object.keys(a), ...Object.keys(b)])].filter(k => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
