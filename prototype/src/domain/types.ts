// Modelo de dados do protótipo. Espelha a proposta de DATA_MODEL_PROPOSAL.md.
// Todos os dados são fictícios.

export type Role = 'mecanico' | 'lider' | 'direcao' | 'comercial' | 'vendedor';

export interface Usuario {
  id: string;
  nome: string;
  role: Role;
  ativo: boolean;
  /** Nível de carreira (proposta do playbook, só informativo). */
  nivel?: string;
  criadoEm: string;
  /** Conta de demonstração: entra sem senha (pode ser desligado no Admin). */
  demo?: boolean;
  /** Login individual (e-mail ou nome de usuário), único. */
  login?: string;
  /** Senha guardada só como hash PBKDF2 com sal próprio — nunca em texto. */
  senha?: { hash: string; sal: string };
  /** Senha provisória definida pela administração: troca obrigatória no primeiro acesso. */
  trocarSenha?: boolean;
  tentativasFalhas?: number;
  bloqueadoAte?: string;
  /** E-mail de login (base real). */
  email?: string;
  /** Como a pessoa aparece no sistema atual (vendedor/lubrificador), para as OS dos dois sistemas baterem. */
  nomeLegado?: string;
}

export type ResultadoAcesso = 'entrou' | 'entrou_demo' | 'saiu' | 'senha_errada' | 'usuario_inexistente' | 'desativado' | 'bloqueado' | 'senha_trocada' | 'sessao_expirada';

/** Registro de acesso: quem, quando, de onde e o resultado. Só a direção vê a lista completa. */
export interface RegistroAcesso {
  id: string;
  em: string;
  usuarioId?: string;
  /** O que foi digitado no campo de login (para enxergar tentativas em contas que não existem). */
  loginDigitado?: string;
  resultado: ResultadoAcesso;
  dispositivo: string;
}

export interface Cliente {
  id: string;
  nome: string;
  telefone?: string;
  tipo: 'particular' | 'frota';
  /** Obrigatórios na abertura de OS (clientes antigos completam na próxima visita). */
  comoConheceu?: string;
  comoConheceuDetalhe?: string;
  cidade?: string;
  bairro?: string;
}

export type Cambio = 'manual' | 'automatico';

export interface Veiculo {
  id: string;
  placa: string;
  placasAnteriores: { placa: string; ate: string; motivo: string }[];
  marca: string;
  modelo: string;
  ano: number;
  motor: string;
  cambio: Cambio;
  combustivel: 'Flex' | 'Gasolina' | 'Diesel' | 'GNV';
  clienteId: string;
  kmAtual?: number;
  kmAtualEm?: string;
  /** Quanto o carro roda por mês, informado pelo vendedor (ajuda a prever a próxima troca). */
  kmPorMes?: number;
}

export type StatusOS = 'aguardando' | 'andamento' | 'pausada' | 'concluido' | 'cancelada' | 'encerrada';

/** Chaves dos 16 serviços do sistema atual (preservadas). */
export type ServicoKey =
  | 'oleoMotor' | 'fluidoFreio' | 'filtroOleo' | 'arMotor' | 'arCondicionado' | 'filtroCombustivel'
  | 'cambioManual' | 'cambioAutomatico' | 'difDianteiro' | 'difTraseiro' | 'caixaTransferencia'
  | 'higienizacaoAC' | 'palhetas' | 'militec' | 'aditivo' | 'flush';

export interface ServicoOS {
  key: ServicoKey;
  marca?: string;
  quantidade?: string;
  codigo?: string;
  /**
   * balcao = vendido na abertura; checklist = identificado na inspeção e aceito pelo cliente;
   * adicional = oferecido pelo mecânico na bancada (militec, aditivo, flush…) e aceito pelo cliente.
   */
  origem: 'balcao' | 'checklist' | 'adicional';
  executado: boolean;
  quantidadeExecutada?: string;
  valor?: number;
  oportunidadeId?: string;
  /** Óleo de motor: intervalo escolhido pelo mecânico conforme o óleo aplicado (5, 7 ou 10 mil km). */
  intervaloKm?: number;
  adicionadoPor?: string;
}

/** Oferta de adicional feita na bancada (aceita ou recusada) — base da taxa de oferta. */
export interface OfertaAdicional {
  key: ServicoKey;
  resultado: 'aceito' | 'recusado';
  por: string;
  em: string;
}

/** Outro mecânico ajudando na OS (chamado por quem atende). Não muda comissão nem rodízio. */
export interface Assistencia {
  mecanicoId: string;
  inicio: string;
  fim?: string;
  chamadoPor: string;
  encerradoPor?: string;
}

export interface Pausa {
  inicio: string;
  fim?: string;
  motivo: 'peca' | 'aprovacao_cliente' | 'outro';
  detalhe?: string;
  por: string;
  retomadaPor?: string;
}

/** OS de retorno: foco no problema relatado, sem refazer o checklist completo. */
export interface AtendimentoRetorno {
  problemaRelatado: string;
  diagnostico?: string;
  /** Classificação interna: o problema tem relação com o serviço anterior? */
  relacaoServicoAnterior?: 'sim' | 'nao' | 'nao_identificado';
  solucao?: string;
  avisoCliente?: string;
  semFotoDepois?: string;
}

export interface OrdemServico {
  id: string;
  numero: number;
  /** Número do pedido do cliente no Olist (ERP), informado pelo vendedor. */
  pedidoOlist?: string;
  /** Carro de loja (revenda): km por mês zerado. */
  carroDeLoja?: boolean;
  status: StatusOS;
  veiculoId: string;
  clienteId: string;
  vendedorId: string;
  mecanicoId?: string;
  abertaEm: string;
  iniciadaEm?: string;
  concluidaEm?: string;
  servicos: ServicoOS[];
  valorInicial: number;
  km?: number;
  obsInterna?: string;
  obsCliente?: string;
  /** Flags do sistema atual "NÃO FAZER TESTE — SÓ EXECUTAR". */
  naoFazerTesteFreio?: boolean;
  naoFazerTesteCambio?: boolean;
  /** Locação/frota com instrução de não oferecer (playbook). */
  naoOferecer?: { alinhadoCom: string; marcadoPor: string; em: string };
  retornoDeOsId?: string;
  retorno?: AtendimentoRetorno;
  pausas?: Pausa[];
  assistencias?: Assistencia[];
  ofertas?: OfertaAdicional[];
  /** Mecânico que assumiu fora da ordem prevista (motivo fica no evento). */
  foraDaOrdem?: { previsto?: string; motivo: string };
  checklistId?: string;
  canceladaMotivo?: string;
  criadaPor: string;
}

export type EstadoItem = 'nao_verificado' | 'ok' | 'atencao' | 'prioritario' | 'nao_aplicavel' | 'pendente_avaliacao';

export interface ItemInspecaoDef {
  id: string;
  grupo: string;
  nome: string;
  instrucao: string;
  tipo: 'visual' | 'medicao' | 'teste' | 'visual_e_teste';
  estadosPermitidos: EstadoItem[];
  /** Estados que exigem foto antes de salvar o item. */
  fotoObrigatoriaEm: EstadoItem[];
  permiteRecomendacao: boolean;
  /** Serviço do catálogo que resolve a recomendação (liga checklist → comercial → execução). */
  servicoRelacionado?: ServicoKey;
  regraIntervaloId?: string;
  /** Só aparece quando a condição bate (ex.: câmbio automático). */
  aplicavelA?: { cambio?: Cambio };
  /** Veículos em que o item não é mostrado (decisão da direção a partir do uso — muitos "Não se aplica"). */
  ocultarPara?: OcultarItem[];
  ativo: boolean;
  versao: number;
  fonte: 'playbook_fase1' | 'pedido_direcao' | 'catalogo_atual';
}

export interface OcultarItem {
  marca: string;
  modelo: string;
  motor?: string;
  motivo: string;
  por: string;
  em: string;
}

export interface RegistroHistorico {
  estado: EstadoItem;
  observacao?: string;
  por: string;
  em: string;
  motivo?: string;
}

export interface ItemRegistro {
  defId: string;
  estado: EstadoItem;
  observacao?: string;
  justificativa?: string;
  recomendacao?: string;
  evidenciaIds: string[];
  registradoPor?: string;
  registradoEm?: string;
  oportunidadeId?: string;
  historico: RegistroHistorico[];
}

export type StatusChecklist = 'nao_iniciado' | 'em_andamento' | 'concluido' | 'excecao_autorizada';

export interface Checklist {
  id: string;
  osId: string;
  veiculoId: string;
  status: StatusChecklist;
  /** Cópia das definições no momento da criação: mudanças no catálogo não alteram inspeções antigas. */
  defs: ItemInspecaoDef[];
  itens: Record<string, ItemRegistro>;
  iniciadoPor?: string;
  iniciadoEm?: string;
  concluidoEm?: string;
  concluidoPor?: string;
  solicitacaoExcecao?: {
    motivo: string;
    solicitadoPor: string;
    em: string;
    status: 'pendente' | 'aprovada' | 'negada';
    decididoPor?: string;
    decididoEm?: string;
    obsDecisao?: string;
  };
  correcaoSolicitada?: { auditoriaId: string; itens: string[]; motivo: string; em: string; por: string; resolvidaEm?: string };
}

export interface Evidencia {
  id: string;
  osId: string;
  veiculoId: string;
  /** Vazio nas fotos de OS de retorno (que não têm checklist). */
  checklistId?: string;
  /** Item do checklist, ou "retorno" nas fotos do atendimento de retorno. */
  itemDefId: string;
  /** Fotos de retorno: antes (o problema) ou depois (a solução). */
  etapa?: 'antes' | 'depois';
  url: string;
  demo: boolean;
  legenda?: string;
  capturadaPor: string;
  em: string;
  visivelCliente: boolean;
  removida?: { por: string; em: string; motivo: string };
}

export type SituacaoOportunidade = 'nova' | 'apresentada' | 'aceita' | 'recusada' | 'avaliar_depois' | 'nao_oferecer';

export interface Oportunidade {
  id: string;
  osId: string;
  veiculoId: string;
  itemDefId: string;
  estadoItem: EstadoItem;
  recomendacao: string;
  evidenciaIds: string[];
  situacao: SituacaoOportunidade;
  servicoKey?: ServicoKey;
  valor?: number;
  criadaPor: string;
  criadaEm: string;
  historico: { situacao: SituacaoOportunidade; por: string; em: string; obs?: string }[];
}

export type OrigemIntervalo = 'fabricante' | 'interna' | 'profissional' | 'estimativa' | 'nao_confirmada';

export interface RegraIntervalo {
  id: string;
  nome: string;
  servicoKey?: ServicoKey;
  itemDefId?: string;
  km?: number;
  /** Quando o intervalo depende do produto aplicado (ex.: óleo 5, 7 ou 10 mil km), o mecânico escolhe. */
  opcoesKm?: number[];
  meses?: number;
  origem: OrigemIntervalo;
  fonte: string;
  validada: boolean;
  validadaPor?: string;
  aplicavelA?: { cambio?: Cambio };
  ativo: boolean;
}

export interface ManutencaoPrevista {
  id: string;
  veiculoId: string;
  osOrigemId: string;
  descricao: string;
  servicoKey?: ServicoKey;
  itemDefId?: string;
  regraId?: string;
  origem: OrigemIntervalo;
  fonte: string;
  ultimaExecucao?: { data: string; km?: number };
  kmPrevisto?: number;
  dataPrevista?: string;
  registradoPor: string;
  registradoEm: string;
  concluidaPorOsId?: string;
  /** Recomendação vinda do checklist: estado do item quando foi registrada (sempre aparece até ser resolvida). */
  estadoItem?: EstadoRecomendado;
}

export type EstadoRecomendado = 'atencao' | 'prioritario' | 'pendente_avaliacao';

export interface Compartilhamento {
  id: string;
  osId: string;
  token: string;
  criadoPor: string;
  criadoEm: string;
  expiraEm?: string;
  revogadoEm?: string;
  revogadoPor?: string;
  motivoRevogacao?: string;
  acessos: number;
  ultimoAcessoEm?: string;
}

export type IndicadorMeta =
  | 'checklist_completo_pct' | 'itens_realizados' | 'carros_atendidos' | 'evidencias_pct' | 'faturamento';

export type StatusVersaoMeta = 'rascunho' | 'aprovada' | 'encerrada';

export interface VersaoMeta {
  versao: number;
  alvo: number;
  vigenciaInicio: string;
  vigenciaFim?: string;
  status: StatusVersaoMeta;
  definidaPor: string;
  definidaEm: string;
  aprovadaPor?: string;
  aprovadaEm?: string;
  justificativa: string;
}

export interface Meta {
  id: string;
  nome: string;
  descricao: string;
  indicador: IndicadorMeta;
  unidade: '%' | 'itens' | 'carros' | 'R$';
  regraCalculo: string;
  elegibilidade: string;
  escopo: { tipo: 'individual'; usuarioId: string } | { tipo: 'coletiva' };
  responsavelId: string;
  comunicadaEm?: string;
  versoes: VersaoMeta[];
}

export interface Politica {
  id: string;
  nome: string;
  status: 'vigente' | 'proposta_em_teste';
  versao: number;
  vigenciaInicio?: string;
  fonte: string;
  descricao: string;
  parametros: Record<string, unknown>;
}

export type StatusOcorrencia = 'registrada' | 'em_revisao' | 'contestada' | 'aprovada' | 'rejeitada' | 'aplicada';

export interface Ocorrencia {
  id: string;
  tipo: 'desconto' | 'reconhecimento';
  profissionalId: string;
  dataHora: string;
  categoria: string;
  descricao: string;
  osId?: string;
  evidencias: string[];
  regra: string;
  efeitoProposto: number;
  registradaPor: string;
  status: StatusOcorrencia;
  manifestacao?: { texto: string; em: string };
  validadaPor?: string;
  decisaoEm?: string;
  obsEncerramento?: string;
  historico: { status: StatusOcorrencia; por: string; em: string; obs?: string }[];
}

export interface Auditoria {
  id: string;
  checklistId: string;
  osId: string;
  mecanicoId: string;
  auditorId: string;
  em: string;
  resultado: 'aprovado' | 'reprovado' | 'correcao_solicitada';
  inconsistencias: { itemDefId: string; descricao: string }[];
  justificativa: string;
  resolvidaEm?: string;
}

export interface PlanoAcao {
  id: string;
  profissionalId: string;
  data: string;
  assunto: string;
  combinados: string;
  prazo: string;
  status: 'aberto' | 'concluido';
  registradoPor: string;
  concluidoEm?: string;
}

export interface DiaExcecao {
  data: string;
  declaradoPor: string;
  motivo: string;
  em: string;
}

export interface Evento {
  id: string;
  em: string;
  por: string;
  tipo: string;
  entidade: string;
  entidadeId: string;
  resumo: string;
  antes?: unknown;
  depois?: unknown;
  motivo?: string;
}

/** Fechamento mensal imutável (meses anteriores ao detalhado na base de demonstração). */
export interface FechamentoMensal {
  mes: string; // AAAA-MM
  usuarioId: string;
  carros: number;
  checklistCompletoPct: number | null;
  evidencias: number;
  itensRealizados: number;
  faturamento: number;
  upsell: number;
  retornos: number;
  politicaVersao: string;
  fechadoEm: string;
}

export interface Rodizio {
  dia: string;
  status: Record<string, 'disponivel' | 'almoco' | 'ausente'>;
}

export interface DB {
  versao: number;
  geradoEm: string;
  usuarios: Usuario[];
  clientes: Cliente[];
  veiculos: Veiculo[];
  os: OrdemServico[];
  checklists: Checklist[];
  evidencias: Evidencia[];
  oportunidades: Oportunidade[];
  catalogo: ItemInspecaoDef[];
  regrasIntervalo: RegraIntervalo[];
  manutencoes: ManutencaoPrevista[];
  compartilhamentos: Compartilhamento[];
  metas: Meta[];
  politicas: Politica[];
  ocorrencias: Ocorrencia[];
  auditorias: Auditoria[];
  planosAcao: PlanoAcao[];
  diasExcecao: DiaExcecao[];
  fechamentos: FechamentoMensal[];
  eventos: Evento[];
  acessos: RegistroAcesso[];
  /** Admin pode desligar o acesso pelas contas de demonstração. */
  acessoDemo: boolean;
  contadorOS: number;
  rodizio: Rodizio;
}
