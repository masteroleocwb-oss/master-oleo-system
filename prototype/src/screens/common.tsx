import { ESTADOS, SERVICOS } from '../domain/catalogo';
import { progresso, STATUS_CHECKLIST_LABEL } from '../domain/checklist';
import type { Checklist, DB, EstadoItem, OrdemServico, StatusOS } from '../domain/types';
import { diffMin, fmtHora, fmtMin, agoraISO, primeiroNome } from '../domain/util';
import { Badge, Placa, Progress, type Tom } from '../ui/components';

export const STATUS_OS: Record<StatusOS, { r: string; tom: Tom }> = {
  aguardando: { r: 'Aguardando', tom: 'atencao' },
  andamento: { r: 'Em andamento', tom: 'info' },
  concluido: { r: 'Concluída', tom: 'ok' },
  cancelada: { r: 'Cancelada', tom: 'muted' },
  encerrada: { r: 'Encerrada (sem execução)', tom: 'muted' },
};

export const TOM_CHECKLIST: Record<Checklist['status'], Tom> = { nao_iniciado: 'neutro', em_andamento: 'info', concluido: 'ok', excecao_autorizada: 'atencao' };

export const EstadoBadge = ({ estado }: { estado: EstadoItem }) => {
  const e = ESTADOS[estado];
  return <Badge tom={e.tom === 'neutro' ? 'neutro' : e.tom} icone={e.icone}>{e.curto}</Badge>;
};

export const ChecklistBadge = ({ c }: { c?: Checklist }) => c
  ? <Badge tom={TOM_CHECKLIST[c.status]}>Checklist: {STATUS_CHECKLIST_LABEL[c.status]}</Badge>
  : <Badge tom="muted">Sem checklist (registro anterior)</Badge>;

export const nomeServicos = (os: OrdemServico, soExecutados = false) =>
  os.servicos.filter(s => !soExecutados || s.executado).map(s => SERVICOS[s.key].nome).join(' · ');

export function OSCard({ db, os, mostrarMecanico = true }: { db: DB; os: OrdemServico; mostrarMecanico?: boolean }) {
  const v = db.veiculos.find(x => x.id === os.veiculoId)!;
  const c = db.checklists.find(x => x.id === os.checklistId);
  const mec = db.usuarios.find(x => x.id === os.mecanicoId);
  const p = c ? progresso(c, db.evidencias) : null;
  const espera = os.status === 'aguardando' ? diffMin(os.abertaEm, agoraISO()) : null;
  return (
    <a className={`os-card ${os.retornoDeOsId ? 'retorno' : ''}`} href={`#/os/${os.id}`} data-os={os.numero}>
      <div className="row between nowrap">
        <div className="row">
          <Placa placa={v.placa} />
          <span className="strong">{v.marca} {v.modelo}</span>
        </div>
        <span className="small muted mono">#{os.numero}</span>
      </div>
      <div className="small muted" style={{ marginTop: 6 }}>{nomeServicos(os)}</div>
      <div className="row" style={{ marginTop: 8 }}>
        {os.retornoDeOsId && <Badge tom="critico" icone="↺">Retorno</Badge>}
        {os.naoOferecer && <Badge tom="muted">Frota · não oferecer</Badge>}
        {(os.naoFazerTesteFreio || os.naoFazerTesteCambio) && <Badge tom="atencao">Não fazer teste{os.naoFazerTesteFreio && os.naoFazerTesteCambio ? '' : os.naoFazerTesteFreio ? ' (freio)' : ' (câmbio)'}</Badge>}
        {os.status !== 'aguardando' && <ChecklistBadge c={c} />}
        {mostrarMecanico && mec && <span className="small muted">{primeiroNome(mec.nome)}</span>}
        {espera != null && <span className="small muted">Aberta às {fmtHora(os.abertaEm)} · espera {fmtMin(espera)}</span>}
        {os.status === 'andamento' && <span className="small muted">Início {fmtHora(os.iniciadaEm)}</span>}
        {os.status === 'concluido' && <span className="small muted">Concluída {fmtHora(os.concluidaEm)}</span>}
      </div>
      {p && os.status === 'andamento' && (
        <div style={{ marginTop: 8 }}>
          <Progress valor={p.pct} tom={p.pct === 100 ? 'ok' : undefined} rotulo="Progresso do checklist" />
          <div className="tiny muted" style={{ marginTop: 3 }}>{p.verificados} de {p.total} itens verificados</div>
        </div>
      )}
    </a>
  );
}
