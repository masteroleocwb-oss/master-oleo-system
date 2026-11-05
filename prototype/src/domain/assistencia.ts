// Indicador de assistência: em quantos carros cada mecânico podia ter ajudado e em quantos ajudou.
// É só informação para a liderança: não muda comissão, rodízio nem gera consequência automática.
import type { DB, OrdemServico } from './types';
import { atendeOS } from './permissions';
import { diaKey } from './util';

type Faixa = [number, number];

/** "Podia ajudar": livre por pelo menos este tempo enquanto o carro de outro estava em andamento. */
export const MIN_LIVRE_PARA_AJUDA = 10;
/** OS "em andamento" por mais que isso é esquecimento, não trabalho: fica fora da conta. */
const MAX_HORAS_OS = 10;

const ms = (iso: string) => new Date(iso).getTime();

/** Junta faixas sobrepostas. */
function unir(fs: Faixa[]): Faixa[] {
  const o = fs.filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
  const r: Faixa[] = [];
  for (const f of o) {
    const u = r.at(-1);
    if (u && f[0] <= u[1]) u[1] = Math.max(u[1], f[1]); else r.push([f[0], f[1]]);
  }
  return r;
}

/** Faixas de `a` sem as de `b`. */
function tirar(a: Faixa[], b: Faixa[]): Faixa[] {
  let r = unir(a);
  for (const [bi, bf] of unir(b)) {
    r = r.flatMap(([ai, af]): Faixa[] => {
      if (bf <= ai || bi >= af) return [[ai, af]];
      return [[ai, Math.min(af, bi)], [Math.max(ai, bf), af]].filter(([x, y]) => y > x) as Faixa[];
    });
  }
  return r;
}

const sobreposto = (fs: Faixa[], [i, f]: Faixa) => fs.reduce((t, [a, b]) => t + Math.max(0, Math.min(b, f) - Math.max(a, i)), 0);

/** Tempo de trabalho da OS (início ao fim, sem as pausas). */
function trabalhoDaOS(os: OrdemServico, agora: number): Faixa[] {
  if (!os.iniciadaEm || !os.mecanicoId) return [];
  if (os.status !== 'andamento' && os.status !== 'pausada' && os.status !== 'concluido') return [];
  const i = ms(os.iniciadaEm);
  const f = os.concluidaEm ? ms(os.concluidaEm) : agora;
  if (!(f > i) || f - i > MAX_HORAS_OS * 36e5) return [];
  const pausas = (os.pausas || []).map(p => [ms(p.inicio), p.fim ? ms(p.fim) : agora] as Faixa);
  return tirar([[i, f]], pausas);
}

export interface LinhaAssistencia {
  mecanicoId: string;
  /** Carros de outros em andamento enquanto ele estava livre (10+ min). */
  podia: number;
  /** Carros em que ajudou. */
  ajudou: number;
  minutosAjudando: number;
  /** Tempo livre enquanto havia carro de outro em andamento. */
  minutosLivre: number;
}

/** Indicador por mecânico ativo, no período [de, ate] (dias no formato AAAA-MM-DD, horário de Brasília). */
export function indicadoresAssistencia(d: Pick<DB, 'os' | 'usuarios' | 'eventos'>, de: string, ate: string, agoraISO: string): LinhaAssistencia[] {
  const agora = ms(agoraISO);
  const mecs = d.usuarios.filter(u => atendeOS(u) && u.ativo);
  const noPeriodo = (iso: string) => { const k = diaKey(iso); return k >= de && k <= ate; };
  const linhas = new Map(mecs.map(m => [m.id, { mecanicoId: m.id, podia: 0, ajudou: 0, minutosAjudando: 0, minutosLivre: 0 }]));

  // Por dia: trabalho de cada OS, ajudas e almoço/ausência de cada mecânico.
  type Dia = { carros: { os: OrdemServico; faixas: Faixa[] }[]; ocupado: Map<string, Faixa[]>; presente: Map<string, Faixa> };
  const dias = new Map<string, Dia>();
  const dia = (k: string) => { let x = dias.get(k); if (!x) dias.set(k, x = { carros: [], ocupado: new Map(), presente: new Map() }); return x; };
  const marcar = (x: Dia, mec: string, f: Faixa[]) => {
    if (!f.length) return;
    x.ocupado.set(mec, [...(x.ocupado.get(mec) || []), ...f]);
    const p = x.presente.get(mec);
    const ini = Math.min(...f.map(z => z[0])), fim = Math.max(...f.map(z => z[1]));
    x.presente.set(mec, p ? [Math.min(p[0], ini), Math.max(p[1], fim)] : [ini, fim]);
  };

  for (const os of d.os) {
    if (os.iniciadaEm && noPeriodo(os.iniciadaEm)) {
      const fs = trabalhoDaOS(os, agora);
      if (fs.length) { const x = dia(diaKey(os.iniciadaEm)); x.carros.push({ os, faixas: fs }); marcar(x, os.mecanicoId!, fs); }
    }
    for (const a of os.assistencias || []) {
      if (!noPeriodo(a.inicio)) continue;
      const f: Faixa = [ms(a.inicio), a.fim ? ms(a.fim) : agora];
      if (!(f[1] > f[0])) continue;
      marcar(dia(diaKey(a.inicio)), a.mecanicoId, [f]);
      const l = linhas.get(a.mecanicoId);
      if (l) l.minutosAjudando += Math.round((f[1] - f[0]) / 60000);
    }
  }
  // Ajudas contam uma vez por carro.
  for (const os of d.os) {
    const quem = new Set((os.assistencias || []).filter(a => noPeriodo(a.inicio)).map(a => a.mecanicoId));
    quem.forEach(m => { const l = linhas.get(m); if (l) l.ajudou++; });
  }

  // Almoço e ausência (rodízio do sistema novo): da marcação até a próxima mudança do mesmo mecânico.
  const rod = d.eventos.filter(e => e.tipo === 'rodizio.status' && noPeriodo(e.em)).sort((a, b) => a.em.localeCompare(b.em));
  for (const [k, x] of dias) {
    for (const m of mecs) {
      const pres = x.presente.get(m.id);
      if (!pres) continue;
      const evs = rod.filter(e => e.entidadeId === m.id && diaKey(e.em) === k);
      evs.forEach((e, i) => {
        if (e.depois === 'disponivel') return;
        const fim = evs[i + 1] ? ms(evs[i + 1].em) : pres[1];
        x.ocupado.set(m.id, [...(x.ocupado.get(m.id) || []), [ms(e.em), fim]]);
      });
    }
  }

  // Livre = presente no dia (do primeiro ao último trabalho) menos o que estava ocupado.
  for (const x of dias.values()) {
    for (const m of mecs) {
      const pres = x.presente.get(m.id);
      if (!pres) continue;
      const livre = tirar([pres], x.ocupado.get(m.id) || []);
      const l = linhas.get(m.id)!;
      const outros = unir(x.carros.filter(c => c.os.mecanicoId !== m.id).flatMap(c => c.faixas));
      l.minutosLivre += Math.round(outros.reduce((t, f) => t + sobreposto(livre, f), 0) / 60000);
      for (const c of x.carros) {
        if (c.os.mecanicoId === m.id) continue;
        const ajudou = c.os.assistencias?.some(a => a.mecanicoId === m.id);
        const livreNoCarro = c.faixas.reduce((t, f) => t + sobreposto(livre, f), 0);
        if (ajudou || livreNoCarro >= MIN_LIVRE_PARA_AJUDA * 60000) l.podia++;
      }
    }
  }
  return [...linhas.values()];
}
