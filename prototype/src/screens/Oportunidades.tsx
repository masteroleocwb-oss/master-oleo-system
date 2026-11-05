import { useState } from 'react';
import { nomeDe, oportunidadePendente, servicoNaOS, tratarOportunidade } from '../data/api';
import { ESTADOS, SERVICOS } from '../domain/catalogo';
import { pode } from '../domain/permissions';
import type { Oportunidade, SituacaoOportunidade, Usuario } from '../domain/types';
import { diaKey, fmtBRL, fmtDataHora, hojeKey, primeiroNome } from '../domain/util';
import { Alerta, Badge, Btn, Card, Empty, Field, Placa, Segmented, Sheet, useAcao, useDB, type Tom } from '../ui/components';
import { FotoImg } from '../ui/FotoImg';

const SIT: Record<SituacaoOportunidade, { r: string; tom: Tom }> = {
  nova: { r: 'Nova', tom: 'info' }, apresentada: { r: 'Apresentada', tom: 'atencao' }, aceita: { r: 'Aceita', tom: 'ok' },
  recusada: { r: 'Recusada', tom: 'muted' }, avaliar_depois: { r: 'Avaliar depois', tom: 'neutro' }, nao_oferecer: { r: 'Não oferecer', tom: 'muted' },
};

type Filtro = 'abertas' | 'hoje' | 'todas';

export function Oportunidades({ u }: { u: Usuario }) {
  const db = useDB();
  const [filtro, setFiltro] = useState<Filtro>('abertas');
  const [sel, setSel] = useState<Oportunidade | null>(null);
  const lista = db.oportunidades
    .filter(o => filtro === 'todas' ? true : filtro === 'abertas' ? oportunidadePendente(db, o) && db.os.find(x => x.id === o.osId)?.status !== 'concluido' : diaKey(o.criadaEm) === hojeKey())
    .sort((a, b) => (a.estadoItem === 'prioritario' ? -1 : 0) - (b.estadoItem === 'prioritario' ? -1 : 0) || b.criadaEm.localeCompare(a.criadaEm))
    .slice(0, 60);
  return (
    <div style={{ maxWidth: 900 }}>
      <div className="page-head">
        <div><h1>Recomendações do checklist</h1><div className="sub">Itens que o mecânico marcou como Atenção ou Prioritário. Identificar não é vender: o comercial apresenta e registra a decisão do cliente.</div></div>
        <Segmented rotulo="Filtro" valor={filtro} onChange={setFiltro} opcoes={[{ v: 'abertas', r: 'Em aberto' }, { v: 'hoje', r: 'Hoje' }, { v: 'todas', r: 'Todas' }]} />
      </div>
      {lista.length === 0 ? <Card><Empty titulo="Nenhuma recomendação neste filtro." /></Card> : (
        <div className="list">
          {lista.map(o => {
            const os = db.os.find(x => x.id === o.osId)!;
            const v = db.veiculos.find(x => x.id === o.veiculoId)!;
            return (
              <button key={o.id} className="li" onClick={() => setSel(o)} data-op={o.id}>
                <Placa placa={v.placa} />
                <div className="grow">
                  <div className="ttl">{o.recomendacao}</div>
                  <div className="meta">OS #{os.numero} · {v.modelo} · {primeiroNome(nomeDe(db, os.mecanicoId))} · {o.evidenciaIds.length} foto(s){o.valor ? ` · ${fmtBRL(o.valor)}` : ''}</div>
                </div>
                <Badge tom={o.estadoItem === 'prioritario' ? 'critico' : 'atencao'}>{ESTADOS[o.estadoItem].curto}</Badge>
                <Badge tom={SIT[o.situacao].tom}>{SIT[o.situacao].r}</Badge>
              </button>
            );
          })}
        </div>
      )}
      {sel && <OportunidadeSheet u={u} op={db.oportunidades.find(x => x.id === sel.id)!} onClose={() => setSel(null)} />}
    </div>
  );
}

function OportunidadeSheet({ u, op, onClose }: { u: Usuario; op: Oportunidade; onClose: () => void }) {
  const db = useDB();
  const acao = useAcao();
  const [valor, setValor] = useState(op.valor ? String(op.valor) : '');
  const [obs, setObs] = useState('');
  const os = db.os.find(x => x.id === op.osId)!;
  const fotos = db.evidencias.filter(e => op.evidenciaIds.includes(e.id) && !e.removida);
  const jaNaOS = servicoNaOS(os, op.servicoKey);
  const podeTratar = pode(u, 'oportunidade.tratar') && op.situacao !== 'nao_oferecer' && op.situacao !== 'aceita' && !jaNaOS;
  const fazer = async (s: SituacaoOportunidade, msg: string) => {
    const r = await acao.executar(() => tratarOportunidade(u, op.id, s, { valor: Number(valor.replace(',', '.')) || undefined, obs }), msg);
    if (r !== undefined) onClose();
  };
  return (
    <Sheet titulo={op.recomendacao} sub={`OS #${os.numero} · ${SIT[op.situacao].r}`} onClose={onClose}>
      {fotos.length > 0 && <div className="fotos" style={{ marginBottom: 12 }}>{fotos.map(f => <div key={f.id} className="foto"><FotoImg url={f.url} alt={f.legenda || ''} /><div className="cap">{f.legenda}</div></div>)}</div>}
      {op.servicoKey && <p className="small">Serviço relacionado: <b>{SERVICOS[op.servicoKey].nome}</b></p>}
      {jaNaOS && <div style={{ margin: '8px 0' }}><Alerta tipo="info">O cliente já contratou este serviço nesta OS: não precisa oferecer. As fotos ficam no checklist e no relatório.</Alerta></div>}
      {os.status === 'concluido' && op.situacao !== 'aceita' && <div style={{ margin: '8px 0' }}><Alerta tipo="info">A OS já foi concluída. Se o cliente aceitar agora, abra uma nova OS para o serviço.</Alerta></div>}
      {op.situacao === 'nao_oferecer' && <Alerta tipo="info">Frota com instrução de não oferecer. Registro mantido para o histórico do veículo.</Alerta>}
      {podeTratar && os.status !== 'concluido' && (
        <>
          <Field rotulo="Valor (se o cliente aceitar)" htmlFor="valor-op"><input id="valor-op" className="input" inputMode="decimal" value={valor} onChange={e => setValor(e.target.value.replace(/[^\d,.]/g, ''))} placeholder="0,00" /></Field>
          <Field rotulo="Observação" htmlFor="obs-op"><input id="obs-op" className="input" value={obs} onChange={e => setObs(e.target.value)} /></Field>
          {acao.erro && <div style={{ marginTop: 8 }}><Alerta tipo="crit">{acao.erro}</Alerta></div>}
          <div className="sheet-foot">
            {op.situacao === 'nova' && <Btn variante="sec" carregando={acao.ocupado} onClick={() => fazer('apresentada', 'Marcada como apresentada.')}>Apresentei ao cliente</Btn>}
            <Btn variante="sec" carregando={acao.ocupado} onClick={() => fazer('avaliar_depois', 'Fica para a próxima visita.')}>Avaliar depois</Btn>
            <Btn variante="danger" carregando={acao.ocupado} onClick={() => fazer('recusada', 'Recusa registrada.')}>Cliente recusou</Btn>
            <Btn carregando={acao.ocupado} onClick={() => fazer('aceita', 'Aceita: serviço incluído na OS.')}>Cliente aceitou</Btn>
          </div>
        </>
      )}
      <div className="section-title">Histórico</div>
      <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
        {op.historico.map((h, i) => <li key={i}>{fmtDataHora(h.em)} · {SIT[h.situacao].r} · {primeiroNome(nomeDe(db, h.por))}{h.obs ? ` · ${h.obs}` : ''}</li>)}
      </ul>
    </Sheet>
  );
}
