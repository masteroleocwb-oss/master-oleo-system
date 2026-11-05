import { useEffect, useState, type ImgHTMLAttributes } from 'react';
import { createPortal } from 'react-dom';

/** Foto que amplia ao tocar (tela cheia; tocar de novo, no × ou Esc fecha). Vale no sistema e no relatório do cliente. */
export function ImgAmpliavel({ src, alt, legenda, ...resto }: { src: string; alt: string; legenda?: string } & Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'>) {
  const [aberta, setAberta] = useState(false);
  useEffect(() => {
    if (!aberta) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberta(false); };
    document.addEventListener('keydown', esc);
    const ov = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', esc); document.body.style.overflow = ov; };
  }, [aberta]);
  const abrir = (e: React.MouseEvent) => { e.preventDefault(); e.stopPropagation(); setAberta(true); };
  return <>
    <img src={src} alt={alt} {...resto} className={`ampliavel ${resto.className || ''}`} onClick={abrir} title="Toque para ampliar" />
    {aberta && createPortal(
      <div className="foto-ampliada" role="dialog" aria-label={`Foto ampliada: ${alt}`} onClick={e => { e.stopPropagation(); setAberta(false); }}>
        <button type="button" className="fechar" aria-label="Fechar foto" onClick={() => setAberta(false)}>×</button>
        <img src={src} alt={alt} />
        {(legenda || alt) && <div className="legenda">{legenda || alt}</div>}
      </div>, document.body)}
  </>;
}
