import { useState } from 'react';
import { ir } from '../app/nav';
import { filaRodizio, iniciarOS, mecanicoDoRetorno, proximoDaFila, setStatusRodizio } from '../data/api';
import { painelHoje } from '../data/metricas';
import { progresso } from '../domain/checklist';
import { pode } from '../domain/permissions';
import type { OrdemServico, Usuario } from '../domain/types';
import { agora, fmtBRL, fmtHora, primeiroNome } from '../domain/util';
import { Alerta, Badge, Btn, Card, Empty, Field, Kpi, Placa, Sheet, useAcao, useDB } from '../ui/components';
import { nomeServicos, OSCard } from './common';

const ROD_LABEL = { disponivel: 'Disponível', almoco: 'Almoço', ausente: 'Ausente' } as const;

export function Operacao({ u }: { u: Usuario }) {
  const db = useDB();
  const p = painelHoje(db);
  const fila = filaRodizio(db);
  const proximo = proximoDaFila(db);
  const acao = useAcao();
  const [designar, setDesignar] = useState<OrdemServico | null>(null);
  const [busca, setBusca] = useState('');
  const mec = u.role === 'mecanico';
  const minha = mec ? p.andamento.find(o => o.mecanicoId === u.id) : undefined;
  const minhasCorrecoes = mec ? p.correcoesPendentes.filter(c => db.os.find(o => o.id === c.osId)?.mecanicoId === u.id) : [];
  const meuStatus = fila.find(f => f.mecanico.id === u.id);

  const assumir = async (os: OrdemServico) => {
    const ck = await acao.executar(() => iniciarOS(u, os.id, u.id), `OS #${os.numero} iniciada. Comece pelo checklist.`);
    if (ck) ir(`/os/${os.id}/checklist`);
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
          <Kpi rotulo="Concluídas hoje" valor={p.concluidasHoje.length} />
          {pode(u, 'os.ver_valores') ? <Kpi rotulo="Faturado hoje" valor={fmtBRL(p.faturamentoHoje)} dica="Venda inicial + itens do checklist realizados" />
            : <Kpi rotulo="Exceções aguardando" valor={p.excecoesPendentes.length} />}
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
                const ckOk = c && (c.status === 'concluido' || c.status === 'excecao_autorizada');
                return (
                  <div className="stack">
                    <div className="row"><Placa placa={v.placa} /><b>{v.marca} {v.modelo}</b><span className="muted small">OS #{minha.numero} · início {fmtHora(minha.iniciadaEm)}</span></div>
                    <div className="small muted">{nomeServicos(minha)}</div>
                    {pr && <div className="small"><b>{pr.verificados}</b> de {pr.total} itens verificados</div>}
                    {c?.solicitacaoExcecao?.status === 'pendente' && <Alerta tipo="info">Exceção do checklist aguardando a liderança.</Alerta>}
                    {ckOk
                      ? <Btn block onClick={() => ir(`/os/${minha.id}/execucao`)}>Executar e finalizar</Btn>
                      : <Btn block onClick={() => ir(`/os/${minha.id}/checklist`)}>{pr?.verificados ? 'Continuar checklist' : 'Começar checklist'}</Btn>}
                  </div>
                );
              })() : (
                <div className="stack">
                  {proximo?.id === u.id
                    ? <Alerta tipo="ok"><b>É a sua vez no rodízio.</b> Assuma a próxima OS da fila.</Alerta>
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
            </Card>
          )}

          <div className="section-title">Fila de OS aguardando ({p.aguardando.length})</div>
          {p.aguardando.length === 0 && <div className="card"><Empty titulo="Nenhuma OS aguardando." /></div>}
          {p.aguardando.sort((a, b) => a.abertaEm.localeCompare(b.abertaEm)).map(os => {
            const doRet = mecanicoDoRetorno(db, os);
            const podeAssumir = mec && !minha && (doRet ? doRet === u.id : proximo?.id === u.id && meuStatus?.status === 'disponivel');
            return (
              <div key={os.id} style={{ marginBottom: 8 }}>
                <OSCard db={db} os={os} />
                <div className="row" style={{ marginTop: 6, justifyContent: 'flex-end' }}>
                  {doRet && <span className="small muted">Retorno: vai para {primeiroNome(db.usuarios.find(x => x.id === doRet)?.nome)}, fora do rodízio</span>}
                  {mec && podeAssumir && <Btn tamanho="sm" carregando={acao.ocupado} onClick={() => assumir(os)}>Assumir esta OS</Btn>}
                  {!mec && pode(u, 'os.iniciar') && <Btn tamanho="sm" variante="sec" onClick={() => setDesignar(os)}>Designar mecânico</Btn>}
                </div>
              </div>
            );
          })}

          <div className="section-title">Em andamento ({p.andamento.length})</div>
          {p.andamento.length === 0 && <div className="card"><Empty titulo="Nenhuma OS em andamento." /></div>}
          {p.andamento.map(os => <OSCard key={os.id} db={db} os={os} />)}

          <div className="section-title">Concluídas hoje ({p.concluidasHoje.length})</div>
          {p.concluidasHoje.map(os => <OSCard key={os.id} db={db} os={os} />)}
        </div>

        <div>
          <Card titulo="Rodízio" acao={proximo && <Badge tom="info">Vez: {primeiroNome(proximo.nome)}</Badge>}>
            <p className="small muted" style={{ marginBottom: 10 }}>A vez é de quem começou a última OS há mais tempo. Almoço e ausência tiram da fila sem mudar a posição. Retorno vai para o mesmo mecânico.</p>
            <div className="list">
              {fila.map((f, i) => (
                <div className="li" key={f.mecanico.id}>
                  <span className={`fila-pos ${proximo?.id === f.mecanico.id ? 'next' : ''}`}>{i + 1}</span>
                  <div className="grow">
                    <div className="ttl">{f.mecanico.nome}</div>
                    <div className="meta">{f.carrosHoje} carro(s) hoje{f.ultima ? ` · último início ${fmtHora(f.ultima)}` : ''}</div>
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
    </div>
  );
}

function DesignarSheet({ u, os, onClose }: { u: Usuario; os: OrdemServico; onClose: () => void }) {
  const db = useDB();
  const fila = filaRodizio(db).filter(f => !f.ocupado);
  const proximo = proximoDaFila(db);
  const doRet = mecanicoDoRetorno(db, os);
  const sugerido = doRet || proximo?.id || '';
  const [mecId, setMecId] = useState(sugerido);
  const [motivo, setMotivo] = useState('');
  const acao = useAcao();
  const foraDaOrdem = mecId && mecId !== sugerido;
  return (
    <Sheet titulo={`Designar OS #${os.numero}`} sub={doRet ? 'Retorno: o padrão é o mecânico do serviço original.' : 'O padrão é o próximo do rodízio.'} onClose={onClose}
      rodape={<>
        <Btn variante="sec" onClick={onClose}>Cancelar</Btn>
        <Btn carregando={acao.ocupado} disabled={!mecId} onClick={async () => { if (await acao.executar(() => iniciarOS(u, os.id, mecId, motivo), 'OS iniciada.')) onClose(); }}>Iniciar com este mecânico</Btn>
      </>}>
      <Field rotulo="Mecânico" htmlFor="mec-designar">
        <select id="mec-designar" className="input" value={mecId} onChange={e => setMecId(e.target.value)}>
          <option value="">Selecione</option>
          {fila.map(f => <option key={f.mecanico.id} value={f.mecanico.id}>{f.mecanico.nome}{f.mecanico.id === sugerido ? ' (sugerido)' : ''}{f.status !== 'disponivel' ? ` — ${ROD_LABEL[f.status]}` : ''}</option>)}
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
