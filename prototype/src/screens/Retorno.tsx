import { useEffect, useRef, useState } from 'react';
import { ir } from '../app/nav';
import { adicionarFotoRetorno, finalizarRetorno, nomeDe, pendenciasRetorno, removerEvidencia, salvarRetorno } from '../data/api';
import type { AtendimentoRetorno, Usuario } from '../domain/types';
import { fmtData, fmtKm } from '../domain/util';
import { Alerta, Btn, Card, Empty, Field, Placa, SaveIndicator, Segmented, useAcao, useDB, type SaveState } from '../ui/components';
import { PhotoCapture } from '../ui/PhotoCapture';
import { nomeServicos } from './common';
import { PausarBotao } from './Pausa';

type Campos = Omit<AtendimentoRetorno, 'problemaRelatado'>;

/** Atendimento de retorno: foco no problema relatado — fotos antes/depois, o que foi feito e o que foi avisado. */
export function Retorno({ u, osId }: { u: Usuario; osId: string }) {
  const db = useDB();
  const os = db.os.find(o => o.id === osId);
  const [campos, setCampos] = useState<Campos>(() => ({ ...(os?.retorno || {}) }));
  const [salvo, setSalvo] = useState<SaveState>('ocioso');
  const [camera, setCamera] = useState<'antes' | 'depois' | null>(null);
  const [km, setKm] = useState('');
  const [tentou, setTentou] = useState(false);
  const acao = useAcao();
  const fotoAcao = useAcao();
  const primeiro = useRef(true);

  // Salvamento automático do texto (o mecânico pode sair e voltar sem perder nada).
  useEffect(() => {
    if (primeiro.current) { primeiro.current = false; return; }
    if (!os || os.status !== 'andamento' || os.mecanicoId !== u.id) return;
    setSalvo('pendente');
    const t = setTimeout(() => { salvarRetorno(u, os.id, campos).then(() => setSalvo('salvo'), () => setSalvo('falha')); }, 700);
    return () => clearTimeout(t);
  }, [campos]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!os || !os.retorno) return <div className="card"><Empty titulo="OS de retorno não encontrada." /></div>;
  if (os.mecanicoId !== u.id) return <div className="card"><Empty titulo="Só o mecânico desta OS registra o atendimento do retorno." /></div>;
  if (os.status !== 'andamento') return <div className="card"><Empty titulo={os.status === 'pausada' ? 'OS pausada. Retome na Operação para continuar.' : 'Esta OS não está em andamento.'}><a href={`#/os/${os.id}`}>Ver OS</a></Empty></div>;

  const v = db.veiculos.find(x => x.id === os.veiculoId)!;
  const orig = db.os.find(o => o.id === os.retornoDeOsId);
  const fotos = db.evidencias.filter(e => e.osId === os.id && e.itemDefId === 'retorno' && !e.removida);
  const kmNum = Number(km.replace(/\D/g, '')) || null;
  const pend = pendenciasRetorno(db, { ...os, retorno: { ...os.retorno, ...campos } }, kmNum);
  const set = (x: Partial<Campos>) => setCampos(c => ({ ...c, ...x }));

  const finalizar = async () => {
    setTentou(true);
    if (pend.length) return;
    await salvarRetorno(u, os.id, campos);
    if (await acao.executar(() => finalizarRetorno(u, os.id, kmNum), `Retorno da OS #${os.numero} concluído.`)) ir(`/os/${os.id}`);
  };

  const BlocoFotos = ({ etapa }: { etapa: 'antes' | 'depois' }) => (
    <div>
      <div className="small strong" style={{ marginBottom: 6 }}>{etapa === 'antes' ? 'Antes — o problema' : 'Depois — a solução'}{etapa === 'antes' && <span style={{ color: 'var(--red)' }}> *</span>}</div>
      <div className="gallery">
        {fotos.filter(f => f.etapa === etapa).map(f => (
          <figure key={f.id}>
            <img src={f.url} alt={f.legenda || `Foto ${etapa}`} />
            <figcaption>{f.legenda}<br /><Btn tamanho="sm" variante="ghost" onClick={() => fotoAcao.executar(() => removerEvidencia(u, f.id, 'Substituída no atendimento do retorno'), 'Foto removida (fica no histórico).')}>Remover</Btn></figcaption>
          </figure>
        ))}
      </div>
      <Btn tamanho="sm" variante="sec" onClick={() => setCamera(etapa)} data-foto={etapa}>+ Foto {etapa === 'antes' ? 'do problema' : 'da solução'}</Btn>
    </div>
  );

  return (
    <div style={{ maxWidth: 820 }}>
      <a className="back" href={`#/os/${os.id}`}>‹ OS #{os.numero}</a>
      <div className="page-head">
        <div>
          <h1>Atendimento de retorno</h1>
          <div className="row" style={{ marginTop: 6 }}><Placa placa={v.placa} /><b>{v.marca} {v.modelo}</b></div>
        </div>
        <div className="row"><SaveIndicator estado={salvo} /><PausarBotao u={u} os={os} /></div>
      </div>

      <Alerta tipo="warn">
        <b>Problema relatado pelo cliente:</b> {os.retorno.problemaRelatado}
        {orig && <div className="small" style={{ marginTop: 4 }}>Serviço original: <a href={`#/os/${orig.id}`}>OS #{orig.numero}</a> em {fmtData(orig.concluidaEm)}, {fmtKm(orig.km)}, por {nomeDe(db, orig.mecanicoId)} — {nomeServicos(orig, true)}</div>}
      </Alerta>
      <p className="small muted" style={{ margin: '10px 0' }}>No retorno não é preciso refazer o checklist completo. Foque no problema: fotografe, registre o que encontrou, o que fez e o que avisou ao cliente.</p>

      <Card titulo="1. O que foi encontrado">
        <BlocoFotos etapa="antes" />
        <div style={{ marginTop: 12 }}>
          <Field rotulo="Diagnóstico" obrigatorio htmlFor="ret-diag" dica="Uso interno da equipe." erro={tentou && !campos.diagnostico?.trim() ? 'Descreva o que encontrou' : null}>
            <textarea id="ret-diag" className="input" value={campos.diagnostico || ''} onChange={e => set({ diagnostico: e.target.value })} placeholder="Ex.: anel do bujão do cárter mal assentado" />
          </Field>
          <Field rotulo="O problema tem relação com o serviço anterior?" obrigatorio>
            <Segmented rotulo="Relação com o serviço anterior" valor={campos.relacaoServicoAnterior || ('' as never)} onChange={x => set({ relacaoServicoAnterior: x })}
              opcoes={[{ v: 'sim', r: 'Sim' }, { v: 'nao', r: 'Não' }, { v: 'nao_identificado', r: 'Não deu para saber' }]} />
          </Field>
        </div>
      </Card>

      <Card titulo="2. O que foi feito">
        <Field rotulo="Solução aplicada" obrigatorio htmlFor="ret-sol" dica="Aparece no relatório do cliente." erro={tentou && !campos.solucao?.trim() ? 'Descreva o que foi feito' : null}>
          <textarea id="ret-sol" className="input" value={campos.solucao || ''} onChange={e => set({ solucao: e.target.value })} placeholder="Ex.: troca do anel de vedação e reaperto do bujão; teste sem vazamento" />
        </Field>
        <BlocoFotos etapa="depois" />
        {!fotos.some(f => f.etapa === 'depois') && (
          <div style={{ marginTop: 8 }}>
            <Field rotulo="Sem foto depois? Diga por quê" htmlFor="ret-semfoto" dica="Ex.: o problema não era visível (barulho, luz no painel).">
              <input id="ret-semfoto" className="input" value={campos.semFotoDepois || ''} onChange={e => set({ semFotoDepois: e.target.value })} />
            </Field>
          </div>
        )}
      </Card>

      <Card titulo="3. O que foi avisado ao cliente">
        <Field rotulo="Aviso ao cliente" obrigatorio htmlFor="ret-aviso" dica="Aparece no relatório do cliente." erro={tentou && !campos.avisoCliente?.trim() ? 'Registre o que foi avisado' : null}>
          <textarea id="ret-aviso" className="input" value={campos.avisoCliente || ''} onChange={e => set({ avisoCliente: e.target.value })} placeholder="Ex.: verificar o piso da garagem nos próximos dias; se aparecer mancha, retornar sem custo" />
        </Field>
      </Card>

      <Card titulo="Quilometragem">
        <Field rotulo="KM no painel" obrigatorio htmlFor="km" dica={`Último registrado: ${fmtKm(v.kmAtual)}`}>
          <input id="km" className="input" inputMode="numeric" value={km} onChange={e => setKm(e.target.value.replace(/\D/g, '').slice(0, 7))} style={{ maxWidth: 220 }} />
        </Field>
      </Card>

      {tentou && pend.length > 0 && <div style={{ marginTop: 12 }}><Alerta tipo="crit"><b>Antes de finalizar:</b><ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{pend.map(p => <li key={p}>{p}</li>)}</ul></Alerta></div>}
      <div style={{ marginTop: 16 }}><Btn block carregando={acao.ocupado} onClick={finalizar}>Finalizar retorno</Btn></div>

      {camera && (
        <PhotoCapture itemId={camera === 'antes' ? 'vazamento' : 'motor'} itemNome={camera === 'antes' ? 'Retorno — problema' : 'Retorno — solução'} ocupado={fotoAcao.ocupado} onClose={() => setCamera(null)}
          onConfirmar={async f => { if (await fotoAcao.executar(() => adicionarFotoRetorno(u, os.id, camera, f), 'Foto registrada.')) setCamera(null); }} />
      )}
    </div>
  );
}
