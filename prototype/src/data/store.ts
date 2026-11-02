// Armazenamento do protótipo: memória + localStorage DESTE navegador.
// Não existe nenhuma conexão com Firebase ou outro servidor.
import type { DB } from '../domain/types';
import { gerarSeed } from './seed';

const CHAVE = 'mo-proto:db:v3';
const CHAVE_DEMO = 'mo-proto:demo-ctrl';

export interface ControleDemo {
  /** Faz o próximo salvamento falhar (testa a UX de erro). */
  falharProximo: boolean;
  /** Simula conexão instável: todo salvamento falha até desligar. */
  offline: boolean;
  latenciaMs: number;
}

export class ErroSalvamento extends Error {
  constructor(msg = 'Não foi possível salvar. Verifique a conexão e tente de novo.') { super(msg); this.name = 'ErroSalvamento'; }
}

/** Armazenamento local, se disponível (no Node dos testes não há; a base fica só em memória). */
const armazenamento: Storage | null = (() => {
  try { const st = globalThis.localStorage; st.setItem('mo-proto:teste', '1'); st.removeItem('mo-proto:teste'); return st; } catch { return null; }
})();

let db: DB = carregar();
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

export const getDB = () => db;
export const assinar = (fn: () => void) => { ouvintes.add(fn); return () => { ouvintes.delete(fn); }; };
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
export async function transacao<T>(mutar: (rascunho: DB) => T, opts: { latencia?: boolean } = {}): Promise<T> {
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
