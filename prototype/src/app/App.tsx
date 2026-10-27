import { useState, type ReactNode } from 'react';
import { painelHoje } from '../data/metricas';
import { pode, ROLE_LABEL, type Capacidade } from '../domain/permissions';
import type { Usuario } from '../domain/types';
import { Admin } from '../screens/Admin';
import { Checklist } from '../screens/Checklist';
import { DetalhesOS } from '../screens/DetalhesOS';
import { Execucao } from '../screens/Execucao';
import { Retorno } from '../screens/Retorno';
import { Lideranca } from '../screens/Lideranca';
import { Login } from '../screens/Login';
import { Metas } from '../screens/Metas';
import { NovaOS } from '../screens/NovaOS';
import { Operacao } from '../screens/Operacao';
import { Oportunidades } from '../screens/Oportunidades';
import { Performance } from '../screens/Performance';
import { RelatorioPublico } from '../screens/RelatorioPublico';
import { Veiculo, Veiculos } from '../screens/Veiculos';
import { Btn, DemoBanner, DemoControles, Empty, useDB } from '../ui/components';
import { ir, navPorPerfil, rotaInicial, sair, useRota, useUsuario } from './nav';

const LOGO = './brand/logo-master-oleo.png';

function AcessoNegado({ u }: { u: Usuario }) {
  return (
    <div className="card" style={{ maxWidth: 520, margin: '40px auto' }}>
      <Empty titulo="Acesso não permitido para o seu perfil">
        <p className="small" style={{ margin: '6px 0 14px' }}>Você entrou como {ROLE_LABEL[u.role]}. Esta área exige outra permissão. A tentativa não altera nada.</p>
        <Btn onClick={() => ir(rotaInicial(u.role))}>Voltar para o início</Btn>
      </Empty>
    </div>
  );
}

export function App() {
  const { partes, query } = useRota();
  const u = useUsuario();
  const db = useDB();
  const [ctrl, setCtrl] = useState(false);

  // Relatório do cliente: público, sem login, sem navegação interna.
  if (partes[0] === 'r') {
    return <>
      <DemoBanner onControles={() => setCtrl(true)} />
      <RelatorioPublico token={partes[1] || ''} />
      {ctrl && <DemoControles onClose={() => setCtrl(false)} />}
    </>;
  }

  if (!u || partes[0] === 'login') {
    return <>
      <DemoBanner onControles={() => setCtrl(true)} />
      <Login />
      {ctrl && <DemoControles onClose={() => setCtrl(false)} />}
    </>;
  }

  const p = painelHoje(db);
  const badges: Record<string, number> = {
    '/lideranca': pode(u, 'checklist.autorizar_excecao') ? p.excecoesPendentes.length + (u.role === 'direcao' ? p.ocorrenciasDecisao.length + p.metasAguardando.length : 0) : 0,
    '/oportunidades': p.oportunidadesNovas.length,
    '/operacao': u.role === 'mecanico' ? p.correcoesPendentes.filter(c => db.os.find(o => o.id === c.osId)?.mecanicoId === u.id).length : 0,
  };
  const nav = navPorPerfil(u.role).filter(i => pode(u, i.cap)).map(i => ({ ...i, badge: badges[i.rota] || 0 }));

  const guard = (cap: Capacidade, el: ReactNode) => (pode(u, cap) ? el : <AcessoNegado u={u} />);
  const [a, b, c] = partes;
  let tela: ReactNode;
  if (!a) { ir(rotaInicial(u.role)); tela = null; }
  else if (a === 'operacao') tela = guard('operacao.ver', <Operacao u={u} />);
  else if (a === 'os' && b === 'nova') tela = guard('os.abrir', <NovaOS u={u} />);
  else if (a === 'os' && b && c === 'checklist') tela = guard('os.executar', <Checklist u={u} osId={b} foco={query.get('item')} />);
  else if (a === 'os' && b && c === 'execucao') tela = guard('os.executar', <Execucao u={u} osId={b} />);
  else if (a === 'os' && b && c === 'retorno') tela = guard('os.executar', <Retorno u={u} osId={b} />);
  else if (a === 'os' && b) tela = guard('operacao.ver', <DetalhesOS u={u} osId={b} />);
  else if (a === 'veiculos' && b) tela = guard('veiculo.ver', <Veiculo u={u} veiculoId={b} />);
  else if (a === 'veiculos') tela = guard('veiculo.ver', <Veiculos u={u} termoInicial={query.get('q') || ''} />);
  else if (a === 'performance') tela = guard('performance.propria', <Performance u={u} />);
  else if (a === 'oportunidades') tela = guard('oportunidade.ver', <Oportunidades u={u} />);
  else if (a === 'lideranca') tela = guard('performance.time', <Lideranca u={u} aba={b} />);
  else if (a === 'metas') tela = guard('metas.ver', <Metas u={u} aba={b} />);
  else if (a === 'admin') tela = guard('admin.historico', <Admin u={u} aba={b} />);
  else tela = <div className="card"><Empty titulo="Página não encontrada"><Btn onClick={() => ir(rotaInicial(u.role))}>Ir para o início</Btn></Empty></div>;

  const ativo = (rota: string) => ('/' + partes.join('/')).startsWith(rota) && !(rota === '/os/nova' && a !== 'os');

  return (
    <>
      <DemoBanner onControles={() => setCtrl(true)} />
      <header className="topbar">
        <a href={`#${rotaInicial(u.role)}`} aria-label="Início"><img className="logo" src={LOGO} alt="Master Óleo" /></a>
        <div className="spacer" />
        <div className="who"><b>{u.nome}</b><span>{ROLE_LABEL[u.role]}</span></div>
        <Btn variante="sec" tamanho="sm" onClick={() => { sair(); ir('/login'); }}>Trocar usuário</Btn>
      </header>
      <div className="layout">
        <nav className="sidenav" aria-label="Navegação principal">
          {nav.map(i => <a key={i.rota} href={`#${i.rota}`} className={ativo(i.rota) ? 'on' : ''}><span className="ic" aria-hidden>{i.icone}</span>{i.rotulo}{i.badge ? <span className="dot">{i.badge}</span> : null}</a>)}
        </nav>
        <main className="main" id="conteudo">{tela}</main>
      </div>
      <nav className="bottomnav" aria-label="Navegação principal">
        {nav.map(i => <a key={i.rota} href={`#${i.rota}`} className={ativo(i.rota) ? 'on' : ''}><span className="ic" aria-hidden>{i.icone}</span><span>{i.rotulo}{i.badge ? <span className="dot">{i.badge}</span> : null}</span></a>)}
      </nav>
      {ctrl && <DemoControles onClose={() => setCtrl(false)} />}
    </>
  );
}
