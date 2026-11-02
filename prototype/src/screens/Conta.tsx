import { useState } from 'react';
import { ir, rotaInicial } from '../app/nav';
import { POLITICA_ACESSO, RESULTADO_ACESSO, trocarMinhaSenha } from '../data/acesso';
import { ROLE_LABEL } from '../domain/permissions';
import type { Usuario } from '../domain/types';
import { fmtDataHora } from '../domain/util';
import { Alerta, Avatar, Badge, Btn, Card, Field, useAcao, useDB } from '../ui/components';

/** Formulário de troca de senha (no primeiro acesso é obrigatório e ocupa a tela toda). */
export function TrocarSenha({ u, obrigatoria }: { u: Usuario; obrigatoria?: boolean }) {
  const [f, setF] = useState({ atual: '', nova: '', conf: '' });
  const [ver, setVer] = useState(false);
  const acao = useAcao();
  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((await acao.executar(() => trocarMinhaSenha(u, f.atual, f.nova, f.conf), 'Senha trocada.')) !== undefined) {
      setF({ atual: '', nova: '', conf: '' });
      if (obrigatoria) ir(rotaInicial(u.role));
    }
  };
  return (
    <form onSubmit={enviar} className="stack" style={{ maxWidth: 420 }}>
      {obrigatoria && <Alerta tipo="info">Você entrou com uma <b>senha provisória</b>. Crie a sua senha pessoal para continuar. Ninguém da administração consegue ver a sua senha.</Alerta>}
      <Field rotulo={obrigatoria ? 'Senha provisória' : 'Senha atual'} obrigatorio htmlFor="senha-atual">
        <input id="senha-atual" className="input" type={ver ? 'text' : 'password'} autoComplete="current-password" value={f.atual} onChange={e => setF({ ...f, atual: e.target.value })} />
      </Field>
      <Field rotulo="Nova senha" obrigatorio htmlFor="senha-nova" dica={`Pelo menos ${POLITICA_ACESSO.senhaMin} caracteres. Evite 123456, datas e o nome da oficina.`}>
        <input id="senha-nova" className="input" type={ver ? 'text' : 'password'} autoComplete="new-password" value={f.nova} onChange={e => setF({ ...f, nova: e.target.value })} />
      </Field>
      <Field rotulo="Repita a nova senha" obrigatorio htmlFor="senha-conf">
        <input id="senha-conf" className="input" type={ver ? 'text' : 'password'} autoComplete="new-password" value={f.conf} onChange={e => setF({ ...f, conf: e.target.value })} />
      </Field>
      <label className="check"><input type="checkbox" checked={ver} onChange={e => setVer(e.target.checked)} /> Mostrar senhas</label>
      {acao.erro && <Alerta tipo="crit">{acao.erro}</Alerta>}
      <Btn type="submit" carregando={acao.ocupado}>{obrigatoria ? 'Criar minha senha e entrar' : 'Trocar senha'}</Btn>
    </form>
  );
}

/** Perfil da própria pessoa: dados de acesso, troca de senha e os últimos acessos à conta. */
export function MinhaConta({ u }: { u: Usuario }) {
  const db = useDB();
  const meus = db.acessos.filter(a => a.usuarioId === u.id).slice(-15).reverse();
  return (
    <div style={{ maxWidth: 760 }}>
      <div className="page-head"><div><h1>Minha conta</h1><div className="sub">Seu perfil e os acessos à sua conta.</div></div></div>
      <Card titulo="Perfil">
        <div className="row"><Avatar nome={u.nome} /><div><b>{u.nome}</b><div className="small muted">{ROLE_LABEL[u.role]}{u.nivel ? ` · ${u.nivel}` : ''}</div></div></div>
        <dl className="small" style={{ margin: '12px 0 0', display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 12px' }}>
          <dt className="muted">Login</dt><dd style={{ margin: 0 }}>{u.login || (u.demo ? 'Conta de demonstração (sem senha)' : '—')}</dd>
          <dt className="muted">Perfil</dt><dd style={{ margin: 0 }}>{ROLE_LABEL[u.role]} — definido pela administração</dd>
        </dl>
      </Card>
      {u.senha && <Card titulo="Trocar senha"><TrocarSenha u={u} /></Card>}
      <Card titulo="Últimos acessos à sua conta">
        <p className="small muted" style={{ marginBottom: 8 }}>Se aparecer algo que não foi você, troque a senha e avise a administração.</p>
        {meus.length === 0 ? <p className="small muted">Nenhum registro ainda.</p> : (
          <div className="tbl-wrap">
            <table className="tbl" data-meus-acessos>
              <thead><tr><th>Quando</th><th>O que</th><th>Aparelho</th></tr></thead>
              <tbody>{meus.map(a => <tr key={a.id}><td>{fmtDataHora(a.em)}</td><td><Badge tom={RESULTADO_ACESSO[a.resultado].tom}>{RESULTADO_ACESSO[a.resultado].rotulo}</Badge></td><td className="small">{a.dispositivo}</td></tr>)}</tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
