import { useState } from 'react';
import { ajudandoEm, chamarAjuda, encerrarAjuda } from '../data/api';
import { atendeOS, pode } from '../domain/permissions';
import type { OrdemServico, Usuario } from '../domain/types';
import { fmtHora, hojeKey, primeiroNome } from '../domain/util';
import { Alerta, Badge, Btn, Sheet, useAcao, useDB } from '../ui/components';

/**
 * Ajuda na OS em andamento: quem atende (ou a liderança) chama outro mecânico; o ajudante aparece no card.
 * Não muda comissão nem rodízio — serve para a liderança ver quem ajuda.
 */
export function AjudaBotao({ u, os }: { u: Usuario; os: OrdemServico }) {
  const db = useDB();
  const acao = useAcao();
  const [aberto, setAberto] = useState(false);
  if (os.status !== 'andamento') return null;
  const podeChamar = (os.mecanicoId === u.id && pode(u, 'os.executar')) || pode(u, 'rodizio.gerenciar');
  const ativas = (os.assistencias || []).filter(a => !a.fim);
  const souAjudante = ativas.some(a => a.mecanicoId === u.id);
  if (!podeChamar && !souAjudante) return null;
  const nome = (id: string) => primeiroNome(db.usuarios.find(x => x.id === id)?.nome) || '—';
  return <>
    {ativas.map(a => (
      <span key={a.mecanicoId} className="row nowrap" style={{ gap: 4 }}>
        <Badge tom="info">Ajuda: {nome(a.mecanicoId)} · desde {fmtHora(a.inicio)}</Badge>
        {(podeChamar || a.mecanicoId === u.id) && (
          <Btn variante="ghost" tamanho="sm" carregando={acao.ocupado} onClick={() => acao.executar(() => encerrarAjuda(u, os.id, a.mecanicoId), 'Ajuda encerrada.')}>
            {a.mecanicoId === u.id ? 'Parei de ajudar' : 'Encerrar ajuda'}
          </Btn>
        )}
      </span>
    ))}
    {podeChamar && <Btn variante="sec" tamanho="sm" onClick={() => setAberto(true)}>Chamar ajuda</Btn>}
    {aberto && <ChamarAjudaSheet u={u} os={os} onClose={() => setAberto(false)} />}
    {acao.erro && <Alerta tipo="crit">{acao.erro}</Alerta>}
  </>;
}

function ChamarAjudaSheet({ u, os, onClose }: { u: Usuario; os: OrdemServico; onClose: () => void }) {
  const db = useDB();
  const acao = useAcao();
  const st = (id: string) => (db.rodizio.dia === hojeKey() ? db.rodizio.status[id] : undefined) || 'disponivel';
  const mecs = db.usuarios.filter(x => atendeOS(x) && x.ativo && x.id !== os.mecanicoId)
    .map(m => {
      const propria = db.os.find(o => o.status === 'andamento' && o.mecanicoId === m.id);
      const ajuda = ajudandoEm(db, m.id);
      const s = st(m.id);
      const situacao = propria ? `Com a OS #${propria.numero}` : s === 'almoco' ? 'No almoço' : s === 'ausente' ? 'Ausente' : ajuda ? (ajuda.id === os.id ? 'Já está ajudando aqui' : `Ajudando na OS #${ajuda.numero}`) : 'Livre';
      return { m, situacao, pode: !propria && s === 'disponivel' && ajuda?.id !== os.id };
    })
    .sort((a, b) => Number(b.pode) - Number(a.pode) || a.m.nome.localeCompare(b.m.nome));
  return (
    <Sheet titulo={`Quem veio ajudar na OS #${os.numero}?`} sub="Fica registrado no card e no painel da liderança. Não muda comissão nem a vez no rodízio." onClose={onClose}
      rodape={<Btn variante="sec" onClick={onClose}>Fechar</Btn>}>
      <div className="list">
        {mecs.map(({ m, situacao, pode: ok }) => (
          <div className="li" key={m.id}>
            <div className="grow"><div className="ttl">{m.nome}</div><div className="meta">{situacao}</div></div>
            <Btn tamanho="sm" variante={ok ? undefined : 'sec'} disabled={!ok} carregando={acao.ocupado}
              onClick={async () => { if ((await acao.executar(() => chamarAjuda(u, os.id, m.id), `${primeiroNome(m.nome)} ajudando na OS #${os.numero}.`)) !== undefined) onClose(); }}>
              Veio ajudar
            </Btn>
          </div>
        ))}
        {!mecs.length && <div className="small muted">Nenhum outro mecânico ativo.</div>}
      </div>
      {acao.erro && <div style={{ marginTop: 10 }}><Alerta tipo="crit">{acao.erro}</Alerta></div>}
    </Sheet>
  );
}
