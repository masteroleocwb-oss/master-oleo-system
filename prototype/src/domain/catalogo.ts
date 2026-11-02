// Catálogos: os 16 serviços do sistema atual (chaves preservadas) e o catálogo
// inicial de itens de inspeção (Playbook — checklist fase 1 + itens pedidos pela direção).
import type { EstadoItem, EstadoRecomendado, ItemInspecaoDef, RegraIntervalo, ServicoKey, SituacaoOportunidade } from './types';

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
  item({ id: 'arrefecimento', grupo: 'Motor', nome: 'Líquido de arrefecimento', tipo: 'visual', fonte: 'playbook_fase1', servicoRelacionado: 'aditivo',
    instrucao: 'Motor frio: confira nível no reservatório e cor do líquido.', fotoObrigatoriaEm: ['prioritario'] }),

  item({ id: 'fluido_cambio', grupo: 'Câmbio', nome: 'Fluido do câmbio (nível e aspecto)', tipo: 'visual', fonte: 'playbook_fase1', servicoRelacionado: 'cambioAutomatico', regraIntervaloId: 'r_cambio_auto',
    aplicavelA: { cambio: 'automatico' }, instrucao: 'Confira nível e cor do fluido conforme o procedimento do modelo.', fotoObrigatoriaEm: ['atencao', 'prioritario'] }),
  item({ id: 'oleo_cambio_manual', grupo: 'Câmbio', nome: 'Óleo do câmbio manual', tipo: 'visual', fonte: 'playbook_fase1', servicoRelacionado: 'cambioManual',
    aplicavelA: { cambio: 'manual' }, instrucao: 'Verifique vazamentos e, se acessível, o nível pelo bujão.', fotoObrigatoriaEm: ['prioritario'] }),
  item({ id: 'trocador_calor', grupo: 'Câmbio', nome: 'Trocador de calor do câmbio', tipo: 'visual', fonte: 'pedido_direcao',
    aplicavelA: { cambio: 'automatico' }, instrucao: 'Quando o câmbio tiver trocador: verifique vazamento e mistura óleo/água no trocador e nas mangueiras.', fotoObrigatoriaEm: ['atencao', 'prioritario'] }),
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
  { id: 'r_oleo_motor', nome: 'Óleo de motor', servicoKey: 'oleoMotor', opcoesKm: [5000, 7000, 10000], meses: 6, origem: 'interna', validada: true, validadaPor: 'u_dir',
    fonte: 'Regra Master Óleo (direção, 27/10/2026): 5, 7 ou 10 mil km conforme o óleo aplicado, ou 6 meses — o que vier primeiro', ativo: true },
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

/**
 * Adicionais que o mecânico oferece na bancada. `itemRelacionado` liga a oferta ao item do
 * checklist que a justifica (ex.: líquido de arrefecimento em Atenção → aditivo).
 */
export const ADICIONAIS: { key: ServicoKey; rotulo: string; itemRelacionado?: string; aplicavelA?: { cambio?: 'manual' | 'automatico' } }[] = [
  { key: 'militec', rotulo: 'Militec/Nano no motor', itemRelacionado: 'oleo_motor' },
  { key: 'aditivo', rotulo: 'Aditivo no radiador', itemRelacionado: 'arrefecimento' },
  { key: 'flush', rotulo: 'Flush do câmbio', itemRelacionado: 'fluido_cambio', aplicavelA: { cambio: 'automatico' } },
  { key: 'higienizacaoAC', rotulo: 'Higienização do ar-condicionado', itemRelacionado: 'filtro_cabine' },
  { key: 'palhetas', rotulo: 'Palhetas do limpador', itemRelacionado: 'palhetas' },
];

/** Recomendação do checklist nas próximas manutenções: como a equipe e o cliente leem cada estado. */
export const RECOMENDACAO: Record<EstadoRecomendado, { interno: string; cliente: string; tom: 'critico' | 'atencao' | 'info' }> = {
  prioritario: { interno: 'Prioritário — mau estado', cliente: 'Recomendamos fazer o quanto antes', tom: 'critico' },
  atencao: { interno: 'Atenção — desgaste', cliente: 'Recomendamos programar', tom: 'atencao' },
  pendente_avaliacao: { interno: 'Avaliar na próxima visita', cliente: 'Avaliar na próxima visita', tom: 'info' },
};

/** O que o cliente respondeu à recomendação (vem da oportunidade ligada ao item). */
export const RESPOSTA_CLIENTE: Partial<Record<SituacaoOportunidade, string>> = {
  nova: 'Ainda não apresentada ao cliente',
  apresentada: 'Apresentada, cliente não respondeu',
  recusada: 'Cliente não quis fazer agora',
  avaliar_depois: 'Cliente vai avaliar',
  nao_oferecer: 'Não oferecida (frota)',
};

/** Como o cliente conheceu a Master Óleo (lista de partida — revisar com a direção). */
export const COMO_CONHECEU = ['Indicação de amigo ou parente', 'Google', 'Instagram', 'Facebook', 'Passou em frente', 'Já era cliente', 'Frota / empresa', 'Outro'] as const;

/** Cidades sugeridas no cadastro (Curitiba e região); o campo aceita qualquer cidade. */
export const CIDADES_SUGERIDAS = ['Curitiba', 'São José dos Pinhais', 'Pinhais', 'Colombo', 'Araucária', 'Campo Largo', 'Fazenda Rio Grande', 'Almirante Tamandaré', 'Piraquara', 'Campina Grande do Sul', 'Quatro Barras'];

/** Serviços que fazem sentido para o câmbio do veículo (manual não vê fluido de automático e vice-versa). */
export const servicoAplicavel = (k: ServicoKey, cambio?: 'manual' | 'automatico') =>
  !cambio || !((k === 'cambioManual' && cambio === 'automatico') || ((k === 'cambioAutomatico' || k === 'flush') && cambio === 'manual'));

export const MOTIVO_PAUSA: Record<'peca' | 'aprovacao_cliente' | 'outro', string> = {
  peca: 'Aguardando peça',
  aprovacao_cliente: 'Aguardando aprovação do cliente',
  outro: 'Outro motivo',
};
