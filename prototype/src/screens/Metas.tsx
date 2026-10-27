import { useMemo, useState } from 'react';
import { ir } from '../app/nav';
import { ajustarMeta, criarMeta, decidirMeta, marcarMetaComunicada, nomeDe, valoresOS } from '../data/api';
import { indicadoresMecanico } from '../data/metricas';
import { calcularProposta, calcularVigente, politicaLabel, POLITICA_PROPOSTA_PARAMS, POLITICA_VIGENTE_PARAMS, STATUS_META_LABEL, versaoEm } from '../domain/gestao';
import { pode } from '../domain/permissions';
import type { IndicadorMeta, Meta, Usuario } from '../domain/types';
import { addDias, agoraISO, fmtBRL, fmtData, fmtMes, hojeKey, mesKey, soma } from '../domain/util';
import { Alerta, Badge, Btn, Card, Field, Sheet, Tabs, useAcao, useDB, type Tom } from '../ui/components';

const IND_LABEL: Record<IndicadorMeta, string> = {
  checklist_completo_pct: 'Checklist completo (%)', itens_realizados: 'Itens realizados', carros_atendidos: 'Carros atendidos', evidencias_pct: 'Evidência quando exigida (%)', faturamento: 'Faturamento (R$)',
};
const UNIDADE: Record<IndicadorMeta, Meta['unidade']> = { checklist_completo_pct: '%', itens_realizados: 'itens', carros_atendidos: 'carros', evidencias_pct: '%', faturamento: 'R$' };

export function Metas({ u, aba }: { u: Usuario; aba?: string }) {
  const a = (aba || 'metas') as 'metas' | 'politicas';
  return (
    <div>
      <div className="page-head"><div><h1>Metas e políticas</h1><div className="sub">Toda alteração cria uma nova versão com vigência. O histórico nunca é reescrito.</div></div></div>
      <Tabs valor={a} onChange={v => ir(`/metas/${v}`)} abas={[{ v: 'metas', r: 'Metas' }, { v: 'politicas', r: 'Remuneração: vigente × proposta' }]} />
      {a === 'metas' ? <ListaMetas u={u} /> : <Politicas u={u} />}
    </div>
  );
}

const tomStatus = (s: string): Tom => (s === 'Vigente' ? 'ok' : s === 'Aguardando aprovação' ? 'atencao' : s.startsWith('Aprovada') ? 'info' : 'muted');

function ListaMetas({ u }: { u: Usuario }) {
  const db = useDB();
  const [ajustar, setAjustar] = useState<Meta | null>(null);
  const [nova, setNova] = useState(false);
  const acao = useAcao();
  const hoje = hojeKey();
  return (
    <div>
      <div className="row between" style={{ marginBottom: 10 }}>
        <Alerta tipo="info">O percentual X da meta (nível × potencial) ainda não foi definido pela direção. As metas abaixo são valores de demonstração.</Alerta>
      </div>
      {pode(u, 'metas.propor') && <div style={{ marginBottom: 12 }}><Btn onClick={() => setNova(true)}>Criar meta</Btn></div>}
      {db.metas.map(m => {
        const st = STATUS_META_LABEL(m, hoje);
        const v = versaoEm(m, hoje);
        const rasc = m.versoes.find(x => x.status === 'rascunho');
        const alvoU = m.escopo.tipo === 'individual' ? m.escopo.usuarioId : null;
        const ind = alvoU ? indicadoresMecanico(db, alvoU) : null;
        return (
          <Card key={m.id} titulo={<div><h3>{m.nome}{alvoU ? ` · ${nomeDe(db, alvoU)}` : ''}</h3><div className="small muted">{m.descricao}</div></div>} acao={<Badge tom={tomStatus(st)}>{st}</Badge>}>
            <div className="row small" style={{ gap: 16 }}>
              <span>Alvo vigente: <b>{v ? `${v.alvo}${m.unidade === '%' ? '%' : ` ${m.unidade}`}` : '—'}</b>{v && ` (v${v.versao}, desde ${fmtData(v.vigenciaInicio + 'T12:00:00Z')})`}</span>
              {ind && v && <span>Realizado no mês: <b>{ind.realizados}</b></span>}
              <span>{m.escopo.tipo === 'coletiva' ? 'Coletiva' : 'Individual'} · responsável {nomeDe(db, m.responsavelId)}</span>
              <span>{m.comunicadaEm ? `Comunicada em ${fmtData(m.comunicadaEm)}` : <Badge tom="atencao">Não comunicada ao time</Badge>}</span>
            </div>
            <p className="tiny muted" style={{ marginTop: 6 }}>Regra: {m.regraCalculo} · Elegibilidade: {m.elegibilidade}</p>
            {rasc && (
              <div style={{ marginTop: 10 }}>
                <Alerta tipo="warn">
                  <b>Versão {rasc.versao} proposta</b> por {nomeDe(db, rasc.definidaPor)}: alvo {rasc.alvo} a partir de {fmtData(rasc.vigenciaInicio + 'T12:00:00Z')}. “{rasc.justificativa}”
                  {pode(u, 'metas.aprovar') ? (
                    <div className="row" style={{ marginTop: 8 }}>
                      <Btn tamanho="sm" carregando={acao.ocupado} onClick={() => acao.executar(() => decidirMeta(u, m.id, true), 'Versão aprovada. A anterior foi encerrada sem perder o histórico.')}>Aprovar</Btn>
                      <Btn tamanho="sm" variante="danger" carregando={acao.ocupado} onClick={() => acao.executar(() => decidirMeta(u, m.id, false), 'Rascunho descartado.')}>Descartar</Btn>
                    </div>
                  ) : <div className="small" style={{ marginTop: 4 }}>Aguardando aprovação da direção.</div>}
                </Alerta>
              </div>
            )}
            <details style={{ marginTop: 10 }}>
              <summary className="small strong" style={{ cursor: 'pointer' }}>Histórico de versões ({m.versoes.length})</summary>
              <table className="tbl" style={{ marginTop: 6 }}>
                <thead><tr><th>Versão</th><th className="num">Alvo</th><th>Vigência</th><th>Status</th><th>Definida / aprovada</th><th>Justificativa</th></tr></thead>
                <tbody>{m.versoes.map(x => (
                  <tr key={x.versao}>
                    <td>v{x.versao}</td><td className="num">{x.alvo}</td>
                    <td>{fmtData(x.vigenciaInicio + 'T12:00:00Z')} → {x.vigenciaFim ? fmtData(x.vigenciaFim + 'T12:00:00Z') : 'sem fim'}</td>
                    <td><Badge tom={x.status === 'aprovada' ? 'ok' : x.status === 'rascunho' ? 'atencao' : 'muted'}>{x.status}</Badge></td>
                    <td className="small">{nomeDe(db, x.definidaPor)}{x.aprovadaPor ? ` / ${nomeDe(db, x.aprovadaPor)}` : ''}</td>
                    <td className="small">{x.justificativa}</td>
                  </tr>))}</tbody>
              </table>
            </details>
            {pode(u, 'metas.propor') && (
              <div className="row" style={{ marginTop: 10 }}>
                {!rasc && <Btn tamanho="sm" variante="sec" onClick={() => setAjustar(m)}>Propor ajuste</Btn>}
                {!m.comunicadaEm && <Btn tamanho="sm" variante="ghost" carregando={acao.ocupado} onClick={() => acao.executar(() => marcarMetaComunicada(u, m.id), 'Marcada como comunicada.')}>Marcar como comunicada</Btn>}
              </div>
            )}
          </Card>
        );
      })}
      {ajustar && <AjusteSheet u={u} m={ajustar} onClose={() => setAjustar(null)} />}
      {nova && <NovaMeta u={u} onClose={() => setNova(false)} />}
    </div>
  );
}

function AjusteSheet({ u, m, onClose }: { u: Usuario; m: Meta; onClose: () => void }) {
  const atual = versaoEm(m, hojeKey());
  const [alvo, setAlvo] = useState(String(atual?.alvo ?? ''));
  const [inicio, setInicio] = useState(addDias(agoraISO(), 1).slice(0, 10));
  const [just, setJust] = useState('');
  const acao = useAcao();
  return (
    <Sheet titulo={`Propor ajuste · ${m.nome}`} sub="Cria um rascunho. Vale só depois da aprovação da direção, a partir da data escolhida. A versão atual continua valendo no seu período." onClose={onClose}
      rodape={<><Btn variante="sec" onClick={onClose}>Cancelar</Btn><Btn carregando={acao.ocupado} onClick={async () => { if ((await acao.executar(() => ajustarMeta(u, m.id, Number(alvo), inicio, just), 'Proposta enviada para aprovação.')) !== undefined) onClose(); }}>Propor</Btn></>}>
      <div className="grid k2">
        <Field rotulo="Novo alvo" obrigatorio htmlFor="aj-alvo" dica={`Atual: ${atual?.alvo ?? '—'}`}><input id="aj-alvo" className="input" inputMode="numeric" value={alvo} onChange={e => setAlvo(e.target.value.replace(/[^\d.]/g, ''))} /></Field>
        <Field rotulo="Vale a partir de" obrigatorio htmlFor="aj-ini" dica="Não pode ser no passado"><input id="aj-ini" type="date" className="input" min={hojeKey()} value={inicio} onChange={e => setInicio(e.target.value)} /></Field>
      </div>
      <Field rotulo="Justificativa" obrigatorio htmlFor="aj-just"><textarea id="aj-just" className="input" value={just} onChange={e => setJust(e.target.value)} /></Field>
      {acao.erro && <Alerta tipo="crit">{acao.erro}</Alerta>}
    </Sheet>
  );
}

function NovaMeta({ u, onClose }: { u: Usuario; onClose: () => void }) {
  const db = useDB();
  const mecs = db.usuarios.filter(x => x.role === 'mecanico' && x.ativo);
  const [f, setF] = useState({ nome: '', descricao: '', indicador: 'itens_realizados' as IndicadorMeta, escopo: 'coletiva', usuarioId: mecs[0]?.id || '', alvo: '', inicio: addDias(agoraISO(), 1).slice(0, 10), regra: '', eleg: 'Todos os mecânicos ativos', just: '' });
  const acao = useAcao();
  return (
    <Sheet titulo="Criar meta" sub="Nasce como rascunho e só vale depois da aprovação da direção." onClose={onClose}
      rodape={<><Btn variante="sec" onClick={onClose}>Cancelar</Btn><Btn carregando={acao.ocupado} onClick={async () => {
        const r = await acao.executar(() => criarMeta(u, {
          nome: f.nome, descricao: f.descricao, indicador: f.indicador, unidade: UNIDADE[f.indicador], regraCalculo: f.regra || IND_LABEL[f.indicador], elegibilidade: f.eleg,
          escopo: f.escopo === 'coletiva' ? { tipo: 'coletiva' } : { tipo: 'individual', usuarioId: f.usuarioId }, responsavelId: u.id, alvo: Number(f.alvo), inicio: f.inicio, justificativa: f.just,
        }), 'Meta criada como rascunho.');
        if (r) onClose();
      }}>Criar rascunho</Btn></>}>
      <Field rotulo="Nome" obrigatorio htmlFor="nm-nome"><input id="nm-nome" className="input" value={f.nome} onChange={e => setF({ ...f, nome: e.target.value })} /></Field>
      <Field rotulo="Descrição" htmlFor="nm-desc"><input id="nm-desc" className="input" value={f.descricao} onChange={e => setF({ ...f, descricao: e.target.value })} /></Field>
      <div className="grid k2">
        <Field rotulo="Indicador" htmlFor="nm-ind"><select id="nm-ind" className="input" value={f.indicador} onChange={e => setF({ ...f, indicador: e.target.value as IndicadorMeta })}>{Object.entries(IND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        <Field rotulo="Escopo" htmlFor="nm-esc"><select id="nm-esc" className="input" value={f.escopo} onChange={e => setF({ ...f, escopo: e.target.value })}><option value="coletiva">Coletiva</option><option value="individual">Individual</option></select></Field>
        {f.escopo === 'individual' && <Field rotulo="Profissional" htmlFor="nm-us"><select id="nm-us" className="input" value={f.usuarioId} onChange={e => setF({ ...f, usuarioId: e.target.value })}>{mecs.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}</select></Field>}
        <Field rotulo="Alvo" obrigatorio htmlFor="nm-alvo"><input id="nm-alvo" className="input" inputMode="numeric" value={f.alvo} onChange={e => setF({ ...f, alvo: e.target.value.replace(/[^\d.]/g, '') })} /></Field>
        <Field rotulo="Início da vigência" htmlFor="nm-ini"><input id="nm-ini" type="date" className="input" min={hojeKey()} value={f.inicio} onChange={e => setF({ ...f, inicio: e.target.value })} /></Field>
      </div>
      <Field rotulo="Regra de cálculo" htmlFor="nm-regra"><input id="nm-regra" className="input" value={f.regra} onChange={e => setF({ ...f, regra: e.target.value })} placeholder="Como o número é calculado" /></Field>
      <Field rotulo="Elegibilidade" htmlFor="nm-eleg"><input id="nm-eleg" className="input" value={f.eleg} onChange={e => setF({ ...f, eleg: e.target.value })} /></Field>
      <Field rotulo="Justificativa" htmlFor="nm-just"><input id="nm-just" className="input" value={f.just} onChange={e => setF({ ...f, just: e.target.value })} /></Field>
      {acao.erro && <Alerta tipo="crit">{acao.erro}</Alerta>}
    </Sheet>
  );
}

function Politicas({ u }: { u: Usuario }) {
  const db = useDB();
  const mecs = db.usuarios.filter(x => x.role === 'mecanico' && x.ativo);
  const mesAtual = mesKey(agoraISO());
  const meses = [...new Set(db.fechamentos.map(f => f.mes))].sort().reverse();
  const [fonte, setFonte] = useState<string>(meses[0] || mesAtual);
  const [mecId, setMecId] = useState(mecs[0]?.id || '');
  const [over, setOver] = useState<{ faturamento?: string; itensPct?: string; score?: string; ajustes?: string }>({});

  const base = useMemo(() => {
    if (fonte === mesAtual) {
      const ind = indicadoresMecanico(db, mecId, mesAtual);
      const os = db.os.filter(o => o.status === 'concluido' && o.mecanicoId === mecId && o.concluidaEm && mesKey(o.concluidaEm) === mesAtual);
      return {
        faturamento: ind.faturamento, itensPct: ind.meta ? (ind.realizados / ind.meta.alvo) * 100 : 0, score: ind.score,
        upsellPorOS: os.map(o => ({ upsell: valoresOS(o).upsell, cambio: soma(o.servicos.filter(s => s.origem === 'checklist' && s.executado && (s.key === 'cambioAutomatico' || s.key === 'cambioManual')).map(s => s.valor || 0)) })),
        nota: 'Mês atual, ainda aberto (parcial).',
      };
    }
    const f = db.fechamentos.find(x => x.mes === fonte && x.usuarioId === mecId);
    return {
      faturamento: f?.faturamento || 0, itensPct: 100, score: 100,
      upsellPorOS: f ? [{ upsell: f.upsell, cambio: 0 }] : [],
      nota: 'Mês fechado. Sem detalhe por OS no fechamento: câmbio considerado zero; itens e score assumidos em 100% (ajuste abaixo).',
    };
  }, [db, fonte, mecId, mesAtual]);

  const num = (s: string | undefined, d: number) => (s === undefined || s === '' ? d : Number(s.replace(',', '.')) || 0);
  const fat = num(over.faturamento, base.faturamento);
  const vig = calcularVigente({ upsellPorOS: base.upsellPorOS, ajustes: num(over.ajustes, 0) });
  const prop = calcularProposta({ faturamento: fat, itensPctMeta: num(over.itensPct, base.itensPct), score: num(over.score, base.score) });
  const pols = db.politicas;

  const equipe = mecs.map(m => {
    const f = db.fechamentos.find(x => x.mes === meses[0] && x.usuarioId === m.id);
    if (!f) return null;
    return { m, vig: calcularVigente({ upsellPorOS: [{ upsell: f.upsell, cambio: 0 }], ajustes: 0 }).valor, prop: calcularProposta({ faturamento: f.faturamento, itensPctMeta: 100, score: 100 }).valor };
  }).filter(Boolean) as { m: Usuario; vig: number; prop: number }[];

  return (
    <div>
      <Alerta tipo="prop">Simulação. Nada aqui altera a remuneração real. A regra <b>vigente</b> é a do sistema atual. A <b>proposta</b> é do Playbook de Remuneração (“percentuais são proposta de backtest, não política final”). O Playbook diz que a comissão por upsell acabou, mas o sistema ainda a calcula: essa divergência está em OPEN_DECISIONS.</Alerta>
      <div className="grid k2" style={{ marginTop: 12 }}>
        {pols.map(p => (
          <Card key={p.id} titulo={<div><Badge tom={p.status === 'vigente' ? 'ok' : 'proposta'}>{politicaLabel(p)}</Badge><h3 style={{ marginTop: 6 }}>{p.nome}</h3></div>}>
            <p className="small">{p.descricao}</p>
            <p className="tiny muted" style={{ marginTop: 6 }}>Fonte: {p.fonte}{p.vigenciaInicio ? ` · vigente desde ${fmtData(p.vigenciaInicio + 'T12:00:00Z')}` : ''}</p>
            <table className="tbl" style={{ marginTop: 8 }}>
              <thead><tr><th>Faixa a partir de</th><th className="num">Taxa</th></tr></thead>
              <tbody>{(p.status === 'vigente' ? POLITICA_VIGENTE_PARAMS.faixas : POLITICA_PROPOSTA_PARAMS.faixas).map(f => <tr key={f.min}><td>{fmtBRL(f.min)}</td><td className="num">{f.pct.toLocaleString('pt-BR')}%</td></tr>)}</tbody>
            </table>
            {p.status !== 'vigente' && <p className="tiny muted" style={{ marginTop: 6 }}>Acelerador: 120% da meta de itens +0,25 p.p.; 150% +0,40 p.p. Fator do score: 95–100 +10%; 90–94 0; 80–89 −10%; abaixo de 80 −20%. Acima de R$ 170 mil: decisão aberta.</p>}
            {p.status !== 'vigente' && pode(u, 'politicas.aprovar') && <div style={{ marginTop: 10 }}><Btn variante="sec" tamanho="sm" disabled title="Fora do escopo do protótipo">Aprovar como vigente (Fase B)</Btn><p className="tiny muted" style={{ marginTop: 4 }}>Trocar a política vigente exige decisão formal da direção, nova versão com data de início e migração planejada. Não é feito no protótipo.</p></div>}
          </Card>
        ))}
      </div>

      <Card titulo="Simular para um mecânico">
        <div className="grid k3">
          <Field rotulo="Mecânico" htmlFor="sim-mec"><select id="sim-mec" className="input" value={mecId} onChange={e => { setMecId(e.target.value); setOver({}); }}>{mecs.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}</select></Field>
          <Field rotulo="Dados de" htmlFor="sim-mes"><select id="sim-mes" className="input" value={fonte} onChange={e => { setFonte(e.target.value); setOver({}); }}><option value={mesAtual}>{fmtMes(mesAtual)} (parcial)</option>{meses.map(m => <option key={m} value={m}>{fmtMes(m)} (fechado)</option>)}</select></Field>
          <Field rotulo="Faturamento da bancada (R$)" htmlFor="sim-fat"><input id="sim-fat" className="input" inputMode="decimal" value={over.faturamento ?? String(Math.round(base.faturamento))} onChange={e => setOver({ ...over, faturamento: e.target.value })} /></Field>
          <Field rotulo="Itens: % da meta" htmlFor="sim-itens"><input id="sim-itens" className="input" inputMode="decimal" value={over.itensPct ?? String(Math.round(base.itensPct))} onChange={e => setOver({ ...over, itensPct: e.target.value })} /></Field>
          <Field rotulo="Score de execução" htmlFor="sim-score"><input id="sim-score" className="input" inputMode="numeric" value={over.score ?? String(base.score)} onChange={e => setOver({ ...over, score: e.target.value })} /></Field>
          <Field rotulo="Ajustes manuais (vigente)" htmlFor="sim-aj"><input id="sim-aj" className="input" inputMode="decimal" value={over.ajustes ?? '0'} onChange={e => setOver({ ...over, ajustes: e.target.value })} /></Field>
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <span className="small muted">Cenários de faturamento:</span>
          {[60000, 90000, 140000].map(v => <Btn key={v} tamanho="sm" variante="sec" onClick={() => setOver({ ...over, faturamento: String(v) })}>{fmtBRL(v).replace(',00', '')}</Btn>)}
        </div>
        <p className="tiny muted" style={{ marginTop: 6 }}>{base.nota}</p>
        <div className="grid k2" style={{ marginTop: 12 }}>
          <div className="kpi"><div className="lbl"><span>Vigente (comissão por upsell)</span><Badge tom="ok">VIGENTE</Badge></div><div className="val">{fmtBRL(vig.valor)}</div><ul className="tiny muted" style={{ margin: '6px 0 0', paddingLeft: 16 }}>{vig.premissas.map(x => <li key={x}>{x}</li>)}</ul></div>
          <div className="kpi"><div className="lbl"><span>Proposta (variável por faturamento)</span><Badge tom="proposta">PROPOSTA</Badge></div><div className="val">{fmtBRL(prop.valor)}</div><ul className="tiny muted" style={{ margin: '6px 0 0', paddingLeft: 16 }}>{prop.premissas.map(x => <li key={x}>{x}</li>)}</ul></div>
        </div>
        <p className="small" style={{ marginTop: 10 }}>Diferença: <b>{fmtBRL(prop.valor - vig.valor)}</b> (proposta − vigente). Fixo por nível não incluído.</p>
      </Card>

      {equipe.length > 0 && (
        <Card titulo={`Impacto na equipe · ${fmtMes(meses[0])} (fechado)`}>
          <table className="tbl">
            <thead><tr><th>Mecânico</th><th className="num">Vigente</th><th className="num">Proposta*</th><th className="num">Diferença</th></tr></thead>
            <tbody>
              {equipe.map(x => <tr key={x.m.id}><td>{x.m.nome}</td><td className="num">{fmtBRL(x.vig)}</td><td className="num">{fmtBRL(x.prop)}</td><td className="num">{fmtBRL(x.prop - x.vig)}</td></tr>)}
              <tr><td><b>Total</b></td><td className="num"><b>{fmtBRL(soma(equipe.map(x => x.vig)))}</b></td><td className="num"><b>{fmtBRL(soma(equipe.map(x => x.prop)))}</b></td><td className="num"><b>{fmtBRL(soma(equipe.map(x => x.prop - x.vig)))}</b></td></tr>
            </tbody>
          </table>
          <p className="tiny muted" style={{ marginTop: 6 }}>* Assume itens a 100% da meta e score 100 (sem detalhe no fechamento). Volumes fictícios e menores que os reais: com eles ninguém atinge a primeira faixa da proposta (R$ 55 mil). O backtest de verdade precisa do faturamento real por bancada (ver OPEN_DECISIONS). Use os cenários acima para ver o efeito das faixas.</p>
        </Card>
      )}
    </div>
  );
}
