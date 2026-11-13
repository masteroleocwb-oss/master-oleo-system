import { createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { ErroValidacao } from '../data/api';
import { assinar, getControle, getDB, resetarDemo, setControle, ErroSalvamento } from '../data/store';
import { ErroPermissao } from '../domain/permissions';

// ───────────────────────── Dados ─────────────────────────

export const useDB = () => useSyncExternalStore(assinar, getDB);

/** Hora atual que se atualiza sozinha (cronômetros). */
export function useAgoraISO(intervaloMs = 30000) {
  const [t, setT] = useState(() => new Date().toISOString());
  useEffect(() => { const id = setInterval(() => setT(new Date().toISOString()), intervaloMs); return () => clearInterval(id); }, [intervaloMs]);
  return t;
}
export const useControle = () => useSyncExternalStore(assinar, getControle);

// ───────────────────────── Toasts ─────────────────────────

type Toast = { id: number; texto: string; tipo: 'ok' | 'err' | 'info'; acao?: { rotulo: string; fn: () => void } };
const ToastCtx = createContext<(t: Omit<Toast, 'id'>) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [lista, setLista] = useState<Toast[]>([]);
  const push = useCallback((t: Omit<Toast, 'id'>) => {
    const id = Date.now() + Math.random();
    setLista(l => [...l.slice(-2), { ...t, id }]);
    setTimeout(() => setLista(l => l.filter(x => x.id !== id)), t.tipo === 'err' ? 7000 : 3500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {lista.map(t => (
          <div key={t.id} className={`toast ${t.tipo}`}>
            <span>{t.tipo === 'ok' ? '✓' : t.tipo === 'err' ? '✕' : 'i'}</span>
            <span>{t.texto}</span>
            {t.acao && <button onClick={() => { t.acao!.fn(); setLista(l => l.filter(x => x.id !== t.id)); }}>{t.acao.rotulo}</button>}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export const mensagemDeErro = (e: unknown) =>
  e instanceof ErroValidacao || e instanceof ErroPermissao || e instanceof ErroSalvamento ? e.message
    : e instanceof Error ? e.message : 'Algo deu errado. Tente de novo.';

/**
 * Executa uma ação de escrita com estado de salvamento e toast.
 * Sucesso devolve o resultado (ou `true` quando a ação não devolve nada); erro devolve `undefined`.
 */
export function useAcao() {
  const toast = useToast();
  const [estado, setEstado] = useState<SaveState>('ocioso');
  const [erro, setErro] = useState<string | null>(null);
  const ultimo = useRef<(() => Promise<unknown>) | null>(null);
  const executar = useCallback(async <T,>(fn: () => Promise<T>, msgOk?: string): Promise<(T extends void | undefined ? true : T) | undefined> => {
    ultimo.current = fn;
    setEstado('salvando'); setErro(null);
    try {
      const r = await fn();
      setEstado('salvo');
      if (msgOk) toast({ texto: msgOk, tipo: 'ok' });
      return (r ?? true) as T extends void | undefined ? true : T;
    } catch (e) {
      const m = mensagemDeErro(e);
      setErro(m);
      setEstado(e instanceof ErroSalvamento ? 'falha' : 'ocioso');
      toast({ texto: m, tipo: 'err', acao: e instanceof ErroSalvamento ? { rotulo: 'Tentar de novo', fn: () => { if (ultimo.current) void executar(ultimo.current as () => Promise<T>, msgOk); } } : undefined });
      return undefined;
    }
  }, [toast]);
  return { executar, estado, erro, ocupado: estado === 'salvando', limparErro: () => setErro(null) };
}

// ───────────────────────── Básicos ─────────────────────────

export type Tom = 'neutro' | 'ok' | 'atencao' | 'critico' | 'info' | 'muted' | 'navy' | 'outline' | 'proposta';

export const Badge = ({ tom = 'neutro', children, icone, title }: { tom?: Tom; children: ReactNode; icone?: string; title?: string }) => (
  <span className={`badge ${tom}`} title={title}>{icone && <span aria-hidden>{icone}</span>}{children}</span>
);

export function Btn({ children, variante, tamanho, block, carregando, className = '', ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variante?: 'sec' | 'ghost' | 'danger' | 'red'; tamanho?: 'sm'; block?: boolean; carregando?: boolean;
}) {
  return (
    <button type="button" {...p} disabled={p.disabled || carregando} className={`btn ${variante || ''} ${tamanho || ''} ${block ? 'block' : ''} ${className}`}>
      {carregando && <span className="spin" aria-hidden />}{children}
    </button>
  );
}

export const LinkBtn = ({ href, children, variante, tamanho, block }: { href: string; children: ReactNode; variante?: 'sec' | 'ghost'; tamanho?: 'sm'; block?: boolean }) => (
  <a href={href} className={`btn ${variante || ''} ${tamanho || ''} ${block ? 'block' : ''}`}>{children}</a>
);

export const Card = ({ children, titulo, acao, className = '', tight }: { children: ReactNode; titulo?: ReactNode; acao?: ReactNode; className?: string; tight?: boolean }) => (
  <section className={`card ${tight ? 'tight' : ''} ${className}`}>
    {(titulo || acao) && <div className="card-head">{typeof titulo === 'string' ? <h2>{titulo}</h2> : titulo}{acao}</div>}
    {children}
  </section>
);

export function Kpi({ rotulo, valor, dica, explicacao, alerta }: { rotulo: string; valor: ReactNode; dica?: ReactNode; explicacao?: { formula: string; porque?: string }; alerta?: boolean }) {
  const [aberto, setAberto] = useState(false);
  return (
    <div className={`kpi ${alerta ? 'alert' : ''}`}>
      <div className="lbl">
        <span>{rotulo}</span>
        {explicacao && <button className="info-btn" aria-expanded={aberto} aria-label={`Como é calculado: ${rotulo}`} onClick={() => setAberto(!aberto)}>?</button>}
      </div>
      <div className="val">{valor}</div>
      {dica && <div className="hint">{dica}</div>}
      {aberto && explicacao && (
        <div className="explain"><b>Como é calculado:</b> {explicacao.formula}{explicacao.porque && <><br /><b>Por que importa:</b> {explicacao.porque}</>}</div>
      )}
    </div>
  );
}

export const Progress = ({ valor, tom, grande, rotulo }: { valor: number; tom?: 'ok' | 'warn' | 'crit'; grande?: boolean; rotulo?: string }) => (
  <div className={`progress ${tom || ''} ${grande ? 'big' : ''}`} role="progressbar" aria-valuenow={Math.round(valor)} aria-valuemin={0} aria-valuemax={100} aria-label={rotulo}>
    <i style={{ width: `${Math.max(0, Math.min(100, valor))}%` }} />
  </div>
);

export function Segmented<T extends string>({ valor, opcoes, onChange, rotulo }: { valor: T; opcoes: { v: T; r: ReactNode }[]; onChange: (v: T) => void; rotulo: string }) {
  return (
    <div className="seg" role="radiogroup" aria-label={rotulo}>
      {opcoes.map(o => <button key={o.v} role="radio" aria-checked={valor === o.v} className={valor === o.v ? 'on' : ''} onClick={() => onChange(o.v)}>{o.r}</button>)}
    </div>
  );
}

export function Tabs<T extends string>({ valor, abas, onChange }: { valor: T; abas: { v: T; r: string; n?: number }[]; onChange: (v: T) => void }) {
  return (
    <div className="tabs" role="tablist">
      {abas.map(a => (
        <button key={a.v} role="tab" aria-selected={valor === a.v} className={valor === a.v ? 'on' : ''} onClick={() => onChange(a.v)}>
          {a.r}{a.n ? <span className="dot">{a.n}</span> : null}
        </button>
      ))}
    </div>
  );
}

export const Field = ({ rotulo, obrigatorio, dica, erro, children, htmlFor }: { rotulo: ReactNode; obrigatorio?: boolean; dica?: ReactNode; erro?: string | null; children: ReactNode; htmlFor?: string }) => (
  <div className="field">
    <label className="lbl" htmlFor={htmlFor}>{rotulo}{obrigatorio && <span className="req" aria-hidden>*</span>}</label>
    {children}
    {erro ? <div className="err" role="alert">{erro}</div> : dica ? <div className="hint">{dica}</div> : null}
  </div>
);

export function Sheet({ titulo, sub, onClose, children, rodape }: { titulo: ReactNode; sub?: ReactNode; onClose: () => void; children: ReactNode; rodape?: ReactNode }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    const ov = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', esc); document.body.style.overflow = ov; };
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={typeof titulo === 'string' ? titulo : undefined}>
        <div className="sheet-head">
          <div><h2>{titulo}</h2>{sub && <div className="muted small" style={{ marginTop: 4 }}>{sub}</div>}</div>
          <button className="x-btn" onClick={onClose} aria-label="Fechar">×</button>
        </div>
        {children}
        {rodape && <div className="sheet-foot">{rodape}</div>}
      </div>
    </div>
  );
}

export type SaveState = 'ocioso' | 'salvando' | 'salvo' | 'falha' | 'pendente';
export const SaveIndicator = ({ estado }: { estado: SaveState }) => {
  if (estado === 'ocioso') return null;
  const m = { salvando: '… Salvando', salvo: '✓ Salvo', falha: '✕ Falha ao salvar', pendente: '● Não salvo' }[estado];
  return <span className={`save ${estado}`} aria-live="polite">{m}</span>;
};

export const Empty = ({ titulo, children }: { titulo: string; children?: ReactNode }) => (
  <div className="empty"><b>{titulo}</b>{children}</div>
);

export const Alerta = ({ tipo = 'info', children, icone }: { tipo?: 'warn' | 'crit' | 'info' | 'ok' | 'prop'; children: ReactNode; icone?: string }) => (
  <div className={`alert-box ${tipo}`} role={tipo === 'crit' ? 'alert' : undefined}>
    <span className="ic" aria-hidden>{icone || { warn: '!', crit: '!', info: 'i', ok: '✓', prop: '◇' }[tipo]}</span>
    <div className="grow">{children}</div>
  </div>
);

export const Placa = ({ placa, grande }: { placa: string; grande?: boolean }) => {
  const n = placa.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return <span className={`plate ${grande ? 'lg' : ''}`}>{n.length === 7 ? `${n.slice(0, 3)}-${n.slice(3)}` : n}</span>;
};

export const Avatar = ({ nome }: { nome: string }) => (
  <span className="avatar" aria-hidden>{nome.split(' ').map(p => p[0]).slice(0, 2).join('')}</span>
);

// ───────────────────────── Demonstração ─────────────────────────

export function DemoBanner({ onControles }: { onControles: () => void }) {
  const c = useControle();
  return (
    <div className="demo-banner no-print">
      <span><strong>AMBIENTE DE DEMONSTRAÇÃO</strong> · dados fictícios · nada aqui afeta o sistema da oficina{c.offline ? ' · SIMULANDO SEM CONEXÃO' : ''}{c.falharProximo ? ' · próximo salvamento vai falhar' : ''}</span>
      <button onClick={onControles}>Controles da demo</button>
    </div>
  );
}

export function DemoControles({ onClose }: { onClose: () => void }) {
  const c = useControle();
  const [confirmando, setConfirmando] = useState(false);
  const toast = useToast();
  return (
    <Sheet titulo="Controles da demonstração" sub="Use para testar estados de erro e voltar ao início." onClose={onClose}>
      <div className="demo-ctrl">
        <label className="check"><input type="checkbox" checked={c.falharProximo} onChange={e => setControle({ falharProximo: e.target.checked })} /> Fazer o próximo salvamento falhar</label>
        <label className="check"><input type="checkbox" checked={c.offline} onChange={e => setControle({ offline: e.target.checked })} /> Simular conexão caída (todo salvamento falha)</label>
        <Field rotulo="Atraso simulado de rede">
          <select className="input" value={c.latenciaMs} onChange={e => setControle({ latenciaMs: Number(e.target.value) })}>
            <option value={0}>Sem atraso</option><option value={250}>250 ms (padrão)</option><option value={1200}>1,2 s (conexão lenta)</option>
          </select>
        </Field>
        <div className="divider" />
        <p className="small muted">Os dados ficam só neste navegador (armazenamento local). Restaurar apaga tudo o que foi feito e recria a base fictícia.</p>
        <div className="sheet-foot">
          {/* Confirmação na própria tela (confirm() do navegador não funciona em visualizadores embutidos). */}
          {confirmando
            ? <Btn variante="danger" onClick={() => { resetarDemo(); toast({ texto: 'Base de demonstração restaurada.', tipo: 'ok' }); onClose(); }}>Sim, descartar e restaurar</Btn>
            : <Btn variante="danger" onClick={() => setConfirmando(true)}>Restaurar dados da demo</Btn>}
          <Btn variante="sec" onClick={confirmando ? () => setConfirmando(false) : onClose}>{confirmando ? 'Voltar' : 'Fechar'}</Btn>
        </div>
      </div>
    </Sheet>
  );
}
