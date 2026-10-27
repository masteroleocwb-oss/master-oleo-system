import { useState } from 'react';
import { acaoOcorrencia, nomeDe } from '../data/api';
import { DEFINICOES, indicadoresMecanico, serieMecanico } from '../data/metricas';
import { STATUS_OCORRENCIA_LABEL } from '../domain/gestao';
import type { Ocorrencia, Usuario } from '../domain/types';
import { fmtData, fmtMes, fmtMin, fmtPct, hojeKey, mesKey } from '../domain/util';
import { Alerta, Badge, Btn, Card, Field, Kpi, Progress, Sheet, useAcao, useDB } from '../ui/components';

const tomPct = (v: number | null, alvo: number) => (v == null ? undefined : v >= alvo ? 'ok' : v >= alvo - 10 ? 'warn' : 'crit') as 'ok' | 'warn' | 'crit' | undefined;

export function Performance({ u }: { u: Usuario }) {
  const db = useDB();
  const mes = mesKey(hojeKey() + 'T15:00:00Z');
  const ind = indicadoresMecanico(db, u.id, mes);
  const serie = serieMecanico(db, u.id);
  const ocorrencias = db.ocorrencias.filter(o => o.profissionalId === u.id && o.status !== 'registrada').sort((a, b) => b.dataHora.localeCompare(a.dataHora));
  const [manif, setManif] = useState<Ocorrencia | null>(null);
  const metaCk = db.metas.find(m => m.id === 'mt_checklist');
  const alvoCk = metaCk?.versoes.filter(v => v.status === 'aprovada').at(-1)?.alvo ?? 95;
  const plano = db.planosAcao.filter(p => p.profissionalId === u.id && p.status === 'aberto');

  return (
    <div>
      <div className="page-head"><div><h1>Meu mês · {fmtMes(mes)}</h1><div className="sub">Seus números, com a explicação de cada um. Toque em “?” para ver a fórmula.</div></div></div>

      {ind.meta && (
        <Card titulo="Meta de itens realizados" acao={<Badge tom="navy">Versão {ind.meta.versao}</Badge>}>
          <div className="row between" style={{ marginBottom: 6 }}>
            <span><b style={{ fontSize: 28, color: 'var(--navy)' }}>{ind.realizados}</b> <span className="muted">de {ind.meta.alvo} itens</span></span>
            <span className="strong">{Math.round(ind.meta.progressoPct)}%</span>
          </div>
          <Progress valor={ind.meta.progressoPct} grande tom={ind.meta.progressoPct >= 100 ? 'ok' : undefined} rotulo="Progresso da meta" />
          <p className="small" style={{ marginTop: 8 }}>
            No ritmo atual, você fecha o mês com <b>{ind.meta.projecao}</b> itens.
            {ind.meta.ritmoNecessario != null && ind.realizados < ind.meta.alvo && <> Para bater a meta: <b>{ind.meta.ritmoNecessario.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}</b> item(ns) por dia útil.</>}
          </p>
          <p className="tiny muted" style={{ marginTop: 4 }}>{DEFINICOES.realizados.formula} Dias de exceção e frota “não oferecer” saem do potencial ({ind.carros - ind.carrosElegiveis} carro(s) este mês).</p>
        </Card>
      )}

      <div className="section-title">Qualidade da inspeção</div>
      <div className="grid k3">
        <div>
          <Kpi rotulo="Checklist completo" valor={fmtPct(ind.checklistPct)} dica={`${ind.checklistCompletos} de ${ind.carros} OS · meta ${alvoCk}%`} explicacao={DEFINICOES.checklist} alerta={ind.checklistPct != null && ind.checklistPct < alvoCk - 10} />
          {ind.checklistPct != null && <div style={{ marginTop: 6 }}><Progress valor={ind.checklistPct} tom={tomPct(ind.checklistPct, alvoCk)} rotulo="Checklist completo" /></div>}
        </div>
        <Kpi rotulo="Evidência quando exigida" valor={fmtPct(ind.evidenciasPct)} dica={`${ind.fotosFeitas} de ${ind.fotosExigidas} itens`} explicacao={DEFINICOES.evidencias} />
        <Kpi rotulo="Exceções autorizadas" valor={ind.excecoes} dica="Separadas do checklist completo" explicacao={DEFINICOES.excecoes} />
      </div>

      <div className="section-title">Resultado</div>
      <div className="grid k4">
        <Kpi rotulo="Carros atendidos" valor={ind.carros} explicacao={DEFINICOES.carros} />
        <Kpi rotulo="Itens identificados" valor={ind.identificados} explicacao={DEFINICOES.identificados} />
        <Kpi rotulo="Aceite das recomendações" valor={fmtPct(ind.conversaoPct)} explicacao={DEFINICOES.conversao} />
        <Kpi rotulo="Adicionais vendidos" valor={ind.adicionais} dica={`${ind.ofertasAdicionais} oferta(s) registradas`} explicacao={DEFINICOES.adicionais} />
        <Kpi rotulo="Assumidas fora da ordem" valor={ind.foraDaOrdem} explicacao={DEFINICOES.foraDaOrdem} />
        <Kpi rotulo="Retornos" valor={ind.retornos} explicacao={DEFINICOES.retornos} alerta={ind.retornos > 0} />
        <Kpi rotulo="Tempo médio por OS" valor={fmtMin(ind.tempoMedioMin)} dica={`Checklist: ${fmtMin(ind.tempoChecklistMin)}`} explicacao={DEFINICOES.tempo} />
        <Kpi rotulo="Score de execução" valor={ind.score} dica={ind.descontoChecklist ? `−${ind.descontoChecklist} pelo checklist` : 'Sem desconto do checklist'} explicacao={DEFINICOES.score} />
      </div>
      <div style={{ marginTop: 10 }}><Alerta tipo="prop">O score e a remuneração por faturamento são <b>proposta em teste</b> do Playbook. Nada aqui muda o seu pagamento atual. A regra vigente continua a do sistema.</Alerta></div>

      <div className="section-title">Evolução</div>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead><tr><th>Mês</th><th className="num">Carros</th><th className="num">Checklist completo</th><th className="num">Itens realizados</th><th className="num">Retornos</th></tr></thead>
          <tbody>
            {serie.map(s => (
              <tr key={s.mes}>
                <td>{fmtMes(s.mes)} {s.fechado ? <span className="tiny muted">fechado</span> : <Badge tom="info">em andamento</Badge>}</td>
                <td className="num">{s.carros}</td>
                <td className="num">{s.checklistPct == null ? <span className="muted tiny">sem checklist</span> : fmtPct(s.checklistPct)}</td>
                <td className="num">{s.itens}</td>
                <td className="num">{s.retornos}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="tiny muted" style={{ marginTop: 6 }}>Meses fechados não mudam depois do fechamento. Antes do piloto não havia checklist, por isso aparece “sem checklist” em vez de 0%.</p>

      {plano.length > 0 && (
        <>
          <div className="section-title">Combinados com a liderança</div>
          {plano.map(p => <Card key={p.id} tight><b>{p.assunto}</b><p className="small">{p.combinados}</p><p className="tiny muted">Prazo {fmtData(p.prazo + 'T12:00:00Z')} · registrado por {nomeDe(db, p.registradoPor)}</p></Card>)}
        </>
      )}

      <div className="section-title">Ocorrências e reconhecimentos</div>
      {ocorrencias.length === 0 ? <Card><p className="small muted">Nenhum registro.</p></Card> : ocorrencias.map(o => (
        <Card key={o.id} tight>
          <div className="row between">
            <span className="row"><Badge tom={o.tipo === 'reconhecimento' ? 'ok' : 'atencao'}>{o.tipo === 'reconhecimento' ? 'Reconhecimento' : 'Ocorrência'}</Badge><b>{o.categoria}</b></span>
            <Badge tom={o.status === 'aplicada' ? 'navy' : o.status === 'rejeitada' ? 'muted' : 'info'}>{STATUS_OCORRENCIA_LABEL[o.status]}</Badge>
          </div>
          <p className="small" style={{ marginTop: 6 }}>{o.descricao}</p>
          <p className="tiny muted">{fmtData(o.dataHora)} · efeito proposto {o.efeitoProposto > 0 ? '+' : ''}{o.efeitoProposto} ponto(s) no score · {o.regra}</p>
          {o.manifestacao && <p className="small" style={{ marginTop: 4 }}><b>Sua manifestação:</b> {o.manifestacao.texto}</p>}
          {o.obsEncerramento && <p className="small muted" style={{ marginTop: 4 }}>Encerramento: {o.obsEncerramento}</p>}
          {o.tipo === 'desconto' && (o.status === 'em_revisao' || o.status === 'aprovada') && (
            <div style={{ marginTop: 8 }}><Btn tamanho="sm" variante="sec" onClick={() => setManif(o)}>Registrar minha manifestação</Btn></div>
          )}
        </Card>
      ))}
      {manif && <ManifestacaoSheet u={u} o={manif} onClose={() => setManif(null)} />}
    </div>
  );
}

function ManifestacaoSheet({ u, o, onClose }: { u: Usuario; o: Ocorrencia; onClose: () => void }) {
  const [txt, setTxt] = useState('');
  const acao = useAcao();
  return (
    <Sheet titulo="Sua manifestação" sub={`${o.categoria}. A direção lê antes de decidir. Nenhum efeito é aplicado sem decisão registrada.`} onClose={onClose}
      rodape={<><Btn variante="sec" onClick={onClose}>Cancelar</Btn><Btn carregando={acao.ocupado} onClick={async () => { if ((await acao.executar(() => acaoOcorrencia(u, o.id, 'contestar', txt), 'Manifestação registrada.')) !== undefined) onClose(); }}>Enviar</Btn></>}>
      <Field rotulo="O que você quer registrar?" obrigatorio htmlFor="manif" erro={acao.erro}><textarea id="manif" className="input" value={txt} onChange={e => setTxt(e.target.value)} /></Field>
    </Sheet>
  );
}
