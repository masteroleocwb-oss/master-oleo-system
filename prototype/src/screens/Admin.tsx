import { useState } from 'react';
import { ir } from '../app/nav';
import { buscarVeiculosEClientes, estadoLink, nomeDe, ocultarItemPara, revogarLink, salvarItemCatalogo, salvarRegraIntervalo, salvarUsuario, voltarAMostrarItem } from '../data/api';
import { sugestoesOcultar } from '../domain/checklist';
import { ESTADOS, ESTADOS_ORDEM, GRUPOS, ORIGEM_LABEL, SERVICO_KEYS, SERVICOS } from '../domain/catalogo';
import { ROLE_LABEL } from '../domain/permissions';
import type { EstadoItem, ItemInspecaoDef, RegraIntervalo, Role, ServicoKey, Usuario } from '../domain/types';
import { fmtData, fmtDataHora, primeiroNome } from '../domain/util';
import { Alerta, Badge, Btn, Card, Empty, Field, Placa, Sheet, Tabs, useAcao, useDB } from '../ui/components';

type Aba = 'busca' | 'catalogo' | 'intervalos' | 'usuarios' | 'historico' | 'links';

export function Admin({ u, aba }: { u: Usuario; aba?: string }) {
  const a = (aba || 'busca') as Aba;
  return (
    <div>
      <div className="page-head"><div><h1>Administração</h1><div className="sub">Tudo o que muda aqui fica no histórico de ações, com antes e depois.</div></div></div>
      <Tabs valor={a} onChange={v => ir(`/admin/${v}`)} abas={[
        { v: 'busca', r: 'Busca' }, { v: 'catalogo', r: 'Itens do checklist' }, { v: 'intervalos', r: 'Regras de intervalo' },
        { v: 'usuarios', r: 'Usuários' }, { v: 'historico', r: 'Histórico de ações' }, { v: 'links', r: 'Links de clientes' },
      ]} />
      {a === 'busca' && <Busca u={u} />}
      {a === 'catalogo' && <Catalogo u={u} />}
      {a === 'intervalos' && <Intervalos u={u} />}
      {a === 'usuarios' && <Usuarios u={u} />}
      {a === 'historico' && <Historico />}
      {a === 'links' && <Links u={u} />}
    </div>
  );
}

function Busca({ u }: { u: Usuario }) {
  const db = useDB();
  const [t, setT] = useState('');
  const veic = buscarVeiculosEClientes(u, t);
  const num = Number(t.replace('#', ''));
  const oss = num > 0 ? db.os.filter(o => String(o.numero).startsWith(String(num))).slice(0, 8) : [];
  return (
    <div style={{ maxWidth: 760 }}>
      <Field rotulo="Placa, cliente, telefone ou número da OS" htmlFor="adm-busca"><input id="adm-busca" className="input" value={t} onChange={e => setT(e.target.value)} autoFocus /></Field>
      {oss.length > 0 && <><div className="section-title">Ordens de serviço</div><div className="list">{oss.map(o => <a key={o.id} className="li" href={`#/os/${o.id}`}><span className="strong">#{o.numero}</span><span className="grow small muted">{fmtData(o.abertaEm)} · {db.veiculos.find(v => v.id === o.veiculoId)?.placa}</span><span className="chev">›</span></a>)}</div></>}
      {veic.length > 0 && <><div className="section-title">Veículos</div><div className="list">{veic.map(r => <a key={r.veiculo.id} className="li" href={`#/veiculos/${r.veiculo.id}`}><Placa placa={r.veiculo.placa} /><span className="grow">{r.veiculo.marca} {r.veiculo.modelo} · {r.cliente?.nome}{r.cliente?.telefone ? ` · ${r.cliente.telefone}` : ''}</span><span className="chev">›</span></a>)}</div></>}
    </div>
  );
}

function Catalogo({ u }: { u: Usuario }) {
  const db = useDB();
  const [ed, setEd] = useState<ItemInspecaoDef | null>(null);
  return (
    <div>
      <Alerta tipo="info">Mudanças valem só para checklists novos. Inspeções já feitas guardam a versão do item usada na época. Critérios de condição (o que é OK, Atenção ou Prioritário em cada item) ainda não foram definidos no Playbook: as instruções abaixo são proposta.</Alerta>
      <SugestoesOcultar u={u} />
      <div style={{ margin: '12px 0' }}><Btn onClick={() => setEd({ id: `item_${Date.now().toString(36)}`, grupo: 'Demais itens', nome: '', instrucao: '', tipo: 'visual', estadosPermitidos: [...ESTADOS_ORDEM], fotoObrigatoriaEm: ['atencao', 'prioritario'], permiteRecomendacao: true, ativo: true, versao: 0, fonte: 'pedido_direcao' })}>Novo item</Btn></div>
      {GRUPOS.map(g => (
        <div key={g}>
          <div className="section-title">{g}</div>
          <div className="list">
            {db.catalogo.filter(d => d.grupo === g).map(d => (
              <button key={d.id} className="li" onClick={() => setEd(d)}>
                <div className="grow">
                  <div className="ttl">{d.nome} {!d.ativo && <Badge tom="muted">Inativo</Badge>}</div>
                  {(d.ocultarPara || []).length > 0 && <div className="meta">Não aparece para: {d.ocultarPara!.map(o => `${o.marca} ${o.modelo}${o.motor ? ` ${o.motor}` : ''}`).join(', ')}</div>}
                  <div className="meta">Foto obrigatória: {d.fotoObrigatoriaEm.length ? d.fotoObrigatoriaEm.map(e => ESTADOS[e].curto).join(', ') : 'nunca'}{d.aplicavelA?.cambio ? ` · só câmbio ${d.aplicavelA.cambio}` : ''}{d.servicoRelacionado ? ` · serviço: ${SERVICOS[d.servicoRelacionado].nome}` : ''} · v{d.versao} · {d.fonte === 'playbook_fase1' ? 'Playbook fase 1' : d.fonte === 'pedido_direcao' ? 'pedido da direção' : 'catálogo atual'}</div>
                </div>
                <span className="chev">›</span>
              </button>
            ))}
          </div>
        </div>
      ))}
      {ed && <ItemSheet u={u} def={ed} onClose={() => setEd(null)} />}
    </div>
  );
}

/** Itens que viram "Não se aplica" quase sempre num modelo: a direção decide não mostrar mais para o mecânico. */
function SugestoesOcultar({ u }: { u: Usuario }) {
  const db = useDB();
  const acao = useAcao();
  const sug = sugestoesOcultar(db.checklists, db.veiculos, db.catalogo);
  const ocultos = db.catalogo.flatMap(d => (d.ocultarPara || []).map((o, i) => ({ d, o, i })));
  return (
    <Card titulo="Itens que quase nunca se aplicam" className="" acao={<Badge tom="info">{sug.length} sugestão(ões)</Badge>}>
      <p className="small muted" style={{ marginBottom: 8 }}>O sistema observa os checklists: quando um item é marcado “Não se aplica” em pelo menos 80% de 3 ou mais inspeções do mesmo modelo e motor, ele sugere deixar de mostrar o item para esse modelo. Só some depois que a direção confirma. Inspeções antigas não mudam.</p>
      {sug.length === 0 && <p className="small muted">Nenhuma sugestão no momento.</p>}
      <div className="list">
        {sug.slice(0, 8).map(g => (
          <div key={`${g.defId}|${g.marca}|${g.modelo}|${g.motor}`} className="li" data-sugestao={`${g.defId}|${g.modelo}`}>
            <div className="grow"><div className="ttl">{g.nome} · {g.marca} {g.modelo} {g.motor}</div><div className="meta">“Não se aplica” em {g.na} de {g.total} inspeções ({g.pct}%)</div></div>
            <Btn tamanho="sm" variante="sec" carregando={acao.ocupado} onClick={() => acao.executar(() => ocultarItemPara(u, g.defId, { marca: g.marca, modelo: g.modelo, motor: g.motor }, `Sugestão do sistema: não se aplica em ${g.na} de ${g.total} inspeções`), `${g.nome} não aparece mais para ${g.marca} ${g.modelo}.`)}>Não mostrar para este modelo</Btn>
          </div>
        ))}
      </div>
      {ocultos.length > 0 && <>
        <div className="small strong" style={{ margin: '12px 0 6px' }}>Já ocultos</div>
        <div className="list">
          {ocultos.map(({ d, o, i }) => (
            <div key={`${d.id}-${i}`} className="li">
              <div className="grow"><div className="ttl">{d.nome} · {o.marca} {o.modelo} {o.motor || ''}</div><div className="meta">{o.motivo} · {nomeDe(db, o.por)} em {fmtData(o.em)}</div></div>
              <Btn tamanho="sm" variante="ghost" carregando={acao.ocupado} onClick={() => acao.executar(() => voltarAMostrarItem(u, d.id, i), 'O item volta a aparecer para este modelo.')}>Voltar a mostrar</Btn>
            </div>
          ))}
        </div>
      </>}
    </Card>
  );
}

function ItemSheet({ u, def, onClose }: { u: Usuario; def: ItemInspecaoDef; onClose: () => void }) {
  const [d, setD] = useState(def);
  const acao = useAcao();
  const toggle = (e: EstadoItem) => setD({ ...d, fotoObrigatoriaEm: d.fotoObrigatoriaEm.includes(e) ? d.fotoObrigatoriaEm.filter(x => x !== e) : [...d.fotoObrigatoriaEm, e] });
  return (
    <Sheet titulo={def.nome || 'Novo item'} sub={def.versao ? `Versão atual ${def.versao}. Salvar cria a versão ${def.versao + 1}.` : 'Item novo'} onClose={onClose}
      rodape={<><Btn variante="sec" onClick={onClose}>Cancelar</Btn><Btn carregando={acao.ocupado} onClick={async () => { if ((await acao.executar(() => salvarItemCatalogo(u, d), 'Item salvo. Vale para checklists novos.')) !== undefined) onClose(); }}>Salvar</Btn></>}>
      <div className="grid k2">
        <Field rotulo="Nome" obrigatorio htmlFor="it-nome"><input id="it-nome" className="input" value={d.nome} onChange={e => setD({ ...d, nome: e.target.value })} /></Field>
        <Field rotulo="Grupo" htmlFor="it-grupo"><select id="it-grupo" className="input" value={d.grupo} onChange={e => setD({ ...d, grupo: e.target.value })}>{GRUPOS.map(g => <option key={g}>{g}</option>)}</select></Field>
      </div>
      <Field rotulo="Instrução para o mecânico" obrigatorio htmlFor="it-inst"><textarea id="it-inst" className="input" value={d.instrucao} onChange={e => setD({ ...d, instrucao: e.target.value })} /></Field>
      <Field rotulo="Foto obrigatória quando marcar">
        <div className="row">{ESTADOS_ORDEM.map(e => <label key={e} className="check" style={{ padding: '4px 8px 4px 0' }}><input type="checkbox" checked={d.fotoObrigatoriaEm.includes(e)} onChange={() => toggle(e)} />{ESTADOS[e].curto}</label>)}</div>
      </Field>
      <div className="grid k2">
        <Field rotulo="Serviço que resolve" htmlFor="it-serv"><select id="it-serv" className="input" value={d.servicoRelacionado || ''} onChange={e => setD({ ...d, servicoRelacionado: (e.target.value || undefined) as ServicoKey | undefined })}><option value="">Nenhum</option>{SERVICO_KEYS.map(k => <option key={k} value={k}>{SERVICOS[k].nome}</option>)}</select></Field>
        <Field rotulo="Aplica a" htmlFor="it-apl"><select id="it-apl" className="input" value={d.aplicavelA?.cambio || ''} onChange={e => setD({ ...d, aplicavelA: e.target.value ? { cambio: e.target.value as 'manual' } : undefined })}><option value="">Todos os veículos</option><option value="manual">Só câmbio manual</option><option value="automatico">Só câmbio automático</option></select></Field>
      </div>
      <label className="check"><input type="checkbox" checked={d.ativo} onChange={e => setD({ ...d, ativo: e.target.checked })} /> Ativo (aparece nos checklists novos)</label>
      {acao.erro && <Alerta tipo="crit">{acao.erro}</Alerta>}
    </Sheet>
  );
}

function Intervalos({ u }: { u: Usuario }) {
  const db = useDB();
  const [ed, setEd] = useState<RegraIntervalo | null>(null);
  return (
    <div>
      <Alerta tipo="warn">Nenhum documento da Master Óleo define intervalos de manutenção. As regras abaixo são <b>fictícias de demonstração</b>. Só regras marcadas como validadas, com fonte, calculam km/data; as demais geram apenas “acompanhar”.</Alerta>
      <div className="tbl-wrap" style={{ marginTop: 12 }}>
        <table className="tbl">
          <thead><tr><th>Regra</th><th>Intervalo</th><th>Origem</th><th>Validada</th><th>Fonte</th><th /></tr></thead>
          <tbody>{db.regrasIntervalo.map(r => (
            <tr key={r.id}>
              <td><b>{r.nome}</b>{r.aplicavelA?.cambio && <div className="tiny muted">só câmbio {r.aplicavelA.cambio}</div>}</td>
              <td>{[r.km ? `${r.km.toLocaleString('pt-BR')} km` : null, r.meses ? `${r.meses} meses` : null].filter(Boolean).join(' ou ') || '—'}</td>
              <td><Badge tom={r.origem === 'nao_confirmada' ? 'muted' : 'navy'}>{ORIGEM_LABEL[r.origem].rotulo}</Badge></td>
              <td>{r.validada ? <Badge tom="ok">Sim</Badge> : <Badge tom="muted">Não</Badge>}</td>
              <td className="small">{r.fonte}</td>
              <td><Btn tamanho="sm" variante="ghost" onClick={() => setEd(r)}>Editar</Btn></td>
            </tr>))}</tbody>
        </table>
      </div>
      {ed && <RegraSheet u={u} r={ed} onClose={() => setEd(null)} />}
    </div>
  );
}

function RegraSheet({ u, r, onClose }: { u: Usuario; r: RegraIntervalo; onClose: () => void }) {
  const [km, setKm] = useState(r.km ? String(r.km) : '');
  const [meses, setMeses] = useState(r.meses ? String(r.meses) : '');
  const [validada, setValidada] = useState(r.validada);
  const [fonte, setFonte] = useState(r.fonte);
  const acao = useAcao();
  return (
    <Sheet titulo={`Regra: ${r.nome}`} sub="Alterações valem para próximas sugestões; manutenções já registradas não mudam." onClose={onClose}
      rodape={<><Btn variante="sec" onClick={onClose}>Cancelar</Btn><Btn carregando={acao.ocupado} onClick={async () => { if (await acao.executar(() => salvarRegraIntervalo(u, r.id, { km: Number(km) || undefined, meses: Number(meses) || undefined, validada, fonte }).then(() => true), 'Regra salva.')) onClose(); }}>Salvar</Btn></>}>
      <div className="grid k2">
        <Field rotulo="A cada (km)" htmlFor="rg-km"><input id="rg-km" className="input" inputMode="numeric" value={km} onChange={e => setKm(e.target.value.replace(/\D/g, ''))} /></Field>
        <Field rotulo="Ou a cada (meses)" htmlFor="rg-m"><input id="rg-m" className="input" inputMode="numeric" value={meses} onChange={e => setMeses(e.target.value.replace(/\D/g, ''))} /></Field>
      </div>
      <Field rotulo="Origem" htmlFor="rg-or" dica="A origem é definida na criação da regra."><select id="rg-or" className="input" value={r.origem} disabled>{Object.entries(ORIGEM_LABEL).map(([k, v]) => <option key={k} value={k}>{v.rotulo}</option>)}</select></Field>
      <Field rotulo="Fonte" obrigatorio={validada} htmlFor="rg-f" dica="Manual do fabricante, decisão da direção etc."><input id="rg-f" className="input" value={fonte} onChange={e => setFonte(e.target.value)} /></Field>
      <label className="check"><input type="checkbox" checked={validada} onChange={e => setValidada(e.target.checked)} /> Regra validada (passa a calcular km/data)</label>
      {acao.erro && <Alerta tipo="crit">{acao.erro}</Alerta>}
    </Sheet>
  );
}

function Usuarios({ u }: { u: Usuario }) {
  const db = useDB();
  const [ed, setEd] = useState<{ id?: string; nome: string; role: Role; ativo: boolean; nivel?: string } | null>(null);
  const acao = useAcao();
  return (
    <div>
      <Alerta tipo="info">No produto, cada usuário tem login próprio. Desativar bloqueia o acesso na hora e mantém o histórico do que a pessoa fez.</Alerta>
      <div style={{ margin: '12px 0' }}><Btn onClick={() => setEd({ nome: '', role: 'mecanico', ativo: true })}>Novo usuário</Btn></div>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead><tr><th>Nome</th><th>Perfil</th><th>Nível</th><th>Status</th><th /></tr></thead>
          <tbody>{db.usuarios.map(x => (
            <tr key={x.id}>
              <td><b>{x.nome}</b></td><td>{ROLE_LABEL[x.role]}</td><td>{x.nivel || '—'}</td>
              <td>{x.ativo ? <Badge tom="ok">Ativo</Badge> : <Badge tom="muted">Desativado</Badge>}</td>
              <td className="row">
                <Btn tamanho="sm" variante="ghost" onClick={() => setEd({ ...x })}>Editar</Btn>
                {x.id !== u.id && <Btn tamanho="sm" variante={x.ativo ? 'danger' : 'sec'} carregando={acao.ocupado} onClick={() => acao.executar(() => salvarUsuario(u, { ...x, ativo: !x.ativo }), x.ativo ? 'Acesso desativado.' : 'Acesso reativado.')}>{x.ativo ? 'Desativar' : 'Reativar'}</Btn>}
              </td>
            </tr>))}</tbody>
        </table>
      </div>
      {ed && (
        <Sheet titulo={ed.id ? `Editar ${ed.nome}` : 'Novo usuário'} onClose={() => setEd(null)}
          rodape={<><Btn variante="sec" onClick={() => setEd(null)}>Cancelar</Btn><Btn carregando={acao.ocupado} onClick={async () => { if ((await acao.executar(() => salvarUsuario(u, ed), 'Usuário salvo.')) !== undefined) setEd(null); }}>Salvar</Btn></>}>
          <Field rotulo="Nome" obrigatorio htmlFor="us-nome"><input id="us-nome" className="input" value={ed.nome} onChange={e => setEd({ ...ed, nome: e.target.value })} /></Field>
          <div className="grid k2">
            <Field rotulo="Perfil" htmlFor="us-role"><select id="us-role" className="input" value={ed.role} onChange={e => setEd({ ...ed, role: e.target.value as Role })}>{(Object.keys(ROLE_LABEL) as Role[]).filter(r => r !== 'comercial' || ed.role === 'comercial').map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select></Field>
            <Field rotulo="Nível (se mecânico)" htmlFor="us-niv"><input id="us-niv" className="input" value={ed.nivel || ''} onChange={e => setEd({ ...ed, nivel: e.target.value })} placeholder="Ex.: N3" /></Field>
          </div>
          {acao.erro && <Alerta tipo="crit">{acao.erro}</Alerta>}
        </Sheet>
      )}
    </div>
  );
}

function Historico() {
  const db = useDB();
  const [filtro, setFiltro] = useState('');
  const [quem, setQuem] = useState('');
  const lista = [...db.eventos].reverse().filter(e => (!filtro || (e.resumo + e.tipo).toLowerCase().includes(filtro.toLowerCase())) && (!quem || e.por === quem)).slice(0, 200);
  return (
    <div>
      <div className="grid k2" style={{ marginBottom: 12 }}>
        <Field rotulo="Filtrar" htmlFor="h-f"><input id="h-f" className="input" value={filtro} onChange={e => setFiltro(e.target.value)} placeholder="Ex.: link, meta, placa" /></Field>
        <Field rotulo="Pessoa" htmlFor="h-q"><select id="h-q" className="input" value={quem} onChange={e => setQuem(e.target.value)}><option value="">Todas</option>{db.usuarios.map(x => <option key={x.id} value={x.id}>{x.nome}</option>)}</select></Field>
      </div>
      {lista.length === 0 ? <Card><Empty titulo="Nenhuma ação encontrada." /></Card> : (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Quando</th><th>Quem</th><th>O quê</th><th>Tipo</th></tr></thead>
            <tbody>{lista.map(e => (
              <tr key={e.id}>
                <td className="small" style={{ whiteSpace: 'nowrap' }}>{fmtDataHora(e.em)}</td>
                <td className="small">{primeiroNome(nomeDe(db, e.por))}</td>
                <td>{e.resumo}{e.motivo && <div className="tiny muted">Motivo: {e.motivo}</div>}{e.antes !== undefined && e.depois !== undefined && <details><summary className="tiny" style={{ cursor: 'pointer' }}>antes / depois</summary><pre className="tiny" style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{JSON.stringify({ antes: e.antes, depois: e.depois }, null, 1).slice(0, 900)}</pre></details>}</td>
                <td className="tiny muted">{e.tipo}</td>
              </tr>))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Links({ u }: { u: Usuario }) {
  const db = useDB();
  const acao = useAcao();
  const lista = [...db.compartilhamentos].sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
  return (
    <div className="tbl-wrap">
      <table className="tbl">
        <thead><tr><th>OS</th><th>Estado</th><th>Criado</th><th>Expira</th><th className="num">Acessos</th><th /></tr></thead>
        <tbody>{lista.map(s => {
          const st = estadoLink(s);
          const os = db.os.find(o => o.id === s.osId);
          return (
            <tr key={s.id}>
              <td><a href={`#/os/${s.osId}`}>#{os?.numero}</a></td>
              <td><Badge tom={st === 'ativo' ? 'ok' : st === 'revogado' ? 'critico' : 'muted'}>{st === 'ativo' ? 'Ativo' : st === 'revogado' ? 'Revogado' : 'Expirado'}</Badge>{s.motivoRevogacao && <div className="tiny muted">{s.motivoRevogacao}</div>}</td>
              <td className="small">{fmtDataHora(s.criadoEm)} · {primeiroNome(nomeDe(db, s.criadoPor))}</td>
              <td className="small">{s.expiraEm ? fmtData(s.expiraEm) : 'sem validade'}</td>
              <td className="num">{s.acessos}</td>
              <td>{st === 'ativo' && <Btn tamanho="sm" variante="danger" carregando={acao.ocupado} onClick={() => acao.executar(() => revogarLink(u, s.id, 'Revogado pela administração'), 'Link revogado.')}>Revogar</Btn>}</td>
            </tr>
          );
        })}</tbody>
      </table>
    </div>
  );
}
