// Login individual, perfis e registro de acessos.
// Protótipo: tudo fica no armazenamento DESTE navegador, então serve para validar o fluxo, não como
// segurança de verdade. No produto: Firebase Authentication + perfil em documento protegido por regras,
// registro de acesso gravado no servidor (ver docs/OPEN_DECISIONS.md, D-02 e D-03).
import { exigir } from '../domain/permissions';
import type { DB, RegistroAcesso, ResultadoAcesso, Usuario } from '../domain/types';
import { agora, agoraISO, novoId } from '../domain/util';
import { ErroValidacao } from './api';
import { MODO_REAL } from './modo';
import * as nuvem from './nuvem';
import { getDB, mutarSemLatencia, transacao } from './store';

export class ErroAcesso extends Error {
  constructor(msg: string) { super(msg); this.name = 'ErroAcesso'; }
}

/** Parâmetros de demonstração (decisão D-03 define os do produto). */
export const POLITICA_ACESSO = { maxTentativas: 5, bloqueioMin: 15, sessaoHoras: 12, senhaMin: 6 };

const ITERACOES = 120_000;
const b64 = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b)));

export async function hashSenha(senha: string, sal?: string): Promise<{ hash: string; sal: string }> {
  const salBytes = sal ? Uint8Array.from(atob(sal), c => c.charCodeAt(0)) : globalThis.crypto.getRandomValues(new Uint8Array(16));
  const chave = await globalThis.crypto.subtle.importKey('raw', new TextEncoder().encode(senha), 'PBKDF2', false, ['deriveBits']);
  const bits = await globalThis.crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salBytes, iterations: ITERACOES }, chave, 256);
  return { hash: b64(bits), sal: b64(salBytes) };
}

/** Comparação em tempo constante (não vaza onde a senha difere). */
const iguais = (a: string, b: string) => { if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; };

const OBVIAS = ['123456', '1234567', '12345678', '654321', '000000', '111111', '123123', 'senha1', 'senha123', 'abc123'];

/** Devolve o problema da senha, ou null se estiver boa. */
export const problemaSenha = (s: string, login?: string): string | null => {
  if (s.length < POLITICA_ACESSO.senhaMin) return `A senha precisa ter pelo menos ${POLITICA_ACESSO.senhaMin} caracteres.`;
  if (/^(.)\1+$/.test(s) || OBVIAS.includes(s.toLowerCase())) return 'Senha fácil demais. Evite sequências e repetições.';
  if (/master|[oó]leo|oficina/i.test(s)) return 'Não use o nome da oficina na senha.';
  if (login && s.toLowerCase() === login.toLowerCase()) return 'A senha não pode ser igual ao login.';
  return null;
};

export const normalizarLogin = (l: string) => l.trim().toLowerCase();
export const loginValido = (l: string) => /^[a-z0-9._@+-]{3,60}$/.test(normalizarLogin(l));

/** Senha provisória legível (sem 0/O, 1/l) para a administração passar à pessoa. */
export const gerarSenhaProvisoria = () => {
  const alf = 'abcdefghjkmnpqrstuvwxyz23456789';
  const b = globalThis.crypto.getRandomValues(new Uint8Array(8));
  return Array.from(b, x => alf[x % alf.length]).join('');
};

/** Resumo do aparelho para o registro (navegador e sistema), sem identificar a pessoa. */
export const dispositivo = (): string => {
  const ua = globalThis.navigator?.userAgent || '';
  if (!ua || /node/i.test(ua)) return 'Teste automatizado';
  const nav = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Navegador';
  const so = /iPhone|iPad/.test(ua) ? 'iPhone/iPad' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : 'outro sistema';
  return `${nav} · ${so}${/Mobile/.test(ua) ? ' (celular)' : ''}`;
};

const registrar = (d: DB, resultado: ResultadoAcesso, usuarioId?: string, loginDigitado?: string) => {
  const r: RegistroAcesso = { id: novoId('ac'), em: agoraISO(), usuarioId, loginDigitado, resultado, dispositivo: dispositivo() };
  d.acessos.push(r);
  // Guarda os 2.000 registros mais recentes no aparelho (no produto, o servidor guarda tudo).
  if (d.acessos.length > 2000) d.acessos.splice(0, d.acessos.length - 2000);
};

/** Login com usuário e senha. A mensagem de erro não revela se a conta existe. */
export async function entrarComSenha(login: string, senha: string): Promise<Usuario> {
  const l = normalizarLogin(login);
  const d0 = getDB();
  const u = d0.usuarios.find(x => x.login && normalizarLogin(x.login) === l);
  const generico = 'Usuário ou senha incorretos.';
  if (!u || !u.senha) {
    await hashSenha(senha || '-'); // mesmo tempo de resposta de uma conta que existe
    mutarSemLatencia(d => registrar(d, 'usuario_inexistente', u?.id, l));
    throw new ErroAcesso(generico);
  }
  if (u.bloqueadoAte && u.bloqueadoAte > agoraISO()) {
    mutarSemLatencia(d => registrar(d, 'bloqueado', u.id, l));
    const ate = new Date(u.bloqueadoAte).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
    throw new ErroAcesso(`Acesso bloqueado por excesso de tentativas até ${ate}. A administração pode liberar antes.`);
  }
  const { hash } = await hashSenha(senha, u.senha.sal);
  if (!iguais(hash, u.senha.hash)) {
    let bloqueou = false;
    mutarSemLatencia(d => {
      const x = d.usuarios.find(y => y.id === u.id)!;
      x.tentativasFalhas = (x.tentativasFalhas || 0) + 1;
      if (x.tentativasFalhas >= POLITICA_ACESSO.maxTentativas) {
        x.bloqueadoAte = new Date(agora().getTime() + POLITICA_ACESSO.bloqueioMin * 60000).toISOString();
        x.tentativasFalhas = 0;
        bloqueou = true;
      }
      registrar(d, 'senha_errada', u.id, l);
    });
    throw new ErroAcesso(bloqueou ? `Muitas tentativas erradas: acesso bloqueado por ${POLITICA_ACESSO.bloqueioMin} minutos.` : generico);
  }
  if (!u.ativo) {
    mutarSemLatencia(d => registrar(d, 'desativado', u.id, l));
    throw new ErroAcesso('Seu acesso está desativado. Fale com a administração.');
  }
  mutarSemLatencia(d => {
    const x = d.usuarios.find(y => y.id === u.id)!;
    x.tentativasFalhas = 0; x.bloqueadoAte = undefined;
    registrar(d, 'entrou', u.id, l);
  });
  return getDB().usuarios.find(x => x.id === u.id)!;
}

/** Contas de demonstração: um toque, sem senha — enquanto a administração permitir. */
export function entrarDemo(usuarioId: string): Usuario {
  const d0 = getDB();
  const u = d0.usuarios.find(x => x.id === usuarioId);
  if (!d0.acessoDemo || !u?.demo) throw new ErroAcesso('O acesso pelas contas de demonstração está desligado. Entre com seu usuário e senha.');
  if (!u.ativo) {
    mutarSemLatencia(d => registrar(d, 'desativado', u.id));
    throw new ErroAcesso(`${u.nome} está com o acesso desativado. Peça à administração para reativar.`);
  }
  mutarSemLatencia(d => registrar(d, 'entrou_demo', u.id));
  return u;
}

export function registrarSaida(usuarioId: string, motivo: 'saiu' | 'sessao_expirada' = 'saiu') {
  if (MODO_REAL) { void nuvem.sair(motivo); return; }
  mutarSemLatencia(d => registrar(d, motivo, usuarioId));
}

/** A própria pessoa troca a senha (obrigatório no primeiro acesso com senha provisória). */
export async function trocarMinhaSenha(u: Usuario, atual: string, nova: string, confirmacao: string) {
  if (MODO_REAL) {
    if (!atual) throw new ErroValidacao('Informe a senha atual.');
    if (nova !== confirmacao) throw new ErroValidacao('A confirmação não é igual à nova senha.');
    if (nova === atual) throw new ErroValidacao('A nova senha precisa ser diferente da atual.');
    if (nova.length < 8) throw new ErroValidacao('A senha precisa ter pelo menos 8 caracteres.');
    const p = problemaSenha(nova, u.email?.split('@')[0]);
    if (p) throw new ErroValidacao(p);
    if (u.email && nova.toLowerCase().includes(u.email.split('@')[0].toLowerCase())) throw new ErroValidacao('Não use o seu e-mail na senha.');
    try { await nuvem.trocarSenha(atual, nova); } catch (e) { throw new ErroValidacao((e as Error).message); }
    return;
  }
  const x = getDB().usuarios.find(y => y.id === u.id);
  if (!x?.senha) throw new ErroValidacao('Esta conta não usa senha.');
  if (!iguais((await hashSenha(atual, x.senha.sal)).hash, x.senha.hash)) throw new ErroValidacao('A senha atual não confere.');
  if (nova !== confirmacao) throw new ErroValidacao('A confirmação não é igual à nova senha.');
  if (nova === atual) throw new ErroValidacao('A nova senha precisa ser diferente da atual.');
  const p = problemaSenha(nova, x.login);
  if (p) throw new ErroValidacao(p);
  const senha = await hashSenha(nova);
  return transacao(d => {
    const y = d.usuarios.find(z => z.id === u.id)!;
    y.senha = senha; y.trocarSenha = false;
    registrar(d, 'senha_trocada', u.id);
    d.eventos.push({ id: novoId('evt'), em: agoraISO(), por: u.id, tipo: 'acesso.senha_trocada', entidade: 'usuario', entidadeId: u.id, resumo: `${y.nome} trocou a própria senha` });
  });
}

/**
 * Administração define login e senha provisória (novo acesso ou redefinição).
 * A senha nunca é guardada nem mostrada depois: só o hash.
 */
export async function definirAcesso(adm: Usuario, alvoId: string, login: string, senhaProvisoria: string) {
  exigir(adm, 'admin.usuarios');
  const l = normalizarLogin(login);
  if (!loginValido(l)) throw new ErroValidacao('Login inválido: use e-mail ou usuário (letras, números, ponto, hífen), com 3 a 60 caracteres.');
  if (getDB().usuarios.some(x => x.id !== alvoId && x.login && normalizarLogin(x.login) === l)) throw new ErroValidacao('Este login já é de outra pessoa.');
  const p = problemaSenha(senhaProvisoria, l);
  if (p) throw new ErroValidacao(p);
  const senha = await hashSenha(senhaProvisoria);
  return transacao(d => {
    const x = d.usuarios.find(y => y.id === alvoId);
    if (!x) throw new ErroValidacao('Usuário não encontrado.');
    const tinha = !!x.senha;
    x.login = l; x.senha = senha; x.trocarSenha = true; x.tentativasFalhas = 0; x.bloqueadoAte = undefined; x.demo = false;
    d.eventos.push({ id: novoId('evt'), em: agoraISO(), por: adm.id, tipo: tinha ? 'acesso.senha_redefinida' : 'acesso.criado', entidade: 'usuario', entidadeId: x.id,
      resumo: tinha ? `Senha de ${x.nome} redefinida (provisória; troca no próximo acesso)` : `Acesso criado para ${x.nome} com o login ${l}` });
  });
}

export async function desbloquearAcesso(adm: Usuario, alvoId: string) {
  exigir(adm, 'admin.usuarios');
  return transacao(d => {
    const x = d.usuarios.find(y => y.id === alvoId)!;
    x.bloqueadoAte = undefined; x.tentativasFalhas = 0;
    d.eventos.push({ id: novoId('evt'), em: agoraISO(), por: adm.id, tipo: 'acesso.desbloqueado', entidade: 'usuario', entidadeId: x.id, resumo: `Acesso de ${x.nome} desbloqueado` });
  });
}

export async function definirAcessoDemo(adm: Usuario, permitir: boolean) {
  exigir(adm, 'admin.usuarios');
  if (!permitir && !getDB().usuarios.some(x => x.ativo && x.senha && x.role === 'direcao')) {
    throw new ErroValidacao('Crie antes um acesso com senha para alguém da direção; senão ninguém consegue administrar o sistema.');
  }
  return transacao(d => {
    d.acessoDemo = permitir;
    d.eventos.push({ id: novoId('evt'), em: agoraISO(), por: adm.id, tipo: 'acesso.demo', entidade: 'config', entidadeId: 'acessoDemo', resumo: permitir ? 'Contas de demonstração liberadas' : 'Contas de demonstração desligadas' });
  });
}

export const ultimoAcesso = (d: DB, usuarioId: string) =>
  [...d.acessos].reverse().find(a => a.usuarioId === usuarioId && (a.resultado === 'entrou' || a.resultado === 'entrou_demo'));

export const RESULTADO_ACESSO: Record<ResultadoAcesso, { rotulo: string; tom: 'ok' | 'critico' | 'atencao' | 'info' | 'muted' }> = {
  entrou: { rotulo: 'Entrou', tom: 'ok' },
  entrou_demo: { rotulo: 'Entrou (demonstração)', tom: 'info' },
  saiu: { rotulo: 'Saiu', tom: 'muted' },
  sessao_expirada: { rotulo: 'Sessão expirou', tom: 'muted' },
  senha_trocada: { rotulo: 'Trocou a senha', tom: 'info' },
  senha_errada: { rotulo: 'Senha errada', tom: 'atencao' },
  usuario_inexistente: { rotulo: 'Login inexistente', tom: 'atencao' },
  desativado: { rotulo: 'Acesso desativado', tom: 'critico' },
  bloqueado: { rotulo: 'Bloqueado', tom: 'critico' },
};
