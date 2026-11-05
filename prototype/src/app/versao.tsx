import { useEffect, useState } from 'react';

// Aba aberta antes de uma atualização continua rodando o código antigo (ex.: não abria as fotos novas).
// Confere de tempos em tempos se saiu versão nova: mostra o aviso e atualiza sozinho quando a pessoa
// volta para a aba depois de um tempo fora (nada fica pela metade: tudo já está salvo na base).

const scriptAtual = () => document.querySelector<HTMLScriptElement>('script[type="module"][src*="assets/index-"]')?.getAttribute('src')?.replace(/^\.?\//, '') || '';

async function saiuVersaoNova(): Promise<boolean> {
  const atual = scriptAtual();
  if (!atual) return false; // modo de desenvolvimento
  try {
    const r = await fetch(`./index.html?v=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) return false;
    const m = (await r.text()).match(/assets\/index-[\w-]+\.js/);
    return !!m && m[0] !== atual;
  } catch { return false; }
}

export function AvisoVersao() {
  const [nova, setNova] = useState(false);
  useEffect(() => {
    let saiuEm = 0;
    const conferir = async () => { if (await saiuVersaoNova()) setNova(true); };
    const t = setInterval(conferir, 5 * 60_000);
    const vis = async () => {
      if (document.visibilityState === 'hidden') { saiuEm = Date.now(); return; }
      const foraHaTempo = saiuEm && Date.now() - saiuEm > 20_000;
      saiuEm = 0;
      if (await saiuVersaoNova()) { if (foraHaTempo) location.reload(); else setNova(true); }
    };
    document.addEventListener('visibilitychange', vis);
    void conferir();
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', vis); };
  }, []);
  if (!nova) return null;
  return (
    <div role="status" style={{ position: 'fixed', left: 12, right: 12, bottom: 12, zIndex: 1000, display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between',
      background: 'var(--ink, #0b1f44)', color: '#fff', borderRadius: 12, padding: '10px 14px', boxShadow: '0 6px 24px rgba(0,0,0,.25)', maxWidth: 560, margin: '0 auto' }}>
      <span style={{ fontSize: 14 }}>Saiu uma versão nova do sistema.</span>
      <button type="button" onClick={() => location.reload()} style={{ background: '#fff', color: '#0b1f44', border: 0, borderRadius: 8, padding: '8px 14px', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>Atualizar</button>
    </div>
  );
}
