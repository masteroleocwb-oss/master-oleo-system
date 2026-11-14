// Utilitários puros: datas (fuso de Brasília), ids, formatação.

export const TZ = 'America/Sao_Paulo';

/** Relógio do protótipo. Testes podem fixar a data. */
let agoraFixo: Date | null = null;
export const fixarAgora = (d: Date | null) => { agoraFixo = d; };
export const agora = () => (agoraFixo ? new Date(agoraFixo) : new Date());
export const agoraISO = () => agora().toISOString();

// Criar um Intl.DateTimeFormat é caro (milissegundos no celular): os formatadores são criados uma vez e
// o dia de cada data já vista fica guardado. A tela de Operação pergunta o dia de cada OS a cada atualização.
const FMT_DIA = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const formatarDia = (dt: Date) => {
  const p: Record<string, string> = {};
  FMT_DIA.formatToParts(dt).forEach(x => { p[x.type] = x.value; });
  return `${p.year}-${p.month}-${p.day}`;
};
const diasVistos = new Map<string, string>();
/** 'AAAA-MM-DD' no fuso de Brasília. */
export const diaKey = (d: Date | string) => {
  if (typeof d !== 'string') return formatarDia(d);
  let r = diasVistos.get(d);
  if (r === undefined) {
    if (diasVistos.size > 50000) diasVistos.clear();
    r = formatarDia(new Date(d));
    diasVistos.set(d, r);
  }
  return r;
};
export const mesKey = (d: Date | string) => diaKey(d).slice(0, 7);
export const hojeKey = () => diaKey(agora());

export const addDias = (iso: string, dias: number) => new Date(new Date(iso).getTime() + dias * 864e5).toISOString();
export const addMeses = (iso: string, meses: number) => {
  const d = new Date(iso);
  d.setMonth(d.getMonth() + meses);
  return d.toISOString();
};
export const diffMin = (a: string, b: string) => Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000);

const FMT_DATA = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ });
const FMT_HORA = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
export const fmtData = (iso?: string) => iso ? FMT_DATA.format(new Date(iso)) : '—';
export const fmtHora = (iso?: string) => iso ? FMT_HORA.format(new Date(iso)) : '—';
export const fmtDataHora = (iso?: string) => iso ? `${fmtData(iso)} ${fmtHora(iso)}` : '—';
export const fmtMes = (mes: string) => {
  const [a, m] = mes.split('-').map(Number);
  return `${['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'].at(m - 1)}/${String(a).slice(2)}`;
};
export const fmtKm = (km?: number) => km == null ? '—' : `${km.toLocaleString('pt-BR')} km`;
export const fmtBRL = (v?: number) => v == null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
/**
 * Valor em reais digitado à mão: "29,90", "29.90", "1.500", "1.500,00" e "R$ 29,90" viram o número certo.
 * Com vírgula, o ponto é milhar. Sem vírgula, ponto seguido de 1 ou 2 dígitos no fim é centavo
 * (teclado do celular que só tem ponto); seguido de 3 dígitos é milhar.
 */
export const lerReais = (x?: string | number | null) => {
  if (typeof x === 'number') return Number.isFinite(x) ? x : 0;
  const t = String(x ?? '').replace(/[^\d,.]/g, '');
  if (!t) return 0;
  const n = t.includes(',') ? t.replace(/\./g, '').replace(',', '.')
    : /\.\d{1,2}$/.test(t) ? t.replace(/\.(?=.*\.)/g, '')
    : t.replace(/\./g, '');
  const v = Number(n);
  return Number.isFinite(v) ? v : 0;
};
export const fmtPct = (v: number | null | undefined, casas = 0) => v == null || Number.isNaN(v) ? '—' : `${v.toLocaleString('pt-BR', { maximumFractionDigits: casas, minimumFractionDigits: casas })}%`;
export const fmtMin = (min?: number | null) => {
  if (min == null || Number.isNaN(min)) return '—';
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  return h ? `${h}h${String(m).padStart(2, '0')}` : `${m} min`;
};

export const normalizarPlaca = (p: string) => p.toUpperCase().replace(/[^A-Z0-9]/g, '');
export const placaValida = (p: string) => /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(normalizarPlaca(p));
export const fmtPlaca = (p: string) => { const n = normalizarPlaca(p); return n.length === 7 ? `${n.slice(0, 3)}-${n.slice(3)}` : n; };

let seq = 0;
export const novoId = (prefixo: string) => `${prefixo}_${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Token imprevisível de 128 bits (base64url) para links públicos. */
export const novoToken = () => {
  const b = new Uint8Array(16);
  globalThis.crypto.getRandomValues(b);
  let s = '';
  b.forEach(x => { s += String.fromCharCode(x); });
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

export const primeiroNome = (n?: string) => (n || '').split(' ')[0];
export const soma = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
export const media = (xs: number[]) => xs.length ? soma(xs) / xs.length : null;
export const pct = (n: number, d: number) => d ? (n / d) * 100 : null;

/** Dias úteis (seg–sáb, padrão da oficina) entre dois dias, inclusive. */
export const diasUteis = (inicio: string, fim: string) => {
  let n = 0;
  for (let d = new Date(inicio + 'T12:00:00Z'); diaKey(d) <= fim; d = new Date(d.getTime() + 864e5)) {
    if (d.getUTCDay() !== 0) n++;
  }
  return n;
};
export const ultimoDiaDoMes = (mes: string) => {
  const [a, m] = mes.split('-').map(Number);
  return `${mes}-${String(new Date(Date.UTC(a, m, 0)).getUTCDate()).padStart(2, '0')}`;
};

/** Telefone brasileiro com DDD: 10 ou 11 dígitos. */
export const telefoneValido = (t?: string) => { const n = (t || '').replace(/\D/g, ''); return n.length === 10 || n.length === 11; };
export const fmtTelefone = (t: string) => {
  const n = t.replace(/\D/g, '').slice(0, 11);
  if (n.length <= 2) return n.length ? `(${n}` : '';
  if (n.length <= 6) return `(${n.slice(0, 2)}) ${n.slice(2)}`;
  if (n.length <= 10) return `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}`;
  return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`;
};

/** Minutos de trabalho na OS: do início à conclusão, descontando as pausas (ex.: aguardando peça). */
export const minutosTrabalhados = (o: { iniciadaEm?: string; concluidaEm?: string; pausas?: { inicio: string; fim?: string }[] }) => {
  if (!o.iniciadaEm || !o.concluidaEm) return null;
  const pausado = soma((o.pausas || []).map(p => diffMin(p.inicio, p.fim || o.concluidaEm!)));
  return Math.max(0, diffMin(o.iniciadaEm, o.concluidaEm) - pausado);
};
