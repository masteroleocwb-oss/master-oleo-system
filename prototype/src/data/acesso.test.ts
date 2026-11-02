import { beforeEach, describe, expect, it } from 'vitest';
import { ErroPermissao } from '../domain/permissions';
import type { Usuario } from '../domain/types';
import { fixarAgora } from '../domain/util';
import { definirAcesso, definirAcessoDemo, desbloquearAcesso, entrarComSenha, entrarDemo, problemaSenha, trocarMinhaSenha } from './acesso';
import { salvarUsuario } from './api';
import { gerarSeed } from './seed';
import { _definirDB, getDB, setControle } from './store';

const U = (id: string): Usuario => getDB().usuarios.find(u => u.id === id)!;
const resultados = () => getDB().acessos.map(a => a.resultado);

beforeEach(() => {
  fixarAgora(new Date('2026-10-26T18:00:00Z'));
  _definirDB(gerarSeed());
  setControle({ latenciaMs: 0, falharProximo: false, offline: false });
});

describe('login com senha e registro de acessos', () => {
  it('administração cria o acesso; senha só como hash; primeiro acesso exige trocar a provisória', async () => {
    const id = await salvarUsuario(U('u_dir'), { nome: 'Pessoa Teste', role: 'mecanico', ativo: true, nivel: 'N2' });
    await definirAcesso(U('u_dir'), id, ' Pessoa.Teste ', 'prov4567');
    const x = U(id);
    expect(x.login).toBe('pessoa.teste');
    expect(JSON.stringify(getDB())).not.toContain('prov4567');
    expect(x.trocarSenha).toBe(true);

    const u = await entrarComSenha('PESSOA.TESTE', 'prov4567');
    expect(u.id).toBe(id);
    await expect(trocarMinhaSenha(u, 'prov4567', 'nova-senha-1', 'outra')).rejects.toThrow(/confirmação/);
    await expect(trocarMinhaSenha(u, 'prov4567', '123456', '123456')).rejects.toThrow(/fácil/);
    await trocarMinhaSenha(u, 'prov4567', 'nova-senha-1', 'nova-senha-1');
    expect(U(id).trocarSenha).toBe(false);
    await expect(entrarComSenha('pessoa.teste', 'prov4567')).rejects.toThrow('Usuário ou senha incorretos.');
    await entrarComSenha('pessoa.teste', 'nova-senha-1');
    expect(resultados()).toEqual(['entrou', 'senha_trocada', 'senha_errada', 'entrou']);
    expect(getDB().eventos.some(e => e.tipo === 'acesso.criado' && e.entidadeId === id)).toBe(true);
  });

  it('login inexistente e senha errada dão a mesma mensagem, e ficam registrados', async () => {
    await definirAcesso(U('u_dir'), 'u_m1', 'andre', 'prov4567');
    await expect(entrarComSenha('ninguem', 'qualquer1')).rejects.toThrow('Usuário ou senha incorretos.');
    await expect(entrarComSenha('andre', 'errada99')).rejects.toThrow('Usuário ou senha incorretos.');
    const [a, b] = getDB().acessos;
    expect(a).toMatchObject({ resultado: 'usuario_inexistente', loginDigitado: 'ninguem' });
    expect(b).toMatchObject({ resultado: 'senha_errada', usuarioId: 'u_m1' });
  });

  it('bloqueia após 5 senhas erradas; a administração pode desbloquear', async () => {
    await definirAcesso(U('u_dir'), 'u_m1', 'andre', 'prov4567');
    for (let i = 0; i < 4; i++) await expect(entrarComSenha('andre', 'errada99')).rejects.toThrow(/incorretos/);
    await expect(entrarComSenha('andre', 'errada99')).rejects.toThrow(/bloqueado/);
    await expect(entrarComSenha('andre', 'prov4567')).rejects.toThrow(/bloqueado/); // nem com a senha certa
    fixarAgora(new Date('2026-10-26T18:16:00Z'));
    await entrarComSenha('andre', 'prov4567'); // passou o tempo de bloqueio
    for (let i = 0; i < 5; i++) await expect(entrarComSenha('andre', 'errada99')).rejects.toThrow();
    await expect(desbloquearAcesso(U('u_m1'), 'u_m1')).rejects.toBeInstanceOf(ErroPermissao);
    await desbloquearAcesso(U('u_dir'), 'u_m1');
    await entrarComSenha('andre', 'prov4567');
  });

  it('pessoa desativada não entra, nem com a senha certa', async () => {
    await definirAcesso(U('u_dir'), 'u_m1', 'andre', 'prov4567');
    await salvarUsuario(U('u_dir'), { ...U('u_m1'), ativo: false });
    await expect(entrarComSenha('andre', 'prov4567')).rejects.toThrow(/desativado/);
    expect(resultados()).toContain('desativado');
  });

  it('login é único e só a administração cria acesso; o histórico não guarda o hash', async () => {
    await definirAcesso(U('u_dir'), 'u_m1', 'andre', 'prov4567');
    await expect(definirAcesso(U('u_dir'), 'u_m2', 'ANDRE', 'prov4567')).rejects.toThrow(/outra pessoa/);
    await expect(definirAcesso(U('u_ven'), 'u_m2', 'outro', 'prov4567')).rejects.toBeInstanceOf(ErroPermissao);
    await expect(definirAcesso(U('u_dir'), 'u_m2', 'a b', 'prov4567')).rejects.toThrow(/Login inválido/);
    await salvarUsuario(U('u_dir'), { ...U('u_m1'), nivel: 'N4' });
    const ev = getDB().eventos.filter(e => e.tipo === 'usuario.alterado').at(-1)!;
    expect(JSON.stringify(ev)).not.toMatch(/hash|sal/);
  });

  it('contas de demonstração: entram sem senha até a direção desligar (e só desliga se houver direção com senha)', async () => {
    expect(entrarDemo('u_m1').id).toBe('u_m1');
    await expect(definirAcessoDemo(U('u_dir'), false)).rejects.toThrow(/direção/);
    await definirAcesso(U('u_dir'), 'u_dir', 'gustavo', 'prov4567');
    await definirAcessoDemo(U('u_dir'), false);
    expect(() => entrarDemo('u_m1')).toThrow(/desligado/);
    expect(U('u_dir').demo).toBe(false);
    expect(resultados()).toEqual(['entrou_demo']);
  });

  it('regras de senha', () => {
    expect(problemaSenha('abc')).toMatch(/6 caracteres/);
    expect(problemaSenha('aaaaaaa')).toMatch(/fácil/);
    expect(problemaSenha('andre.c', 'andre.c')).toMatch(/igual ao login/);
    expect(problemaSenha('MasterOleo2026')).toMatch(/nome da oficina/);
    expect(problemaSenha('carro-azul-7')).toBeNull();
  });
});
