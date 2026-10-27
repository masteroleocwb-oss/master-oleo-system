import { useState } from 'react';
import { entrar, ir, rotaInicial } from '../app/nav';
import { ROLE_LABEL } from '../domain/permissions';
import type { Role } from '../domain/types';
import { Alerta, Avatar, Badge, useDB } from '../ui/components';

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
  return (
    <div className="login-wrap">
      <div className="login-hero">
        <img src="./brand/logo-master-oleo.png" alt="Master Óleo" />
        <h1>Plataforma de operação e inspeção técnica</h1>
        <p className="muted">Protótipo navegável. Escolha um usuário de demonstração para entrar com o perfil dele.</p>
      </div>
      <Alerta tipo="info">
        No produto, cada pessoa entra com o próprio login (e-mail e senha ou PIN pessoal) e o perfil é definido pela administração.
        Aqui não há senha: a escolha abaixo simula o login individual. Toda ação fica registrada com o nome de quem fez.
      </Alerta>
      {msg && <div style={{ marginTop: 12 }}><Alerta tipo="crit">{msg}</Alerta></div>}
      {ORDEM.map(role => {
        const us = db.usuarios.filter(u => u.role === role);
        if (!us.length) return null;
        return (
          <section key={role}>
            <div className="section-title">{ROLE_LABEL[role]}</div>
            <p className="small muted" style={{ marginBottom: 8 }}>{ROTEIRO[role]}</p>
            <div className="user-grid">
              {us.map(u => (
                <button key={u.id} className={`user-card ${u.ativo ? '' : 'off'}`} data-user={u.id}
                  onClick={() => {
                    if (!u.ativo) { setMsg(`${u.nome} está com o acesso desativado. Peça à administração para reativar.`); return; }
                    entrar(u.id); ir(rotaInicial(u.role));
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
