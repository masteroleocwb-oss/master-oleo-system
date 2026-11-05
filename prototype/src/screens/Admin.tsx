import { useState } from 'react';
import { ir } from '../app/nav';
import { definirAcesso, definirAcessoDemo, desbloquearAcesso, gerarSenhaProvisoria, POLITICA_ACESSO, RESULTADO_ACESSO, ultimoAcesso } from '../data/acesso';
import { nomeLegadoDe } from '../data/legado';
import { MODO_REAL } from '../data/modo';
import { buscarVeiculosEClientes, estadoLink, nomeDe, ocultarItemPara, revogarLink, salvarItemCatalogo, salvarRegraIntervalo, salvarUsuario, voltarAMostrarItem } from '../data/api';
import { sugestoesOcultar } from '../domain/checklist';
import { ESTADOS, ESTADOS_ORDEM, GRUPOS, ORIGEM_LABEL, SERVICO_KEYS, SERVICOS } from '../domain/catalogo';
import { ROLE_LABEL, podeAtenderCarros } from '../domain/permissions';
import type { EstadoItem, ItemInspecaoDef, RegraIntervalo, ResultadoAcesso, Role, ServicoKey, Usuario } from '../domain/types';
import { agora, agoraISO, fmtData, fmtDataHora, primeiroNome } from '../domain/util';
import { Alerta, Badge, Btn, Card, Empty, Field, Placa, Sheet, Tabs, useAcao, useDB } from '../ui/components';

type Aba = 'busca' | 'catalogo' | 'intervalos' | 'usuarios' | 'acessos' | 'historico' | 'links';

export function Admin({ u, aba }: { u: Usuario; aba?: string }) {
  const a = (aba || 'busca') as Aba;
  return (
    <div>
      <div className="page-head"><div><h1>Administração</h1><div className="sub">Tudo o que muda aqui fica no histórico de ações, com antes e depois.</div></div></div>
      <Tabs valor={a} onChange={v => ir(`/admin/${v}`)} abas={[
        { v: 'busca', r: 'Busca' }, { v: 'catalogo', r: 'Itens do checklist' }, { v: 'intervalos', r: 'Regras de intervalo' },
        { v: 'usuarios', r: 'Usuários' }, { v: 'acessos', r: 'Acessos' }, { v: 'historico', r: 'Histórico de ações' }, { v: 'links', r: 'Links de clientes' },
      ]} />
      {a === 'busca' && <Busca u={u} />}
      {a === 'catalogo' && <Catalogo u={u} />}
      {a === 'intervalos' && <Intervalos u={u} />}
      {a === 'usuarios' && (MODO_REAL ? <UsuariosReal u={u} /> : <Usuarios u={u} />)}
      {a === 'acessos' && <Acessos u={u} />}
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

type EdUsuario = { id?: string; nome: string; role: Role; ativo: boolean; nivel?: string; login?: string; senhaProv?: string };

/** Situação do acesso de uma pessoa, para a tabela. */
function situacaoAcesso(x: Usuario, acessoDemo: boolean) {
  if (!x.ativo) return <Badge tom="muted">Desativado</Badge>;
  if (x.bloqueadoAte && x.bloqueadoAte > agoraISO()) return <Badge tom="critico">Bloqueado até {new Date(x.bloqueadoAte).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })}</Badge>;
  if (x.senha && x.trocarSenha) return <Badge tom="atencao">Aguardando 1º acesso</Badge>;
  if (x.senha) return <Badge tom="ok">Com senha</Badge>;
  if (x.demo) return <Badge tom={acessoDemo ? 'info' : 'muted'}>{acessoDemo ? 'Demonstração' : 'Demonstração (desligada)'}</Badge>;
  return <Badge tom="muted">Sem acesso</Badge>;
}

function Usuarios({ u }: { u: Usuario }) {
  const db = useDB();
  const [ed, setEd] = useState<EdUsuario | null>(null);
  const [ac, setAc] = useState<{ id: string; nome: string; login: string; senhaProv: string; redefinir: boolean } | null>(null);
  const [entregue, setEntregue] = useState<{ nome: string; login: string; senha: string } | null>(null);
  const acao = useAcao();

  const salvarEd = async () => {
    if (!ed) return;
    const comAcesso = !ed.id && !!(ed.login || ed.senhaProv);
    const r = await acao.executar(async () => {
      const id = await salvarUsuario(u, ed);
      if (comAcesso) await definirAcesso(u, id, ed.login || '', ed.senhaProv || '');
      return id;
    }, comAcesso ? 'Usuário e acesso criados.' : 'Usuário salvo.');
    if (r !== undefined) {
      if (comAcesso) setEntregue({ nome: ed.nome, login: (ed.login || '').trim().toLowerCase(), senha: ed.senhaProv || '' });
      setEd(null);
    }
  };
  const salvarAc = async () => {
    if (!ac) return;
    if ((await acao.executar(() => definirAcesso(u, ac.id, ac.login, ac.senhaProv), ac.redefinir ? 'Senha redefinida.' : 'Acesso criado.')) !== undefined) {
      setEntregue({ nome: ac.nome, login: ac.login.trim().toLowerCase(), senha: ac.senhaProv });
      setAc(null);
    }
  };

  return (
    <div>
      <Alerta tipo="info">
        Cada pessoa entra com login e senha próprios. Você cria o acesso com uma <b>senha provisória</b>; no primeiro acesso a pessoa é obrigada a criar a dela,
        que ninguém mais vê. Desativar bloqueia o acesso na hora e mantém o histórico do que a pessoa fez.
      </Alerta>
      {entregue && (
        <div style={{ marginTop: 12 }} data-entregue>
          <Alerta tipo="ok">
            Passe para <b>{entregue.nome}</b> pessoalmente ou por mensagem privada: login <b data-entregue-login>{entregue.login}</b> e senha provisória <b data-entregue-senha style={{ fontFamily: "ui-monospace, Menlo, monospace", fontSize: 15 }}>{entregue.senha}</b>.
            Ela não aparece de novo; se perder, use “Redefinir senha”.
            <div style={{ marginTop: 6 }}><Btn tamanho="sm" variante="ghost" onClick={() => setEntregue(null)}>Já passei, ocultar</Btn></div>
          </Alerta>
        </div>
      )}
      <div style={{ margin: '12px 0' }}><Btn onClick={() => { setEntregue(null); setEd({ nome: '', role: 'mecanico', ativo: true, login: '', senhaProv: gerarSenhaProvisoria() }); }}>Novo usuário</Btn></div>
      <div className="tbl-wrap">
        <table className="tbl" data-tabela-usuarios>
          <thead><tr><th>Nome</th><th>Perfil</th><th>Login</th><th>Acesso</th><th>Último acesso</th><th /></tr></thead>
          <tbody>{db.usuarios.map(x => {
            const ult = ultimoAcesso(db, x.id);
            const bloqueado = !!x.bloqueadoAte && x.bloqueadoAte > agoraISO();
            return (
              <tr key={x.id} data-usuario={x.id}>
                <td><b>{x.nome}</b>{x.nivel && <div className="tiny muted">{x.nivel}</div>}</td>
                <td>{ROLE_LABEL[x.role]}</td>
                <td className="small">{x.login || '—'}</td>
                <td>{situacaoAcesso(x, db.acessoDemo)}</td>
                <td className="small">{ult ? fmtDataHora(ult.em) : '—'}</td>
                <td className="row">
                  <Btn tamanho="sm" variante="ghost" onClick={() => setEd({ id: x.id, nome: x.nome, role: x.role, ativo: x.ativo, nivel: x.nivel })}>Editar</Btn>
                  {x.ativo && <Btn tamanho="sm" variante="sec" data-acao-acesso={x.id} onClick={() => { setEntregue(null); setAc({ id: x.id, nome: x.nome, login: x.login || '', senhaProv: gerarSenhaProvisoria(), redefinir: !!x.senha }); }}>{x.senha ? 'Redefinir senha' : 'Criar acesso'}</Btn>}
                  {bloqueado && <Btn tamanho="sm" variante="sec" carregando={acao.ocupado} onClick={() => acao.executar(() => desbloquearAcesso(u, x.id), 'Acesso desbloqueado.')}>Desbloquear</Btn>}
                  {x.id !== u.id && <Btn tamanho="sm" variante={x.ativo ? 'danger' : 'sec'} carregando={acao.ocupado} onClick={() => acao.executar(() => salvarUsuario(u, { ...x, ativo: !x.ativo }), x.ativo ? 'Acesso desativado.' : 'Acesso reativado.')}>{x.ativo ? 'Desativar' : 'Reativar'}</Btn>}
                </td>
              </tr>);
          })}</tbody>
        </table>
      </div>
      {ed && (
        <Sheet titulo={ed.id ? `Editar ${ed.nome}` : 'Novo usuário'} onClose={() => setEd(null)}
          rodape={<><Btn variante="sec" onClick={() => setEd(null)}>Cancelar</Btn><Btn carregando={acao.ocupado} onClick={salvarEd}>Salvar</Btn></>}>
          <Field rotulo="Nome" obrigatorio htmlFor="us-nome"><input id="us-nome" className="input" value={ed.nome} onChange={e => setEd({ ...ed, nome: e.target.value })} /></Field>
          <div className="grid k2">
            <Field rotulo="Perfil" htmlFor="us-role" dica="Define o que a pessoa vê e pode fazer."><select id="us-role" className="input" value={ed.role} onChange={e => setEd({ ...ed, role: e.target.value as Role })}>{(Object.keys(ROLE_LABEL) as Role[]).filter(r => r !== 'comercial' || ed.role === 'comercial').map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select></Field>
            <Field rotulo="Nível (se mecânico)" htmlFor="us-niv"><input id="us-niv" className="input" value={ed.nivel || ''} onChange={e => setEd({ ...ed, nivel: e.target.value })} placeholder="Ex.: N3" /></Field>
          </div>
          {!ed.id && <>
            <div className="section-title" style={{ marginTop: 6 }}>Acesso</div>
            <CamposAcesso login={ed.login || ''} senha={ed.senhaProv || ''} onLogin={v => setEd({ ...ed, login: v })} onSenha={v => setEd({ ...ed, senhaProv: v })} />
            <p className="tiny muted">Deixe o login em branco para cadastrar sem acesso (dá para criar depois).</p>
          </>}
          {acao.erro && <Alerta tipo="crit">{acao.erro}</Alerta>}
        </Sheet>
      )}
      {ac && (
        <Sheet titulo={ac.redefinir ? `Redefinir senha de ${ac.nome}` : `Criar acesso para ${ac.nome}`} onClose={() => setAc(null)}
          rodape={<><Btn variante="sec" onClick={() => setAc(null)}>Cancelar</Btn><Btn carregando={acao.ocupado} onClick={salvarAc}>{ac.redefinir ? 'Redefinir senha' : 'Criar acesso'}</Btn></>}>
          {ac.redefinir && <Alerta tipo="warn">A senha atual deixa de valer agora. No próximo acesso a pessoa entra com a provisória e cria uma nova.</Alerta>}
          <CamposAcesso login={ac.login} senha={ac.senhaProv} onLogin={v => setAc({ ...ac, login: v })} onSenha={v => setAc({ ...ac, senhaProv: v })} />
          {acao.erro && <Alerta tipo="crit">{acao.erro}</Alerta>}
        </Sheet>
      )}
    </div>
  );
}

function CamposAcesso({ login, senha, onLogin, onSenha }: { login: string; senha: string; onLogin: (v: string) => void; onSenha: (v: string) => void }) {
  return (
    <div className="grid k2">
      <Field rotulo="Login (e-mail ou usuário)" htmlFor="us-login" dica="Ex.: joao.silva ou o e-mail da pessoa.">
        <input id="us-login" className="input" autoCapitalize="none" autoComplete="off" value={login} onChange={e => onLogin(e.target.value)} />
      </Field>
      <Field rotulo="Senha provisória" htmlFor="us-senha-prov" dica={`Mínimo ${POLITICA_ACESSO.senhaMin} caracteres. A pessoa troca no primeiro acesso.`}>
        <div className="row nowrap">
          <input id="us-senha-prov" className="input" style={{ fontFamily: "ui-monospace, Menlo, monospace" }} autoComplete="off" value={senha} onChange={e => onSenha(e.target.value)} />
          <Btn tamanho="sm" variante="ghost" onClick={() => onSenha(gerarSenhaProvisoria())}>Gerar outra</Btn>
        </div>
      </Field>
    </div>
  );
}

const RESULTADOS = Object.keys(RESULTADO_ACESSO) as ResultadoAcesso[];

function Acessos({ u }: { u: Usuario }) {
  const db = useDB();
  const acao = useAcao();
  const [quem, setQuem] = useState('');
  const [res, setRes] = useState<'' | 'falhas' | ResultadoAcesso>('');
  const falha = (r: ResultadoAcesso) => r === 'senha_errada' || r === 'usuario_inexistente' || r === 'bloqueado' || r === 'desativado';
  const desde24h = new Date(agora().getTime() - 24 * 3600e3).toISOString();
  const falhas24 = db.acessos.filter(a => a.em >= desde24h && falha(a.resultado)).length;
  const lista = [...db.acessos].reverse()
    .filter(a => (!quem || a.usuarioId === quem) && (!res || (res === 'falhas' ? falha(a.resultado) : a.resultado === res)))
    .slice(0, 300);
  const comSenhaDirecao = db.usuarios.some(x => x.ativo && x.senha && x.role === 'direcao');
  return (
    <div>
      {!MODO_REAL && <Card titulo="Contas de demonstração">
        <p className="small" style={{ marginBottom: 8 }}>
          Enquanto estiver ligado, a tela de entrada mostra as pessoas fictícias e qualquer um entra com um toque, sem senha.
          Desligue depois de criar os acessos do time (é preciso ter pelo menos uma pessoa da direção com senha).
        </p>
        <div className="row">
          <Badge tom={db.acessoDemo ? 'atencao' : 'ok'}>{db.acessoDemo ? 'Ligado: entra sem senha' : 'Desligado: só com login e senha'}</Badge>
          <Btn tamanho="sm" variante={db.acessoDemo ? 'danger' : 'sec'} data-acesso-demo carregando={acao.ocupado}
            onClick={() => acao.executar(() => definirAcessoDemo(u, !db.acessoDemo), db.acessoDemo ? 'Contas de demonstração desligadas.' : 'Contas de demonstração ligadas.')}>
            {db.acessoDemo ? 'Desligar contas de demonstração' : 'Ligar contas de demonstração'}
          </Btn>
        </div>
        {db.acessoDemo && !comSenhaDirecao && <p className="tiny muted" style={{ marginTop: 6 }}>Para desligar, crie antes o acesso com senha de alguém da direção em Usuários.</p>}
        {acao.erro && <div style={{ marginTop: 8 }}><Alerta tipo="crit">{acao.erro}</Alerta></div>}
      </Card>}
      <div className="row" style={{ margin: '12px 0' }}>
        <Badge tom={falhas24 ? 'atencao' : 'muted'}>{falhas24} tentativa(s) com falha nas últimas 24 h</Badge>
        <span className="small muted">{MODO_REAL ? 'Muitas senhas erradas seguidas bloqueiam o login por alguns minutos (proteção do Firebase). Sessão vale 12 h.' : `Bloqueio automático após ${POLITICA_ACESSO.maxTentativas} senhas erradas seguidas, por ${POLITICA_ACESSO.bloqueioMin} min. Sessão vale ${POLITICA_ACESSO.sessaoHoras} h.`}</span>
      </div>
      <div className="grid k2" style={{ marginBottom: 12 }}>
        <Field rotulo="Pessoa" htmlFor="ac-quem"><select id="ac-quem" className="input" value={quem} onChange={e => setQuem(e.target.value)}><option value="">Todas</option>{db.usuarios.map(x => <option key={x.id} value={x.id}>{x.nome}</option>)}</select></Field>
        <Field rotulo="Resultado" htmlFor="ac-res"><select id="ac-res" className="input" value={res} onChange={e => setRes(e.target.value as typeof res)}><option value="">Todos</option><option value="falhas">Só falhas</option>{RESULTADOS.map(r => <option key={r} value={r}>{RESULTADO_ACESSO[r].rotulo}</option>)}</select></Field>
      </div>
      {lista.length === 0 ? <Card><Empty titulo="Nenhum acesso registrado ainda." /></Card> : (
        <div className="tbl-wrap">
          <table className="tbl" data-tabela-acessos>
            <thead><tr><th>Quando</th><th>Pessoa</th><th>Resultado</th><th>Aparelho</th></tr></thead>
            <tbody>{lista.map(a => (
              <tr key={a.id} data-acesso={a.resultado}>
                <td className="small" style={{ whiteSpace: 'nowrap' }}>{fmtDataHora(a.em)}</td>
                <td className="small">{a.usuarioId ? nomeDe(db, a.usuarioId) : <span className="muted">login digitado: {a.loginDigitado || '—'}</span>}</td>
                <td><Badge tom={RESULTADO_ACESSO[a.resultado]?.tom || 'muted'}>{RESULTADO_ACESSO[a.resultado]?.rotulo || a.resultado}</Badge></td>
                <td className="small">{a.dispositivo}</td>
              </tr>))}</tbody>
          </table>
        </div>
      )}
      <p className="tiny muted" style={{ marginTop: 8 }}>{MODO_REAL ? 'Mesmo registro do sistema atual: gravado no servidor, ninguém edita nem apaga. Mostra os 400 mais recentes.' : 'Neste beta o registro fica neste navegador. No sistema real ele é gravado no servidor e não pode ser apagado por quem usa o sistema.'}</p>
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

const PERFIS_REAIS: Role[] = ['direcao', 'lider', 'vendedor', 'mecanico'];

/**
 * Usuários na base real: as contas (e-mail e senha) são criadas no 👥 Usuários do sistema atual.
 * Aqui a direção ajusta perfil, nível e o nome com que a pessoa aparece no sistema atual,
 * para que vendedor e lubrificador das OS batam nos dois sistemas (comissão e rodízio).
 */
function UsuariosReal({ u }: { u: Usuario }) {
  const db = useDB();
  const acao = useAcao();
  const [ed, setEd] = useState<{ id: string; nome: string; role: Role; ativo: boolean; nivel?: string; nomeLegado: string; atendeComoMecanico: boolean } | null>(null);
  const reais = db.usuarios.filter(x => !x.id.startsWith('legado:'));
  const desde = new Date(agora().getTime() - 60 * 864e5).toISOString();
  const semConta = db.usuarios.filter(x => x.id.startsWith('legado:')).map(x => ({
    x, oss: db.os.filter(o => (o.mecanicoId === x.id || o.vendedorId === x.id) && o.abertaEm >= desde).length,
  })).filter(y => y.oss > 0).sort((a, b) => b.oss - a.oss);
  const nomesAtuais = [...new Set(db.usuarios.filter(x => x.id.startsWith('legado:')).map(x => x.nome))].sort();
  return (
    <div>
      <Alerta tipo="info">
        As contas são criadas no <b>👥 Usuários do sistema atual</b> (e-mail e senha provisória). Aqui você ajusta perfil, nível e o
        <b> nome no sistema atual</b>: é por ele que as OS dos dois sistemas reconhecem o vendedor e o mecânico (comissão e rodízio).
      </Alerta>
      {semConta.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <Alerta tipo="warn">
            <b>Nomes do sistema atual que ainda não estão ligados a uma conta</b> (últimos 60 dias). Edite a conta da pessoa e coloque o nome exatamente como abaixo:
            <ul style={{ margin: '4px 0 0', paddingLeft: 18 }} data-sem-conta>{semConta.map(y => <li key={y.x.id}><b>{y.x.nome}</b> · {y.oss} OS · {ROLE_LABEL[y.x.role]}</li>)}</ul>
          </Alerta>
        </div>
      )}
      <div className="tbl-wrap" style={{ marginTop: 12 }}>
        <table className="tbl" data-tabela-usuarios>
          <thead><tr><th>Nome</th><th>Perfil</th><th>E-mail</th><th>Nome no sistema atual</th><th>Atende carros</th><th>Situação</th><th /></tr></thead>
          <tbody>{reais.map(x => (
            <tr key={x.id} data-usuario={x.id}>
              <td><b>{x.nome}</b>{x.nivel && <div className="tiny muted">{x.nivel}</div>}</td>
              <td>{ROLE_LABEL[x.role]}</td>
              <td className="small">{x.email || '—'}</td>
              <td className="small">{x.role === 'vendedor' || x.role === 'mecanico' || x.atendeComoMecanico || x.nomeLegado ? (x.nomeLegado || <span className="muted">{nomeLegadoDe(x)} (automático)</span>) : '—'}</td>
              <td data-atende-carros={x.id}>
                {x.role === 'mecanico' ? <span className="small muted">Sim (mecânico)</span>
                  : podeAtenderCarros(x.role) ? (
                    <Btn tamanho="sm" variante={x.atendeComoMecanico ? undefined : 'sec'} carregando={acao.ocupado}
                      onClick={() => acao.executar(() => salvarUsuario(u, { ...x, atendeComoMecanico: !x.atendeComoMecanico }), x.atendeComoMecanico ? `${x.nome} não atende mais carros.` : `${x.nome} agora atende carros: começa o dia fora da fila e entra tocando em "Estou atendendo" na Operação.`)}>
                      {x.atendeComoMecanico ? 'Sim · desligar' : 'Não · ligar'}
                    </Btn>)
                  : <span className="small muted">—</span>}
              </td>
              <td>{!x.ativo ? <Badge tom="muted">Desativado</Badge> : x.trocarSenha ? <Badge tom="atencao">Aguardando 1º acesso</Badge> : <Badge tom="ok">Ativo</Badge>}</td>
              <td className="row">
                <Btn tamanho="sm" variante="ghost" onClick={() => setEd({ id: x.id, nome: x.nome, role: x.role, ativo: x.ativo, nivel: x.nivel, nomeLegado: x.nomeLegado || '', atendeComoMecanico: !!x.atendeComoMecanico })}>Editar</Btn>
                {x.id !== u.id && <Btn tamanho="sm" variante={x.ativo ? 'danger' : 'sec'} carregando={acao.ocupado} onClick={() => acao.executar(() => salvarUsuario(u, { ...x, ativo: !x.ativo }), x.ativo ? 'Acesso desativado.' : 'Acesso reativado.')}>{x.ativo ? 'Desativar' : 'Reativar'}</Btn>}
              </td>
            </tr>))}</tbody>
        </table>
      </div>
      {ed && (
        <Sheet titulo={`Editar ${ed.nome}`} onClose={() => setEd(null)}
          rodape={<><Btn variante="sec" onClick={() => setEd(null)}>Cancelar</Btn><Btn carregando={acao.ocupado} onClick={async () => { if ((await acao.executar(() => salvarUsuario(u, ed), 'Usuário salvo.')) !== undefined) setEd(null); }}>Salvar</Btn></>}>
          <Field rotulo="Nome" obrigatorio htmlFor="us-nome"><input id="us-nome" className="input" value={ed.nome} onChange={e => setEd({ ...ed, nome: e.target.value })} /></Field>
          <div className="grid k2">
            <Field rotulo="Perfil" htmlFor="us-role"><select id="us-role" className="input" value={ed.role} disabled={ed.id === u.id} onChange={e => setEd({ ...ed, role: e.target.value as Role })}>{PERFIS_REAIS.map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select></Field>
            <Field rotulo="Nível (se mecânico)" htmlFor="us-niv"><input id="us-niv" className="input" value={ed.nivel || ''} onChange={e => setEd({ ...ed, nivel: e.target.value })} placeholder="Ex.: N3" /></Field>
          </div>
          <Field rotulo="Nome no sistema atual" htmlFor="us-legado" dica="Como a pessoa aparece como vendedor ou lubrificador nas OS (ex.: Faust, Cadu, Caio). Em branco = primeiro nome.">
            <input id="us-legado" className="input" list="nomes-atuais" value={ed.nomeLegado} maxLength={40} onChange={e => setEd({ ...ed, nomeLegado: e.target.value })} />
            <datalist id="nomes-atuais">{nomesAtuais.map(n => <option key={n} value={n} />)}</datalist>
          </Field>
          {podeAtenderCarros(ed.role) && (
            <label className="row nowrap" style={{ gap: 8, margin: '4px 0 10px' }}>
              <input type="checkbox" checked={ed.atendeComoMecanico} onChange={e => setEd({ ...ed, atendeComoMecanico: e.target.checked })} data-atende />
              <span><b>Atende carros também</b> <span className="small muted">— entra no rodízio, assume e executa OS como mecânico. Começa o dia fora da fila; na Operação, toca em “Estou atendendo” para entrar e em “Não estou atendendo” para sair.</span></span>
            </label>
          )}
          {acao.erro && <Alerta tipo="crit">{acao.erro}</Alerta>}
        </Sheet>
      )}
    </div>
  );
}
