import { useState } from 'react';
import { ir, useRota } from '../app/nav';
import { cancelarOS, decidirExcecao, definirVisibilidadeFoto, estadoLink, gerarLink, marcarNaoOferecer, nomeDe, projetarRelatorio, registrarCompartilhamento, revogarLink, valoresOS } from '../data/api';
import { ESTADOS, GRUPOS, MOTIVO_PAUSA, SERVICOS } from '../domain/catalogo';
import { fotosAtivasDoItem, progresso } from '../domain/checklist';
import { pode } from '../domain/permissions';
import type { Compartilhamento, OrdemServico, Usuario } from '../domain/types';
import { fmtBRL, fmtData, fmtDataHora, fmtKm, fmtMin, diffMin, primeiroNome } from '../domain/util';
import { Alerta, Badge, Btn, Card, Empty, Field, Placa, Sheet, Tabs, useAcao, useDB, useToast } from '../ui/components';
import { ChecklistBadge, EstadoBadge, STATUS_OS } from './common';
import { AuditoriaSheet } from './Lideranca';
import { rotaTrabalho } from './Operacao';
import { PausarBotao } from './Pausa';

type Aba = 'resumo' | 'checklist' | 'fotos' | 'relatorio' | 'historico';

export function DetalhesOS({ u, osId }: { u: Usuario; osId: string }) {
  const db = useDB();
  const { query } = useRota();
  const os = db.os.find(o => o.id === osId);
  const [aba, setAba] = useState<Aba>('resumo');
  const [cancelar, setCancelar] = useState(false);
  const [naoOf, setNaoOf] = useState(false);
  const [auditar, setAuditar] = useState(false);
  const fotoAcao = useAcao();
  if (!os) return <div className="card"><Empty titulo="OS não encontrada." /></div>;

  const v = db.veiculos.find(x => x.id === os.veiculoId)!;
  const cli = db.clientes.find(x => x.id === os.clienteId);
  const c = db.checklists.find(x => x.id === os.checklistId);
  const pr = c ? progresso(c, db.evidencias) : null;
  const val = valoresOS(os);
  const eventos = db.eventos.filter(e => e.entidadeId === os.id || (c && e.entidadeId === c.id) || db.evidencias.some(x => x.id === e.entidadeId && x.osId === os.id) || db.compartilhamentos.some(s => s.id === e.entidadeId && s.osId === os.id) || db.oportunidades.some(o => o.id === e.entidadeId && o.osId === os.id)).sort((a, b) => b.em.localeCompare(a.em));
  const souExecutor = os.mecanicoId === u.id;
  const origem = os.retornoDeOsId ? db.os.find(o => o.id === os.retornoDeOsId) : undefined;
  const fotos = db.evidencias.filter(e => e.osId === os.id);

  return (
    <div>
      <a className="back" href="#/operacao">‹ Operação</a>
      {query.get('criada') && <div style={{ marginBottom: 12 }}><Alerta tipo="ok">OS #{os.numero} criada e colocada na fila do rodízio.</Alerta></div>}
      <div className="page-head">
        <div>
          <div className="row"><h1>OS #{os.numero}</h1><Badge tom={STATUS_OS[os.status].tom}>{STATUS_OS[os.status].r}</Badge>{os.retornoDeOsId && <Badge tom="critico" icone="↺">Retorno</Badge>}</div>
          <div className="row" style={{ marginTop: 8 }}>
            <a href={`#/veiculos/${v.id}`} style={{ textDecoration: 'none' }}><Placa placa={v.placa} /></a>
            <span className="strong">{v.marca} {v.modelo} {v.ano}</span>
            <span className="small muted">{v.motor} · {v.cambio}</span>
          </div>
        </div>
        <div className="row">
          {souExecutor && os.status === 'andamento' && (() => {
            const ckOk = c?.status === 'concluido' || c?.status === 'excecao_autorizada';
            return <Btn onClick={() => ir(rotaTrabalho(os, ckOk))}>{os.retornoDeOsId ? 'Atendimento do retorno' : ckOk ? 'Executar e finalizar' : 'Abrir checklist'}</Btn>;
          })()}
          <PausarBotao u={u} os={os} />
          {pode(u, 'checklist.auditar') && c && (c.status === 'concluido' || c.status === 'excecao_autorizada') && os.mecanicoId !== u.id && <Btn variante="sec" onClick={() => setAuditar(true)}>Auditar checklist</Btn>}
          {pode(u, 'excecao.declarar') && !os.naoOferecer && os.status !== 'concluido' && cli?.tipo === 'frota' && <Btn variante="sec" onClick={() => setNaoOf(true)}>Marcar “não oferecer”</Btn>}
          {pode(u, 'os.cancelar') && (os.status === 'aguardando' || os.status === 'andamento' || os.status === 'pausada') && <Btn variante="danger" onClick={() => setCancelar(true)}>Cancelar OS</Btn>}
        </div>
      </div>

      {c?.solicitacaoExcecao?.status === 'pendente' && pode(u, 'checklist.autorizar_excecao') && <ExcecaoDecisao u={u} checklistId={c.id} motivo={c.solicitacaoExcecao.motivo} quem={nomeDe(db, c.solicitacaoExcecao.solicitadoPor)} pendentes={pr!.pendentes} />}
      {os.status === 'cancelada' && <div style={{ marginBottom: 12 }}><Alerta tipo="warn">OS cancelada: {os.canceladaMotivo}. Ela continua no histórico.</Alerta></div>}

      <Tabs valor={aba} onChange={setAba} abas={[
        { v: 'resumo', r: 'Resumo' }, { v: 'checklist', r: 'Checklist' }, { v: 'fotos', r: `Fotos (${fotos.filter(f => !f.removida).length})` },
        { v: 'relatorio', r: 'Relatório do cliente' }, { v: 'historico', r: 'Histórico' },
      ]} />

      {aba === 'resumo' && (
        <div className="grid cols2">
          <div>
            <Card titulo="Serviços">
              <table className="tbl">
                <thead><tr><th>Serviço</th><th>Origem</th><th>Status</th>{pode(u, 'os.ver_valores') && <th className="num">Valor</th>}</tr></thead>
                <tbody>
                  {os.servicos.map((s, i) => (
                    <tr key={i}>
                      <td><b>{SERVICOS[s.key].nome}</b><div className="small muted">{[s.marca, s.quantidadeExecutada || s.quantidade ? `${s.quantidadeExecutada || s.quantidade} L` : null, s.codigo, s.intervaloKm ? `próxima em ${s.intervaloKm.toLocaleString('pt-BR')} km ou 6 meses` : null].filter(Boolean).join(' · ')}</div></td>
                      <td>{s.origem === 'checklist' ? <Badge tom="info">Checklist</Badge> : s.origem === 'adicional' ? <Badge tom="info">Adicional</Badge> : <Badge tom="outline">Balcão</Badge>}</td>
                      <td>{s.executado ? <Badge tom="ok">Executado</Badge> : <Badge tom="neutro">Pendente</Badge>}</td>
                      {pode(u, 'os.ver_valores') && <td className="num">{s.valor ? fmtBRL(s.valor) : '—'}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
              {pode(u, 'os.ver_valores') && (
                <div className="row between" style={{ marginTop: 10 }}>
                  <span className="small muted">Venda inicial {fmtBRL(val.inicial)} + itens do checklist {fmtBRL(val.upsell)}</span>
                  <b>{fmtBRL(val.total)}</b>
                </div>
              )}
            </Card>
            {(os.ofertas || []).some(o => o.resultado === 'recusado') && (
              <p className="small muted" style={{ margin: '-4px 0 12px' }}>Adicionais oferecidos e recusados: {os.ofertas!.filter(o => o.resultado === 'recusado').map(o => SERVICOS[o.key].nome).join(', ')}</p>
            )}
            {os.retorno && <RetornoResumo os={os} />}
            {(os.obsCliente || os.obsInterna) && !os.retorno && (
              <Card titulo="Observações">
                {os.obsCliente && <p><b>Para o cliente:</b> {os.obsCliente}</p>}
                {os.obsInterna && <p style={{ marginTop: 6 }}><b>Interna:</b> {os.obsInterna}</p>}
              </Card>
            )}
          </div>
          <div>
            <Card titulo="Dados da OS">
              <dl className="small" style={{ margin: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 12px' }}>
                <dt className="muted">Cliente</dt><dd style={{ margin: 0 }}>{cli?.nome}{cli?.tipo === 'frota' && ' (frota)'}{pode(u, 'cliente.ver_contato') && cli?.telefone ? ` · ${cli.telefone}` : ''}</dd>
                <dt className="muted">Vendedor</dt><dd style={{ margin: 0 }}>{nomeDe(db, os.vendedorId)}</dd>
                <dt className="muted">Mecânico</dt><dd style={{ margin: 0 }}>{os.mecanicoId ? nomeDe(db, os.mecanicoId) : 'Aguardando rodízio'}</dd>
                <dt className="muted">Aberta</dt><dd style={{ margin: 0 }}>{fmtDataHora(os.abertaEm)}</dd>
                {os.iniciadaEm && <><dt className="muted">Início</dt><dd style={{ margin: 0 }}>{fmtDataHora(os.iniciadaEm)}</dd></>}
                {os.concluidaEm && <><dt className="muted">Conclusão</dt><dd style={{ margin: 0 }}>{fmtDataHora(os.concluidaEm)} ({fmtMin(diffMin(os.iniciadaEm!, os.concluidaEm))})</dd></>}
                <dt className="muted">KM</dt><dd style={{ margin: 0 }}>{fmtKm(os.km)}</dd>
                <dt className="muted">Checklist</dt><dd style={{ margin: 0 }}><ChecklistBadge c={c} />{pr && ` ${pr.verificados}/${pr.total}`}</dd>
              </dl>
              {(os.naoFazerTesteFreio || os.naoFazerTesteCambio) && <div style={{ marginTop: 10 }}><Alerta tipo="crit">{[os.naoFazerTesteFreio && 'Freio', os.naoFazerTesteCambio && 'Câmbio'].filter(Boolean).join(' e ')}: NÃO FAZER TESTE — SÓ EXECUTAR</Alerta></div>}
              {os.naoOferecer && <div style={{ marginTop: 10 }}><Alerta tipo="info">Não oferecer serviços (frota). Alinhado com {os.naoOferecer.alinhadoCom}; marcado por {nomeDe(db, os.naoOferecer.marcadoPor)}.</Alerta></div>}
              {os.foraDaOrdem && <div style={{ marginTop: 10 }}><Alerta tipo="info">Assumida fora da ordem prevista{os.foraDaOrdem.previsto ? ` (previsto: ${nomeDe(db, os.foraDaOrdem.previsto)})` : ''}. Motivo: {os.foraDaOrdem.motivo}</Alerta></div>}
              {(os.pausas || []).length > 0 && (
                <div style={{ marginTop: 10 }} className="small">
                  <b>Pausas</b>
                  {os.pausas!.map((p, i) => <div key={i} className="muted">{MOTIVO_PAUSA[p.motivo]}{p.detalhe ? ` — ${p.detalhe}` : ''} · {fmtDataHora(p.inicio)} → {p.fim ? fmtDataHora(p.fim) : 'em pausa'}</div>)}
                </div>
              )}
              {origem && <div style={{ marginTop: 10 }}><Alerta tipo="warn">Retorno da <a href={`#/os/${origem.id}`}>OS #{origem.numero}</a> ({fmtData(origem.concluidaEm)}, {nomeDe(db, origem.mecanicoId)}).</Alerta></div>}
            </Card>
          </div>
        </div>
      )}

      {aba === 'checklist' && (
        !c ? <Card><Empty titulo={os.status === 'aguardando' ? 'O checklist começa quando um mecânico assume a OS.' : os.retornoDeOsId ? 'OS de retorno: o atendimento foca no problema relatado, sem checklist completo (veja o Resumo).' : 'OS registrada antes do checklist existir.'} /></Card> : (
          <div>
            {c.correcaoSolicitada && <div style={{ marginBottom: 12 }}><Alerta tipo={c.correcaoSolicitada.resolvidaEm ? 'ok' : 'warn'}>Correção solicitada por {nomeDe(db, c.correcaoSolicitada.por)}: {c.correcaoSolicitada.motivo}. {c.correcaoSolicitada.resolvidaEm ? `Enviada em ${fmtDataHora(c.correcaoSolicitada.resolvidaEm)}.` : 'Aguardando o mecânico.'}</Alerta></div>}
            {GRUPOS.filter(g => c.defs.some(d => d.grupo === g)).map(g => (
              <div key={g}>
                <div className="section-title">{g}</div>
                <div className="list">
                  {c.defs.filter(d => d.grupo === g).map(d => {
                    const it = c.itens[d.id];
                    return (
                      <div key={d.id} className="li">
                        <div className="grow">
                          <div className="ttl">{d.nome}</div>
                          <div className="meta">
                            {[it.recomendacao, it.justificativa && `Não se aplica: ${it.justificativa}`, it.observacao, fotosAtivasDoItem(it, db.evidencias) ? `${fotosAtivasDoItem(it, db.evidencias)} foto(s)` : null, it.historico.length > 1 ? `alterado ${it.historico.length - 1}x` : null].filter(Boolean).join(' · ')}
                          </div>
                        </div>
                        <EstadoBadge estado={it.estado} />
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {aba === 'fotos' && (
        fotos.length === 0 ? <Card><Empty titulo="Nenhuma foto nesta OS." /></Card> : (
          <div className="gallery">
            {fotos.map(f => (
              <figure key={f.id} style={f.removida ? { opacity: .45 } : undefined}>
                <img src={f.url} alt={f.legenda || 'Foto do item'} />
                <figcaption><b>{f.itemDefId === 'retorno' ? `Retorno — ${f.etapa === 'antes' ? 'problema' : 'solução'}` : c?.defs.find(d => d.id === f.itemDefId)?.nome}</b><br />{f.legenda}{f.removida ? ` · Removida: ${f.removida.motivo}` : ''}<br /><span className="muted">{primeiroNome(nomeDe(db, f.capturadaPor))} · {fmtDataHora(f.em)}{f.demo ? ' · demonstrativa' : ''}</span>
                  {!f.removida && <><br />{f.visivelCliente ? <Badge tom="outline">Aparece para o cliente</Badge> : <Badge tom="neutro">Oculta do cliente</Badge>}</>}
                  {!f.removida && pode(u, 'relatorio.revogar') && <div style={{ marginTop: 6 }}><Btn tamanho="sm" variante="sec" carregando={fotoAcao.ocupado} onClick={() => fotoAcao.executar(() => definirVisibilidadeFoto(u, f.id, !f.visivelCliente), f.visivelCliente ? 'Foto oculta do relatório do cliente.' : 'Foto volta a aparecer no relatório.')}>{f.visivelCliente ? 'Ocultar do cliente' : 'Mostrar ao cliente'}</Btn></div>}
                </figcaption>
              </figure>
            ))}
          </div>
        )
      )}

      {aba === 'relatorio' && <RelatorioInterno u={u} os={os} />}

      {aba === 'historico' && (
        <Card titulo="Quem fez o quê">
          {eventos.length === 0 ? <Empty titulo="Sem eventos registrados nesta demonstração." /> : (
            <div className="tl">
              {eventos.map(e => (
                <div key={e.id} className="tl-item">
                  <div className="small muted">{fmtDataHora(e.em)} · {nomeDe(db, e.por)}</div>
                  <div>{e.resumo}</div>
                  {e.motivo && <div className="small muted">Motivo: {e.motivo}</div>}
                </div>
              ))}
            </div>
          )}
          <p className="tiny muted" style={{ marginTop: 8 }}>Registros da base de demonstração anteriores à sessão não têm trilha detalhada; ações feitas agora aparecem aqui.</p>
        </Card>
      )}

      {cancelar && <CancelarSheet u={u} os={os} onClose={() => setCancelar(false)} />}
      {naoOf && <NaoOferecerSheet u={u} os={os} onClose={() => setNaoOf(false)} />}
      {auditar && c && <AuditoriaSheet u={u} checklistId={c.id} onClose={() => setAuditar(false)} />}
    </div>
  );
}

function ExcecaoDecisao({ u, checklistId, motivo, quem, pendentes }: { u: Usuario; checklistId: string; motivo: string; quem: string; pendentes: number }) {
  const [obs, setObs] = useState('');
  const acao = useAcao();
  return (
    <div style={{ marginBottom: 12 }}>
      <Alerta tipo="warn">
        <b>{quem} pediu exceção do checklist</b> com {pendentes} item(ns) pendente(s): “{motivo}”.
        <input className="input" style={{ marginTop: 8 }} aria-label="Observação da decisão" placeholder="Observação (opcional)" value={obs} onChange={e => setObs(e.target.value)} />
        <div className="row" style={{ marginTop: 8 }}>
          <Btn tamanho="sm" carregando={acao.ocupado} onClick={() => acao.executar(() => decidirExcecao(u, checklistId, true, obs), 'Exceção autorizada. Não conta como checklist completo.')}>Autorizar exceção</Btn>
          <Btn tamanho="sm" variante="danger" carregando={acao.ocupado} onClick={() => acao.executar(() => decidirExcecao(u, checklistId, false, obs), 'Exceção negada. O mecânico precisa completar.')}>Negar</Btn>
        </div>
      </Alerta>
    </div>
  );
}

function CancelarSheet({ u, os, onClose }: { u: Usuario; os: OrdemServico; onClose: () => void }) {
  const [motivo, setMotivo] = useState('');
  const acao = useAcao();
  return (
    <Sheet titulo={`Cancelar OS #${os.numero}`} sub="A OS não é apagada: fica no histórico como cancelada, com o motivo." onClose={onClose}
      rodape={<><Btn variante="sec" onClick={onClose}>Voltar</Btn><Btn variante="danger" carregando={acao.ocupado} onClick={async () => { if ((await acao.executar(() => cancelarOS(u, os.id, motivo), 'OS cancelada.')) !== undefined) onClose(); }}>Confirmar cancelamento</Btn></>}>
      <Field rotulo="Motivo" obrigatorio htmlFor="motivo-canc" erro={acao.erro}><textarea id="motivo-canc" className="input" value={motivo} onChange={e => setMotivo(e.target.value)} /></Field>
    </Sheet>
  );
}

function NaoOferecerSheet({ u, os, onClose }: { u: Usuario; os: OrdemServico; onClose: () => void }) {
  const [com, setCom] = useState('');
  const acao = useAcao();
  return (
    <Sheet titulo="Não oferecer serviços" sub="Só para locação/frota (Playbook). O checklist continua obrigatório; recomendações ficam registradas sem oferta." onClose={onClose}
      rodape={<><Btn variante="sec" onClick={onClose}>Voltar</Btn><Btn carregando={acao.ocupado} onClick={async () => { if ((await acao.executar(() => marcarNaoOferecer(u, os.id, com), 'Marcado como não oferecer.')) !== undefined) onClose(); }}>Confirmar</Btn></>}>
      <Field rotulo="Alinhado com quem no comercial?" obrigatorio htmlFor="alinhado" erro={acao.erro}><input id="alinhado" className="input" value={com} onChange={e => setCom(e.target.value)} placeholder="Ex.: Helena (comercial)" /></Field>
    </Sheet>
  );
}

const ESTADO_LINK: Record<string, { r: string; tom: 'ok' | 'muted' | 'critico' | 'info' | 'atencao' }> = {
  ativo: { r: 'Compartilhado', tom: 'ok' }, expirado: { r: 'Expirado', tom: 'muted' }, revogado: { r: 'Revogado', tom: 'critico' },
};

function RelatorioInterno({ u, os }: { u: Usuario; os: OrdemServico }) {
  const db = useDB();
  const acao = useAcao();
  const toast = useToast();
  const [dias, setDias] = useState(30);
  const [revogar, setRevogar] = useState<Compartilhamento | null>(null);
  const links = db.compartilhamentos.filter(s => s.osId === os.id).sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
  const ativo = links.find(s => estadoLink(s) === 'ativo');
  const rel = os.status === 'concluido' ? projetarRelatorio(db, os) : null;
  const estado = os.status !== 'concluido' ? 'Em preparação' : rel?.atualizadoEm ? 'Atualizado após a conclusão' : ativo ? 'Compartilhado' : 'Pronto para enviar';
  const url = (t: string) => `${location.origin}${location.pathname}#/r/${t}`;
  const cli = db.clientes.find(c => c.id === os.clienteId);

  const copiar = async (t: string, id: string) => {
    try { await navigator.clipboard.writeText(url(t)); toast({ texto: 'Link copiado.', tipo: 'ok' }); } catch { toast({ texto: 'Não foi possível copiar automaticamente. Selecione o link e copie.', tipo: 'info' }); }
    void registrarCompartilhamento(u, id, 'copiar');
  };

  return (
    <div className="grid cols2">
      <div>
        <Card titulo="Estado do relatório" acao={<Badge tom={os.status !== 'concluido' ? 'neutro' : rel?.atualizadoEm ? 'atencao' : ativo ? 'ok' : 'info'}>{estado}</Badge>}>
          {os.status !== 'concluido'
            ? <p className="small muted">O relatório fica pronto quando a OS é concluída. Ele mostra itens verificados, fotos, serviços feitos e próximas manutenções — sem valores, telefone ou notas internas.</p>
            : <>
              <p className="small muted" style={{ marginBottom: 10 }}>O link é imprevisível, só leitura, e pode expirar ou ser revogado a qualquer momento. Não dá acesso a nenhuma outra OS.</p>
              {rel?.atualizadoEm && <div style={{ marginBottom: 10 }}><Alerta tipo="warn">Um item do checklist foi corrigido depois da conclusão ({fmtDataHora(rel.atualizadoEm)}). O relatório mostra a versão atual e avisa o cliente.</Alerta></div>}
              {pode(u, 'relatorio.gerar_link') && (
                <div className="row">
                  <select className="input" style={{ width: 'auto' }} aria-label="Validade do link" value={dias} onChange={e => setDias(Number(e.target.value))}>
                    <option value={7}>Válido por 7 dias</option><option value={30}>Válido por 30 dias</option><option value={90}>Válido por 90 dias</option>
                  </select>
                  <Btn carregando={acao.ocupado} onClick={() => acao.executar(() => gerarLink(u, os.id, dias), 'Link criado.')}>{ativo ? 'Gerar novo link' : 'Gerar link do relatório'}</Btn>
                </div>
              )}
            </>}
        </Card>
        {links.length > 0 && (
          <Card titulo="Links criados">
            <div className="list">
              {links.map(s => {
                const st = estadoLink(s);
                return (
                  <div key={s.id} className="li" style={{ flexWrap: 'wrap' }}>
                    <div className="grow">
                      <div className="row"><Badge tom={ESTADO_LINK[st].tom}>{ESTADO_LINK[st].r}</Badge><span className="small muted">{s.acessos} acesso(s){s.ultimoAcessoEm ? `, último ${fmtDataHora(s.ultimoAcessoEm)}` : ''}</span></div>
                      <div className="small muted" style={{ marginTop: 4 }}>Criado por {primeiroNome(nomeDe(db, s.criadoPor))} em {fmtDataHora(s.criadoEm)}{s.expiraEm ? ` · expira ${fmtData(s.expiraEm)}` : ''}</div>
                      {s.revogadoEm && <div className="small muted">Revogado por {primeiroNome(nomeDe(db, s.revogadoPor))}: {s.motivoRevogacao || 'sem motivo'}</div>}
                      {st === 'ativo' && <code className="tiny" style={{ wordBreak: 'break-all', display: 'block', marginTop: 4 }}>{url(s.token)}</code>}
                    </div>
                    {st === 'ativo' && (
                      <div className="row">
                        <Btn tamanho="sm" variante="sec" onClick={() => copiar(s.token, s.id)}>Copiar</Btn>
                        <a className="btn sm sec" target="_blank" rel="noreferrer" onClick={() => void registrarCompartilhamento(u, s.id, 'whatsapp')}
                          href={`https://wa.me/?text=${encodeURIComponent(`Olá${cli ? `, ${primeiroNome(cli.nome)}` : ''}! Segue o relatório da revisão do seu veículo na Master Óleo: ${url(s.token)}`)}`}>WhatsApp</a>
                        <a className="btn sm ghost" href={`#/r/${s.token}`}>Abrir</a>
                        {pode(u, 'relatorio.revogar') && <Btn tamanho="sm" variante="danger" onClick={() => setRevogar(s)}>Revogar</Btn>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="tiny muted" style={{ marginTop: 8 }}>O botão WhatsApp só abre o aplicativo com a mensagem pronta; nada é enviado automaticamente.</p>
          </Card>
        )}
      </div>
      <div>
        <Card titulo="O que o cliente vê">
          {!rel ? <Empty titulo="Disponível após a conclusão." /> : (
            <div className="small">
              <p><b>{rel.veiculo.marca} {rel.veiculo.modelo}</b> · {rel.veiculo.placa} · {fmtKm(rel.km)}</p>
              <p className="muted">Técnico: {rel.tecnico} · {fmtData(rel.data)}</p>
              <div className="divider" />
              <p><b>{rel.itens.length}</b> itens inspecionados · <b>{rel.itens.filter(i => i.estado === 'atencao' || i.estado === 'prioritario').length}</b> com recomendação · <b>{rel.fotos.length}</b> foto(s)</p>
              {rel.itens.filter(i => i.estado === 'atencao' || i.estado === 'prioritario').map(i => <p key={i.nome} style={{ marginTop: 4 }}>{ESTADOS[i.estado].icone} {i.nome}: {ESTADOS[i.estado].cliente}</p>)}
              <div className="divider" />
              <p className="muted tiny">Não aparece: valores, telefone, CPF, notas internas, metas, ocorrências, nome completo do mecânico.</p>
            </div>
          )}
        </Card>
      </div>
      {revogar && (
        <Sheet titulo="Revogar link" sub="Quem abrir o link verá que ele não está mais disponível. Não dá para desfazer; gere um novo se precisar." onClose={() => setRevogar(null)}
          rodape={<><Btn variante="sec" onClick={() => setRevogar(null)}>Voltar</Btn><Btn variante="danger" carregando={acao.ocupado} onClick={async () => { const m = (document.getElementById('motivo-rev') as HTMLInputElement).value; if ((await acao.executar(() => revogarLink(u, revogar.id, m), 'Link revogado.')) !== undefined) setRevogar(null); }}>Revogar</Btn></>}>
          <Field rotulo="Motivo" htmlFor="motivo-rev"><input id="motivo-rev" className="input" placeholder="Ex.: enviado para o contato errado" /></Field>
        </Sheet>
      )}
    </div>
  );
}

const RELACAO = { sim: 'Sim, relacionado ao serviço anterior', nao: 'Não relacionado', nao_identificado: 'Não foi possível identificar' } as const;

function RetornoResumo({ os }: { os: OrdemServico }) {
  const db = useDB();
  const r = os.retorno!;
  const fotos = db.evidencias.filter(e => e.osId === os.id && e.itemDefId === 'retorno' && !e.removida);
  const Galeria = ({ etapa }: { etapa: 'antes' | 'depois' }) => {
    const fs = fotos.filter(f => f.etapa === etapa);
    return fs.length ? <div className="gallery">{fs.map(f => <figure key={f.id}><img src={f.url} alt={f.legenda || etapa} /><figcaption>{f.legenda}</figcaption></figure>)}</div> : <p className="small muted">Sem foto.</p>;
  };
  return (
    <Card titulo="Atendimento do retorno">
      <p><b>Problema relatado:</b> {r.problemaRelatado}</p>
      {r.diagnostico && <p style={{ marginTop: 6 }}><b>Diagnóstico (interno):</b> {r.diagnostico}</p>}
      {r.relacaoServicoAnterior && <p style={{ marginTop: 6 }}><b>Relação com o serviço anterior:</b> {RELACAO[r.relacaoServicoAnterior]}</p>}
      {r.solucao && <p style={{ marginTop: 6 }}><b>O que foi feito:</b> {r.solucao}</p>}
      {r.avisoCliente && <p style={{ marginTop: 6 }}><b>Avisado ao cliente:</b> {r.avisoCliente}</p>}
      <div className="ba-grid" style={{ marginTop: 10 }}>
        <div><div className="small strong">Antes</div><Galeria etapa="antes" /></div>
        <div><div className="small strong">Depois</div>{r.semFotoDepois && !fotos.some(f => f.etapa === 'depois') ? <p className="small muted">Sem foto: {r.semFotoDepois}</p> : <Galeria etapa="depois" />}</div>
      </div>
    </Card>
  );
}
