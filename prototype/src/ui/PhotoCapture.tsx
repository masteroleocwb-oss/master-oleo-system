import { useRef, useState } from 'react';
import { fotoDemo } from '../data/demoFotos';
import { MODO_REAL } from '../data/modo';
import { Btn, Field, Sheet } from './components';

/** Reduz a foto antes de guardar (no produto: upload para o Storage com compressão no aparelho). */
const comprimir = (arquivo: File) => new Promise<string>((ok, falha) => {
  const leitor = new FileReader();
  leitor.onerror = () => falha(new Error('Não foi possível ler a imagem.'));
  leitor.onload = () => {
    const img = new Image();
    img.onerror = () => falha(new Error('Arquivo não é uma imagem válida.'));
    img.onload = () => {
      // Lado maior até 1024 px e no máximo ~300 KB: envia rápido no 4G e cabe num documento da base.
      let max = 1024;
      for (;;) {
        const k = Math.min(1, max / Math.max(img.width, img.height));
        const cv = document.createElement('canvas');
        cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
        cv.getContext('2d')!.drawImage(img, 0, 0, cv.width, cv.height);
        for (const q of [0.7, 0.55, 0.4]) {
          const url = cv.toDataURL('image/jpeg', q);
          if (url.length <= 300_000 || (q === 0.4 && max <= 480)) { ok(url); return; }
        }
        max = Math.round(max * 0.75);
      }
    };
    img.src = String(leitor.result);
  };
  leitor.readAsDataURL(arquivo);
});

export function PhotoCapture({ itemId, itemNome, onConfirmar, onClose, ocupado }: {
  itemId: string; itemNome: string; ocupado?: boolean;
  onConfirmar: (f: { url: string; demo: boolean; legenda: string }) => void; onClose: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [foto, setFoto] = useState<{ url: string; demo: boolean } | null>(null);
  const [legenda, setLegenda] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [n, setN] = useState(0);

  const escolher = async (f?: File) => {
    if (!f) return;
    setErro(null);
    try { setFoto({ url: await comprimir(f), demo: false }); } catch (e) { setErro((e as Error).message); }
  };

  return (
    <Sheet titulo="Foto do item" sub={itemNome} onClose={onClose}
      rodape={foto ? <>
        <Btn variante="sec" onClick={() => { setFoto(null); setTimeout(() => input.current?.click(), 0); }}>Refazer</Btn>
        <Btn carregando={ocupado} onClick={() => onConfirmar({ ...foto, legenda })}>Usar esta foto</Btn>
      </> : undefined}>
      <input ref={input} type="file" accept="image/*" capture="environment" className="sr-only" aria-label="Escolher foto"
        onChange={e => { void escolher(e.target.files?.[0]); e.target.value = ''; }} />
      {!foto ? (
        <div className="stack">
          <Btn block onClick={() => input.current?.click()}>Abrir câmera</Btn>
          {!MODO_REAL && <Btn block variante="sec" onClick={() => { setFoto({ url: fotoDemo(itemId, `${itemNome} · demonstração`, n), demo: true }); setN(n + 1); }}>Usar foto demonstrativa</Btn>}
          <p className="small muted">{MODO_REAL ? 'No celular, "Abrir câmera" usa a câmera traseira.' : 'No celular, "Abrir câmera" usa a câmera traseira. Fotos enviadas aqui ficam só neste navegador. Para a demonstração, prefira a foto demonstrativa (sem imagem real).'}</p>
          {erro && <p className="small" style={{ color: 'var(--crit)' }}>{erro}</p>}
        </div>
      ) : (
        <div className="stack">
          <img className="preview-img" src={foto.url} alt={`Pré-visualização da foto de ${itemNome}`} />
          <Field rotulo="Legenda (opcional)" dica="Ex.: lado do motorista, desgaste na borda" htmlFor="legenda-foto">
            <input id="legenda-foto" className="input" value={legenda} maxLength={80} onChange={e => setLegenda(e.target.value)} />
          </Field>
        </div>
      )}
    </Sheet>
  );
}
