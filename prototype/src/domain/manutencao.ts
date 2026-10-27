// Próximas manutenções: nunca inventa intervalo. Sem regra validada, gera só
// "acompanhar", sem data ou km apresentados como confirmados.
import type { ManutencaoPrevista, RegraIntervalo, ServicoKey, Veiculo } from './types';
import { addMeses } from './util';

export type StatusManutencao = 'futura' | 'proxima' | 'vencida' | 'concluida' | 'acompanhar';

export const STATUS_MANUT_LABEL: Record<StatusManutencao, string> = {
  futura: 'Futura',
  proxima: 'Próxima',
  vencida: 'Vencida',
  concluida: 'Concluída',
  acompanhar: 'Acompanhar',
};

/** Limiares de "próxima": parâmetros de demonstração, configuráveis. */
export const LIMIAR_PROXIMA = { km: 1000, dias: 30 };

export const regraPara = (regras: RegraIntervalo[], servico: ServicoKey, v: Pick<Veiculo, 'cambio'>) =>
  regras.find(r => r.ativo && r.servicoKey === servico && (!r.aplicavelA?.cambio || r.aplicavelA.cambio === v.cambio));

export interface Sugestao {
  servicoKey: ServicoKey;
  descricao: string;
  regra?: RegraIntervalo;
  kmPrevisto?: number;
  dataPrevista?: string;
  confirmavel: boolean;
  motivo: string;
  /** A regra depende do produto: o mecânico precisa escolher o intervalo em km. */
  opcoesKm?: number[];
}

export const sugerirProxima = (servico: ServicoKey, nome: string, regras: RegraIntervalo[], v: Pick<Veiculo, 'cambio'>, dataISO: string, km?: number, intervaloKm?: number): Sugestao => {
  const regra = regraPara(regras, servico, v);
  if (!regra) return { servicoKey: servico, descricao: nome, confirmavel: false, motivo: 'Sem regra de intervalo cadastrada' };
  if (!regra.validada || (!regra.km && !regra.meses && !regra.opcoesKm?.length)) {
    return { servicoKey: servico, descricao: nome, regra, confirmavel: false, motivo: 'Regra sem intervalo validado — registrar só acompanhamento' };
  }
  // Intervalo por produto: só vale um dos valores permitidos pela regra.
  const kmRegra = regra.opcoesKm?.length ? (intervaloKm && regra.opcoesKm.includes(intervaloKm) ? intervaloKm : undefined) : regra.km;
  return {
    servicoKey: servico,
    descricao: nome,
    regra,
    kmPrevisto: kmRegra && km != null ? km + kmRegra : undefined,
    dataPrevista: regra.meses ? addMeses(dataISO, regra.meses) : undefined,
    confirmavel: true,
    opcoesKm: regra.opcoesKm,
    motivo: [kmRegra ? `${kmRegra.toLocaleString('pt-BR')} km` : regra.opcoesKm ? `${regra.opcoesKm.map(x => x / 1000).join(', ')} mil km (conforme o óleo)` : null, regra.meses ? `${regra.meses} meses` : null].filter(Boolean).join(' ou ') + ', o que vier primeiro',
  };
};

/** Texto único para "próxima": km ou data, o que vier primeiro. */
export const textoPrevisto = (kmPrevisto: number | undefined, dataPrevista: string | undefined, fmtKm: (n?: number) => string, fmtData: (s?: string) => string) =>
  kmPrevisto && dataPrevista ? `${fmtKm(kmPrevisto)} ou ${fmtData(dataPrevista)}, o que vier primeiro`
    : kmPrevisto ? fmtKm(kmPrevisto) : dataPrevista ? fmtData(dataPrevista) : '';

export const statusManutencao = (m: ManutencaoPrevista, kmAtual: number | undefined, hojeISO: string): StatusManutencao => {
  if (m.concluidaPorOsId) return 'concluida';
  if (m.kmPrevisto == null && !m.dataPrevista) return 'acompanhar';
  const hoje = new Date(hojeISO).getTime();
  const vencKm = m.kmPrevisto != null && kmAtual != null && kmAtual >= m.kmPrevisto;
  const vencData = !!m.dataPrevista && new Date(m.dataPrevista).getTime() < hoje;
  if (vencKm || vencData) return 'vencida';
  const proxKm = m.kmPrevisto != null && kmAtual != null && m.kmPrevisto - kmAtual <= LIMIAR_PROXIMA.km;
  const proxData = !!m.dataPrevista && new Date(m.dataPrevista).getTime() - hoje <= LIMIAR_PROXIMA.dias * 864e5;
  return proxKm || proxData ? 'proxima' : 'futura';
};
