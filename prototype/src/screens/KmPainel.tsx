import { useState } from 'react';
import type { FotoKm } from '../data/api';
import { fmtData, fmtKm } from '../domain/util';
import { Alerta, Btn } from '../ui/components';
import { PhotoCapture } from '../ui/PhotoCapture';

/**
 * KM digitado menor que o último registrado: o registro antigo pode estar errado. O mecânico corrige
 * com uma foto do painel, que fica guardada na OS (só para a equipe) junto com quem corrigiu.
 */
export function FotoPainelKm({ kmAnterior, em, foto, onFoto }: { kmAnterior: number; em?: string; foto?: FotoKm; onFoto: (f: FotoKm) => void }) {
  const [camera, setCamera] = useState(false);
  return (
    <div className="stack" style={{ marginTop: 10 }}>
      <Alerta tipo="warn">
        <b>KM menor que o último registrado ({fmtKm(kmAnterior)}{em ? ` em ${fmtData(em)}` : ''}).</b> Confira o número. Se o registro antigo estiver errado, tire uma foto do painel mostrando a quilometragem: a correção fica registrada com a foto (não aparece para o cliente).
      </Alerta>
      {foto ? (
        <div className="row">
          <img src={foto.url} alt="Foto do painel" style={{ maxWidth: 160, borderRadius: 8 }} />
          <Btn tamanho="sm" variante="sec" onClick={() => setCamera(true)}>Trocar foto</Btn>
        </div>
      ) : <Btn variante="sec" onClick={() => setCamera(true)}>Foto do painel</Btn>}
      {camera && (
        <PhotoCapture itemId="painel" itemNome="Painel — quilometragem" onClose={() => setCamera(false)}
          onConfirmar={f => { onFoto({ url: f.url, demo: f.demo }); setCamera(false); }} />
      )}
    </div>
  );
}
