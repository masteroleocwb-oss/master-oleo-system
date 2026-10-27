import { useMemo, useState } from 'react';
import { ir } from '../app/nav';
import { finalizarOS, pendenciasFinalizacao, type FinalizarInput, type ProximaInput } from '../data/api';
import { ORIGEM_LABEL, SERVICOS } from '../domain/catalogo';
import { sugerirProxima } from '../domain/manutencao';
import type { Usuario } from '../domain/types';
import { addMeses, agoraISO, fmtBRL, fmtData, fmtKm } from '../domain/util';
import { Alerta, Badge, Btn, Card, Empty, Field, Placa, useAcao, useDB } from '../ui/components';
import { ChecklistBadge } from './common';

interface LinhaProx extends ProximaInput { chave: string; incluir: boolean; editavel: boolean; motivo: string }

export function Execucao({ u, osId }: { u: Usuario; osId: string }) {
  const db = useDB();
  const os = db.os.find(o => o.id === osId);
  const acao = useAcao();
  const [km, setKm] = useState('');
  const [exec, setExec] = useState<Record<string, { executado: boolean; qtd?: string }>>(() =>
    Object.fromEntries((os?.servicos || []).map((s, i) => [`${s.key}:${i}`, { executado: true, qtd: s.quantidade }])));
  const [obsInterna, setObsInterna] = useState(os?.obsInterna || '');
  const [obsCliente, setObsCliente] = useState(os?.obsCliente || '');
  const [tentou, setTentou] = useState(false);
  const [extras, setExtras] = useState<Record<string, Partial<LinhaProx>>>({});

  const v = os && db.veiculos.find(x => x.id === os.veiculoId);
  const c = os && db.checklists.find(x => x.id === os.checklistId);
  const kmNum = Number(km.replace(/\D/g, '')) || null;

  const proximas: LinhaProx[] = useMemo(() => {
    if (!os || !v) return [];
    const linhas: LinhaProx[] = [];
    os.servicos.forEach((s, i) => {
      if (!exec[`${s.key}:${i}`]?.executado) return;
      const sug = sugerirProxima(s.key, SERVICOS[s.key].nome, db.regrasIntervalo, v, agoraISO(), kmNum ?? undefined);
      if (!sug.regra) return;
      linhas.push({
        chave: `s:${s.key}`, servicoKey: s.key, descricao: sug.descricao, regraId: sug.regra.id, origem: sug.confirmavel ? sug.regra.origem : 'nao_confirmada',
        fonte: sug.regra.fonte, kmPrevisto: sug.kmPrevisto, dataPrevista: sug.dataPrevista, incluir: true, editavel: false, motivo: sug.motivo,
      });
    });
    // Recomendações do checklist que o cliente não fez agora: viram acompanhamento recomendado pelo profissional.
    c?.defs.forEach(d => {
      const it = c.itens[d.id];
      const aceita = db.oportunidades.find(o => o.osId === os.id && o.itemDefId === d.id)?.situacao === 'aceita';
      if (aceita || !(it.estado === 'atencao' || it.estado === 'prioritario' || it.estado === 'pendente_avaliacao')) return;
      linhas.push({
        chave: `i:${d.id}`, itemDefId: d.id, descricao: it.estado === 'pendente_avaliacao' ? `Avaliar ${d.nome.toLowerCase()}` : it.recomendacao || `Revisar ${d.nome.toLowerCase()}`,
        origem: 'profissional', fonte: `Checklist da OS #${os.numero}`, incluir: true, editavel: true,
        motivo: it.estado === 'prioritario' ? 'Item prioritário não realizado nesta visita' : 'Recomendação do mecânico',
      });
    });
    return linhas.map(l => ({ ...l, ...extras[l.chave] }));
  }, [os, v, c, db, exec, kmNum, extras]);

  if (!os || !v) return <div className="card"><Empty titulo="OS não encontrada." /></div>;
  if (os.mecanicoId !== u.id) return <div className="card"><Empty titulo="Só o mecânico desta OS registra a execução." /></div>;
  if (os.status !== 'andamento') return <div className="card"><Empty titulo="Esta OS não está em andamento."><a href={`#/os/${os.id}`}>Ver OS</a></Empty></div>;

  const entrada: FinalizarInput = {
    km: kmNum,
    servicos: os.servicos.map((s, i) => ({ key: s.key, executado: !!exec[`${s.key}:${i}`]?.executado, quantidadeExecutada: exec[`${s.key}:${i}`]?.qtd })),
    obsInterna, obsCliente,
    proximas: proximas.filter(p => p.incluir).map(({ chave: _c, incluir: _i, editavel: _e, motivo: _m, ...p }) => p),
  };
  const pend = pendenciasFinalizacao(db, os, entrada);

  const finalizar = async () => {
    setTentou(true);
    if (pend.length) return;
    if (await acao.executar(() => finalizarOS(u, os.id, entrada).then(() => true), `OS #${os.numero} concluída. Relatório do cliente pronto.`)) ir(`/os/${os.id}`);
  };

  return (
    <div style={{ maxWidth: 820 }}>
      <a className="back" href={`#/os/${os.id}`}>‹ OS #{os.numero}</a>
      <div className="page-head">
        <div><h1>Execução e finalização</h1><div className="row" style={{ marginTop: 6 }}><Placa placa={v.placa} /><b>{v.marca} {v.modelo}</b><ChecklistBadge c={c} /></div></div>
      </div>

      {c && c.status !== 'concluido' && c.status !== 'excecao_autorizada' && (
        <div style={{ marginBottom: 12 }}><Alerta tipo="warn">O checklist precisa estar concluído (ou com exceção autorizada) antes de finalizar. <a href={`#/os/${os.id}/checklist`}>Abrir checklist</a></Alerta></div>
      )}

      <Card titulo="Serviços executados">
        {os.servicos.map((s, i) => {
          const k = `${s.key}:${i}`;
          return (
            <div key={k} className="row nowrap" style={{ padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
              <label className="check grow" style={{ padding: '6px 0' }}>
                <input type="checkbox" checked={!!exec[k]?.executado} onChange={e => setExec({ ...exec, [k]: { ...exec[k], executado: e.target.checked } })} />
                <span>
                  <b>{SERVICOS[s.key].nome}</b> {s.origem === 'checklist' && <Badge tom="info">Do checklist</Badge>}
                  <span className="small muted" style={{ display: 'block' }}>{[s.marca, s.codigo, s.valor ? fmtBRL(s.valor) : null].filter(Boolean).join(' · ')}</span>
                </span>
              </label>
              {SERVICOS[s.key].campos.includes('quantidade') && (
                <input aria-label={`Litros usados em ${SERVICOS[s.key].nome}`} className="input" style={{ width: 90 }} inputMode="decimal" value={exec[k]?.qtd || ''} placeholder="L"
                  onChange={e => setExec({ ...exec, [k]: { ...exec[k], qtd: e.target.value } })} />
              )}
            </div>
          );
        })}
      </Card>

      <Card titulo="Quilometragem">
        <Field rotulo="KM no painel" obrigatorio htmlFor="km" dica={`Último registrado: ${fmtKm(v.kmAtual)}${v.kmAtualEm ? ` em ${fmtData(v.kmAtualEm)}` : ''}`}
          erro={tentou && pend.find(p => p.toLowerCase().includes('km') || p.toLowerCase().includes('quilometragem')) || null}>
          <input id="km" className="input" inputMode="numeric" value={km} onChange={e => setKm(e.target.value.replace(/\D/g, '').slice(0, 7))} placeholder="Ex.: 53450" style={{ maxWidth: 220 }} />
        </Field>
      </Card>

      <Card titulo="Próximas manutenções">
        <p className="small muted" style={{ marginBottom: 10 }}>O sistema só calcula km/data quando há regra validada. Sem regra validada, registra como “acompanhar”. Nenhum intervalo é inventado.</p>
        {proximas.length === 0 && <p className="small muted">Nenhuma sugestão para os serviços desta OS.</p>}
        {proximas.map(p => (
          <div key={p.chave} style={{ padding: '10px 0', borderBottom: '1px solid var(--line)' }}>
            <label className="check" style={{ padding: 0 }}>
              <input type="checkbox" checked={p.incluir} onChange={e => setExtras({ ...extras, [p.chave]: { ...extras[p.chave], incluir: e.target.checked } })} />
              <span className="grow">
                <b>{p.descricao}</b>
                <span className="row" style={{ marginTop: 4 }}>
                  <Badge tom={p.origem === 'nao_confirmada' ? 'muted' : p.origem === 'profissional' ? 'info' : 'navy'}>{ORIGEM_LABEL[p.origem].rotulo}</Badge>
                  <span className="small muted">{p.motivo}</span>
                </span>
                {!p.editavel && (p.kmPrevisto || p.dataPrevista) && <span className="small" style={{ display: 'block', marginTop: 4 }}>Previsto: {[p.kmPrevisto ? fmtKm(p.kmPrevisto) : null, p.dataPrevista ? fmtData(p.dataPrevista) : null].filter(Boolean).join(' ou ')}</span>}
                <span className="tiny muted" style={{ display: 'block' }}>Fonte: {p.fonte}</span>
              </span>
            </label>
            {p.editavel && p.incluir && (
              <div className="row" style={{ marginTop: 6, paddingLeft: 32 }}>
                <select className="input" style={{ width: 'auto' }} aria-label="Quando revisar" value={p.dataPrevista ? 'meses' : 'proxima'}
                  onChange={e => setExtras({ ...extras, [p.chave]: { ...extras[p.chave], dataPrevista: e.target.value === 'meses' ? addMeses(agoraISO(), 3) : undefined } })}>
                  <option value="proxima">Na próxima visita</option>
                  <option value="meses">Em até 3 meses</option>
                </select>
              </div>
            )}
          </div>
        ))}
      </Card>

      <Card titulo="Observações">
        <Field rotulo="Para o cliente (aparece no relatório)" htmlFor="obs-cli"><textarea id="obs-cli" className="input" value={obsCliente} onChange={e => setObsCliente(e.target.value)} /></Field>
        <Field rotulo="Interna (só equipe)" htmlFor="obs-int"><textarea id="obs-int" className="input" value={obsInterna} onChange={e => setObsInterna(e.target.value)} /></Field>
      </Card>

      {tentou && pend.length > 0 && <div style={{ marginTop: 12 }}><Alerta tipo="crit"><b>Antes de finalizar:</b><ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{pend.map(p => <li key={p}>{p}</li>)}</ul></Alerta></div>}
      <div style={{ marginTop: 16 }}><Btn block carregando={acao.ocupado} onClick={finalizar}>Finalizar OS</Btn></div>
    </div>
  );
}
