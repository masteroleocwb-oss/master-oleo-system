// Armazenamento: na demonstração, memória + localStorage DESTE navegador; no piloto (MODO_REAL),
// a base real da oficina (nuvem.ts). A interface usa as mesmas funções nos dois casos.
import type { DB } from '../domain/types';
import { ErroSalvamento } from './erros';
import { MODO_REAL } from './modo';
import * as nuvem from './nuvem';
import { gerarSeed } from './seed';

export { ErroSalvamento };

const CHAVE = 'mo-proto:db:v3';
const CHAVE_DEMO = 'mo-proto:demo-ctrl';

export interface ControleDemo {
  /** Faz o próximo salvamento falhar (testa a UX de erro). */
  falharProximo: boolean;
  /** Simula conexão instável: todo salvamento falha até desligar. */
  offline: boolean;
  latenciaMs: number;
}


/** Armazenamento local, se disponível (no Node dos testes não há; a base fica só em memória). */
const armazenamento: Storage | null = (() => {
  try { const st = globalThis.localStorage; st.setItem('mo-proto:teste', '1'); st.removeItem('mo-proto:teste'); return st; } catch { return null; }
})();

let db: DB = MODO_REAL ? nuvem.getDB() : carregar();
const ouvintes = new Set<() => void>();
let controle: ControleDemo = carregarControle();

function carregar(): DB {
  // Bases de versões anteriores do protótipo não são migradas: a demonstração recomeça com a base nova.
  try { ['mo-proto:db:v1', 'mo-proto:db:v2'].forEach(k => armazenamento?.removeItem(k)); } catch { /* ignora */ }
  try {
    const raw = armazenamento?.getItem(CHAVE);
    if (raw) return JSON.parse(raw) as DB;
  } catch { /* base corrompida ou sem acesso: recria */ }
  const novo = gerarSeed();
  persistir(novo);
  return novo;
}

function carregarControle(): ControleDemo {
  try {
    const raw = armazenamento?.getItem(CHAVE_DEMO);
    if (raw) return { ...{ falharProximo: false, offline: false, latenciaMs: 250 }, ...JSON.parse(raw) };
  } catch { /* ignora */ }
  return { falharProximo: false, offline: false, latenciaMs: 250 };
}

function persistir(d: DB) {
  try { armazenamento?.setItem(CHAVE, JSON.stringify(d)); }
  catch { throw new ErroSalvamento('Sem espaço no armazenamento local do navegador.'); }
}

export const getDB = () => (MODO_REAL ? nuvem.getDB() : db);
export const assinar = (fn: () => void) => {
  if (MODO_REAL) return nuvem.assinar(fn);
  ouvintes.add(fn); return () => { ouvintes.delete(fn); };
};
const notificar = () => ouvintes.forEach(fn => fn());

export const getControle = () => controle;
export const setControle = (c: Partial<ControleDemo>) => {
  controle = { ...controle, ...c };
  try { armazenamento?.setItem(CHAVE_DEMO, JSON.stringify(controle)); } catch { /* ignora */ }
  notificar();
};

const esperar = (ms: number) => new Promise(r => setTimeout(r, ms));

/**
 * Aplica uma alteração de forma atômica (tudo ou nada), como uma transação.
 * Simula latência e falhas de rede para a interface mostrar "Salvando / Salvo / Falha".
 */
/** `cadastroDe`: OS cujo cliente/carro esta ação corrige (na base real, gravados só nelas). */
export async function transacao<T>(mutar: (rascunho: DB) => T, opts: { latencia?: boolean; cadastroDe?: string[] } = {}): Promise<T> {
  if (MODO_REAL) return nuvem.transacao(mutar, opts.cadastroDe);
  if (opts.latencia !== false && controle.latenciaMs) await esperar(controle.latenciaMs);
  if (controle.offline || controle.falharProximo) {
    if (controle.falharProximo) setControle({ falharProximo: false });
    throw new ErroSalvamento();
  }
  const rascunho = structuredClone(db);
  const r = mutar(rascunho);
  persistir(rascunho);
  db = rascunho;
  notificar();
  return r;
}

/** Leitura que também grava (contador de acessos do link público) sem latência. */
export function mutarSemLatencia(mutar: (d: DB) => void) {
  if (MODO_REAL) return; // contador de acessos do link: na base real o link é lido sem login e não grava
  const rascunho = structuredClone(db);
  mutar(rascunho);
  try { persistir(rascunho); } catch { return; }
  db = rascunho;
  notificar();
}

export function resetarDemo() {
  db = gerarSeed();
  persistir(db);
  setControle({ falharProximo: false, offline: false });
  notificar();
}

/** Só para testes automatizados. */
export function _definirDB(d: DB) { db = d; notificar(); }
