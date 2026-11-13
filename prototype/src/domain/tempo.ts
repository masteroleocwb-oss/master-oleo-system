// Tempo de serviço: padrão por tipo de OS, cronômetro, registros fora do tempo real e OS esquecida aberta.
// O relógio vai do "Assumir" ao "Finalizar", sem contar as pausas (peça, aprovação do cliente).
import type { OrdemServico } from './types';
import { diffMin, minutosTrabalhados, TZ } from './util';

/**
 * Padrão PROVISÓRIO (direção, 13/11/2026): troca de óleo 30 min; com câmbio automático 2 h.
 * Fase 1 só mostra o cronômetro e mede; o padrão definitivo sai dos dados limpos (Fase 2).
 */
export const TEMPO_PADRAO = { cambioAutomatico: 120, oleo: 30 };

export const tempoPadraoMin = (os: Pick<OrdemServico, 'servicos'>) =>
  os.servicos.some(s => s.key === 'cambioAutomatico') ? TEMPO_PADRAO.cambioAutomatico : TEMPO_PADRAO.oleo;

export const rotuloPadrao = (os: Pick<OrdemServico, 'servicos'>) =>
  os.servicos.some(s => s.key === 'cambioAutomatico') ? 'com câmbio automático' : 'troca de óleo';

/** Minutos de serviço até agora (OS em andamento ou pausada) ou até o fim (concluída), sem as pausas. */
export const minutosDeServico = (os: Pick<OrdemServico, 'iniciadaEm' | 'concluidaEm' | 'pausas'>, agoraIso: string) =>
  minutosTrabalhados({ ...os, concluidaEm: os.concluidaEm || agoraIso });

export type FaixaTempo = 'ok' | 'perto' | 'acima';
/** Verde até 80% do padrão, amarelo até o padrão, vermelho acima. */
export const faixaTempo = (min: number, padrao: number): FaixaTempo => min > padrao ? 'acima' : min >= padrao * 0.8 ? 'perto' : 'ok';

const horaBR = (iso: string) => {
  const p: Record<string, string> = {};
  new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23' })
    .formatToParts(new Date(iso)).forEach(x => { p[x.type] = x.value; });
  return { h: Number(p.hour) + Number(p.minute) / 60, dia: p.weekday };
};

/** Fora do expediente da oficina (com folga): antes das 7h, depois das 19h, sábado depois das 15h, domingo. */
export const foraDoExpediente = (iso: string) => {
  const { h, dia } = horaBR(iso);
  return dia === 'Sun' || h < 7 || h >= 19 || (dia === 'Sat' && h >= 15);
};

/** Menos que isso do "Assumir" ao "Finalizar" não é serviço feito em tempo real. */
export const MIN_REGISTRO_REAL = 10;

/**
 * OS concluída cujo registro não reflete o tempo real (botões apertados depois, em lote, ou fora do expediente).
 * Fica fora das métricas de tempo e aparece para a liderança cobrar o registro na hora.
 */
export function registroForaDoTempoReal(os: Pick<OrdemServico, 'status' | 'iniciadaEm' | 'concluidaEm' | 'pausas' | 'retornoDeOsId'>): string | null {
  if (os.status !== 'concluido' || !os.iniciadaEm || !os.concluidaEm) return null;
  const min = minutosTrabalhados(os);
  if (!os.retornoDeOsId && min != null && min < MIN_REGISTRO_REAL) return `Assumida e finalizada em ${min} min`;
  if (foraDoExpediente(os.concluidaEm)) return 'Finalizada fora do expediente';
  if (foraDoExpediente(os.iniciadaEm)) return 'Assumida fora do expediente';
  return null;
}

/** OS em andamento bem além do padrão: provavelmente o carro já saiu e ninguém finalizou. */
export const provavelEsquecida = (os: Pick<OrdemServico, 'status' | 'servicos' | 'iniciadaEm' | 'concluidaEm' | 'pausas'>, agoraIso: string) => {
  if (os.status !== 'andamento' || !os.iniciadaEm) return false;
  const min = minutosDeServico(os, agoraIso);
  return min != null && min > tempoPadraoMin(os) * 1.5;
};

/** Etapas da OS (minutos): fila, checklist, execução depois do checklist, pausas. */
export function etapasDaOS(os: Pick<OrdemServico, 'abertaEm' | 'iniciadaEm' | 'concluidaEm' | 'pausas'>, ck?: { iniciadoEm?: string; concluidoEm?: string }) {
  const pausas = (os.pausas || []).reduce((s, p) => s + Math.max(0, diffMin(p.inicio, p.fim || os.concluidaEm || p.inicio)), 0);
  return {
    fila: os.iniciadaEm ? Math.max(0, diffMin(os.abertaEm, os.iniciadaEm)) : null,
    checklist: ck?.iniciadoEm && ck.concluidoEm ? Math.max(0, diffMin(ck.iniciadoEm, ck.concluidoEm)) : null,
    execucao: ck?.concluidoEm && os.concluidaEm ? Math.max(0, diffMin(ck.concluidoEm, os.concluidaEm)) : null,
    pausas: pausas || null,
    total: os.concluidaEm ? minutosTrabalhados(os) : null,
  };
}

export const mediana = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
