import { useState } from 'react';
import { ir } from '../app/nav';
import { filaRodizio, iniciarOS, mecanicoDoRetorno, previsaoFila, proximoDaFila, retomarOS, setStatusRodizio } from '../data/api';
import { PausarSheet } from './Pausa';
import { painelHoje } from '../data/metricas';
import { MOTIVO_PAUSA } from '../domain/catalogo';
import { progresso } from '../domain/checklist';
import { pode } from '../domain/permissions';
import type { OrdemServico, Usuario } from '../domain/types';
import { agora, fmtBRL, fmtHora, primeiroNome } from '../domain/util';
import { Alerta, Badge, Btn, Card, Empty, Field, Kpi, Placa, Sheet, useAcao, useDB } from '../ui/components';
import { nomeServicos, OSCard } from './common';

const ROD_LABEL = { disponivel: 'Disponível', almoco: 'Almoço', ausente: 'Ausente' } as const;

/** Rota de trabalho da OS: retorno tem atendimento próprio; as demais, checklist → execução. */
export const rotaTrabalho = (os: OrdemServico, ckOk: boolean) =>
  os.retornoDeOsId ? `/os/${os.id}/retorno` : ckOk ? `/os/${os.id}/execucao` : `/os/${os.id}/checklist`;

export function Operacao({ u }: { u: Usuario }) {
  const db = useDB();
  const p = painelHoje(db);
  const fila = filaRodizio(db);
  const proximo = proximoDaFila(db);
  const previsao = previsaoFila(db);
  const acao = useAcao();
  const [designar, setDesignar] = useState<OrdemServico | null>(null);
  const [assumirFora, setAssumirFora] = useState<OrdemServico | null>(null);
  const [pausar, setPausar] = useState<OrdemServico | null>(null);
  const [busca, setBusca] = useState('');
  const mec = u.role === 'mecanico';
  const minha = mec ? p.andamento.find(o => o.mecanicoId === u.id) : undefined;
  const minhasPausadas = mec ? p.pausadas.filter(o => o.mecanicoId === u.id) : [];
  const minhasCorrecoes = mec ? p.correcoesPendentes.filter(c => db.os.find(o => o.id === c.osId)?.mecanicoId === u.id) : [];
  const meuStatus = fila.find(f => f.mecanico.id === u.id);
  const minhaPrevista = mec ? p.aguardando.find(o => previsao.get(o.id)?.mecanicoId === u.id) : undefined;

  const abrirTrabalho = (os: OrdemServico) => ir(os.retornoDeOsId ? `/os/${os.id}/retorno` : `/os/${os.id}/checklist`);
  const assumir = async (os: OrdemServico) => {
    if (previsao.get(os.id)?.mecanicoId !== u.id) { setAssumirFora(os); return; }
    if (await acao.executar(() => iniciarOS(u, os.id, u.id), `OS #${os.numero} iniciada.`)) abrirTrabalho(os);
  };

  const d = agora().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', timeZone: 'America/Sao_Paulo' });
  const hoje = d.charAt(0).toUpperCase() + d.slice(1);

  return (
    <div>
      <div className="page-head">
        <div><h1>Operação de hoje</h1><div className="sub">{hoje}</div></div>
        <form className="row" onSubmit={e => { e.preventDefault(); ir(`/veiculos?q=${encodeURIComponent(busca)}`); }} role="search">
          <label className="sr-only" htmlFor="busca-op">Buscar placa, cliente ou OS</label>
          <input id="busca-op" className="input" style={{ width: 230 }} placeholder="Placa, cliente ou nº da OS" value={busca} onChange={e => setBusca(e.target.value)} />
          <Btn variante="sec" type="submit">Buscar</Btn>
        </form>
      </div>

      {minhasCorrecoes.map(c => {
        const os = db.os.find(o => o.id === c.osId)!;
        return (
          <div key={c.id} style={{ marginBottom: 12 }}>
            <Alerta tipo="warn">
              <b>A liderança pediu correção no checklist da OS #{os.numero}.</b> Motivo: {c.correcaoSolicitada!.motivo}.
              <div style={{ marginTop: 8 }}><Btn tamanho="sm" onClick={() => ir(`/os/${os.id}/checklist`)}>Revisar itens indicados</Btn></div>
            </Alerta>
          </div>
        );
      })}

      {!mec && (
        <div className="grid k4" style={{ marginBottom: 16 }}>
          <Kpi rotulo="Aguardando" valor={p.aguardando.length} />
          <Kpi rotulo="Em andamento" valor={p.andamento.length} />
          <Kpi rotulo="Pausadas" valor={p.pausadas.length} dica="Aguardando peça ou aprovação do cliente" />
          {pode(u, 'os.ver_valores') ? <Kpi rotulo="Faturado hoje" valor={fmtBRL(p.faturamentoHoje)} dica={`${p.concluidasHoje.length} OS concluídas hoje`} />
            : <Kpi rotulo="Concluídas hoje" valor={p.concluidasHoje.length} />}
        </div>
      )}

      <div className="grid cols2">
        <div>
          {mec && (
            <Card titulo="Sua bancada" className="" acao={meuStatus && <Badge tom={meuStatus.status === 'disponivel' ? 'ok' : 'atencao'}>{ROD_LABEL[meuStatus.status]}</Badge>}>
              {minha ? (() => {
                const c = db.checklists.find(x => x.id === minha.checklistId);
                const pr = c ? progresso(c, db.evidencias) : null;
                const v = db.veiculos.find(x => x.id === minha.veiculoId)!;
                const ckOk = !!c && (c.status === 'concluido' || c.status === 'excecao_autorizada');
                return (
                  <div className="stack">
                    <div className="row"><Placa placa={v.placa} /><b>{v.marca} {v.modelo}</b><span className="muted small">OS #{minha.numero} · início {fmtHora(minha.iniciadaEm)}</span></div>
                    {minha.retorno ? <Alerta tipo="warn"><b>Retorno.</b> Problema relatado: {minha.retorno.problemaRelatado}</Alerta> : <div className="small muted">{nomeServicos(minha)}</div>}
                    {pr && <div className="small"><b>{pr.verificados}</b> de {pr.total} itens verificados</div>}
                    {c?.solicitacaoExcecao?.status === 'pendente' && <Alerta tipo="info">Exceção do checklist aguardando a liderança.</Alerta>}
                    <Btn block onClick={() => ir(rotaTrabalho(minha, ckOk))}>
                      {minha.retornoDeOsId ? 'Abrir atendimento do retorno' : ckOk ? 'Executar e finalizar' : pr?.verificados ? 'Continuar checklist' : 'Começar checklist'}
                    </Btn>
                    <Btn block variante="sec" onClick={() => setPausar(minha)}>Pausar OS (ex.: aguardando peça)</Btn>
                  </div>
                );
              })() : (
                <div className="stack">
                  {minhaPrevista
                    ? <Alerta tipo="ok"><b>Próxima OS prevista para você: #{minhaPrevista.numero}.</b> Assuma quando estiver pronto.</Alerta>
                    : <p className="small muted">Sem OS em andamento. {proximo ? `Próximo do rodízio: ${primeiroNome(proximo.nome)}.` : 'Ninguém disponível no rodízio.'}</p>}
                  {meuStatus && (
                    <div className="row">
                      {meuStatus.status === 'almoco'
                        ? <Btn variante="sec" carregando={acao.ocupado} onClick={() => acao.executar(() => setStatusRodizio(u, u.id, 'disponivel'), 'Você voltou do almoço. Sua posição na fila foi mantida.')}>Voltei do almoço</Btn>
                        : <Btn variante="sec" carregando={acao.ocupado} onClick={() => acao.executar(() => setStatusRodizio(u, u.id, 'almoco'), 'Almoço registrado. Você sai da fila sem perder a posição.')}>Sair para almoço</Btn>}
                    </div>
                  )}
                </div>
              )}
              {minhasPausadas.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div className="small strong" style={{ marginBottom: 6 }}>Suas OS pausadas</div>
                  {minhasPausadas.map(os => (
                    <div key={os.id} className="row between" style={{ padding: '6px 0', borderTop: '1px solid var(--line)' }}>
                      <span className="small">OS #{os.numero} · {MOTIVO_PAUSA[os.pausas!.at(-1)!.motivo]}</span>
                      <Btn tamanho="sm" variante="sec" carregando={acao.ocupado} disabled={!!minha}
                        onClick={async () => { if (await acao.executar(() => retomarOS(u, os.id), `OS #${os.numero} retomada.`)) ir(`/os/${os.id}`); }}>
                        {minha ? 'Finalize a atual para retomar' : 'Retomar'}
                      </Btn>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}

          <div className="section-title">Fila de OS aguardando ({p.aguardando.length}) — por ordem de chegada</div>
          {p.aguardando.length === 0 && <div className="card"><Empty titulo="Nenhuma OS aguardando." /></div>}
          {p.aguardando.map(os => {
            const prev = previsao.get(os.id);
            const doRet = mecanicoDoRetorno(db, os);
            const retornoDeOutro = !!doRet && doRet !== u.id;
            const podeAssumir = mec && !minha && meuStatus?.status === 'disponivel' && !retornoDeOutro;
            return (
              <div key={os.id} style={{ marginBottom: 8 }}>
                <OSCard db={db} os={os} previsto={prev} euId={u.id} />
                <div className="row" style={{ marginTop: 6, justifyContent: 'flex-end' }}>
                  {mec && retornoDeOutro && <span className="small muted">Retorno: fica com {primeiroNome(db.usuarios.find(x => x.id === doRet)?.nome)} (a liderança pode designar outro)</span>}
                  {podeAssumir && (
                    <Btn tamanho="sm" variante={prev?.mecanicoId === u.id ? undefined : 'sec'} carregando={acao.ocupado} onClick={() => assumir(os)}>
                      {prev?.mecanicoId === u.id ? 'Assumir esta OS' : 'Assumir fora da vez'}
                    </Btn>
                  )}
                  {!mec && pode(u, 'os.iniciar') && <Btn tamanho="sm" variante="sec" onClick={() => setDesignar(os)}>Designar mecânico</Btn>}
                </div>
              </div>
            );
          })}

          <div className="section-title">Em andamento ({p.andamento.length})</div>
          {p.andamento.length === 0 && <div className="card"><Empty titulo="Nenhuma OS em andamento." /></div>}
          {p.andamento.map(os => <OSCard key={os.id} db={db} os={os} />)}

          {p.pausadas.length > 0 && <>
            <div className="section-title">Pausadas ({p.pausadas.length})</div>
            {p.pausadas.map(os => (
              <div key={os.id} style={{ marginBottom: 8 }}>
                <OSCard db={db} os={os} />
                {!mec && pode(u, 'rodizio.gerenciar') && (
                  <div className="row" style={{ marginTop: 6, justifyContent: 'flex-end' }}>
                    <Btn tamanho="sm" variante="sec" carregando={acao.ocupado} onClick={() => acao.executar(() => retomarOS(u, os.id), `OS #${os.numero} retomada.`)}>Retomar</Btn>
                  </div>
                )}
              </div>
            ))}
          </>}

          <div className="section-title">Concluídas hoje ({p.concluidasHoje.length})</div>
          {p.concluidasHoje.map(os => <OSCard key={os.id} db={db} os={os} />)}
        </div>

        <div>
          <Card titulo="Rodízio" acao={proximo && <Badge tom="info">Vez: {primeiroNome(proximo.nome)}</Badge>}>
            <p className="small muted" style={{ marginBottom: 10 }}>A vez é de quem começou a última OS há mais tempo. Almoço e ausência tiram da fila sem mudar a posição. Retorno vai para o mesmo mecânico. Se o previsto estiver indisponível, outro mecânico pode assumir informando o motivo.</p>
            <div className="list">
              {fila.map((f, i) => (
                <div className="li" key={f.mecanico.id}>
                  <span className={`fila-pos ${proximo?.id === f.mecanico.id ? 'next' : ''}`}>{i + 1}</span>
                  <div className="grow">
                    <div className="ttl">{f.mecanico.nome}</div>
                    <div className="meta">{f.carrosHoje} carro(s) hoje{f.ultima ? ` · último início ${fmtHora(f.ultima)}` : ''}{f.pausadas ? ` · ${f.pausadas} pausada(s)` : ''}</div>
                  </div>
                  {f.ocupado ? <Badge tom="info">Em OS</Badge> : <Badge tom={f.status === 'disponivel' ? 'ok' : 'atencao'}>{ROD_LABEL[f.status]}</Badge>}
                  {pode(u, 'rodizio.gerenciar') && (
                    <select aria-label={`Status de ${f.mecanico.nome}`} className="input" style={{ width: 120, minHeight: 36, padding: '4px 8px', fontSize: 14 }} value={f.status}
                      onChange={e => acao.executar(() => setStatusRodizio(u, f.mecanico.id, e.target.value as 'disponivel'), 'Status do rodízio atualizado.')}>
                      <option value="disponivel">Disponível</option><option value="almoco">Almoço</option><option value="ausente">Ausente</option>
                    </select>
                  )}
                </div>
              ))}
            </div>
          </Card>
          {pode(u, 'os.abrir') && <div style={{ marginTop: 12 }}><Btn block onClick={() => ir('/os/nova')}>+ Nova OS</Btn></div>}
        </div>
      </div>
      {designar && <DesignarSheet u={u} os={designar} onClose={() => setDesignar(null)} />}
      {assumirFora && <AssumirForaSheet u={u} os={assumirFora} onClose={() => setAssumirFora(null)} onOk={() => abrirTrabalho(assumirFora)} />}
      {pausar && <PausarSheet u={u} os={pausar} onClose={() => setPausar(null)} />}
    </div>
  );
}

const MOTIVOS_FORA = ['O mecânico previsto está ocupado/indisponível agora', 'Combinado com o mecânico previsto', 'Pedido da liderança'];

function AssumirForaSheet({ u, os, onClose, onOk }: { u: Usuario; os: OrdemServico; onClose: () => void; onOk: () => void }) {
  const db = useDB();
  const prev = previsaoFila(db).get(os.id)?.mecanicoId;
  const nomePrev = primeiroNome(db.usuarios.find(x => x.id === prev)?.nome);
  const [motivo, setMotivo] = useState('');
  const acao = useAcao();
  return (
    <Sheet titulo={`Assumir OS #${os.numero} fora da vez`} sub={prev ? `Esta OS estava prevista para ${nomePrev}.` : 'Nenhum mecânico estava previsto para esta OS.'} onClose={onClose}
      rodape={<>
        <Btn variante="sec" onClick={onClose}>Cancelar</Btn>
        <Btn carregando={acao.ocupado} disabled={!motivo.trim()} onClick={async () => { if (await acao.executar(() => iniciarOS(u, os.id, u.id, motivo), `OS #${os.numero} iniciada.`)) { onClose(); onOk(); } }}>Assumir</Btn>
      </>}>
      <div className="row" style={{ marginBottom: 10 }}>
        {MOTIVOS_FORA.map(m => <button key={m} type="button" className={`chip ${motivo === m ? 'on' : ''}`} onClick={() => setMotivo(m)}>{m}</button>)}
      </div>
      <Field rotulo="Motivo" obrigatorio dica="Fica no histórico da OS e no painel da liderança." htmlFor="motivo-assumir">
        <textarea id="motivo-assumir" className="input" value={motivo} onChange={e => setMotivo(e.target.value)} />
      </Field>
      {acao.erro && <Alerta tipo="crit">{acao.erro}</Alerta>}
    </Sheet>
  );
}

function DesignarSheet({ u, os, onClose }: { u: Usuario; os: OrdemServico; onClose: () => void }) {
  const db = useDB();
  const fila = filaRodizio(db).filter(f => !f.ocupado);
  const doRet = mecanicoDoRetorno(db, os);
  const sugerido = previsaoFila(db).get(os.id)?.mecanicoId || '';
  const [mecId, setMecId] = useState(sugerido);
  const [motivo, setMotivo] = useState('');
  const acao = useAcao();
  const foraDaOrdem = mecId && mecId !== sugerido;
  return (
    <Sheet titulo={`Designar OS #${os.numero}`} sub={doRet ? 'Retorno: o padrão é o mecânico do serviço original.' : 'O padrão é o mecânico previsto na fila.'} onClose={onClose}
      rodape={<>
        <Btn variante="sec" onClick={onClose}>Cancelar</Btn>
        <Btn carregando={acao.ocupado} disabled={!mecId} onClick={async () => { if (await acao.executar(() => iniciarOS(u, os.id, mecId, motivo), 'OS iniciada.')) onClose(); }}>Iniciar com este mecânico</Btn>
      </>}>
      <Field rotulo="Mecânico" htmlFor="mec-designar">
        <select id="mec-designar" className="input" value={mecId} onChange={e => setMecId(e.target.value)}>
          <option value="">Selecione</option>
          {fila.map(f => <option key={f.mecanico.id} value={f.mecanico.id}>{f.mecanico.nome}{f.mecanico.id === sugerido ? ' (previsto)' : ''}{f.status !== 'disponivel' ? ` — ${ROD_LABEL[f.status]}` : ''}</option>)}
        </select>
      </Field>
      {foraDaOrdem && (
        <Field rotulo="Motivo para sair da ordem" obrigatorio dica="Fica registrado no histórico da OS e no painel da liderança." htmlFor="motivo-fora">
          <textarea id="motivo-fora" className="input" value={motivo} onChange={e => setMotivo(e.target.value)} />
        </Field>
      )}
      {acao.erro && <Alerta tipo="crit">{acao.erro}</Alerta>}
    </Sheet>
  );
}
