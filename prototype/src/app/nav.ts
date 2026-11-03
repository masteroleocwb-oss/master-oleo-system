import { useEffect, useState, useSyncExternalStore } from 'react';
import { MODO_REAL } from '../data/modo';
import * as nuvem from '../data/nuvem';
import { assinar, getDB } from '../data/store';
import type { Capacidade } from '../domain/permissions';
import type { Role } from '../domain/types';

// ───────────────────────── Sessão ─────────────────────────
// Protótipo: a sessão fica neste navegador (quem entrou e desde quando). No produto, o login é do
// Firebase Auth e o perfil vem de um documento protegido, nunca do navegador.

const CHAVE = 'mo-proto:sessao';
/** A sessão vale por um turno; depois pede login de novo. */
export const SESSAO_HORAS = 12;
type Sessao = { id: string; desde: string };
const ouvintes = new Set<() => void>();
let atual: Sessao | null = (() => {
  try {
    const r = localStorage.getItem(CHAVE);
    if (!r) return null;
    try { const j = JSON.parse(r); if (j?.id) return j as Sessao; } catch { /* formato antigo: só o id */ }
    return { id: r, desde: new Date().toISOString() };
  } catch { return null; }
})();

export const entrar = (id: string) => { atual = { id, desde: new Date().toISOString() }; try { localStorage.setItem(CHAVE, JSON.stringify(atual)); } catch { /* ignora */ } ouvintes.forEach(f => f()); };
export const sair = () => { atual = null; try { localStorage.removeItem(CHAVE); } catch { /* ignora */ } ouvintes.forEach(f => f()); };
/** Id de quem está com a sessão vencida (para registrar a saída), ou null. */
export const sessaoVencida = () => (MODO_REAL ? (nuvem.sessaoVencida() ? nuvem.getEstado().uid : null) : atual && Date.now() - Date.parse(atual.desde) > SESSAO_HORAS * 3600e3 ? atual.id : null);

export function useUsuario() {
  const id = useSyncExternalStore(f => { ouvintes.add(f); return () => ouvintes.delete(f); }, () => atual?.id ?? null);
  const db = useSyncExternalStore(assinar, getDB);
  if (MODO_REAL) {
    const uid = nuvem.getEstado().uid;
    const ur = uid ? db.usuarios.find(x => x.id === uid) : undefined;
    return ur && ur.ativo ? ur : null;
  }
  const u = id ? db.usuarios.find(x => x.id === id) : undefined;
  // Conta desativada, ou conta de demonstração depois que a administração desligou esse acesso: fora.
  return u && u.ativo && !(u.demo && !u.senha && !db.acessoDemo) ? u : null;
}

// ───────────────────────── Rotas ─────────────────────────

export const useRota = () => {
  const [h, setH] = useState(() => location.hash.slice(1) || '/');
  useEffect(() => {
    const f = () => { setH(location.hash.slice(1) || '/'); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);
  const [caminho, query = ''] = h.split('?');
  return { partes: caminho.split('/').filter(Boolean), query: new URLSearchParams(query), caminho };
};

export const ir = (rota: string) => { location.hash = rota; };

export interface ItemNav { rota: string; rotulo: string; icone: string; cap: Capacidade; badge?: number }

export const navPorPerfil = (role: Role): ItemNav[] => {
  const op: ItemNav = { rota: '/operacao', rotulo: 'Operação', icone: '▦', cap: 'operacao.ver' };
  const nova: ItemNav = { rota: '/os/nova', rotulo: 'Nova OS', icone: '+', cap: 'os.abrir' };
  const perf: ItemNav = { rota: '/performance', rotulo: 'Meu mês', icone: '◔', cap: 'performance.propria' };
  const veic: ItemNav = { rota: '/veiculos', rotulo: 'Veículos', icone: '⌕', cap: 'veiculo.ver' };
  const opps: ItemNav = { rota: '/oportunidades', rotulo: 'Recomendações', icone: '◈', cap: 'oportunidade.ver' };
  const lid: ItemNav = { rota: '/lideranca', rotulo: 'Liderança', icone: '◧', cap: 'performance.time' };
  const metas: ItemNav = { rota: '/metas', rotulo: 'Metas e políticas', icone: '◎', cap: 'metas.ver' };
  const adm: ItemNav = { rota: '/admin', rotulo: 'Administração', icone: '⚙', cap: 'admin.historico' };
  switch (role) {
    case 'mecanico': return [op, perf, veic];
    case 'vendedor': return [op, nova, opps, veic];
    case 'comercial': return [opps, op, veic];
    case 'lider': return [op, lid, metas, opps, veic, nova];
    case 'direcao': return [lid, op, metas, opps, veic, adm];
  }
};

export const rotaInicial = (role: Role) => (role === 'comercial' ? '/oportunidades' : role === 'direcao' ? '/lideranca' : '/operacao');
