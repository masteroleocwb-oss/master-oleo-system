import { useEffect, useState, useSyncExternalStore } from 'react';
import { assinar, getDB } from '../data/store';
import type { Capacidade } from '../domain/permissions';
import type { Role } from '../domain/types';

// ───────────────────────── Sessão ─────────────────────────
// Protótipo: a "sessão" é o usuário de demonstração escolhido. No produto, login individual
// (Firebase Auth) e o perfil vem de um documento protegido, nunca do navegador.

const CHAVE = 'mo-proto:sessao';
const ouvintes = new Set<() => void>();
let atual: string | null = (() => { try { return localStorage.getItem(CHAVE); } catch { return null; } })();

export const entrar = (id: string) => { atual = id; try { localStorage.setItem(CHAVE, id); } catch { /* ignora */ } ouvintes.forEach(f => f()); };
export const sair = () => { atual = null; try { localStorage.removeItem(CHAVE); } catch { /* ignora */ } ouvintes.forEach(f => f()); };

export function useUsuario() {
  const id = useSyncExternalStore(f => { ouvintes.add(f); return () => ouvintes.delete(f); }, () => atual);
  const db = useSyncExternalStore(assinar, getDB);
  const u = id ? db.usuarios.find(x => x.id === id) : undefined;
  return u && u.ativo ? u : null;
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
