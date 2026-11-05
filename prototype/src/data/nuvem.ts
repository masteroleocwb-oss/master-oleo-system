// Base real (piloto): Firebase Auth + Firestore + Storage do projeto da oficina.
// As OS ficam em `orders`, no formato do sistema atual (ver legado.ts). O resto (checklists, fotos,
// recomendações, histórico…) fica em coleções próprias do sistema novo.
// A interface continua lendo um "DB" em memória: este módulo o monta a partir dos documentos e,
// a cada ação, grava só o que mudou, numa transação que confere se ninguém alterou antes.
import { initializeApp, type FirebaseApp } from 'firebase/app';
import {
  connectAuthEmulator, EmailAuthProvider, getAuth, onAuthStateChanged, reauthenticateWithCredential, sendPasswordResetEmail,
  signInWithEmailAndPassword, signOut, updatePassword, type Auth, type User,
} from 'firebase/auth';
import {
  addDoc, collection, connectFirestoreEmulator, deleteField, doc, FieldPath, getDocs, getDocsFromCache, initializeFirestore, limit, onSnapshot, orderBy,
  persistentLocalCache, persistentMultipleTabManager, query, runTransaction, serverTimestamp, where, type DocumentData, type Firestore, type Unsubscribe,
} from 'firebase/firestore';
import { connectStorageEmulator, getDownloadURL, getStorage, ref as refStorage, uploadString, type FirebaseStorage } from 'firebase/storage';
import { CATALOGO_INICIAL, REGRAS_INICIAIS } from '../domain/catalogo';
import type { DB, RegistroAcesso, ResultadoAcesso, Role, Usuario } from '../domain/types';
import { ErroSalvamento as ErroNuvem } from './erros';
import { camposAlterados, derivarCadastros, legadoDeOS, MapaNomes, osDeLegado, PADRAO_CRIACAO, type DocLegado } from './legado';

/** Configuração pública do app web (a mesma do sistema atual; não é segredo — o acesso é controlado pelas regras). */
const CONFIG = {
  apiKey: 'AIzaSyDGKmHDcq4ErMxiovaZJl7W2aASQ_WqgGY',
  authDomain: 'masteroleo-1ed99.firebaseapp.com',
  projectId: 'masteroleo-1ed99',
  storageBucket: 'masteroleo-1ed99.firebasestorage.app',
  messagingSenderId: '242752297319',
  appId: '1:242752297319:web:e6384e400ba2abc2aa37c2',
};


const emNavegador = typeof window !== 'undefined';
export const USAR_EMULADOR = emNavegador && ['localhost', '127.0.0.1'].includes(location.hostname) && new URLSearchParams(location.search).has('emulador');

let app: FirebaseApp, auth: Auth, fs: Firestore, st: FirebaseStorage;
let iniciado = false;
export function iniciar() {
  if (iniciado) return;
  iniciado = true;
  app = initializeApp(CONFIG);
  auth = getAuth(app);
  fs = initializeFirestore(app, {
    ignoreUndefinedProperties: true,
    ...(USAR_EMULADOR ? {} : { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) }),
  });
  st = getStorage(app);
  if (USAR_EMULADOR) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectFirestoreEmulator(fs, '127.0.0.1', 8080);
    connectStorageEmulator(st, '127.0.0.1', 9199);
  }
  onAuthStateChanged(auth, u => { void aoMudarLogin(u); });
}

// ───────────────────────── Estado ─────────────────────────

/** Coleções do sistema novo: chave no DB → coleção no Firestore. */
const COLECOES = {
  checklists: 'checklists', evidencias: 'evidencias', oportunidades: 'oportunidades', manutencoes: 'manutencoes',
  compartilhamentos: 'compartilhamentos', catalogo: 'catalogo', regrasIntervalo: 'regrasIntervalo', metas: 'metas',
  politicas: 'politicas', ocorrencias: 'ocorrencias', auditorias: 'auditorias', planosAcao: 'planosAcao',
  diasExcecao: 'diasExcecao', fechamentos: 'fechamentos', eventos: 'eventos',
} as const;
type ChaveCol = keyof typeof COLECOES;
const CHAVES = Object.keys(COLECOES) as ChaveCol[];

/** Documentos sem campo `id` próprio. */
const idDe = (chave: ChaveCol, x: Record<string, unknown>): string =>
  chave === 'diasExcecao' ? String(x.data) : chave === 'fechamentos' ? `${x.mes}_${x.usuarioId}` : String(x.id);

/** Intervalos: só o óleo de motor foi definido pela direção (D-05). Os demais ficam como "acompanhar". */
const REGRAS_REAIS = REGRAS_INICIAIS.map(r => r.id === 'r_oleo_motor' ? { ...r, validadaPor: 'direcao' }
  : { ...r, km: undefined, meses: undefined, validada: false, validadaPor: undefined, origem: 'nao_confirmada' as const, fonte: 'Aguardando definição da direção (D-05)' });

const raw = {
  orders: new Map<string, DocLegado>(),
  usuarios: new Map<string, DocumentData>(),
  global: {} as DocumentData,
  acessos: [] as RegistroAcesso[],
  col: Object.fromEntries(CHAVES.map(c => [c, new Map<string, unknown>()])) as Record<ChaveCol, Map<string, unknown>>,
};
const carregou = { orders: false, usuarios: false, global: false };

export type EstadoBase = 'desconectado' | 'carregando' | 'pronto' | 'erro';
let estado: EstadoBase = 'desconectado';
let erroCarga = '';
let uidAtual: string | null = null;
let db: DB = dbVazio();
const ouvintes = new Set<() => void>();
const notificar = () => ouvintes.forEach(f => f());
export const assinar = (f: () => void) => { ouvintes.add(f); return () => { ouvintes.delete(f); }; };
export const getDB = () => db;
export const getEstado = () => ({ estado, erro: erroCarga, uid: uidAtual });

function dbVazio(): DB {
  return {
    versao: 1, geradoEm: new Date().toISOString(), usuarios: [], clientes: [], veiculos: [], os: [], checklists: [], evidencias: [], oportunidades: [],
    catalogo: [], regrasIntervalo: [], manutencoes: [], compartilhamentos: [], metas: [], politicas: [], ocorrencias: [], auditorias: [], planosAcao: [],
    diasExcecao: [], fechamentos: [], eventos: [], acessos: [], acessoDemo: false, contadorOS: 0, rodizio: { dia: '', status: {} },
  };
}

const isoDe = (x: unknown): string => {
  const t = x as { toDate?: () => Date } | null;
  return t && typeof t.toDate === 'function' ? t.toDate().toISOString() : typeof x === 'string' ? x : '2020-01-01T00:00:00.000Z';
};

const usuarioDeDoc = (id: string, u: DocumentData): Usuario => ({
  id, nome: u.nome || u.email || 'Sem nome', role: (u.perfil || 'mecanico') as Role, ativo: u.ativo === true, criadoEm: isoDe(u.criadoEm),
  email: u.email, nomeLegado: u.nomeLegado || undefined, nivel: u.nivel || undefined, trocarSenha: u.trocarSenha === true,
});

let reconstruir = false;
function agendar() {
  if (reconstruir) return;
  reconstruir = true;
  queueMicrotask(() => {
    reconstruir = false;
    db = montarDB();
    if (estado === 'carregando' && carregou.orders && carregou.usuarios && carregou.global) estado = 'pronto';
    notificar();
  });
}

function montarDB(): DB {
  const reais = [...raw.usuarios].map(([id, u]) => usuarioDeDoc(id, u));
  const nomes = new MapaNomes(reais);
  const orders = [...raw.orders];
  const os = orders.map(([id, o]) => osDeLegado(id, o, nomes));
  const { veiculos, clientes } = derivarCadastros(orders);
  const rod = (raw.global.rodizio || {}) as { dia?: string; status?: Record<string, string> };
  const status: DB['rodizio']['status'] = {};
  for (const [nome, s] of Object.entries(rod.status || {})) {
    const id = nomes.id(nome, 'mecanico');
    if (id && (s === 'disponivel' || s === 'almoco' || s === 'ausente')) status[id] = s;
  }
  const lista = <K extends ChaveCol>(k: K) => [...raw.col[k].values()] as DB[K];
  const catalogo = lista('catalogo');
  const regras = lista('regrasIntervalo');
  return {
    ...dbVazio(),
    geradoEm: new Date().toISOString(),
    usuarios: [...reais, ...nomes.semConta.values()],
    clientes, veiculos, os,
    checklists: lista('checklists'), evidencias: lista('evidencias'), oportunidades: lista('oportunidades'), manutencoes: lista('manutencoes'),
    compartilhamentos: lista('compartilhamentos'), metas: lista('metas'), politicas: lista('politicas'), ocorrencias: lista('ocorrencias'),
    auditorias: lista('auditorias'), planosAcao: lista('planosAcao'), diasExcecao: lista('diasExcecao'), fechamentos: lista('fechamentos'),
    eventos: lista('eventos').sort((a, b) => a.em.localeCompare(b.em)),
    catalogo: catalogo.length ? catalogo : CATALOGO_INICIAL.map(d => ({ ...d })),
    regrasIntervalo: regras.length ? regras : REGRAS_REAIS.map(r => JSON.parse(JSON.stringify(r))),
    acessos: raw.acessos,
    contadorOS: os.reduce((m, o) => Math.max(m, o.numero), 0),
    rodizio: { dia: rod.dia || '', status },
  };
}

// ───────────────────────── Login e carga ─────────────────────────

const CHAVE_SESSAO = 'mo2:sessaoDesde';
export const SESSAO_HORAS = 12;
let assinaturas: Unsubscribe[] = [];
const desligar = () => { assinaturas.forEach(f => f()); assinaturas = []; };

async function aoMudarLogin(u: User | null) {
  desligar();
  raw.orders.clear(); raw.usuarios.clear(); raw.global = {}; raw.acessos = [];
  CHAVES.forEach(c => raw.col[c].clear());
  Object.assign(carregou, { orders: false, usuarios: false, global: false });
  pediuAntigas = false; placasBuscadas.clear(); eventosRodizio = false;
  uidAtual = u?.uid ?? null;
  if (!u) { estado = 'desconectado'; db = dbVazio(); notificar(); return; }
  // Sessão aberta fora da tela de login (ou vencida): sai.
  const desde = Number(localStorage.getItem(CHAVE_SESSAO) || 0);
  if (!desde) { await signOut(auth); return; }
  estado = 'carregando'; erroCarga = '';
  notificar();
  const falha = (e: unknown) => {
    const code = (e as { code?: string })?.code;
    erroCarga = code === 'permission-denied' ? 'Seu login não tem permissão para ver os dados. Fale com a direção.' : 'Não foi possível carregar os dados. Verifique a conexão.';
    estado = 'erro'; notificar();
  };
  // OS dos últimos 90 dias ao vivo (mesma janela do sistema atual). O histórico antigo vem depois,
  // conforme o perfil (ver carregarAntigas), para não ler a coleção inteira a cada login.
  const desdeISO = new Date(Date.now() - JANELA_DIAS * 864e5).toISOString();
  assinaturas.push(onSnapshot(query(collection(fs, 'orders'), where('dataHora', '>=', desdeISO)), s => {
    s.docChanges().forEach(ch => { if (ch.type === 'removed') raw.orders.delete(ch.doc.id); else raw.orders.set(ch.doc.id, ch.doc.data()); });
    if (!carregou.orders) { carregou.orders = true; carregarAntigas(u.uid); }
    void buscarPlacasAbertas();
    agendar();
  }, falha));
  assinaturas.push(onSnapshot(collection(fs, 'usuarios'), s => {
    s.docChanges().forEach(ch => { if (ch.type === 'removed') raw.usuarios.delete(ch.doc.id); else raw.usuarios.set(ch.doc.id, ch.doc.data()); });
    if (!carregou.usuarios) {
      carregou.usuarios = true;
      if (raw.usuarios.get(u.uid)?.perfil === 'direcao') assinarAcessos();
      carregarAntigas(u.uid);
    }
    agendar();
  }, falha));
  assinaturas.push(onSnapshot(doc(fs, 'config', 'global'), s => { raw.global = s.data() || {}; carregou.global = true; agendar(); }, falha));
  for (const c of CHAVES) {
    const q = c === 'eventos' ? query(collection(fs, COLECOES[c]), orderBy('em', 'desc'), limit(600)) : collection(fs, COLECOES[c]);
    assinaturas.push(onSnapshot(q, s => {
      s.docChanges().forEach(ch => { if (ch.type === 'removed') raw.col[c].delete(ch.doc.id); else raw.col[c].set(ch.doc.id, ch.doc.data()); });
      agendar();
    }, e => console.warn('Falha ao ler', c, e)));
  }
}

const JANELA_DIAS = 90;
const CHAVE_HISTORICO = 'mo2:historicoEm';
const HISTORICO_VALE_DIAS = 45;
/** Quem busca cliente antigo por nome/telefone ou vê indicadores precisa do histórico inteiro. */
const PERFIS_HISTORICO = ['direcao', 'lider', 'vendedor'];
let pediuAntigas = false;
const placasBuscadas = new Set<string>();

/** Depois de saber o perfil: histórico inteiro para quem precisa; os demais recebem só o das placas em atendimento. */
function carregarAntigas(uid: string) {
  if (pediuAntigas || !carregou.orders || !carregou.usuarios) return;
  pediuAntigas = true;
  if (PERFIS_HISTORICO.includes(raw.usuarios.get(uid)?.perfil)) void carregarHistorico();
  else void buscarPlacasAbertas();
}

/**
 * Histórico completo: lido do servidor uma vez por aparelho e guardado no cache local do navegador.
 * Nos logins seguintes vem do cache (sem custo); as OS recentes chegam pela janela ao vivo.
 */
async function carregarHistorico() {
  try {
    const marca = Number(localStorage.getItem(CHAVE_HISTORICO) || 0);
    let s = null;
    if (!USAR_EMULADOR && marca && Date.now() - marca < HISTORICO_VALE_DIAS * 864e5) {
      s = await getDocsFromCache(collection(fs, 'orders')).catch(() => null);
      if (s && s.size < 100) s = null;
    }
    if (!s) {
      s = await getDocs(collection(fs, 'orders'));
      localStorage.setItem(CHAVE_HISTORICO, String(Date.now()));
    }
    s.forEach(d => { if (!raw.orders.has(d.id)) raw.orders.set(d.id, d.data()); });
    agendar();
  } catch (e) { console.warn('Histórico completo indisponível', e); }
}

let eventosRodizio = false;
/** Marcações de almoço/ausência (poucas por dia) para o painel de assistência; o resto do histórico vem pela janela. */
export async function carregarEventosRodizio() {
  if (eventosRodizio || !fs || !uidAtual) return;
  eventosRodizio = true;
  try {
    const s = await getDocs(query(collection(fs, 'eventos'), where('tipo', '==', 'rodizio.status')));
    s.forEach(d => { if (!raw.col.eventos.has(d.id)) raw.col.eventos.set(d.id, d.data()); });
    agendar();
  } catch (e) { eventosRodizio = false; console.warn('Marcações do rodízio indisponíveis', e); }
}

/** Sem o histórico inteiro: busca as OS antigas só das placas que estão em atendimento (km, últimas trocas). */
async function buscarPlacasAbertas() {
  if (!pediuAntigas || PERFIS_HISTORICO.includes(raw.usuarios.get(uidAtual ?? '')?.perfil)) return;
  const novas = new Set<string>();
  for (const o of raw.orders.values()) {
    if (o.status !== 'aguardando' && o.status !== 'andamento') continue;
    const p = String(o.placa || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (p && !placasBuscadas.has(p)) { placasBuscadas.add(p); novas.add(p); }
  }
  // Formatos gravados pelo sistema atual: "ABC1234" e "ABC-1234". Até 30 valores por consulta.
  const valores = [...novas].flatMap(p => [p, `${p.slice(0, 3)}-${p.slice(3)}`]);
  for (let i = 0; i < valores.length; i += 30) {
    try {
      const s = await getDocs(query(collection(fs, 'orders'), where('placa', 'in', valores.slice(i, i + 30))));
      s.forEach(d => { if (!raw.orders.has(d.id)) raw.orders.set(d.id, d.data()); });
      agendar();
    } catch (e) { console.warn('Histórico da placa indisponível', e); }
  }
}

function assinarAcessos() {
  assinaturas.push(onSnapshot(query(collection(fs, 'acessos'), orderBy('em', 'desc'), limit(400)), s => {
    raw.acessos = s.docs.map(d => {
      const a = d.data();
      return { id: d.id, em: isoDe(a.em), usuarioId: a.uid || undefined, loginDigitado: a.email || undefined, resultado: a.resultado as ResultadoAcesso, dispositivo: a.dispositivo || '' };
    }).reverse();
    agendar();
  }, e => console.warn('Registro de acessos indisponível', e)));
}

export const dispositivoResumo = () => {
  const ua = navigator.userAgent;
  const nav = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Navegador';
  const so = /iPhone|iPad/.test(ua) ? 'iPhone/iPad' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : 'outro';
  return `Sistema novo · ${nav} · ${so}${/Mobile/.test(ua) ? ' (celular)' : ''}`.slice(0, 80);
};

/** Mesmo registro de acessos do sistema atual (coleção `acessos`, só acrescenta). */
export async function registrarAcesso(resultado: string, email?: string) {
  const u = auth.currentUser;
  try {
    await addDoc(collection(fs, 'acessos'), {
      resultado, uid: u?.uid ?? null, email: (email || u?.email || '').slice(0, 120),
      nome: u ? (raw.usuarios.get(u.uid)?.nome ?? null) : null, alvo: null, dispositivo: dispositivoResumo(), em: serverTimestamp(),
    });
  } catch (e) { console.warn('Não registrou o acesso', e); }
}

const mensagemAuth = (e: unknown) => {
  const c = (e as { code?: string })?.code || '';
  if (/invalid-credential|wrong-password|user-not-found|invalid-email|invalid-login/.test(c)) return 'E-mail ou senha incorretos.';
  if (/too-many-requests/.test(c)) return 'Muitas tentativas. Aguarde alguns minutos ou use "Esqueci minha senha".';
  if (/user-disabled/.test(c)) return 'Este acesso está desativado. Fale com a direção.';
  if (/network/.test(c)) return 'Sem conexão. Verifique a internet e tente de novo.';
  if (/requires-recent-login/.test(c)) return 'Por segurança, saia e entre de novo antes de trocar a senha.';
  if (/weak-password/.test(c)) return 'Senha fraca. Use pelo menos 8 caracteres.';
  return 'Não foi possível entrar. Tente de novo.';
};

export async function entrar(email: string, senha: string) {
  iniciar();
  const em = email.trim().toLowerCase();
  localStorage.setItem(CHAVE_SESSAO, String(Date.now()));
  try {
    const cred = await signInWithEmailAndPassword(auth, em, senha);
    await registrarAcesso('entrou');
    return cred.user.uid;
  } catch (e) {
    localStorage.removeItem(CHAVE_SESSAO);
    const c = (e as { code?: string })?.code || '';
    if (/invalid-credential|wrong-password|user-not-found/.test(c)) await registrarAcesso('senha_errada', em);
    if (/too-many-requests/.test(c)) await registrarAcesso('bloqueado', em);
    throw new Error(mensagemAuth(e));
  }
}

export async function sair(resultado = 'saiu') {
  if (!iniciado) return;
  if (auth.currentUser) await registrarAcesso(resultado);
  localStorage.removeItem(CHAVE_SESSAO);
  await signOut(auth);
}

export const sessaoVencida = () => {
  const desde = Number(localStorage.getItem(CHAVE_SESSAO) || 0);
  return !!uidAtual && !!desde && Date.now() - desde > SESSAO_HORAS * 3600e3;
};

export async function esqueciSenha(email: string) {
  iniciar();
  try { await sendPasswordResetEmail(auth, email.trim().toLowerCase()); }
  catch (e) { if (!/user-not-found/.test((e as { code?: string })?.code || '')) throw new Error(mensagemAuth(e)); }
}

export async function trocarSenha(atual: string, nova: string) {
  const u = auth.currentUser;
  if (!u?.email) throw new Error('Entre de novo para trocar a senha.');
  try {
    await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email, atual));
    await updatePassword(u, nova);
  } catch (e) {
    const c = (e as { code?: string })?.code || '';
    throw new Error(/invalid-credential|wrong-password/.test(c) ? 'A senha atual não confere.' : mensagemAuth(e));
  }
  const { updateDoc } = await import('firebase/firestore');
  await updateDoc(doc(fs, 'usuarios', u.uid), { trocarSenha: false, senhaTrocadaEm: serverTimestamp() });
  await registrarAcesso('senha_trocada');
}

// ───────────────────────── Gravação ─────────────────────────

/** JSON com chaves ordenadas: o Firestore não preserva a ordem dos campos. */
const estavel = (x: unknown): string => JSON.stringify(x, (_k, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v));
const limpo = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

/** Campos de cadastro: só são gravados quando a OS nasce (não reescrevem o histórico). */
const CAMPOS_CADASTRO = new Set(['cliente', 'tel', 'placa', 'marca', 'modelo', 'motor', 'ano', 'cambio', 'combustivel', 'comoConheceu', 'comoConheceuDetalhe', 'cidade', 'bairro', 'kmPorMes']);

/** Projeção do relatório público (vem de api.ts, registrada lá para não criar dependência circular). */
let projetar: ((d: DB, osId: string) => unknown) | null = null;
export const definirProjetor = (f: (d: DB, osId: string) => unknown) => { projetar = f; };

const CONFLITO = 'Outra pessoa alterou estes dados agora há pouco. A tela já foi atualizada; confira e tente de novo.';

/** Aplica uma ação: monta o rascunho, grava o que mudou numa transação e devolve o resultado. */
export async function transacao<T>(mutar: (rascunho: DB) => T): Promise<T> {
  if (estado !== 'pronto') throw new ErroNuvem('Ainda carregando os dados. Aguarde um instante.');
  const antes = db;
  const depois = structuredClone(db);
  const r = mutar(depois);
  await gravar(antes, depois);
  return r;
}

async function enviarFotos(antes: DB, depois: DB) {
  for (const ev of depois.evidencias) {
    if (!ev.url.startsWith('data:') || antes.evidencias.some(x => x.id === ev.id && x.url === ev.url && !x.url.startsWith('data:'))) continue;
    const r = refStorage(st, `plataforma/evidencias/${ev.osId}/${ev.id}.jpg`);
    await uploadString(r, ev.url, 'data_url');
    ev.url = await getDownloadURL(r);
    ev.demo = false;
  }
}

async function gravar(antes: DB, depois: DB) {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new ErroNuvem('Sua sessão terminou. Entre de novo.');
  try { await enviarFotos(antes, depois); }
  catch { throw new ErroNuvem('Não foi possível enviar a foto. Verifique a conexão e tente de novo.'); }

  const nomesA = new MapaNomes(antes.usuarios);
  const nomesD = new MapaNomes(depois.usuarios);
  const veic = (d: DB, id: string) => d.veiculos.find(v => v.id === id);
  const cli = (d: DB, id: string) => d.clientes.find(c => c.id === id);

  // OS
  const novas = depois.os.filter(o => !antes.os.some(a => a.id === o.id));
  const alteradas: { id: string; campos: string[]; antes: DocLegado; depois: DocLegado }[] = [];
  for (const o of depois.os) {
    const a = antes.os.find(x => x.id === o.id);
    if (!a || estavel(a) === estavel(o)) continue;
    const pa = legadoDeOS(a, veic(antes, a.veiculoId), cli(antes, a.clienteId), nomesA);
    const pd = legadoDeOS(o, veic(depois, o.veiculoId), cli(depois, o.clienteId), nomesD);
    const campos = camposAlterados(pa, pd).filter(k => !CAMPOS_CADASTRO.has(k));
    if (campos.length) alteradas.push({ id: o.id, campos, antes: pa, depois: pd });
  }
  if (depois.os.length < antes.os.length) throw new ErroNuvem('OS não são apagadas no sistema novo; use Cancelar.');

  // Coleções do sistema novo
  type Mud = { chave: ChaveCol; id: string; antes?: unknown; depois?: unknown };
  const muds: Mud[] = [];
  for (const c of CHAVES) {
    const ma = new Map((antes[c] as unknown as Record<string, unknown>[]).map(x => [idDe(c, x), x]));
    const md = new Map((depois[c] as unknown as Record<string, unknown>[]).map(x => [idDe(c, x), x]));
    for (const [id, x] of md) { const y = ma.get(id); if (!y || estavel(y) !== estavel(x)) muds.push({ chave: c, id, antes: y, depois: x }); }
    if (c !== 'eventos') for (const [id, y] of ma) if (!md.has(id)) muds.push({ chave: c, id, antes: y });
  }
  // Catálogo e regras ainda não gravados vêm do padrão: a primeira alteração grava a lista inteira.
  for (const c of ['catalogo', 'regrasIntervalo'] as const) {
    if (raw.col[c].size === 0 && muds.some(m => m.chave === c)) {
      for (const x of depois[c] as unknown as Record<string, unknown>[]) if (!muds.some(m => m.chave === c && m.id === idDe(c, x))) muds.push({ chave: c, id: idDe(c, x), depois: x });
    }
  }

  // Usuários: só edição de perfil (contas novas são criadas no 👥 Usuários do sistema atual).
  const mudUsuarios = depois.usuarios.filter(u => !u.id.startsWith('legado:')).flatMap(u => {
    const a = antes.usuarios.find(x => x.id === u.id);
    if (!a) throw new ErroNuvem('Para criar uma conta nova, use o botão 👥 Usuários no sistema atual.');
    return estavel(a) === estavel(u) ? [] : [u];
  });

  const rodizioMudou = estavel(antes.rodizio) !== estavel(depois.rodizio);

  if (!novas.length && !alteradas.length && !muds.length && !mudUsuarios.length && !rodizioMudou) return;

  let maiorExistente = 0;
  if (novas.length) {
    try {
      const s = await getDocs(query(collection(fs, 'orders'), orderBy('numeroOrdem', 'desc'), limit(1)));
      maiorExistente = Number(s.docs[0]?.data().numeroOrdem) || 0;
    } catch { throw new ErroNuvem('Não foi possível gerar o número da OS. Verifique a conexão e tente de novo.'); }
  }

  const escritasLocais: (() => void)[] = [];
  try {
    await runTransaction(fs, async tx => {
      escritasLocais.length = 0;
      // Leituras primeiro (regra das transações).
      const refContador = doc(fs, 'config', 'contadores');
      const contador = novas.length ? await tx.get(refContador) : null;
      const docsOS = await Promise.all(alteradas.map(m => tx.get(doc(fs, 'orders', m.id))));
      const retornos = novas.filter(o => o.retornoDeOsId).map(o => o.retornoDeOsId!);
      const docsRetorno = await Promise.all(retornos.map(id => tx.get(doc(fs, 'orders', id))));
      const docsCol = await Promise.all(muds.map(m => (m.chave === 'eventos' ? Promise.resolve(null) : tx.get(doc(fs, COLECOES[m.chave], m.id)))));

      // Confere que ninguém mudou o que esta ação está mudando.
      alteradas.forEach((m, i) => {
        const s = docsOS[i];
        if (!s.exists()) throw new ErroNuvem('Esta OS não existe mais.');
        const noServidor = legadoDeOS(osDeLegado(m.id, s.data(), nomesA), undefined, undefined, nomesA);
        if (m.campos.some(k => estavel(noServidor[k]) !== estavel(m.antes[k]))) throw new ErroNuvem(CONFLITO);
      });
      muds.forEach((m, i) => {
        const s = docsCol[i];
        if (!s) return;
        const atual = s.exists() ? s.data() : undefined;
        const esperado = m.antes === undefined ? undefined : limpo(m.antes);
        if (estavel(atual ?? null) !== estavel(esperado ?? null)) throw new ErroNuvem(CONFLITO);
      });

      // Numeração igual à do sistema atual: maior entre o contador e a maior OS existente, + 1.
      let n = Math.max(Number(contador?.data()?.numeroOrdem) || 0, maiorExistente, ...antes.os.map(o => o.numero));
      for (const o of novas) {
        const provisorio = o.numero;
        o.numero = ++n;
        depois.eventos.filter(e => e.entidadeId === o.id).forEach(e => { e.resumo = e.resumo.replace(`#${provisorio}`, `#${o.numero}`); });
        const dados = { ...PADRAO_CRIACAO, ...legadoDeOS(o, veic(depois, o.veiculoId), cli(depois, o.clienteId), nomesD), numeroOrdem: o.numero };
        tx.set(doc(fs, 'orders', o.id), { ...dados, createdAt: serverTimestamp() });
        escritasLocais.push(() => raw.orders.set(o.id, { ...dados, createdAt: new Date().toISOString() }));
      }
      if (novas.length) tx.set(refContador, { numeroOrdem: n, numeroOrdemAtualizadoEm: serverTimestamp() }, { merge: true });

      // Retorno aberto no sistema novo: a OS original fica marcada como "voltou com problema", como no sistema atual.
      retornos.forEach((id, i) => {
        const s = docsRetorno[i];
        const nova = novas.find(o => o.retornoDeOsId === id)!;
        if (!s.exists() || (s.data().retorno as { isRetorno?: boolean } | undefined)?.isRetorno) return;
        const retorno = { isRetorno: true, data: nova.abertaEm.slice(0, 10), motivo: 'outros', descricao: nova.retorno?.problemaRelatado || '', fotosRetorno: [] };
        tx.update(s.ref, { retorno, voltouComProblema: true });
        escritasLocais.push(() => raw.orders.set(id, { ...raw.orders.get(id), retorno, voltouComProblema: true }));
      });

      alteradas.forEach((m, i) => {
        const upd: Record<string, unknown> = {};
        for (const k of m.campos) upd[k] = m.depois[k] === undefined ? deleteField() : m.depois[k];
        tx.update(docsOS[i].ref, upd as DocumentData);
        const base = { ...docsOS[i].data() };
        for (const k of m.campos) { if (m.depois[k] === undefined) delete base[k]; else base[k] = m.depois[k]; }
        escritasLocais.push(() => raw.orders.set(m.id, base));
      });

      for (const m of muds) {
        const r = doc(fs, COLECOES[m.chave], m.id);
        if (m.depois === undefined) { tx.delete(r); escritasLocais.push(() => raw.col[m.chave].delete(m.id)); }
        else { const x = limpo(m.depois); tx.set(r, x); escritasLocais.push(() => raw.col[m.chave].set(m.id, x)); }
      }

      // Link do cliente: o relatório público é uma cópia restrita, lida pelo token (sem login).
      for (const m of muds.filter(x => x.chave === 'compartilhamentos' && x.depois)) {
        const sh = m.depois as DB['compartilhamentos'][number];
        const rel = projetar && !sh.revogadoEm ? projetar(depois, sh.osId) : null;
        tx.set(doc(fs, 'relatorios', sh.token), limpo({ osId: sh.osId, expiraEm: sh.expiraEm ?? null, revogadoEm: sh.revogadoEm ?? null, relatorio: rel }));
      }

      for (const u of mudUsuarios) {
        const dados = { nome: u.nome, perfil: u.role, ativo: u.ativo, nivel: u.nivel ?? null, nomeLegado: u.nomeLegado ?? null, atualizadoEm: serverTimestamp(), atualizadoPor: uid };
        tx.update(doc(fs, 'usuarios', u.id), dados);
        escritasLocais.push(() => raw.usuarios.set(u.id, { ...raw.usuarios.get(u.id), ...dados, atualizadoEm: new Date().toISOString() }));
      }

      if (rodizioMudou) {
        const nomeDe = (id: string) => nomesD.nome(id);
        const ref = doc(fs, 'config', 'global');
        const atual = (raw.global.rodizio || {}) as { dia?: string; status?: Record<string, string> };
        if (atual.dia !== depois.rodizio.dia) {
          const status = Object.fromEntries(Object.entries(depois.rodizio.status).map(([id, s]) => [nomeDe(id), s]).filter(([n]) => n));
          tx.set(ref, { rodizio: { dia: depois.rodizio.dia, status }, rodizioAtualizadoEm: serverTimestamp() }, { merge: true });
          escritasLocais.push(() => { raw.global = { ...raw.global, rodizio: { dia: depois.rodizio.dia, status } }; });
        } else {
          for (const [id, s] of Object.entries(depois.rodizio.status)) {
            if (antes.rodizio.status[id] === s || !nomeDe(id)) continue;
            tx.update(ref, new FieldPath('rodizio', 'status', nomeDe(id)), s, 'rodizioAtualizadoEm', serverTimestamp());
            escritasLocais.push(() => { raw.global = { ...raw.global, rodizio: { ...atual, status: { ...(atual.status || {}), [nomeDe(id)]: s } } }; });
          }
        }
      }
    });
  } catch (e) {
    if (e instanceof ErroNuvem) throw e;
    const code = (e as { code?: string })?.code || '';
    if (code === 'permission-denied') throw new ErroNuvem('Sem permissão para esta ação. Se acha que deveria ter, fale com a direção.');
    if (code === 'aborted' || code === 'failed-precondition') throw new ErroNuvem(CONFLITO);
    console.error('Falha ao gravar', e);
    throw new ErroNuvem('Não foi possível salvar. Verifique a conexão e tente de novo.');
  }
  escritasLocais.forEach(f => f());
  db = montarDB();
  notificar();
}

// ───────────────────────── Relatório público ─────────────────────────

export async function lerRelatorio(token: string): Promise<{ osId: string; expiraEm: string | null; revogadoEm: string | null; relatorio: unknown } | null> {
  iniciar();
  if (!/^[\w-]{16,64}$/.test(token)) return null;
  const { getDoc } = await import('firebase/firestore');
  try {
    const s = await getDoc(doc(fs, 'relatorios', token));
    return s.exists() ? (s.data() as never) : null;
  } catch { return null; }
}
