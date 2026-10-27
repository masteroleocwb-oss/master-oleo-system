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
}

export const sugerirProxima = (servico: ServicoKey, nome: string, regras: RegraIntervalo[], v: Pick<Veiculo, 'cambio'>, dataISO: string, km?: number): Sugestao => {
  const regra = regraPara(regras, servico, v);
  if (!regra) return { servicoKey: servico, descricao: nome, confirmavel: false, motivo: 'Sem regra de intervalo cadastrada' };
  if (!regra.validada || (!regra.km && !regra.meses)) {
    return { servicoKey: servico, descricao: nome, regra, confirmavel: false, motivo: 'Regra sem intervalo validado — registrar só acompanhamento' };
  }
  return {
    servicoKey: servico,
    descricao: nome,
    regra,
    kmPrevisto: regra.km && km != null ? km + regra.km : undefined,
    dataPrevista: regra.meses ? addMeses(dataISO, regra.meses) : undefined,
    confirmavel: true,
    motivo: [regra.km ? `${regra.km.toLocaleString('pt-BR')} km` : null, regra.meses ? `${regra.meses} meses` : null].filter(Boolean).join(' ou ') + ', o que vier primeiro',
  };
};

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
