import { useEffect, useState, type ImgHTMLAttributes } from 'react';
import { lerFoto } from '../data/nuvem';
import { ImgAmpliavel } from './Ampliar';

/** Foto de evidência: as guardadas na base ("foto:<id>") são buscadas só quando aparecem na tela. */
export function FotoImg({ url, alt, ...resto }: { url: string; alt: string } & Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'>) {
  const daBase = url.startsWith('foto:');
  const [src, setSrc] = useState(daBase ? '' : url);
  const [falhou, setFalhou] = useState(false);
  useEffect(() => {
    if (!daBase) { setSrc(url); return; }
    let vivo = true;
    setFalhou(false);
    lerFoto(url).then(s => { if (vivo) setSrc(s); }).catch(() => { if (vivo) setFalhou(true); });
    return () => { vivo = false; };
  }, [url, daBase]);
  if (!src) return <span className="foto-carregando" style={resto.style} role="img" aria-label={falhou ? 'Foto indisponível' : 'Carregando foto'}>{falhou ? 'Foto indisponível' : ''}</span>;
  return <ImgAmpliavel src={src} alt={alt} {...resto} />;
}
