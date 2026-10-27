import { useState } from 'react';
import { ir } from '../app/nav';
import { buscarVeiculosEClientes, corrigirPlaca, nomeDe } from '../data/api';
import { ESTADOS, ORIGEM_LABEL, SERVICOS } from '../domain/catalogo';
import { STATUS_MANUT_LABEL, statusManutencao, type StatusManutencao } from '../domain/manutencao';
import { pode } from '../domain/permissions';
import type { Usuario } from '../domain/types';
import { agoraISO, fmtData, fmtDataHora, fmtKm, primeiroNome } from '../domain/util';
import { Alerta, Badge, Btn, Card, Empty, Field, Placa, Sheet, useAcao, useDB, type Tom } from '../ui/components';
import { ChecklistBadge, nomeServicos, STATUS_OS } from './common';

const TOM_MANUT: Record<StatusManutencao, Tom> = { vencida: 'critico', proxima: 'atencao', futura: 'info', concluida: 'ok', acompanhar: 'muted' };

export function Veiculos({ u, termoInicial }: { u: Usuario; termoInicial: string }) {
  const db = useDB();
  const [termo, setTermo] = useState(termoInicial);
  const res = buscarVeiculosEClientes(u, termo);
  const comAlerta = db.veiculos
    .map(v => ({ v, venc: db.manutencoes.filter(m => m.veiculoId === v.id && statusManutencao(m, v.kmAtual, agoraISO()) === 'vencida') }))
    .filter(x => x.venc.length).slice(0, 6);
  return (
    <div style={{ maxWidth: 820 }}>
      <div className="page-head"><div><h1>Veículos</h1><div className="sub">Histórico completo por placa, mesmo quando a placa muda.</div></div></div>
      <Field rotulo={`Buscar por placa, cliente${pode(u, 'cliente.ver_contato') ? ', telefone' : ''} ou número da OS`} htmlFor="busca-veiculos">
        <input id="busca-veiculos" className="input" autoFocus value={termo} onChange={e => setTermo(e.target.value)} placeholder="Ex.: DEM1A23, Mariana, 7001" autoComplete="off" />
      </Field>
      {termo.trim().length >= 2 && (
        <div className="list" style={{ marginTop: 12 }}>
          {res.length === 0 && <Empty titulo="Nada encontrado." />}
          {res.map(r => (
            <a key={r.veiculo.id} className="li" href={`#/veiculos/${r.veiculo.id}`}>
              <Placa placa={r.veiculo.placa} />
              <div className="grow"><div className="ttl">{r.veiculo.marca} {r.veiculo.modelo} {r.veiculo.ano}</div><div className="meta">{r.cliente?.nome} · {r.visitas} visita(s) · encontrado por {r.motivo}</div></div>
              <span className="chev">›</span>
            </a>
          ))}
        </div>
      )}
      {termo.trim().length < 2 && comAlerta.length > 0 && (
        <>
          <div className="section-title">Com manutenção vencida</div>
          <div className="list">
            {comAlerta.map(({ v, venc }) => (
              <a key={v.id} className="li" href={`#/veiculos/${v.id}`}>
                <Placa placa={v.placa} />
                <div className="grow"><div className="ttl">{v.marca} {v.modelo}</div><div className="meta">{venc.map(m => m.descricao).join(', ')}</div></div>
                <Badge tom="critico">Vencida</Badge>
              </a>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function Veiculo({ u, veiculoId }: { u: Usuario; veiculoId: string }) {
  const db = useDB();
  const [placa, setPlaca] = useState(false);
  const v = db.veiculos.find(x => x.id === veiculoId);
  if (!v) return <div className="card"><Empty titulo="Veículo não encontrado." /></div>;
  const cli = db.clientes.find(c => c.id === v.clienteId);
  const oss = db.os.filter(o => o.veiculoId === v.id && o.status !== 'encerrada').sort((a, b) => b.abertaEm.localeCompare(a.abertaEm));
  const manut = db.manutencoes.filter(m => m.veiculoId === v.id).map(m => ({ m, st: statusManutencao(m, v.kmAtual, agoraISO()) }));
  const abertas = manut.filter(x => x.st !== 'concluida').sort((a, b) => ['vencida', 'proxima', 'futura', 'acompanhar'].indexOf(a.st) - ['vencida', 'proxima', 'futura', 'acompanhar'].indexOf(b.st));
  const recs = db.oportunidades.filter(o => o.veiculoId === v.id && (o.situacao === 'avaliar_depois' || o.situacao === 'recusada' || o.situacao === 'apresentada'));
  const fotos = db.evidencias.filter(e => e.veiculoId === v.id && !e.removida).sort((a, b) => b.em.localeCompare(a.em));

  return (
    <div>
      <a className="back" href="#/veiculos">‹ Veículos</a>
      <div className="page-head">
        <div>
          <div className="row"><Placa placa={v.placa} grande /><h1>{v.marca} {v.modelo} {v.ano}</h1></div>
          <div className="sub">{v.motor} · câmbio {v.cambio} · {v.combustivel} · último KM {fmtKm(v.kmAtual)}{v.kmAtualEm ? ` em ${fmtData(v.kmAtualEm)}` : ''}</div>
          <div className="sub">Cliente: {cli?.nome}{cli?.tipo === 'frota' ? ' (frota)' : ''}{pode(u, 'cliente.ver_contato') && cli?.telefone ? ` · ${cli.telefone}` : ''}</div>
          {v.placasAnteriores.length > 0 && <div className="sub">Placas anteriores: {v.placasAnteriores.map(p => `${p.placa} (até ${fmtData(p.ate)})`).join(', ')}</div>}
        </div>
        <div className="row">
          {pode(u, 'os.abrir') && <Btn onClick={() => ir('/os/nova')}>Nova OS</Btn>}
          {pode(u, 'veiculo.corrigir_cadastro') && <Btn variante="sec" onClick={() => setPlaca(true)}>Alterar placa</Btn>}
        </div>
      </div>

      <div className="grid cols2">
        <div>
          <Card titulo="Linha do tempo">
            {oss.length === 0 ? <Empty titulo="Sem visitas registradas." /> : (
              <div className="tl">
                {oss.map(o => {
                  const c = db.checklists.find(x => x.id === o.checklistId);
                  const rec = c ? c.defs.filter(d => ['atencao', 'prioritario'].includes(c.itens[d.id].estado)) : [];
                  return (
                    <div key={o.id} className={`tl-item ${!c ? 'legado' : ''} ${o.retornoDeOsId ? 'alerta' : ''}`}>
                      <div className="row between">
                        <a href={`#/os/${o.id}`} className="strong">{fmtData(o.concluidaEm || o.abertaEm)} · OS #{o.numero}</a>
                        <Badge tom={STATUS_OS[o.status].tom}>{STATUS_OS[o.status].r}</Badge>
                      </div>
                      <div className="small">{fmtKm(o.km)} · {nomeServicos(o, o.status === 'concluido')}</div>
                      <div className="row" style={{ marginTop: 4 }}>
                        <ChecklistBadge c={c} />
                        {o.mecanicoId && <span className="small muted">{primeiroNome(nomeDe(db, o.mecanicoId))}</span>}
                        {o.retornoDeOsId && <Badge tom="critico">Retorno</Badge>}
                      </div>
                      {rec.length > 0 && <div className="small" style={{ marginTop: 4 }}>{rec.map(d => `${ESTADOS[c!.itens[d.id].estado].icone} ${d.nome}`).join(' · ')}</div>}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
          {fotos.length > 0 && (
            <Card titulo={`Fotos do veículo (${fotos.length})`}>
              <div className="gallery">
                {fotos.slice(0, 12).map(f => {
                  const os = db.os.find(o => o.id === f.osId);
                  return <figure key={f.id}><img src={f.url} alt={f.legenda || 'Foto'} /><figcaption>{f.legenda}<br /><span className="muted">{fmtData(f.em)} · OS #{os?.numero}</span></figcaption></figure>;
                })}
              </div>
            </Card>
          )}
        </div>
        <div>
          <Card titulo="Próximas manutenções">
            {abertas.length === 0 ? <Empty titulo="Nada registrado." /> : (
              <div className="list">
                {abertas.map(({ m, st }) => (
                  <div key={m.id} className="li">
                    <div className="grow">
                      <div className="ttl">{m.descricao}</div>
                      <div className="meta">{m.kmPrevisto || m.dataPrevista ? [m.kmPrevisto ? fmtKm(m.kmPrevisto) : null, m.dataPrevista ? fmtData(m.dataPrevista) : null].filter(Boolean).join(' ou ') : 'Sem intervalo confirmado'}</div>
                      <div className="meta">{ORIGEM_LABEL[m.origem].rotulo}{m.ultimaExecucao ? ` · última ${fmtData(m.ultimaExecucao.data)}${m.ultimaExecucao.km ? `, ${fmtKm(m.ultimaExecucao.km)}` : ''}` : ''}</div>
                    </div>
                    <Badge tom={TOM_MANUT[st]}>{STATUS_MANUT_LABEL[st]}</Badge>
                  </div>
                ))}
              </div>
            )}
            <p className="tiny muted" style={{ marginTop: 8 }}>Intervalos de demonstração. Em produção, só regras aprovadas pela direção calculam km/data.</p>
          </Card>
          {recs.length > 0 && (
            <Card titulo="Recomendações em aberto">
              {recs.map(r => {
                const os = db.os.find(o => o.id === r.osId);
                return (
                  <div key={r.id} style={{ padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
                    <div className="row between"><b className="small">{r.recomendacao}</b><Badge tom={r.estadoItem === 'prioritario' ? 'critico' : 'atencao'}>{ESTADOS[r.estadoItem].curto}</Badge></div>
                    <div className="tiny muted">OS #{os?.numero} · {fmtData(r.criadaEm)} · {r.situacao === 'avaliar_depois' ? 'cliente vai avaliar depois' : r.situacao === 'recusada' ? 'recusada' : 'apresentada'}</div>
                  </div>
                );
              })}
            </Card>
          )}
          <Card titulo="Serviços já feitos">
            {Object.entries(oss.filter(o => o.status === 'concluido').flatMap(o => o.servicos.filter(s => s.executado).map(s => ({ s, o })))
              .reduce<Record<string, { data: string; km?: number }>>((acc, { s, o }) => { if (!acc[s.key] || acc[s.key].data < o.concluidaEm!) acc[s.key] = { data: o.concluidaEm!, km: o.km }; return acc; }, {}))
              .map(([k, x]) => <div key={k} className="row between small" style={{ padding: '4px 0' }}><span>{SERVICOS[k as keyof typeof SERVICOS].nome}</span><span className="muted">{fmtData(x.data)} · {fmtKm(x.km)}</span></div>)}
          </Card>
        </div>
      </div>
      {placa && <PlacaSheet u={u} veiculoId={v.id} atual={v.placa} onClose={() => setPlaca(false)} />}
      <p className="tiny muted" style={{ marginTop: 16 }}>Atualizado {fmtDataHora(agoraISO())}</p>
    </div>
  );
}

function PlacaSheet({ u, veiculoId, atual, onClose }: { u: Usuario; veiculoId: string; atual: string; onClose: () => void }) {
  const [nova, setNova] = useState('');
  const [motivo, setMotivo] = useState('');
  const acao = useAcao();
  return (
    <Sheet titulo="Alterar placa" sub={`Placa atual ${atual}. O histórico continua no mesmo veículo e a placa antiga fica registrada.`} onClose={onClose}
      rodape={<><Btn variante="sec" onClick={onClose}>Cancelar</Btn><Btn carregando={acao.ocupado} onClick={async () => { if ((await acao.executar(() => corrigirPlaca(u, veiculoId, nova, motivo), 'Placa alterada. Histórico preservado.')) !== undefined) onClose(); }}>Salvar</Btn></>}>
      <Field rotulo="Nova placa" obrigatorio htmlFor="nova-placa"><input id="nova-placa" className="input" value={nova} onChange={e => setNova(e.target.value.toUpperCase())} maxLength={8} /></Field>
      <Field rotulo="Motivo" obrigatorio htmlFor="motivo-placa" dica="Ex.: conversão para padrão Mercosul, erro de digitação"><input id="motivo-placa" className="input" value={motivo} onChange={e => setMotivo(e.target.value)} /></Field>
      {acao.erro && <Alerta tipo="crit">{acao.erro}</Alerta>}
    </Sheet>
  );
}
