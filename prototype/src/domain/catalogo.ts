// Catálogos: os 16 serviços do sistema atual (chaves preservadas) e o catálogo
// inicial de itens de inspeção (Playbook — checklist fase 1 + itens pedidos pela direção).
import type { EstadoItem, ItemInspecaoDef, RegraIntervalo, ServicoKey } from './types';

export const SERVICOS: Record<ServicoKey, { nome: string; campos: ('marca' | 'quantidade' | 'codigo')[] }> = {
  oleoMotor: { nome: 'Óleo de motor', campos: ['marca', 'quantidade'] },
  fluidoFreio: { nome: 'Fluido de freio', campos: ['marca', 'quantidade'] },
  filtroOleo: { nome: 'Filtro de óleo', campos: ['codigo'] },
  arMotor: { nome: 'Filtro de ar do motor', campos: ['codigo'] },
  arCondicionado: { nome: 'Filtro de cabine (ar-condicionado)', campos: ['codigo'] },
  filtroCombustivel: { nome: 'Filtro de combustível', campos: ['codigo'] },
  cambioManual: { nome: 'Troca de óleo do câmbio manual', campos: ['marca', 'quantidade'] },
  cambioAutomatico: { nome: 'Troca de fluido do câmbio automático', campos: ['marca', 'quantidade'] },
  difDianteiro: { nome: 'Óleo do diferencial dianteiro', campos: ['marca', 'quantidade'] },
  difTraseiro: { nome: 'Óleo do diferencial traseiro', campos: ['marca', 'quantidade'] },
  caixaTransferencia: { nome: 'Óleo da caixa de transferência', campos: ['marca', 'quantidade'] },
  higienizacaoAC: { nome: 'Higienização do ar-condicionado', campos: [] },
  palhetas: { nome: 'Palhetas', campos: ['codigo'] },
  militec: { nome: 'Militec/Nano', campos: [] },
  aditivo: { nome: 'Aditivo', campos: ['marca'] },
  flush: { nome: 'Flush', campos: [] },
};
export const SERVICO_KEYS = Object.keys(SERVICOS) as ServicoKey[];

/** Rótulos curtos que o mecânico entende sem treinamento. */
export const ESTADOS: Record<EstadoItem, { rotulo: string; curto: string; cliente: string; tom: 'neutro' | 'ok' | 'atencao' | 'critico' | 'info' | 'muted'; icone: string }> = {
  nao_verificado: { rotulo: 'A verificar', curto: 'A verificar', cliente: '—', tom: 'neutro', icone: '○' },
  ok: { rotulo: 'OK — em bom estado', curto: 'OK', cliente: 'Em bom estado', tom: 'ok', icone: '✓' },
  atencao: { rotulo: 'Atenção — recomendar', curto: 'Atenção', cliente: 'Recomendamos acompanhar', tom: 'atencao', icone: '!' },
  prioritario: { rotulo: 'Prioritário — agir logo', curto: 'Prioritário', cliente: 'Recomendamos ação prioritária', tom: 'critico', icone: '‼' },
  nao_aplicavel: { rotulo: 'Não se aplica', curto: 'Não se aplica', cliente: 'Não se aplica ao veículo', tom: 'muted', icone: '–' },
  pendente_avaliacao: { rotulo: 'Sem como avaliar agora', curto: 'Avaliar depois', cliente: 'Avaliação pendente', tom: 'info', icone: '?' },
};

export const ESTADOS_ORDEM: EstadoItem[] = ['ok', 'atencao', 'prioritario', 'nao_aplicavel', 'pendente_avaliacao'];

const TODOS: EstadoItem[] = ['ok', 'atencao', 'prioritario', 'nao_aplicavel', 'pendente_avaliacao'];

const item = (d: Omit<ItemInspecaoDef, 'ativo' | 'versao' | 'estadosPermitidos' | 'permiteRecomendacao'> & Partial<ItemInspecaoDef>): ItemInspecaoDef => ({
  ativo: true, versao: 1, estadosPermitidos: TODOS, permiteRecomendacao: true, ...d,
});

export const GRUPOS = ['Filtros', 'Motor', 'Câmbio', 'Freios', 'Demais itens'];

/** Catálogo inicial. Critérios de condição ainda não definidos no playbook → instruções são proposta (ver OPEN_DECISIONS). */
export const CATALOGO_INICIAL: ItemInspecaoDef[] = [
  item({ id: 'filtro_ar_motor', grupo: 'Filtros', nome: 'Filtro de ar do motor', tipo: 'visual', fonte: 'playbook_fase1', servicoRelacionado: 'arMotor', regraIntervaloId: 'r_ar_motor',
    instrucao: 'Retire a tampa da caixa do filtro e olhe o elemento contra a luz. Fotografe o lado sujo se marcar Atenção ou Prioritário.', fotoObrigatoriaEm: ['atencao', 'prioritario'] }),
  item({ id: 'filtro_combustivel', grupo: 'Filtros', nome: 'Filtro de combustível', tipo: 'visual', fonte: 'playbook_fase1', servicoRelacionado: 'filtroCombustivel',
    instrucao: 'Localize o filtro, verifique sinais de vazamento, oxidação e a data/km da última troca registrada.', fotoObrigatoriaEm: ['prioritario'] }),
  item({ id: 'filtro_cabine', grupo: 'Filtros', nome: 'Filtro de cabine (ar-condicionado)', tipo: 'visual', fonte: 'playbook_fase1', servicoRelacionado: 'arCondicionado',
    instrucao: 'Abra o porta-luvas, retire o filtro e verifique sujeira, folhas e odor.', fotoObrigatoriaEm: ['atencao', 'prioritario'] }),

  item({ id: 'oleo_motor', grupo: 'Motor', nome: 'Óleo do motor (nível e aspecto)', tipo: 'visual', fonte: 'playbook_fase1', servicoRelacionado: 'oleoMotor', regraIntervaloId: 'r_oleo_motor',
    instrucao: 'Com o motor desligado, confira nível na vareta e aspecto (cor, borra, cheiro de combustível).', fotoObrigatoriaEm: ['prioritario'] }),
  item({ id: 'vazamento_motor', grupo: 'Motor', nome: 'Vazamentos no motor', tipo: 'visual', fonte: 'playbook_fase1',
    instrucao: 'Com o carro no elevador, procure óleo no cárter, tampa de válvulas e retentores.', fotoObrigatoriaEm: ['atencao', 'prioritario'], permiteRecomendacao: true }),
  item({ id: 'arrefecimento', grupo: 'Motor', nome: 'Líquido de arrefecimento', tipo: 'visual', fonte: 'playbook_fase1', servicoRelacionado: 'aditivo',
    instrucao: 'Motor frio: confira nível no reservatório e cor do líquido.', fotoObrigatoriaEm: ['prioritario'] }),
  item({ id: 'trocador_calor', grupo: 'Motor', nome: 'Trocador de calor', tipo: 'visual', fonte: 'pedido_direcao',
    instrucao: 'Verifique sinais de vazamento e mistura óleo/água no trocador e mangueiras.', fotoObrigatoriaEm: ['atencao', 'prioritario'] }),

  item({ id: 'fluido_cambio', grupo: 'Câmbio', nome: 'Fluido do câmbio (nível e aspecto)', tipo: 'visual', fonte: 'playbook_fase1', servicoRelacionado: 'cambioAutomatico', regraIntervaloId: 'r_cambio_auto',
    aplicavelA: { cambio: 'automatico' }, instrucao: 'Confira nível e cor do fluido conforme o procedimento do modelo.', fotoObrigatoriaEm: ['atencao', 'prioritario'] }),
  item({ id: 'oleo_cambio_manual', grupo: 'Câmbio', nome: 'Óleo do câmbio manual', tipo: 'visual', fonte: 'playbook_fase1', servicoRelacionado: 'cambioManual',
    aplicavelA: { cambio: 'manual' }, instrucao: 'Verifique vazamentos e, se acessível, o nível pelo bujão.', fotoObrigatoriaEm: ['prioritario'] }),
  item({ id: 'coxim_cambio', grupo: 'Câmbio', nome: 'Coxim do câmbio', tipo: 'visual', fonte: 'pedido_direcao',
    instrucao: 'Com o carro no elevador, verifique rachaduras e folga na borracha do coxim.', fotoObrigatoriaEm: ['atencao', 'prioritario'] }),

  item({ id: 'fluido_freio', grupo: 'Freios', nome: 'Fluido de freio', tipo: 'visual_e_teste', fonte: 'playbook_fase1', servicoRelacionado: 'fluidoFreio', regraIntervaloId: 'r_fluido_freio',
    instrucao: 'Confira nível e cor no reservatório. Se a OS tem "NÃO FAZER TESTE — SÓ EXECUTAR", só registre o aspecto.', fotoObrigatoriaEm: ['prioritario'] }),
  item({ id: 'pastilhas', grupo: 'Freios', nome: 'Pastilhas de freio', tipo: 'visual', fonte: 'playbook_fase1',
    instrucao: 'Olhe pela roda ou pelo elevador a espessura do material de atrito.', fotoObrigatoriaEm: ['atencao', 'prioritario'] }),
  item({ id: 'discos', grupo: 'Freios', nome: 'Discos de freio', tipo: 'visual', fonte: 'playbook_fase1',
    instrucao: 'Verifique sulcos, rebarba na borda e manchas de superaquecimento.', fotoObrigatoriaEm: ['atencao', 'prioritario'] }),

  item({ id: 'palhetas', grupo: 'Demais itens', nome: 'Palhetas do limpador', tipo: 'visual', fonte: 'catalogo_atual', servicoRelacionado: 'palhetas',
    instrucao: 'Verifique borracha ressecada ou rasgada e se limpa sem deixar faixas.', fotoObrigatoriaEm: [] }),
  item({ id: 'diferencial', grupo: 'Demais itens', nome: 'Diferencial / caixa de transferência', tipo: 'visual', fonte: 'catalogo_atual', servicoRelacionado: 'difTraseiro',
    instrucao: 'Só em veículos com diferencial ou tração 4x4: procure vazamentos nos retentores.', fotoObrigatoriaEm: ['prioritario'] }),
];

/**
 * Regras de intervalo de DEMONSTRAÇÃO. Os valores são fictícios e estão marcados como tal:
 * nenhum documento da Master Óleo define intervalos (ver OPEN_DECISIONS).
 */
export const REGRAS_INICIAIS: RegraIntervalo[] = [
  { id: 'r_oleo_motor', nome: 'Óleo de motor', servicoKey: 'oleoMotor', km: 10000, meses: 12, origem: 'interna', validada: true, validadaPor: 'u_dir',
    fonte: 'Regra interna FICTÍCIA de demonstração — substituir pela regra aprovada pela direção', ativo: true },
  { id: 'r_fluido_freio', nome: 'Fluido de freio', servicoKey: 'fluidoFreio', meses: 24, origem: 'fabricante', validada: true, validadaPor: 'u_dir',
    fonte: 'Exemplo de recomendação de fabricante (dado fictício de demonstração)', ativo: true },
  { id: 'r_ar_motor', nome: 'Filtro de ar do motor', servicoKey: 'arMotor', km: 15000, origem: 'interna', validada: true, validadaPor: 'u_dir',
    fonte: 'Regra interna FICTÍCIA de demonstração', ativo: true },
  { id: 'r_cambio_auto', nome: 'Fluido do câmbio automático', servicoKey: 'cambioAutomatico', origem: 'nao_confirmada', validada: false,
    fonte: 'Sem intervalo validado — varia por modelo; exige consulta ao manual do veículo', ativo: true, aplicavelA: { cambio: 'automatico' } },
];

export const ORIGEM_LABEL: Record<RegraIntervalo['origem'], { rotulo: string; cliente: string }> = {
  fabricante: { rotulo: 'Recomendação do fabricante', cliente: 'Recomendação do fabricante' },
  interna: { rotulo: 'Regra interna Master Óleo', cliente: 'Padrão Master Óleo' },
  profissional: { rotulo: 'Recomendação do profissional', cliente: 'Recomendação do nosso técnico' },
  estimativa: { rotulo: 'Estimativa pelo histórico', cliente: 'Estimativa pelo uso do veículo' },
  nao_confirmada: { rotulo: 'Não confirmada — acompanhar', cliente: 'Acompanhar na próxima visita' },
};
