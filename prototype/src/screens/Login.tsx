import { useState } from 'react';
import { entrar, ir, rotaInicial } from '../app/nav';
import { entrarComSenha, entrarDemo } from '../data/acesso';
import * as nuvem from '../data/nuvem';
import { ROLE_LABEL } from '../domain/permissions';
import type { Role } from '../domain/types';
import { Alerta, Avatar, Badge, Btn, Field, useDB } from '../ui/components';

const ROTEIRO: Record<Role, string> = {
  mecanico: 'Assume a OS pelo rodízio, faz o checklist item a item com fotos, finaliza e acompanha o próprio mês.',
  vendedor: 'Abre OS, consulta o histórico do veículo, trata recomendações e envia o relatório ao cliente.',
  comercial: 'Trabalha as recomendações do checklist: apresentar, aceitar, recusar ou deixar para depois.',
  lider: 'Acompanha a operação, autoriza exceções, audita checklists, registra ocorrências e propõe metas.',
  direcao: 'Aprova metas e políticas, decide ocorrências, simula remuneração e administra o sistema.',
};

// O perfil Comercial fica para o futuro: hoje o balcão (vendedor) trata as recomendações.
const ORDEM: Role[] = ['mecanico', 'lider', 'direcao', 'vendedor'];

export function Login() {
  const db = useDB();
  const [msg, setMsg] = useState<string | null>(null);
  const [login, setLogin] = useState('');
  const [senha, setSenha] = useState('');
  const [ver, setVer] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!login.trim() || !senha) { setMsg('Informe o usuário e a senha.'); return; }
    setOcupado(true); setMsg(null);
    try { const u = await entrarComSenha(login, senha); entrar(u.id); ir(rotaInicial(u.role)); }
    catch (err) { setMsg((err as Error).message); setSenha(''); }
    finally { setOcupado(false); }
  };
  return (
    <div className="login-wrap">
      <div className="login-hero">
        <img src="./brand/logo-master-oleo.png" alt="Master Óleo" />
        <h1>Plataforma de operação e inspeção técnica</h1>
      </div>
      <form className="card login-form" onSubmit={enviar} aria-label="Entrar">
        <h2 style={{ marginBottom: 10 }}>Entrar</h2>
        <Field rotulo="E-mail ou usuário" htmlFor="login-usuario">
          <input id="login-usuario" className="input" autoComplete="username" autoCapitalize="none" value={login} onChange={e => setLogin(e.target.value)} />
        </Field>
        <Field rotulo="Senha" htmlFor="login-senha">
          <div className="row nowrap">
            <input id="login-senha" className="input" type={ver ? 'text' : 'password'} autoComplete="current-password" value={senha} onChange={e => setSenha(e.target.value)} />
            <Btn variante="ghost" tamanho="sm" onClick={() => setVer(!ver)} aria-label={ver ? 'Esconder senha' : 'Mostrar senha'}>{ver ? 'Esconder' : 'Mostrar'}</Btn>
          </div>
        </Field>
        {msg && <div style={{ marginTop: 10 }}><Alerta tipo="crit">{msg}</Alerta></div>}
        <div style={{ marginTop: 12 }}><Btn type="submit" block carregando={ocupado}>Entrar</Btn></div>
        <p className="small muted" style={{ marginTop: 10 }}>Esqueceu a senha ou o acesso foi bloqueado? Peça à administração para redefinir. Cada entrada fica registrada.</p>
      </form>
      {db.acessoDemo && <>
      <div className="section-title" style={{ marginTop: 24 }}>Contas de demonstração (beta)</div>
      <Alerta tipo="info">
        Para testar sem senha, toque em uma pessoa fictícia abaixo. A administração pode desligar estas contas em Admin › Acessos
        depois de criar os acessos do time. Neste beta tudo fica guardado só neste navegador.
      </Alerta>
      {ORDEM.map(role => {
        const us = db.usuarios.filter(u => u.role === role && u.demo);
        if (!us.length) return null;
        return (
          <section key={role}>
            <div className="section-title">{ROLE_LABEL[role]}</div>
            <p className="small muted" style={{ marginBottom: 8 }}>{ROTEIRO[role]}</p>
            <div className="user-grid">
              {us.map(u => (
                <button key={u.id} className={`user-card ${u.ativo ? '' : 'off'}`} data-user={u.id}
                  onClick={() => {
                    try { entrarDemo(u.id); entrar(u.id); ir(rotaInicial(u.role)); }
                    catch (err) { setMsg((err as Error).message); window.scrollTo(0, 0); }
                  }}>
                  <Avatar nome={u.nome} />
                  <span className="grow">
                    <span className="strong" style={{ display: 'block' }}>{u.nome}</span>
                    <span className="small muted">{ROLE_LABEL[u.role]}{u.nivel ? ` · ${u.nivel}` : ''}</span>
                  </span>
                  {!u.ativo && <Badge tom="muted">Desativado</Badge>}
                </button>
              ))}
            </div>
          </section>
        );
      })}
      </>}
      <div className="section-title">Cliente (sem login)</div>
      <p className="small muted">O cliente não tem conta: recebe um link seguro do relatório. Exemplos para testar os estados do link:</p>
      <div className="row" style={{ marginTop: 8 }}>
        <a className="btn sec sm" href="#/r/Dm0Ativo7xQ2pL9vR4tY1w">Link ativo</a>
        <a className="btn sec sm" href="#/r/Dm0Revog3kP8sN2bV6cX0z">Link revogado</a>
        <a className="btn sec sm" href="#/r/Dm0Expir5mQ1wE7rT3yU9i">Link expirado</a>
        <a className="btn sec sm" href="#/r/7001">Link inválido (número da OS)</a>
      </div>
    </div>
  );
}

/** Login na base real: e-mail e senha do Firebase (as mesmas contas do sistema atual). */
export function LoginReal({ aviso }: { aviso?: string }) {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [ver, setVer] = useState(false);
  const [msg, setMsg] = useState<{ tipo: 'crit' | 'info'; texto: string } | null>(aviso ? { tipo: 'info', texto: aviso } : null);
  const [ocupado, setOcupado] = useState(false);
  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !senha) { setMsg({ tipo: 'crit', texto: 'Informe o e-mail e a senha.' }); return; }
    setOcupado(true); setMsg(null);
    try { await nuvem.entrar(email, senha); ir('/'); }
    catch (err) { setMsg({ tipo: 'crit', texto: (err as Error).message }); setSenha(''); }
    finally { setOcupado(false); }
  };
  const esqueci = async () => {
    if (!email.trim()) { setMsg({ tipo: 'crit', texto: 'Digite o seu e-mail no campo acima e toque de novo em "Esqueci minha senha".' }); return; }
    setOcupado(true);
    try { await nuvem.esqueciSenha(email); setMsg({ tipo: 'info', texto: 'Se o e-mail estiver cadastrado, chega em instantes um link para criar uma nova senha. Confira também o spam.' }); }
    catch (err) { setMsg({ tipo: 'crit', texto: (err as Error).message }); }
    finally { setOcupado(false); }
  };
  return (
    <div className="login-wrap">
      <div className="login-hero">
        <img src="./brand/logo-master-oleo.png" alt="Master Óleo" />
        <h1>Plataforma de operação e inspeção técnica</h1>
      </div>
      <form className="card login-form" onSubmit={enviar} aria-label="Entrar">
        <h2 style={{ marginBottom: 10 }}>Entrar</h2>
        <Field rotulo="E-mail" htmlFor="login-email">
          <input id="login-email" className="input" type="email" autoComplete="username" autoCapitalize="none" value={email} onChange={e => setEmail(e.target.value)} />
        </Field>
        <Field rotulo="Senha" htmlFor="login-senha">
          <div className="row nowrap">
            <input id="login-senha" className="input" type={ver ? 'text' : 'password'} autoComplete="current-password" value={senha} onChange={e => setSenha(e.target.value)} />
            <Btn variante="ghost" tamanho="sm" onClick={() => setVer(!ver)} aria-label={ver ? 'Esconder senha' : 'Mostrar senha'}>{ver ? 'Esconder' : 'Mostrar'}</Btn>
          </div>
        </Field>
        {msg && <div style={{ marginTop: 10 }}><Alerta tipo={msg.tipo}>{msg.texto}</Alerta></div>}
        <div style={{ marginTop: 12 }}><Btn type="submit" block carregando={ocupado}>Entrar</Btn></div>
        <div style={{ marginTop: 8, textAlign: 'center' }}><Btn variante="ghost" tamanho="sm" onClick={esqueci} disabled={ocupado}>Esqueci minha senha</Btn></div>
        <p className="small muted" style={{ marginTop: 10 }}>Use o mesmo e-mail e a mesma senha do sistema atual. Cada entrada fica registrada; não compartilhe a sua senha.</p>
      </form>
    </div>
  );
}
