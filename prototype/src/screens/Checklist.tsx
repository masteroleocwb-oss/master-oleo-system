import { useEffect, useRef, useState } from 'react';
import { ir } from '../app/nav';
import { adicionarEvidencia, concluirChecklist, enviarCorrecao, registrarItemChecklist, removerEvidencia, solicitarExcecao } from '../data/api';
import { ESTADOS, ESTADOS_ORDEM, GRUPOS } from '../domain/catalogo';
import { fotosAtivasDoItem, pendenciasParaConcluir, progresso, validarItem, type DadosItem } from '../domain/checklist';
import type { Checklist as TChecklist, DB, EstadoItem, ItemInspecaoDef, Usuario } from '../domain/types';
import { fmtDataHora, primeiroNome } from '../domain/util';
import { Alerta, Badge, Btn, Empty, Field, Placa, Progress, SaveIndicator, Segmented, Sheet, useAcao, useDB, type SaveState } from '../ui/components';
import { PhotoCapture } from '../ui/PhotoCapture';
import { EstadoBadge } from './common';

type Modo = 'lista' | 'compacto';

export function Checklist({ u, osId, foco }: { u: Usuario; osId: string; foco: string | null }) {
  const db = useDB();
  const os = db.os.find(o => o.id === osId);
  const c = os && db.checklists.find(x => x.id === os.checklistId);
  const [modo, setModo] = useState<Modo>(() => (localStorage.getItem('mo-proto:modo-ck') as Modo) || 'lista');
  const [aberto, setAberto] = useState<string | null>(foco);
  const [soPendentes, setSoPendentes] = useState(false);
  const [destaque, setDestaque] = useState<string[]>([]);
  const [excecao, setExcecao] = useState(false);
  const acao = useAcao();

  useEffect(() => { try { localStorage.setItem('mo-proto:modo-ck', modo); } catch { /* ignora */ } }, [modo]);
  useEffect(() => { if (foco) setTimeout(() => document.getElementById(`item-${foco}`)?.scrollIntoView({ block: 'center' }), 50); }, [foco]);

  if (!os || !c) return <div className="card"><Empty titulo="Checklist não encontrado." /></div>;
  const v = db.veiculos.find(x => x.id === os.veiculoId)!;
  const souExecutor = os.mecanicoId === u.id;
  const correcao = c.correcaoSolicitada && !c.correcaoSolicitada.resolvidaEm ? c.correcaoSolicitada : undefined;
  const fechado = c.status === 'concluido' || c.status === 'excecao_autorizada';
  const editavel = (defId: string) => souExecutor && (!fechado || !!correcao?.itens.includes(defId));
  const pr = progresso(c, db.evidencias);
  const pend = pendenciasParaConcluir(c, db.evidencias);
  const excPendente = c.solicitacaoExcecao?.status === 'pendente';

  const concluir = async () => {
    if (pend.length) {
      setDestaque(pend.map(p => p.defId));
      setAberto(pend[0].defId);
      setTimeout(() => document.getElementById(`item-${pend[0].defId}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 50);
      return;
    }
    if (await acao.executar(() => concluirChecklist(u, c.id), 'Checklist concluído. Agora a execução do serviço.')) ir(`/os/${os.id}/execucao`);
  };

  const defs = c.defs.filter(d => !soPendentes || c.itens[d.id].estado === 'nao_verificado' || destaque.includes(d.id));
  const grupos = GRUPOS.filter(g => defs.some(d => d.grupo === g));

  return (
    <div style={{ maxWidth: 820 }}>
      <a className="back" href={`#/os/${os.id}`}>‹ OS #{os.numero}</a>
      <div className="page-head">
        <div>
          <h1>Checklist técnico</h1>
          <div className="row" style={{ marginTop: 6 }}><Placa placa={v.placa} /><span className="strong">{v.marca} {v.modelo} {v.ano}</span><span className="small muted">câmbio {v.cambio}</span></div>
        </div>
        <Segmented rotulo="Modo de visualização" valor={modo} onChange={setModo} opcoes={[{ v: 'lista', r: 'Lista' }, { v: 'compacto', r: 'Compacto' }]} />
      </div>

      {(os.naoFazerTesteFreio || os.naoFazerTesteCambio) && (
        <div style={{ marginBottom: 10 }}><Alerta tipo="crit" icone="!"><b>{[os.naoFazerTesteFreio && 'FREIO', os.naoFazerTesteCambio && 'CÂMBIO'].filter(Boolean).join(' E ')}: NÃO FAZER TESTE — SÓ EXECUTAR.</b> Registre o aspecto visual, sem teste.</Alerta></div>
      )}
      {os.retornoDeOsId && <div style={{ marginBottom: 10 }}><Alerta tipo="warn">Retorno de serviço. {os.obsInterna}</Alerta></div>}
      {os.naoOferecer && <div style={{ marginBottom: 10 }}><Alerta tipo="info">Frota com instrução de <b>não oferecer</b> serviços (alinhado com {os.naoOferecer.alinhadoCom}). Faça o checklist normalmente: as recomendações ficam registradas, sem oferta.</Alerta></div>}
      {!souExecutor && <div style={{ marginBottom: 10 }}><Alerta tipo="info">Somente leitura: este checklist é de {primeiroNome(db.usuarios.find(x => x.id === os.mecanicoId)?.nome)}.</Alerta></div>}
      {correcao && (
        <div style={{ marginBottom: 10 }}><Alerta tipo="warn"><b>Correção solicitada pela liderança</b> em {fmtDataHora(correcao.em)}: {correcao.motivo}. Revise os itens destacados. O registro anterior fica guardado no histórico.</Alerta></div>
      )}
      {c.status === 'excecao_autorizada' && <div style={{ marginBottom: 10 }}><Alerta tipo="warn">Checklist fechado por <b>exceção autorizada</b> por {primeiroNome(db.usuarios.find(x => x.id === c.solicitacaoExcecao?.decididoPor)?.nome)}: {c.solicitacaoExcecao?.motivo}. Não conta como completo.</Alerta></div>}
      {excPendente && <div style={{ marginBottom: 10 }}><Alerta tipo="info">Exceção solicitada: “{c.solicitacaoExcecao!.motivo}”. Aguardando a liderança. Você pode continuar preenchendo os itens.</Alerta></div>}

      <div className="ck-progress">
        <div className="row between nowrap" style={{ marginBottom: 6 }}>
          <span className="strong" style={{ color: 'var(--navy)' }}>{pr.verificados} de {pr.total} itens verificados</span>
          <span className="strong">{pr.pct}%</span>
        </div>
        <Progress valor={pr.pct} grande tom={pr.pct === 100 ? 'ok' : undefined} rotulo="Progresso do checklist" />
        <div className="ck-stats">
          <span><b>{pr.pendentes}</b> a verificar</span>
          <span><b>{pr.comRecomendacao}</b> com recomendação</span>
          <span><b>{pr.comFoto}</b> com foto</span>
          <label className="row" style={{ gap: 6, cursor: 'pointer' }}><input type="checkbox" checked={soPendentes} onChange={e => setSoPendentes(e.target.checked)} /> Só pendentes</label>
        </div>
      </div>

      {grupos.map(g => {
        const ds = defs.filter(d => d.grupo === g);
        const ok = ds.filter(d => c.itens[d.id].estado !== 'nao_verificado').length;
        return (
          <section className="ck-group" key={g}>
            <h3><span>{g}</span><span>{ok}/{ds.length}</span></h3>
            {modo === 'lista'
              ? ds.map(d => (
                <ItemLinha key={d.id} db={db} c={c} def={d} aberto={aberto === d.id} onToggle={() => setAberto(aberto === d.id ? null : d.id)}
                  destaque={destaque.includes(d.id)} emCorrecao={!!correcao?.itens.includes(d.id)} editavel={editavel(d.id)} u={u}
                  onSalvo={() => {
                    setDestaque(x => x.filter(y => y !== d.id));
                    const idx = c.defs.findIndex(x => x.id === d.id);
                    const prox = c.defs.slice(idx + 1).find(x => c.itens[x.id].estado === 'nao_verificado' && x.id !== d.id);
                    setAberto(prox?.id || null);
                  }} />
              ))
              : (
                <div className="list ck-compact">
                  {ds.map(d => {
                    const it = c.itens[d.id];
                    const fotos = fotosAtivasDoItem(it, db.evidencias);
                    return (
                      <button key={d.id} id={`item-${d.id}`} className="li" onClick={() => setAberto(d.id)} style={destaque.includes(d.id) ? { background: 'var(--crit-50)' } : correcao?.itens.includes(d.id) ? { background: 'var(--warn-50)' } : undefined}>
                        <div className="grow"><div className="ttl">{d.nome}</div>{fotos > 0 && <div className="meta">{fotos} foto(s)</div>}</div>
                        <EstadoBadge estado={it.estado} /><span className="chev">›</span>
                      </button>
                    );
                  })}
                </div>
              )}
          </section>
        );
      })}

      {modo === 'compacto' && aberto && (() => {
        const d = c.defs.find(x => x.id === aberto)!;
        return (
          <Sheet titulo={d.nome} sub={d.grupo} onClose={() => setAberto(null)}>
            <ItemEditor db={db} c={c} def={d} u={u} editavel={editavel(d.id)} emCorrecao={!!correcao?.itens.includes(d.id)}
              onSalvo={() => {
                setDestaque(x => x.filter(y => y !== d.id));
                const idx = c.defs.findIndex(x => x.id === d.id);
                setAberto(c.defs.slice(idx + 1).find(x => c.itens[x.id].estado === 'nao_verificado')?.id || null);
              }} />
          </Sheet>
        );
      })()}

      {souExecutor && (
        <div className="card" style={{ marginTop: 20 }}>
          {correcao ? (
            <>
              <p className="small muted" style={{ marginBottom: 10 }}>Depois de revisar os itens indicados, envie a correção para a liderança.</p>
              <Btn block carregando={acao.ocupado} onClick={() => acao.executar(() => enviarCorrecao(u, c.id), 'Correção enviada para a liderança.')}>Enviar correção</Btn>
            </>
          ) : fechado ? (
            <Btn block onClick={() => ir(`/os/${os.id}/execucao`)}>{os.status === 'andamento' ? 'Ir para a execução' : 'Ver OS'}</Btn>
          ) : (
            <>
              {destaque.length > 0 && pend.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <Alerta tipo="crit">
                    <b>Faltam {pend.length} pendência(s) para concluir:</b>
                    <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                      {pend.slice(0, 8).map(p => <li key={p.defId + p.motivo}><a href={`#/os/${os.id}/checklist?item=${p.defId}`} onClick={e => { e.preventDefault(); setAberto(p.defId); document.getElementById(`item-${p.defId}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }); }}>{p.nome}</a> — {p.motivo}</li>)}
                    </ul>
                  </Alerta>
                </div>
              )}
              <Btn block carregando={acao.ocupado} onClick={concluir}>Concluir checklist</Btn>
              {pend.length > 0 && !excPendente && (
                <div style={{ marginTop: 8, textAlign: 'center' }}>
                  <Btn variante="ghost" tamanho="sm" onClick={() => setExcecao(true)}>Não consigo completar — pedir exceção à liderança</Btn>
                </div>
              )}
            </>
          )}
        </div>
      )}
      {excecao && <ExcecaoSheet u={u} c={c} pendentes={pend.length} onClose={() => setExcecao(false)} />}
    </div>
  );
}

function ExcecaoSheet({ u, c, pendentes, onClose }: { u: Usuario; c: TChecklist; pendentes: number; onClose: () => void }) {
  const [motivo, setMotivo] = useState('');
  const acao = useAcao();
  return (
    <Sheet titulo="Pedir exceção do checklist" sub={`${pendentes} item(ns) pendente(s). A liderança decide; exceção não conta como checklist completo.`} onClose={onClose}
      rodape={<><Btn variante="sec" onClick={onClose}>Voltar</Btn><Btn carregando={acao.ocupado} onClick={async () => { if ((await acao.executar(() => solicitarExcecao(u, c.id, motivo), 'Pedido enviado à liderança.')) !== undefined) onClose(); }}>Enviar pedido</Btn></>}>
      <Field rotulo="O que impediu de completar?" obrigatorio htmlFor="motivo-exc" erro={acao.erro}>
        <textarea id="motivo-exc" className="input" value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Ex.: cliente precisou sair antes de subir o carro no elevador" />
      </Field>
    </Sheet>
  );
}

function ItemLinha(p: { db: DB; c: TChecklist; def: ItemInspecaoDef; aberto: boolean; onToggle: () => void; destaque: boolean; emCorrecao: boolean; editavel: boolean; u: Usuario; onSalvo: () => void }) {
  const it = p.c.itens[p.def.id];
  // Depois de aberto, o editor continua montado (só escondido): recolher não perde uma escolha ainda não salva.
  const [montar, setMontar] = useState(p.aberto);
  useEffect(() => { if (p.aberto) setMontar(true); }, [p.aberto]);
  const fotos = fotosAtivasDoItem(it, p.db.evidencias);
  const cls = ['ck-item', it.estado === 'nao_verificado' ? 'pend' : '', p.destaque ? 'hl' : '', p.emCorrecao ? 'corr' : ''].join(' ');
  return (
    <div className={cls} id={`item-${p.def.id}`} data-item={p.def.id}>
      <button className="ck-head" onClick={p.onToggle} aria-expanded={p.aberto}>
        <span className="nm">{p.def.nome}<small>{it.estado !== 'nao_verificado' ? `${fotos ? `${fotos} foto(s) · ` : ''}${it.registradoEm ? `registrado ${fmtDataHora(it.registradoEm).slice(-5)}` : ''}` : p.def.fotoObrigatoriaEm.length ? 'Foto obrigatória em ' + p.def.fotoObrigatoriaEm.map(e => ESTADOS[e].curto).join(' / ') : 'Sem foto obrigatória'}</small></span>
        {p.emCorrecao && <Badge tom="atencao">Corrigir</Badge>}
        <EstadoBadge estado={it.estado} />
        <span className="chev" aria-hidden>{p.aberto ? '⌃' : '⌄'}</span>
      </button>
      {(p.aberto || montar) && <div className="ck-body" hidden={!p.aberto}><ItemEditor db={p.db} c={p.c} def={p.def} u={p.u} editavel={p.editavel} emCorrecao={p.emCorrecao} onSalvo={p.onSalvo} /></div>}
    </div>
  );
}

function ItemEditor({ db, c, def, u, editavel, emCorrecao, onSalvo }: { db: DB; c: TChecklist; def: ItemInspecaoDef; u: Usuario; editavel: boolean; emCorrecao: boolean; onSalvo: () => void }) {
  const it = c.itens[def.id];
  const [estado, setEstado] = useState<EstadoItem>(it.estado);
  const [dados, setDados] = useState<DadosItem>({ observacao: it.observacao, justificativa: it.justificativa, recomendacao: it.recomendacao });
  const [save, setSave] = useState<SaveState>('ocioso');
  const [camera, setCamera] = useState(false);
  const [erros, setErros] = useState<string[]>([]);
  const acao = useAcao();
  const fotoAcao = useAcao();
  const montado = useRef(true);
  useEffect(() => { montado.current = true; return () => { montado.current = false; }; }, []);

  const evs = db.evidencias.filter(e => it.evidenciaIds.includes(e.id));
  const ativas = fotosAtivasDoItem(it, db.evidencias);
  const precisaFoto = estado !== 'nao_verificado' && def.fotoObrigatoriaEm.includes(estado);
  const precisaTexto = estado === 'nao_aplicavel' || estado === 'pendente_avaliacao' || estado === 'atencao' || estado === 'prioritario';
  const mudou = estado !== it.estado || (dados.observacao || '') !== (it.observacao || '') || (dados.justificativa || '') !== (it.justificativa || '') || (dados.recomendacao || '') !== (it.recomendacao || '');

  const salvar = async (e = estado, d = dados) => {
    const errs = validarItem(def, e, d, ativas);
    setErros(errs);
    if (errs.length) { setSave('pendente'); return; }
    setSave('salvando');
    const r = await acao.executar(() => registrarItemChecklist(u, c.id, def.id, e, d).then(() => true));
    if (!montado.current) return;
    setSave(r ? 'salvo' : 'falha');
    if (r) onSalvo();
  };

  const escolher = (e: EstadoItem) => {
    setEstado(e); setErros([]);
    // Menos toques: OK sem foto exigida salva na hora.
    const simples = e === 'ok' && !def.fotoObrigatoriaEm.includes('ok');
    if (simples && editavel) void salvar(e, { observacao: dados.observacao });
    else setSave('pendente');
  };

  return (
    <div>
      <div className="ck-instr"><b>Como verificar:</b> {def.instrucao}</div>
      <div className="estados" role="radiogroup" aria-label={`Condição de ${def.nome}`}>
        {ESTADOS_ORDEM.filter(e => def.estadosPermitidos.includes(e)).map(e => (
          <button key={e} role="radio" aria-checked={estado === e} disabled={!editavel} className={`estado-btn ${ESTADOS[e].tom} ${estado === e ? 'on' : ''}`} onClick={() => escolher(e)} data-estado={e}>
            <span className="ic" aria-hidden>{ESTADOS[e].icone}</span>{ESTADOS[e].curto}
          </button>
        ))}
      </div>

      {estado === 'nao_aplicavel' && (
        <Field rotulo="Por que não se aplica?" obrigatorio htmlFor={`just-${def.id}`}>
          <input id={`just-${def.id}`} className="input" disabled={!editavel} value={dados.justificativa || ''} onChange={e => setDados({ ...dados, justificativa: e.target.value })} placeholder="Ex.: veículo sem diferencial" />
        </Field>
      )}
      {(estado === 'atencao' || estado === 'prioritario') && def.permiteRecomendacao && (
        <Field rotulo="Recomendação ao cliente" dica="Vai para o comercial e para o relatório do cliente." htmlFor={`rec-${def.id}`}>
          <input id={`rec-${def.id}`} className="input" disabled={!editavel} value={dados.recomendacao || ''} onChange={e => setDados({ ...dados, recomendacao: e.target.value })} placeholder={`Ex.: trocar ${def.nome.toLowerCase()}`} />
        </Field>
      )}
      {(precisaTexto || dados.observacao) && (
        <Field rotulo={estado === 'pendente_avaliacao' ? 'O que impediu a avaliação?' : 'Observação técnica (interna)'} obrigatorio={estado === 'pendente_avaliacao'} htmlFor={`obs-${def.id}`}>
          <input id={`obs-${def.id}`} className="input" disabled={!editavel} value={dados.observacao || ''} onChange={e => setDados({ ...dados, observacao: e.target.value })} />
        </Field>
      )}

      <div className="field">
        <span className="lbl">Fotos {precisaFoto && <Badge tom={ativas ? 'ok' : 'critico'}>{ativas ? 'Foto obrigatória ✓' : 'Foto obrigatória'}</Badge>}</span>
        <div className="fotos">
          {evs.map(e => (
            <div key={e.id} className={`foto ${e.removida ? 'removida' : ''}`}>
              <img src={e.url} alt={e.legenda || `Foto de ${def.nome}`} />
              {!e.removida && editavel && <button className="rm" aria-label="Remover foto" onClick={() => fotoAcao.executar(() => removerEvidencia(u, e.id, 'Substituída pelo mecânico'), 'Foto removida (fica no histórico).')}>×</button>}
              <div className="cap">{e.removida ? 'Removida' : e.legenda || (e.demo ? 'Demonstrativa' : '')}</div>
            </div>
          ))}
          {editavel && <button className="foto-add" onClick={() => setCamera(true)}><span style={{ fontSize: 20 }}>+</span>Foto</button>}
        </div>
      </div>

      {erros.length > 0 && <div style={{ marginTop: 10 }}><Alerta tipo="crit">{erros.join(' ')}</Alerta></div>}

      {editavel && (
        <div className="row between" style={{ marginTop: 12 }}>
          <SaveIndicator estado={save === 'ocioso' && mudou ? 'pendente' : save} />
          {(mudou || save === 'falha' || save === 'pendente') && estado !== 'nao_verificado' && (
            <Btn carregando={acao.ocupado} onClick={() => salvar()}>{save === 'falha' ? 'Tentar salvar de novo' : emCorrecao ? 'Salvar correção' : 'Salvar item'}</Btn>
          )}
        </div>
      )}

      {it.historico.length > 1 && (
        <details style={{ marginTop: 12 }}>
          <summary className="small strong" style={{ cursor: 'pointer' }}>Histórico do item ({it.historico.length} registros)</summary>
          <ul className="small" style={{ margin: '6px 0 0', paddingLeft: 18 }}>
            {it.historico.map((h, i) => <li key={i}>{fmtDataHora(h.em)} · {ESTADOS[h.estado].curto} · {primeiroNome(db.usuarios.find(x => x.id === h.por)?.nome)}{h.motivo ? ` · ${h.motivo}` : ''}{h.observacao ? ` · “${h.observacao}”` : ''}</li>)}
          </ul>
        </details>
      )}

      {camera && (
        <PhotoCapture itemId={def.id} itemNome={def.nome} ocupado={fotoAcao.ocupado} onClose={() => setCamera(false)}
          onConfirmar={async f => { if (await fotoAcao.executar(() => adicionarEvidencia(u, c.id, def.id, f), 'Foto salva no item.')) setCamera(false); }} />
      )}
    </div>
  );
}
