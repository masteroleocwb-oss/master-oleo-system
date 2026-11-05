import { useState } from 'react';
import { ir } from '../app/nav';
import { pausarOS, retomarOS } from '../data/api';
import { MOTIVO_PAUSA } from '../domain/catalogo';
import { pode } from '../domain/permissions';
import type { OrdemServico, Pausa, Usuario } from '../domain/types';
import { Alerta, Btn, Field, Sheet, useAcao, useDB } from '../ui/components';

/** Botão "Pausar OS" para o executor (ou liderança) em OS em andamento. */
export function PausarBotao({ u, os }: { u: Usuario; os: OrdemServico }) {
  const [aberto, setAberto] = useState(false);
  if (os.status !== 'andamento' || !((os.mecanicoId === u.id && pode(u, 'os.executar')) || pode(u, 'rodizio.gerenciar'))) return null;
  return <>
    <Btn variante="sec" tamanho="sm" onClick={() => setAberto(true)}>Pausar OS</Btn>
    {aberto && <PausarSheet u={u} os={os} onClose={() => setAberto(false)} />}
  </>;
}

/** Botão "Retomar OS" na própria OS pausada (mecânico da OS ou liderança). */
export function RetomarBotao({ u, os, bloco }: { u: Usuario; os: OrdemServico; bloco?: boolean }) {
  const db = useDB();
  const acao = useAcao();
  if (os.status !== 'pausada' || !((os.mecanicoId === u.id && pode(u, 'os.executar')) || pode(u, 'rodizio.gerenciar'))) return null;
  // Um carro por vez: com outra OS em andamento, mostra qual e leva até ela.
  const outra = db.os.find(o => o.status === 'andamento' && o.mecanicoId === os.mecanicoId);
  if (outra) return <Alerta tipo="info">Para retomar esta OS, pause ou finalize antes a <a href={`#/os/${outra.id}`}>OS #{outra.numero}</a>, que está em andamento.</Alerta>;
  return <>
    <Btn block={bloco} carregando={acao.ocupado} onClick={() => acao.executar(() => retomarOS(u, os.id), `OS #${os.numero} retomada.`)}>Retomar OS</Btn>
    {acao.erro && <Alerta tipo="crit">{acao.erro}</Alerta>}
  </>;
}

export function PausarSheet({ u, os, onClose }: { u: Usuario; os: OrdemServico; onClose: () => void }) {
  const [motivo, setMotivo] = useState<Pausa['motivo']>('peca');
  const [detalhe, setDetalhe] = useState('');
  const acao = useAcao();
  return (
    <Sheet titulo={`Pausar OS #${os.numero}`} sub="Enquanto a OS estiver pausada, você fica livre para assumir outro carro. O tempo pausado não conta no tempo de serviço." onClose={onClose}
      rodape={<>
        <Btn variante="sec" onClick={onClose}>Cancelar</Btn>
        <Btn carregando={acao.ocupado} onClick={async () => { if (await acao.executar(() => pausarOS(u, os.id, motivo, detalhe), `OS #${os.numero} pausada.`)) { onClose(); ir('/operacao'); } }}>Pausar</Btn>
      </>}>
      <Field rotulo="Motivo" htmlFor="motivo-pausa">
        <select id="motivo-pausa" className="input" value={motivo} onChange={e => setMotivo(e.target.value as Pausa['motivo'])}>
          {(Object.keys(MOTIVO_PAUSA) as Pausa['motivo'][]).map(k => <option key={k} value={k}>{MOTIVO_PAUSA[k]}</option>)}
        </select>
      </Field>
      <Field rotulo={motivo === 'peca' ? 'Qual peça?' : 'Detalhe'} obrigatorio={motivo === 'outro'} htmlFor="detalhe-pausa">
        <input id="detalhe-pausa" className="input" value={detalhe} onChange={e => setDetalhe(e.target.value)} placeholder={motivo === 'peca' ? 'Ex.: filtro de combustível — chega às 15h' : ''} />
      </Field>
      {acao.erro && <Alerta tipo="crit">{acao.erro}</Alerta>}
    </Sheet>
  );
}

