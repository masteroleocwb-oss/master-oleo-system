import { useEffect, useState } from 'react';
import { ir } from '../app/nav';
import { acaoOcorrencia, auditarChecklist, concluirPlanoAcao, declararDiaExcecao, decidirExcecao, nomeDe, registrarOcorrencia, registrarPlanoAcao } from '../data/api';
import { MODO_REAL } from '../data/modo';
import { carregarEventosRodizio } from '../data/nuvem';
import { indicadoresAssistencia, MIN_LIVRE_PARA_AJUDA } from '../domain/assistencia';
import { DEFINICOES, indicadoresEquipe, indicadoresLideranca, indicadoresMecanico, painelHoje, serieMecanico } from '../data/metricas';
import { fotosAtivasDoItem, pendenciasParaConcluir } from '../domain/checklist';
import { CATEGORIAS_OCORRENCIA, STATUS_OCORRENCIA_LABEL, type AcaoOcorrencia } from '../domain/gestao';
import { pode } from '../domain/permissions';
import type { Ocorrencia, Usuario } from '../domain/types';
import { addDias, agoraISO, fmtBRL, fmtData, fmtDataHora, fmtMes, fmtMin, fmtPct, hojeKey, mesKey, primeiroNome } from '../domain/util';
import { Alerta, Badge, Btn, Card, Empty, Field, Kpi, Placa, Segmented, Sheet, Tabs, useAcao, useDB, type Tom } from '../ui/components';
import { EstadoBadge } from './common';
import { FotoImg } from '../ui/FotoImg';

type Aba = 'visao' | 'mecanicos' | 'assistencia' | 'auditoria' | 'excecoes' | 'ocorrencias' | 'retornos' | 'planos' | 'gestao';

export function Lideranca({ u, aba: abaRota }: { u: Usuario; aba?: string }) {
  const db = useDB();
  const aba = (abaRota || 'visao') as Aba;
  const p = painelHoje(db);
  const setAba = (a: Aba) => ir(`/lideranca/${a}`);
  const decisaoOcorr = u.role === 'direcao' ? p.ocorrenciasDecisao.length + p.ocorrenciasAplicar.length : p.ocorrenciasRascunho.length;
  return (
    <div>
      <div className="page-head"><div><h1>Painel da liderança</h1><div className="sub">{fmtMes(mesKey(hojeKey() + 'T15:00:00Z'))}{MODO_REAL ? '' : ' · dados fictícios'}</div></div></div>
      <Tabs valor={aba} onChange={setAba} abas={[
        { v: 'visao', r: 'Visão geral' }, { v: 'mecanicos', r: 'Por mecânico' }, { v: 'assistencia', r: 'Assistência' }, { v: 'auditoria', r: 'Auditoria', n: p.correcoesPendentes.length },
        { v: 'excecoes', r: 'Exceções', n: p.excecoesPendentes.length }, { v: 'ocorrencias', r: 'Ocorrências', n: decisaoOcorr },
        { v: 'retornos', r: 'Retornos' }, { v: 'planos', r: 'Conversas' }, { v: 'gestao', r: 'Indicadores da liderança' },
      ]} />
      {aba === 'visao' && <Visao u={u} />}
      {aba === 'mecanicos' && <PorMecanico />}
      {aba === 'assistencia' && <Assistencia />}
      {aba === 'auditoria' && <Auditoria u={u} />}
      {aba === 'excecoes' && <Excecoes u={u} />}
      {aba === 'ocorrencias' && <Ocorrencias u={u} />}
      {aba === 'retornos' && <Retornos />}
      {aba === 'planos' && <Planos u={u} />}
      {aba === 'gestao' && <Gestao />}
    </div>
  );
}

type PeriodoAj = 'hoje' | '7d' | 'mes';

/** Em quantos carros cada mecânico podia ter ajudado (livre 10+ min com carro de outro rodando) e em quantos ajudou. */
function Assistencia() {
  const db = useDB();
  const [per, setPer] = useState<PeriodoAj>('hoje');
  useEffect(() => { if (MODO_REAL) void carregarEventosRodizio(); }, []);
  const hoje = hojeKey();
  const de = per === 'hoje' ? hoje : per === '7d' ? addDias(hoje + 'T15:00:00Z', -6).slice(0, 10) : hoje.slice(0, 8) + '01';
  const linhas = indicadoresAssistencia(db, de, hoje, agoraISO())
    .map(l => ({ ...l, nome: db.usuarios.find(x => x.id === l.mecanicoId)?.nome || '—' }))
    .sort((a, b) => b.podia - a.podia || a.nome.localeCompare(b.nome));
  const agora = db.os.filter(o => o.status === 'andamento' && o.assistencias?.some(a => !a.fim));
  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '—');
  return (
    <div className="stack">
      <Card titulo="Assistência por mecânico" acao={<Segmented rotulo="Período" valor={per} onChange={setPer} opcoes={[{ v: 'hoje', r: 'Hoje' }, { v: '7d', r: '7 dias' }, { v: 'mes', r: 'Mês' }]} />}>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Mecânico</th><th className="num">Podia ajudar</th><th className="num">Ajudou</th><th className="num">Aproveitamento</th><th className="num">Tempo ajudando</th><th className="num">Livre com carro rodando</th></tr></thead>
            <tbody>
              {linhas.map(l => (
                <tr key={l.mecanicoId}>
                  <td>{l.nome}</td>
                  <td className="num">{l.podia}</td>
                  <td className="num">{l.ajudou}</td>
                  <td className="num">{pct(l.ajudou, l.podia)}</td>
                  <td className="num">{fmtMin(l.minutosAjudando)}</td>
                  <td className="num">{fmtMin(l.minutosLivre)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="small muted" style={{ marginTop: 10 }}>
          <b>Podia ajudar</b>: carros de outro mecânico em andamento enquanto ele esteve livre por {MIN_LIVRE_PARA_AJUDA} min ou mais (sem OS própria, fora do almoço/ausência marcados no rodízio, entre o primeiro e o último carro dele no dia). <b>Ajudou</b>: carros em que o mecânico da OS registrou a ajuda. É informação para conversa; não muda comissão nem gera consequência automática.
        </p>
      </Card>
      <Card titulo="Ajudando agora">
        {agora.length === 0 ? <Empty titulo="Ninguém ajudando agora." /> : (
          <div className="list">
            {agora.map(o => (
              <a className="li" key={o.id} href={`#/os/${o.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                <div className="grow">
                  <div className="ttl">OS #{o.numero} · com {primeiroNome(db.usuarios.find(x => x.id === o.mecanicoId)?.nome)}</div>
                  <div className="meta">Ajuda: {o.assistencias!.filter(a => !a.fim).map(a => `${primeiroNome(db.usuarios.find(x => x.id === a.mecanicoId)?.nome)} desde ${fmtDataHora(a.inicio).slice(-5)}`).join(', ')}</div>
                </div>
              </a>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function Visao({ u }: { u: Usuario }) {
  const db = useDB();
  const eq = indicadoresEquipe(db);
  const p = painelHoje(db);
  const alvo = db.metas.find(m => m.id === 'mt_checklist')?.versoes.filter(v => v.status === 'aprovada').at(-1)?.alvo ?? 95;
  const pend = [
    { t: 'Exceções de checklist aguardando decisão', n: p.excecoesPendentes.length, rota: '/lideranca/excecoes', tom: 'critico' as Tom },
    { t: 'Correções de checklist com o mecânico', n: p.correcoesPendentes.length, rota: '/lideranca/auditoria', tom: 'atencao' },
    { t: u.role === 'direcao' ? 'Ocorrências aguardando decisão da direção' : 'Ocorrências registradas não enviadas para revisão', n: u.role === 'direcao' ? p.ocorrenciasDecisao.length : p.ocorrenciasRascunho.length, rota: '/lideranca/ocorrencias', tom: 'atencao' },
    { t: 'Ocorrências aprovadas aguardando aplicação', n: u.role === 'direcao' ? p.ocorrenciasAplicar.length : 0, rota: '/lideranca/ocorrencias', tom: 'info' },
    { t: 'Metas aguardando aprovação da direção', n: p.metasAguardando.length, rota: '/metas', tom: 'info' },
    { t: 'Recomendações novas sem tratamento do comercial', n: p.oportunidadesNovas.length, rota: '/oportunidades', tom: 'neutro' },
  ].filter(x => x.n > 0) as { t: string; n: number; rota: string; tom: Tom }[];
  return (
    <div>
      <div className="grid k4">
        <Kpi rotulo="Checklist completo (mês)" valor={fmtPct(eq.checklistPct)} dica={`Meta ${alvo}% · ${eq.excecoes} exceção(ões) à parte`} explicacao={DEFINICOES.checklist} alerta={eq.checklistPct != null && eq.checklistPct < alvo} />
        <Kpi rotulo="Evidência quando exigida" valor={fmtPct(eq.evidenciasPct)} explicacao={DEFINICOES.evidencias} />
        <Kpi rotulo="Itens identificados → realizados" valor={`${eq.identificados} → ${eq.realizados}`} dica={`Aceite ${fmtPct(eq.identificados ? (eq.realizados / eq.identificados) * 100 : null)}`} explicacao={DEFINICOES.conversao} />
        <Kpi rotulo="Retornos no mês" valor={eq.retornos} explicacao={DEFINICOES.retornos} alerta={eq.retornos > 0} />
        <Kpi rotulo="Carros atendidos (mês)" valor={eq.carros} />
        {pode(u, 'os.ver_valores') && <Kpi rotulo="Faturamento (mês)" valor={fmtBRL(eq.faturamento)} dica={`Itens do checklist: ${fmtBRL(eq.upsell)}`} />}
        <Kpi rotulo="Hoje: aguardando / em andamento" valor={`${p.aguardando.length} / ${p.andamento.length}`} />
        <Kpi rotulo="Hoje: concluídas" valor={p.concluidasHoje.length} />
      </div>
      <div className="section-title">Pendências da liderança</div>
      {pend.length === 0 ? <Card><Empty titulo="Nada pendente." /></Card> : (
        <div className="list">
          {pend.map(x => <a key={x.t} className="li" href={`#${x.rota}`}><Badge tom={x.tom}>{x.n}</Badge><span className="grow">{x.t}</span><span className="chev">›</span></a>)}
        </div>
      )}
      <div className="section-title">Checklist completo por mecânico</div>
      <Card>
        {eq.porMec.map(({ usuario, ind }) => (
          <div key={usuario.id} style={{ marginBottom: 10 }}>
            <div className="row between small"><b>{usuario.nome}</b><span>{fmtPct(ind.checklistPct)} · {ind.carros} carros · {ind.excecoes} exceção(ões)</span></div>
            <div className="progress" style={{ marginTop: 4 }}><i style={{ width: `${ind.checklistPct || 0}%`, background: (ind.checklistPct || 0) >= alvo ? 'var(--ok)' : (ind.checklistPct || 0) >= alvo - 10 ? '#d48806' : 'var(--crit)' }} /></div>
          </div>
        ))}
        <p className="tiny muted">Volume e faturamento não aparecem neste ranking de propósito: qualidade da inspeção primeiro.</p>
      </Card>
    </div>
  );
}

function PorMecanico() {
  const db = useDB();
  const eq = indicadoresEquipe(db);
  const [sel, setSel] = useState<string | null>(null);
  return (
    <div>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead><tr><th>Mecânico</th><th className="num">Carros</th><th className="num">Checklist</th><th className="num">Exceções</th><th className="num">Evidência</th><th className="num">Identif.</th><th className="num">Realizados / meta</th><th className="num">Retornos</th><th className="num">Tempo médio</th><th className="num">Score*</th></tr></thead>
          <tbody>
            {eq.porMec.map(({ usuario, ind }) => (
              <tr key={usuario.id} style={{ cursor: 'pointer' }} onClick={() => setSel(usuario.id)}>
                <td><b>{usuario.nome}</b> <span className="tiny muted">{usuario.nivel}</span></td>
                <td className="num">{ind.carros}</td>
                <td className="num">{fmtPct(ind.checklistPct)}</td>
                <td className="num">{ind.excecoes}</td>
                <td className="num">{fmtPct(ind.evidenciasPct)}</td>
                <td className="num">{ind.identificados}</td>
                <td className="num">{ind.realizados}{ind.meta ? ` / ${ind.meta.alvo}` : ''}</td>
                <td className="num">{ind.retornos}</td>
                <td className="num">{fmtMin(ind.tempoMedioMin)}</td>
                <td className="num">{ind.score}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="tiny muted" style={{ marginTop: 6 }}>* Score de execução é proposta em teste do Playbook; não altera pagamento. Toque numa linha para ver o detalhe.</p>
      {sel && <DetalheMecanico id={sel} onClose={() => setSel(null)} />}
    </div>
  );
}

function DetalheMecanico({ id, onClose }: { id: string; onClose: () => void }) {
  const db = useDB();
  const u = db.usuarios.find(x => x.id === id)!;
  const ind = indicadoresMecanico(db, id);
  const serie = serieMecanico(db, id);
  return (
    <Sheet titulo={u.nome} sub={`${u.nivel || ''} · mês atual`} onClose={onClose}>
      <div className="grid k2">
        <Kpi rotulo="Checklist completo" valor={fmtPct(ind.checklistPct)} dica={`${ind.checklistCompletos}/${ind.carros}`} explicacao={DEFINICOES.checklist} />
        <Kpi rotulo="Itens realizados" valor={`${ind.realizados}${ind.meta ? ` / ${ind.meta.alvo}` : ''}`} dica={ind.meta ? `Projeção ${ind.meta.projecao}` : undefined} explicacao={DEFINICOES.realizados} />
        <Kpi rotulo="Evidência" valor={fmtPct(ind.evidenciasPct)} explicacao={DEFINICOES.evidencias} />
        <Kpi rotulo="Tempo do checklist" valor={fmtMin(ind.tempoChecklistMin)} />
      </div>
      <div className="section-title">Últimos meses</div>
      <table className="tbl"><thead><tr><th>Mês</th><th className="num">Carros</th><th className="num">Checklist</th><th className="num">Itens</th></tr></thead>
        <tbody>{serie.map(s => <tr key={s.mes}><td>{fmtMes(s.mes)}</td><td className="num">{s.carros}</td><td className="num">{s.checklistPct == null ? '—' : fmtPct(s.checklistPct)}</td><td className="num">{s.itens}</td></tr>)}</tbody>
      </table>
    </Sheet>
  );
}

function Auditoria({ u }: { u: Usuario }) {
  const db = useDB();
  const [sel, setSel] = useState<string | null>(null);
  const auditados = new Set(db.auditorias.map(a => a.checklistId));
  const candidatos = db.os.filter(o => o.status === 'concluido' && o.checklistId && !auditados.has(o.checklistId) && mesKey(o.concluidaEm!) === mesKey(agoraISO()))
    .sort((a, b) => b.concluidaEm!.localeCompare(a.concluidaEm!)).slice(0, 12);
  const feitas = [...db.auditorias].sort((a, b) => b.em.localeCompare(a.em));
  const TOM_AU: Record<string, Tom> = { aprovado: 'ok', reprovado: 'critico', correcao_solicitada: 'atencao' };
  return (
    <div className="grid cols2">
      <div>
        <div className="section-title" style={{ marginTop: 0 }}>Para auditar (concluídas no mês, mais recentes)</div>
        <div className="list">
          {candidatos.length === 0 && <Empty titulo="Nenhuma OS pendente de auditoria." />}
          {candidatos.map(o => {
            const c = db.checklists.find(x => x.id === o.checklistId)!;
            const v = db.veiculos.find(x => x.id === o.veiculoId)!;
            const rec = c.defs.filter(d => ['atencao', 'prioritario'].includes(c.itens[d.id].estado)).length;
            return (
              <button key={o.id} className="li" onClick={() => setSel(c.id)} disabled={o.mecanicoId === u.id}>
                <Placa placa={v.placa} />
                <div className="grow"><div className="ttl">OS #{o.numero} · {primeiroNome(nomeDe(db, o.mecanicoId))}</div><div className="meta">{fmtDataHora(o.concluidaEm)} · {rec} recomendação(ões) · {c.status === 'excecao_autorizada' ? 'exceção autorizada' : 'completo'}</div></div>
                <span className="chev">›</span>
              </button>
            );
          })}
        </div>
      </div>
      <div>
        <div className="section-title" style={{ marginTop: 0 }}>Auditorias registradas</div>
        <div className="list">
          {feitas.map(a => {
            const os = db.os.find(o => o.id === a.osId);
            return (
              <a key={a.id} className="li" href={`#/os/${a.osId}`}>
                <div className="grow">
                  <div className="ttl">OS #{os?.numero} · {primeiroNome(nomeDe(db, a.mecanicoId))}</div>
                  <div className="meta">{fmtData(a.em)} · por {primeiroNome(nomeDe(db, a.auditorId))}{a.justificativa ? ` · ${a.justificativa}` : ''}</div>
                  {a.resultado === 'correcao_solicitada' && <div className="meta">{a.resolvidaEm ? `Correção enviada em ${fmtDataHora(a.resolvidaEm)}` : 'Aguardando correção do mecânico'}</div>}
                </div>
                <Badge tom={TOM_AU[a.resultado]}>{a.resultado === 'correcao_solicitada' ? 'Correção' : a.resultado === 'aprovado' ? 'Aprovado' : 'Reprovado'}</Badge>
              </a>
            );
          })}
        </div>
      </div>
      {sel && <AuditoriaSheet u={u} checklistId={sel} onClose={() => setSel(null)} />}
    </div>
  );
}

export function AuditoriaSheet({ u, checklistId, onClose }: { u: Usuario; checklistId: string; onClose: () => void }) {
  const db = useDB();
  const c = db.checklists.find(x => x.id === checklistId)!;
  const os = db.os.find(o => o.id === c.osId)!;
  const [resultado, setResultado] = useState<'aprovado' | 'correcao_solicitada' | 'reprovado'>('aprovado');
  const [marcados, setMarcados] = useState<Record<string, string>>({});
  const [just, setJust] = useState('');
  const acao = useAcao();
  return (
    <Sheet titulo={`Auditar checklist · OS #${os.numero}`} sub={`Mecânico: ${nomeDe(db, os.mecanicoId)}. A auditoria não altera a inspeção: correções são feitas pelo mecânico, com histórico.`} onClose={onClose}
      rodape={<><Btn variante="sec" onClick={onClose}>Cancelar</Btn><Btn carregando={acao.ocupado} onClick={async () => {
        const inc = Object.entries(marcados).map(([itemDefId, descricao]) => ({ itemDefId, descricao: descricao || 'Inconsistência apontada' }));
        if ((await acao.executar(() => auditarChecklist(u, c.id, resultado, inc, just), 'Auditoria registrada.')) !== undefined) onClose();
      }}>Registrar auditoria</Btn></>}>
      <Segmented rotulo="Resultado" valor={resultado} onChange={setResultado} opcoes={[{ v: 'aprovado', r: 'Aprovado' }, { v: 'correcao_solicitada', r: 'Pedir correção' }, { v: 'reprovado', r: 'Reprovado' }]} />
      <div className="list" style={{ marginTop: 12 }}>
        {c.defs.map(d => {
          const it = c.itens[d.id];
          const fotos = db.evidencias.filter(e => it.evidenciaIds.includes(e.id) && !e.removida);
          return (
            <div key={d.id} className="li" style={{ flexWrap: 'wrap' }}>
              {resultado !== 'aprovado' && <input type="checkbox" aria-label={`Marcar ${d.nome} como inconsistente`} checked={d.id in marcados} onChange={e => { const m = { ...marcados }; if (e.target.checked) m[d.id] = ''; else delete m[d.id]; setMarcados(m); }} style={{ width: 22, height: 22 }} />}
              <div className="grow"><div className="ttl">{d.nome}</div><div className="meta">{[it.recomendacao, it.justificativa, it.observacao, d.fotoObrigatoriaEm.includes(it.estado) && !fotosAtivasDoItem(it, db.evidencias) ? 'SEM FOTO OBRIGATÓRIA' : null].filter(Boolean).join(' · ')}</div></div>
              {fotos.slice(0, 2).map(f => <FotoImg key={f.id} url={f.url} alt="" style={{ width: 56, height: 42, objectFit: 'cover', borderRadius: 6 }} />)}
              <EstadoBadge estado={it.estado} />
              {d.id in marcados && <input className="input" style={{ flexBasis: '100%' }} aria-label={`O que está inconsistente em ${d.nome}`} placeholder="O que está inconsistente?" value={marcados[d.id]} onChange={e => setMarcados({ ...marcados, [d.id]: e.target.value })} />}
            </div>
          );
        })}
      </div>
      <Field rotulo="Justificativa" obrigatorio={resultado !== 'aprovado'} htmlFor="just-au"><textarea id="just-au" className="input" value={just} onChange={e => setJust(e.target.value)} /></Field>
      {acao.erro && <Alerta tipo="crit">{acao.erro}</Alerta>}
    </Sheet>
  );
}

function Excecoes({ u }: { u: Usuario }) {
  const db = useDB();
  const acao = useAcao();
  const [data, setData] = useState(hojeKey());
  const [motivo, setMotivo] = useState('');
  const pend = db.checklists.filter(c => c.solicitacaoExcecao?.status === 'pendente');
  const decididas = db.checklists.filter(c => c.solicitacaoExcecao && c.solicitacaoExcecao.status !== 'pendente' && c.solicitacaoExcecao.decididoEm && c.solicitacaoExcecao.decididoEm > addDias(agoraISO(), -10)).slice(-8).reverse();
  const naoOferecer = db.os.filter(o => o.naoOferecer).slice(-8).reverse();
  return (
    <div className="grid cols2">
      <div>
        <div className="section-title" style={{ marginTop: 0 }}>Pedidos de exceção do checklist</div>
        {pend.length === 0 ? <Card><Empty titulo="Nenhum pedido aguardando." /></Card> : pend.map(c => {
          const os = db.os.find(o => o.id === c.osId)!;
          const faltam = pendenciasParaConcluir(c, db.evidencias);
          return (
            <Card key={c.id} tight>
              <div className="row between"><b>OS #{os.numero} · {primeiroNome(nomeDe(db, os.mecanicoId))}</b><span className="small muted">{fmtDataHora(c.solicitacaoExcecao!.em)}</span></div>
              <p className="small" style={{ marginTop: 4 }}>“{c.solicitacaoExcecao!.motivo}”</p>
              <p className="tiny muted">{faltam.length} pendência(s): {faltam.slice(0, 4).map(f => f.nome).join(', ')}{faltam.length > 4 ? '…' : ''}</p>
              {pode(u, 'checklist.autorizar_excecao') && (
                <div className="row" style={{ marginTop: 8 }}>
                  <Btn tamanho="sm" carregando={acao.ocupado} onClick={() => acao.executar(() => decidirExcecao(u, c.id, true, ''), 'Exceção autorizada.')}>Autorizar</Btn>
                  <Btn tamanho="sm" variante="danger" carregando={acao.ocupado} onClick={() => acao.executar(() => decidirExcecao(u, c.id, false, ''), 'Exceção negada.')}>Negar</Btn>
                  <a className="btn sm ghost" href={`#/os/${os.id}`}>Ver OS</a>
                </div>
              )}
            </Card>
          );
        })}
        <div className="section-title">Decididas recentemente</div>
        <div className="list">
          {decididas.length === 0 && <Empty titulo="Nenhuma." />}
          {decididas.map(c => <a key={c.id} className="li" href={`#/os/${c.osId}`}><div className="grow"><div className="ttl">OS #{db.os.find(o => o.id === c.osId)?.numero}</div><div className="meta">{c.solicitacaoExcecao!.motivo}</div></div><Badge tom={c.solicitacaoExcecao!.status === 'aprovada' ? 'atencao' : 'muted'}>{c.solicitacaoExcecao!.status === 'aprovada' ? 'Autorizada' : 'Negada'}</Badge></a>)}
        </div>
      </div>
      <div>
        <Card titulo="Dias de exceção">
          <p className="small muted" style={{ marginBottom: 10 }}>Playbook: o checklist continua obrigatório; os carros do dia saem do potencial de itens do mês.</p>
          <div className="list" style={{ marginBottom: 12 }}>
            {db.diasExcecao.length === 0 && <Empty titulo="Nenhum dia declarado." />}
            {db.diasExcecao.map(d => <div key={d.data} className="li"><div className="grow"><div className="ttl">{fmtData(d.data + 'T12:00:00Z')}</div><div className="meta">{d.motivo} · {primeiroNome(nomeDe(db, d.declaradoPor))}</div></div></div>)}
          </div>
          {pode(u, 'excecao.declarar') && (
            <>
              <div className="grid k2">
                <Field rotulo="Dia" htmlFor="dia-exc"><input id="dia-exc" type="date" className="input" value={data} onChange={e => setData(e.target.value)} /></Field>
                <Field rotulo="Motivo" htmlFor="mot-exc"><input id="mot-exc" className="input" value={motivo} onChange={e => setMotivo(e.target.value)} /></Field>
              </div>
              <div style={{ marginTop: 10 }}><Btn variante="sec" carregando={acao.ocupado} onClick={async () => { if ((await acao.executar(() => declararDiaExcecao(u, data, motivo), 'Dia de exceção declarado.')) !== undefined) setMotivo(''); }}>Declarar dia de exceção</Btn></div>
            </>
          )}
        </Card>
        <Card titulo="Frota: não oferecer">
          {naoOferecer.length === 0 ? <Empty titulo="Nenhuma OS marcada." /> : naoOferecer.map(o => (
            <div key={o.id} className="small" style={{ padding: '4px 0' }}><a href={`#/os/${o.id}`}>OS #{o.numero}</a> · alinhado com {o.naoOferecer!.alinhadoCom} · {primeiroNome(nomeDe(db, o.naoOferecer!.marcadoPor))}</div>
          ))}
        </Card>
      </div>
    </div>
  );
}

const TOM_OC: Record<string, Tom> = { registrada: 'neutro', em_revisao: 'info', contestada: 'atencao', aprovada: 'navy', rejeitada: 'muted', aplicada: 'ok' };

function Ocorrencias({ u }: { u: Usuario }) {
  const db = useDB();
  const [nova, setNova] = useState(false);
  const [decidir, setDecidir] = useState<{ o: Ocorrencia; acao: AcaoOcorrencia } | null>(null);
  const acao = useAcao();
  const lista = [...db.ocorrencias].sort((a, b) => b.dataHora.localeCompare(a.dataHora));
  return (
    <div>
      <Alerta tipo="prop">Fluxo: <b>registro → revisão → decisão da direção → aplicação</b>. O profissional pode se manifestar antes da decisão. Nada é aplicado automaticamente e nenhuma consequência de RH sai daqui. Categorias e pontos são <b>proposta em teste</b> do Playbook.</Alerta>
      <div className="row between" style={{ margin: '14px 0 8px' }}>
        <div className="section-title" style={{ margin: 0 }}>Registros</div>
        {pode(u, 'ocorrencia.registrar') && <Btn tamanho="sm" onClick={() => setNova(true)}>Registrar</Btn>}
      </div>
      {lista.map(o => (
        <Card key={o.id} tight>
          <div className="row between">
            <span className="row"><Badge tom={o.tipo === 'reconhecimento' ? 'ok' : 'atencao'}>{o.tipo === 'reconhecimento' ? 'Reconhecimento' : 'Ocorrência'}</Badge><b>{o.categoria}</b><span className="small muted">{nomeDe(db, o.profissionalId)}</span></span>
            <Badge tom={TOM_OC[o.status]}>{STATUS_OCORRENCIA_LABEL[o.status]}</Badge>
          </div>
          <p className="small" style={{ marginTop: 6 }}>{o.descricao}</p>
          <p className="tiny muted">{fmtDataHora(o.dataHora)} · efeito proposto {o.efeitoProposto > 0 ? '+' : ''}{o.efeitoProposto} · {o.regra} · registrada por {primeiroNome(nomeDe(db, o.registradaPor))}{o.osId ? <> · <a href={`#/os/${o.osId}`}>OS #{db.os.find(x => x.id === o.osId)?.numero}</a></> : ''}</p>
          {o.manifestacao && <p className="small" style={{ marginTop: 4 }}><b>Manifestação do profissional:</b> {o.manifestacao.texto}</p>}
          <details style={{ marginTop: 6 }}><summary className="tiny strong" style={{ cursor: 'pointer' }}>Histórico ({o.historico.length})</summary>
            <ul className="tiny" style={{ margin: '4px 0 0', paddingLeft: 18 }}>{o.historico.map((h, i) => <li key={i}>{fmtDataHora(h.em)} · {STATUS_OCORRENCIA_LABEL[h.status]} · {primeiroNome(nomeDe(db, h.por))}{h.obs ? ` · ${h.obs}` : ''}</li>)}</ul>
          </details>
          <div className="row" style={{ marginTop: 8 }}>
            {o.status === 'registrada' && (o.registradaPor === u.id || u.role === 'direcao') && <Btn tamanho="sm" variante="sec" carregando={acao.ocupado} onClick={() => acao.executar(() => acaoOcorrencia(u, o.id, 'enviar_revisao'), 'Enviada para revisão.')}>Enviar para revisão</Btn>}
            {pode(u, 'ocorrencia.decidir') && (o.status === 'em_revisao' || o.status === 'contestada') && <>
              <Btn tamanho="sm" onClick={() => setDecidir({ o, acao: 'aprovar' })}>Aprovar</Btn>
              <Btn tamanho="sm" variante="danger" onClick={() => setDecidir({ o, acao: 'rejeitar' })}>Rejeitar</Btn>
            </>}
            {pode(u, 'ocorrencia.aplicar') && o.status === 'aprovada' && <Btn tamanho="sm" onClick={() => setDecidir({ o, acao: 'aplicar' })}>Aplicar efeito</Btn>}
          </div>
        </Card>
      ))}
      {nova && <NovaOcorrencia u={u} onClose={() => setNova(false)} />}
      {decidir && <DecidirOcorrencia u={u} o={decidir.o} acao={decidir.acao} onClose={() => setDecidir(null)} />}
    </div>
  );
}

function DecidirOcorrencia({ u, o, acao: a, onClose }: { u: Usuario; o: Ocorrencia; acao: AcaoOcorrencia; onClose: () => void }) {
  const [obs, setObs] = useState('');
  const acao = useAcao();
  const t = { aprovar: 'Aprovar ocorrência', rejeitar: 'Rejeitar ocorrência', aplicar: 'Aplicar efeito' }[a as 'aprovar'];
  return (
    <Sheet titulo={t} sub={`${o.categoria} · ${o.efeitoProposto} ponto(s) no score (proposta em teste). Não altera salário neste protótipo.`} onClose={onClose}
      rodape={<><Btn variante="sec" onClick={onClose}>Cancelar</Btn><Btn variante={a === 'rejeitar' ? 'danger' : undefined} carregando={acao.ocupado} onClick={async () => { if ((await acao.executar(() => acaoOcorrencia(u, o.id, a, obs), 'Decisão registrada.')) !== undefined) onClose(); }}>{t}</Btn></>}>
      {o.manifestacao && <div style={{ marginBottom: 10 }}><Alerta tipo="info"><b>Manifestação:</b> {o.manifestacao.texto}</Alerta></div>}
      <Field rotulo={a === 'aplicar' ? 'Observação de encerramento' : 'Justificativa da decisão'} obrigatorio={a !== 'aplicar'} htmlFor="obs-dec" erro={acao.erro}><textarea id="obs-dec" className="input" value={obs} onChange={e => setObs(e.target.value)} /></Field>
    </Sheet>
  );
}

function NovaOcorrencia({ u, onClose }: { u: Usuario; onClose: () => void }) {
  const db = useDB();
  const mecs = db.usuarios.filter(x => x.role === 'mecanico' && x.ativo && x.id !== u.id);
  const [prof, setProf] = useState(mecs[0]?.id || '');
  const [cat, setCat] = useState(0);
  const [desc, setDesc] = useState('');
  const [osNum, setOsNum] = useState('');
  const acao = useAcao();
  const c = CATEGORIAS_OCORRENCIA[cat];
  return (
    <Sheet titulo="Registrar ocorrência ou reconhecimento" sub="Fica como “registrada”: só vale depois de revisão e decisão da direção." onClose={onClose}
      rodape={<><Btn variante="sec" onClick={onClose}>Cancelar</Btn><Btn carregando={acao.ocupado} onClick={async () => {
        const osId = osNum ? db.os.find(o => o.numero === Number(osNum))?.id : undefined;
        if ((await acao.executar(() => registrarOcorrencia(u, { tipo: c.tipo, profissionalId: prof, categoria: c.categoria, descricao: desc, osId, regra: c.regra, efeitoProposto: c.pontos }), 'Registrada. Envie para revisão quando estiver pronta.')) !== undefined) onClose();
      }}>Registrar</Btn></>}>
      <Field rotulo="Profissional" htmlFor="oc-prof"><select id="oc-prof" className="input" value={prof} onChange={e => setProf(e.target.value)}>{mecs.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}</select></Field>
      <Field rotulo="Categoria" htmlFor="oc-cat" dica={`${c.regra} · ${c.pontos > 0 ? '+' : ''}${c.pontos} ponto(s) (proposta em teste)`}>
        <select id="oc-cat" className="input" value={cat} onChange={e => setCat(Number(e.target.value))}>{CATEGORIAS_OCORRENCIA.map((x, i) => <option key={x.categoria} value={i}>{x.tipo === 'reconhecimento' ? 'Reconhecimento: ' : ''}{x.categoria}</option>)}</select>
      </Field>
      <Field rotulo="O que aconteceu (fato, sem julgamento)" obrigatorio htmlFor="oc-desc"><textarea id="oc-desc" className="input" value={desc} onChange={e => setDesc(e.target.value)} /></Field>
      <Field rotulo="Número da OS (opcional)" htmlFor="oc-os"><input id="oc-os" className="input" inputMode="numeric" value={osNum} onChange={e => setOsNum(e.target.value.replace(/\D/g, ''))} /></Field>
      {acao.erro && <Alerta tipo="crit">{acao.erro}</Alerta>}
    </Sheet>
  );
}

function Retornos() {
  const db = useDB();
  const lista = db.os.filter(o => o.retornoDeOsId).sort((a, b) => b.abertaEm.localeCompare(a.abertaEm));
  return (
    <div className="list">
      {lista.length === 0 && <Empty titulo="Nenhum retorno." />}
      {lista.map(o => {
        const orig = db.os.find(x => x.id === o.retornoDeOsId);
        const v = db.veiculos.find(x => x.id === o.veiculoId)!;
        return (
          <a key={o.id} className="li" href={`#/os/${o.id}`}>
            <Placa placa={v.placa} />
            <div className="grow"><div className="ttl">OS #{o.numero} ← retorno da #{orig?.numero}</div><div className="meta">{fmtData(o.abertaEm)} · serviço original de {nomeDe(db, orig?.mecanicoId)} · {o.retorno?.problemaRelatado || o.obsInterna}</div>
              {o.retorno?.solucao && <div className="meta">Feito: {o.retorno.solucao}</div>}</div>
            {o.retorno?.relacaoServicoAnterior === 'sim' ? <Badge tom="critico">Ligado ao serviço</Badge>
              : o.retorno?.relacaoServicoAnterior === 'nao' ? <Badge tom="ok">Não ligado ao serviço</Badge>
                : o.retorno?.relacaoServicoAnterior ? <Badge tom="muted">Causa não identificada</Badge>
                  : <Badge tom="atencao">{o.status === 'concluido' ? 'Retorno' : 'Em aberto'}</Badge>}
          </a>
        );
      })}
    </div>
  );
}

function Planos({ u }: { u: Usuario }) {
  const db = useDB();
  const acao = useAcao();
  const mecs = db.usuarios.filter(x => x.role === 'mecanico' && x.ativo);
  const [f, setF] = useState({ profissionalId: mecs[0]?.id || '', assunto: '', combinados: '', prazo: addDias(agoraISO(), 14).slice(0, 10) });
  return (
    <div className="grid cols2">
      <div>
        {db.planosAcao.slice().reverse().map(p => (
          <Card key={p.id} tight>
            <div className="row between"><b>{p.assunto} · {nomeDe(db, p.profissionalId)}</b><Badge tom={p.status === 'aberto' ? (p.prazo < hojeKey() ? 'critico' : 'info') : 'ok'}>{p.status === 'aberto' ? (p.prazo < hojeKey() ? 'Prazo vencido' : 'Em aberto') : 'Concluído'}</Badge></div>
            <p className="small" style={{ marginTop: 4 }}>{p.combinados}</p>
            <p className="tiny muted">{fmtData(p.data)} · prazo {fmtData(p.prazo + 'T12:00:00Z')} · {primeiroNome(nomeDe(db, p.registradoPor))}</p>
            {p.status === 'aberto' && pode(u, 'plano_acao.registrar') && <div style={{ marginTop: 6 }}><Btn tamanho="sm" variante="sec" carregando={acao.ocupado} onClick={() => acao.executar(() => concluirPlanoAcao(u, p.id), 'Concluído.')}>Marcar como concluído</Btn></div>}
          </Card>
        ))}
      </div>
      {pode(u, 'plano_acao.registrar') && (
        <Card titulo="Registrar conversa de performance">
          <Field rotulo="Profissional" htmlFor="pa-prof"><select id="pa-prof" className="input" value={f.profissionalId} onChange={e => setF({ ...f, profissionalId: e.target.value })}>{mecs.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}</select></Field>
          <Field rotulo="Assunto" htmlFor="pa-ass"><input id="pa-ass" className="input" value={f.assunto} onChange={e => setF({ ...f, assunto: e.target.value })} /></Field>
          <Field rotulo="Combinados" htmlFor="pa-comb"><textarea id="pa-comb" className="input" value={f.combinados} onChange={e => setF({ ...f, combinados: e.target.value })} /></Field>
          <Field rotulo="Prazo" htmlFor="pa-prazo"><input id="pa-prazo" type="date" className="input" value={f.prazo} onChange={e => setF({ ...f, prazo: e.target.value })} /></Field>
          <div style={{ marginTop: 12 }}><Btn carregando={acao.ocupado} onClick={async () => { if ((await acao.executar(() => registrarPlanoAcao(u, f), 'Conversa registrada.')) !== undefined) setF({ ...f, assunto: '', combinados: '' }); }}>Registrar</Btn></div>
        </Card>
      )}
    </div>
  );
}

function Gestao() {
  const db = useDB();
  const g = indicadoresLideranca(db);
  return (
    <div>
      <p className="small muted" style={{ marginBottom: 12 }}>A liderança também é medida: auditar, decidir rápido e cumprir combinados sustentam o checklist.</p>
      <div className="grid k3">
        <Kpi rotulo="Checklists auditados no mês" valor={fmtPct(g.auditoriaPct)} dica={`${g.auditadas} de ${g.concluidas} · referência ${g.alvoAuditoriaPct}%`} alerta={(g.auditoriaPct ?? 0) < g.alvoAuditoriaPct}
          explicacao={{ formula: 'Checklists auditados no mês ÷ OS concluídas com checklist no mês.', porque: 'Sem auditoria amostral, o checklist vira formalidade. A referência de 10% é proposta (ver OPEN_DECISIONS).' }} />
        <Kpi rotulo="Tempo médio para decidir exceção" valor={fmtMin(g.tempoDecisaoExcecaoMin)} dica={`${g.excecoesDecididas} decididas · ${g.excecoesPendentes} aguardando`} explicacao={{ formula: 'Média entre o pedido do mecânico e a decisão da liderança.', porque: 'Pedido parado trava a OS.' }} />
        <Kpi rotulo="Correções em aberto" valor={g.correcoesAbertas} />
        <Kpi rotulo="Conversas com prazo vencido" valor={g.planosVencidos} dica={`${g.planosAbertos} em aberto`} alerta={g.planosVencidos > 0} />
        <Kpi rotulo="Ocorrências paradas em rascunho" valor={g.ocorrenciasParadas} />
        <Kpi rotulo="Metas sem comunicação ao time" valor={g.metasSemComunicar} />
        <Kpi rotulo="OS assumidas fora da ordem no mês" valor={g.foraDaOrdem.length} explicacao={{ formula: 'OS em que o mecânico (ou a liderança) saiu da previsão da fila, sempre com motivo.', porque: 'Permite assumir quando o previsto está indisponível, sem perder a transparência do rodízio.' }} />
        <Kpi rotulo="OS pausadas agora" valor={g.pausadas.length} dica="Aguardando peça ou aprovação" />
      </div>
      {g.foraDaOrdem.length > 0 && (
        <Card titulo="Fora da ordem — motivos registrados">
          <div className="list">
            {g.foraDaOrdem.slice(0, 12).map(o => (
              <a key={o.id} className="li" href={`#/os/${o.id}`}>
                <div className="grow"><div className="ttl">OS #{o.numero} · {nomeDe(db, o.mecanicoId)}{o.foraDaOrdem!.previsto ? ` (previsto: ${nomeDe(db, o.foraDaOrdem!.previsto)})` : ''}</div><div className="meta">{fmtDataHora(o.iniciadaEm)} · {o.foraDaOrdem!.motivo}</div></div>
              </a>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
