import { ESTADOS, MOTIVO_PAUSA, SERVICOS, semTeste } from '../domain/catalogo';
import { progresso, STATUS_CHECKLIST_LABEL } from '../domain/checklist';
import type { Checklist, DB, EstadoItem, OrdemServico, StatusOS } from '../domain/types';
import { diffMin, fmtHora, fmtMin, agoraISO, primeiroNome } from '../domain/util';
import { Badge, Placa, Progress, useAgoraISO, type Tom } from '../ui/components';
import { faixaTempo, minutosDeServico, provavelEsquecida, registroForaDoTempoReal, rotuloPadrao, tempoPadraoMin } from '../domain/tempo';

const TOM_FAIXA = { ok: 'ok', perto: 'atencao', acima: 'critico' } as const;

/** Cronômetro da OS: verde até 80% do padrão, amarelo até o padrão, vermelho acima. Em andamento, atualiza sozinho. */
export function Cronometro({ os, grande = false }: { os: OrdemServico; grande?: boolean }) {
  const agora = useAgoraISO();
  if (!os.iniciadaEm || (os.status !== 'andamento' && os.status !== 'pausada' && os.status !== 'concluido')) return null;
  if (os.status === 'concluido' && registroForaDoTempoReal(os)) return null;
  const min = minutosDeServico(os, agora);
  if (min == null) return null;
  const padrao = tempoPadraoMin(os);
  const faixa = faixaTempo(min, padrao);
  const texto = os.status === 'concluido' ? `Tempo de serviço ${fmtMin(min)}` : `⏱ ${fmtMin(min)}${os.status === 'pausada' ? ' (pausada)' : ''}`;
  const extra = faixa === 'acima' ? ` · ${fmtMin(min - padrao)} acima do padrão` : ` / padrão ${fmtMin(padrao)}`;
  return (
    <span className={`badge ${TOM_FAIXA[faixa]}`} data-cronometro={faixa} title={`Padrão provisório (${rotuloPadrao(os)}): ${fmtMin(padrao)}. Não conta as pausas.`}
      style={{ whiteSpace: 'normal', borderRadius: 12, ...(grande ? { fontSize: 15, padding: '6px 12px', fontWeight: 800 } : { fontWeight: 700 }) }}>
      {texto}{extra}
    </span>
  );
}

/** Aviso para OS concluída cujo registro não foi feito na hora (fica fora das métricas de tempo). */
export const RegistroForaBadge = ({ os }: { os: OrdemServico }) => {
  const motivo = registroForaDoTempoReal(os);
  return motivo ? <Badge tom="atencao" icone="!">Registro fora do tempo real · {motivo.toLowerCase()}</Badge> : null;
};

/** OS em andamento muito além do padrão: provavelmente esqueceram de finalizar. */
export const EsquecidaAviso = ({ os }: { os: OrdemServico }) => {
  const agora = useAgoraISO();
  return provavelEsquecida(os, agora)
    ? <div className="small" data-esquecida style={{ marginTop: 6, color: 'var(--crit)', fontWeight: 700 }}>Ainda está nesta OS? Se o carro já saiu, finalize agora: o tempo continua contando.</div>
    : null;
};

export const STATUS_OS: Record<StatusOS, { r: string; tom: Tom }> = {
  aguardando: { r: 'Aguardando', tom: 'atencao' },
  andamento: { r: 'Em andamento', tom: 'info' },
  pausada: { r: 'Pausada', tom: 'atencao' },
  concluido: { r: 'Concluída', tom: 'ok' },
  cancelada: { r: 'Cancelada', tom: 'muted' },
  encerrada: { r: 'Encerrada (sem execução)', tom: 'muted' },
};

export const TOM_CHECKLIST: Record<Checklist['status'], Tom> = { nao_iniciado: 'neutro', em_andamento: 'info', concluido: 'ok', excecao_autorizada: 'atencao' };

export const EstadoBadge = ({ estado }: { estado: EstadoItem }) => {
  const e = ESTADOS[estado];
  return <Badge tom={e.tom === 'neutro' ? 'neutro' : e.tom} icone={e.icone}>{e.curto}</Badge>;
};

/** Carro de loja (revenda): o checklist é opcional; o mecânico vê isso em todas as telas da OS. */
export const CarroDeLojaBadge = ({ os }: { os: OrdemServico }) => os.carroDeLoja ? <Badge tom="info">Carro de loja · checklist opcional</Badge> : null;

export const ChecklistBadge = ({ c }: { c?: Checklist }) => c
  ? <Badge tom={TOM_CHECKLIST[c.status]}>Checklist: {STATUS_CHECKLIST_LABEL[c.status]}</Badge>
  : <Badge tom="muted">Sem checklist (registro anterior)</Badge>;

export const nomeServicos = (os: OrdemServico, soExecutados = false) =>
  os.servicos.filter(s => !soExecutados || s.executado).map(s => SERVICOS[s.key].nome).join(' · ');

export function OSCard({ db, os, mostrarMecanico = true, previsto, euId }: {
  db: DB; os: OrdemServico; mostrarMecanico?: boolean;
  /** Fila aguardando: posição e mecânico previsto (só informação). */
  previsto?: { posicao: number; mecanicoId?: string };
  euId?: string;
}) {
  const v = db.veiculos.find(x => x.id === os.veiculoId)!;
  const c = db.checklists.find(x => x.id === os.checklistId);
  const mec = db.usuarios.find(x => x.id === os.mecanicoId);
  const p = c ? progresso(c, db.evidencias) : null;
  const espera = os.status === 'aguardando' ? diffMin(os.abertaEm, agoraISO()) : null;
  const pausa = os.status === 'pausada' ? os.pausas?.at(-1) : undefined;
  const ajudantes = (os.assistencias || []).filter(x => !x.fim).map(x => primeiroNome(db.usuarios.find(y => y.id === x.mecanicoId)?.nome));
  const prevMec = previsto?.mecanicoId ? db.usuarios.find(x => x.id === previsto.mecanicoId) : undefined;
  return (
    <a className={`os-card st-${os.status} ${os.retornoDeOsId ? 'retorno' : ''} ${previsto && previsto.mecanicoId && previsto.mecanicoId === euId ? 'minha-vez' : ''}`} href={`#/os/${os.id}`} data-os={os.numero}>
      <div className="row between nowrap">
        <div className="row">
          {previsto && <span className="fila-pos" title="Posição na fila">{previsto.posicao}º</span>}
          <Placa placa={v.placa} />
          <span className="strong">{v.marca} {v.modelo}</span>
        </div>
        <span className="row nowrap" style={{ gap: 6 }}><span className={`st-pill st-${os.status}`}>{STATUS_OS[os.status].r}</span><span className="small muted mono">#{os.numero}</span></span>
      </div>
      {mostrarMecanico && mec && (os.status === 'andamento' || os.status === 'pausada') && (
        <div className="com-mecanico">Com: <b>{mec.nome}</b>{ajudantes.length > 0 && <> · Ajuda: <b>{ajudantes.join(', ')}</b></>}</div>
      )}
      {previsto && os.status === 'aguardando' && (
        <div className="com-mecanico previsto">
          {prevMec ? <>Previsto: <b>{prevMec.id === euId ? 'você' : prevMec.nome}</b>{os.retornoDeOsId ? ' (retorno)' : ''}</> : 'Aguardando mecânico livre'}
        </div>
      )}
      {pausa && <div className="small" style={{ marginTop: 6, color: 'var(--warn)' }}><b>Pausada:</b> {MOTIVO_PAUSA[pausa.motivo]}{pausa.detalhe ? ` — ${pausa.detalhe}` : ''} · desde {fmtHora(pausa.inicio)}</div>}
      <div className="small muted" style={{ marginTop: 6 }}>{os.retorno ? `Problema relatado: ${os.retorno.problemaRelatado}` : nomeServicos(os)}</div>
      <div className="row" style={{ marginTop: 8 }}>
        {os.retornoDeOsId && <Badge tom="critico" icone="↺">Retorno</Badge>}
        {os.naoOferecer && <Badge tom="muted">Frota · não oferecer</Badge>}
        <CarroDeLojaBadge os={os} />
        {semTeste(os).length > 0 && <Badge tom="atencao">Não fazer teste{semTeste(os).length > 1 ? '' : ` (${semTeste(os)[0].toLowerCase()})`}</Badge>}
        {os.status !== 'aguardando' && !os.retornoDeOsId && !(os.carroDeLoja && (!c || c.status === 'nao_iniciado')) && <ChecklistBadge c={c} />}
        {mostrarMecanico && mec && os.status === 'concluido' && <span className="small muted">{primeiroNome(mec.nome)}</span>}
        {espera != null && <span className="small muted">Aberta às {fmtHora(os.abertaEm)} · espera {fmtMin(espera)}</span>}
        {os.pedidoOlist && <span className="small muted">Pedido Olist {os.pedidoOlist}</span>}
        {os.status === 'andamento' && <span className="small muted">Início {fmtHora(os.iniciadaEm)}</span>}
        {os.status === 'concluido' && <span className="small muted">Concluída {fmtHora(os.concluidaEm)}</span>}
        <span data-tempo-servico><Cronometro os={os} /></span>
        <RegistroForaBadge os={os} />
      </div>
      <EsquecidaAviso os={os} />
      {p && os.status === 'andamento' && (
        <div style={{ marginTop: 8 }}>
          <Progress valor={p.pct} tom={p.pct === 100 ? 'ok' : undefined} rotulo="Progresso do checklist" />
          <div className="tiny muted" style={{ marginTop: 3 }}>{p.verificados} de {p.total} itens verificados</div>
        </div>
      )}
    </a>
  );
}
