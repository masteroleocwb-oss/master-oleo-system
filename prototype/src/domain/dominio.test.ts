import { beforeEach, describe, expect, it } from 'vitest';
import { CATALOGO_INICIAL, REGRAS_INICIAIS } from './catalogo';
import { aprendidoPeloSistema, naoSeAplicaAprendido, novoChecklist, pendenciasParaConcluir, registrarItem, validarItem } from './checklist';
import { aprovarVersao, calcularProposta, calcularVigente, descontoChecklist, proporVersao, scoreExecucao, transicaoOcorrencia, versaoEm } from './gestao';
import { statusManutencao, sugerirProxima } from './manutencao';
import { pode } from './permissions';
import type { Meta, Ocorrencia, OrdemServico, Usuario, Veiculo } from './types';
import { fixarAgora, novoToken, placaValida } from './util';

const veic = (cambio: 'manual' | 'automatico'): Veiculo => ({ id: 'v', placa: 'ABC1D23', placasAnteriores: [], marca: 'X', modelo: 'Y', ano: 2020, motor: '1.0', cambio, combustivel: 'Flex', clienteId: 'c' });
const os = { id: 'os1' } as OrdemServico;
const usuario = (role: Usuario['role'], id = 'x', ativo = true): Usuario => ({ id, nome: 'Fulano', role, ativo, criadoEm: '' });

beforeEach(() => fixarAgora(new Date('2026-10-26T15:00:00Z')));

describe('"Não se aplica" aprendido', () => {
  const v = (id: string, modelo = 'Y'): Veiculo => ({ ...veic('manual'), id, placa: `ABC1D${id.padStart(2, '0')}`.slice(0, 7), modelo });
  const comNA = (id: string, veiculoId: string, defId: string, estado: 'nao_aplicavel' | 'ok') =>
    registrarItem({ ...novoChecklist(id, os, v(veiculoId), CATALOGO_INICIAL), veiculoId }, defId, estado, { justificativa: 'Não tem' }, 'm', '2026-10-01T12:00:00Z');

  it('mesmo carro: o que não se aplicou na visita anterior já chega marcado; o que se aplicou, não', () => {
    const ant = registrarItem(comNA('c1', 'a', 'diferencial', 'nao_aplicavel'), 'palhetas', 'ok', {}, 'm', '2026-10-01T12:00:00Z');
    const r = naoSeAplicaAprendido([ant], [v('a')], v('a'), CATALOGO_INICIAL);
    expect(r.diferencial).toMatch(/visita anterior/);
    expect(r.palhetas).toBeUndefined();
    const c = novoChecklist('c2', os, v('a'), CATALOGO_INICIAL, r, '2026-11-05T12:00:00Z');
    expect(aprendidoPeloSistema(c.itens.diferencial)).toBe(true);
    expect(c.itens.palhetas.estado).toBe('nao_verificado');
  });

  it('modelo: só a partir de 10 inspeções com 90% ou mais de "não se aplica"', () => {
    const vs = Array.from({ length: 10 }, (_, i) => v(String(i + 1)));
    const nove = vs.slice(0, 9).map((x, i) => comNA(`k${i}`, x.id, 'diferencial', 'nao_aplicavel'));
    const novo = v('99');
    expect(naoSeAplicaAprendido(nove, [...vs, novo], novo, CATALOGO_INICIAL).diferencial).toBeUndefined();
    const dez = [...nove, comNA('k9', vs[9].id, 'diferencial', 'nao_aplicavel')];
    expect(naoSeAplicaAprendido(dez, [...vs, novo], novo, CATALOGO_INICIAL).diferencial).toMatch(/10 de 10/);
    const outroModelo = v('98', 'Z');
    expect(naoSeAplicaAprendido(dez, [...vs, outroModelo], outroModelo, CATALOGO_INICIAL).diferencial).toBeUndefined();
  });
});

describe('checklist', () => {
  it('todos os itens começam "A verificar" e não existe preenchimento automático', () => {
    const c = novoChecklist('c', os, veic('manual'), CATALOGO_INICIAL);
    expect(Object.values(c.itens).every(i => i.estado === 'nao_verificado')).toBe(true);
    expect(c.status).toBe('nao_iniciado');
  });

  it('mostra só os itens de câmbio que se aplicam ao veículo', () => {
    const man = novoChecklist('c', os, veic('manual'), CATALOGO_INICIAL).defs.map(d => d.id);
    const aut = novoChecklist('c', os, veic('automatico'), CATALOGO_INICIAL).defs.map(d => d.id);
    expect(man).toContain('oleo_cambio_manual');
    expect(man).not.toContain('fluido_cambio');
    expect(aut).toContain('fluido_cambio');
    expect(aut).not.toContain('oleo_cambio_manual');
  });

  it('exige justificativa em "Não se aplica", observação em "Avaliar depois" e foto quando configurado', () => {
    const def = CATALOGO_INICIAL.find(d => d.id === 'pastilhas')!;
    expect(validarItem(def, 'nao_aplicavel', {}, 0)).toContain('Diga por que não se aplica.');
    expect(validarItem(def, 'pendente_avaliacao', {}, 0)).toContain('Diga o que impediu a avaliação.');
    expect(validarItem(def, 'prioritario', {}, 0).join()).toMatch(/Foto obrigatória/);
    expect(validarItem(def, 'prioritario', {}, 1)).toEqual([]);
    expect(validarItem(def, 'ok', {}, 0)).toEqual([]);
    expect(validarItem(def, 'nao_verificado', {}, 0).length).toBeGreaterThan(0);
  });

  it('alteração acrescenta ao histórico, nunca sobrescreve em silêncio', () => {
    let c = novoChecklist('c', os, veic('manual'), CATALOGO_INICIAL);
    c = registrarItem(c, 'palhetas', 'ok', {}, 'm1', '2026-10-26T15:00:00Z');
    c = registrarItem(c, 'palhetas', 'atencao', { recomendacao: 'trocar' }, 'm1', '2026-10-26T15:05:00Z', 'Correção solicitada');
    const h = c.itens.palhetas.historico;
    expect(h.map(x => x.estado)).toEqual(['ok', 'atencao']);
    expect(h[1].motivo).toBe('Correção solicitada');
    expect(c.status).toBe('em_andamento');
  });

  it('lista exatamente o que falta para concluir', () => {
    let c = novoChecklist('c', os, veic('manual'), CATALOGO_INICIAL);
    for (const d of c.defs) c = registrarItem(c, d.id, 'ok', {}, 'm', 'x');
    expect(pendenciasParaConcluir(c, [])).toEqual([]);
    c = registrarItem(c, 'discos', 'prioritario', {}, 'm', 'y');
    const p = pendenciasParaConcluir(c, []);
    expect(p).toHaveLength(1);
    expect(p[0].defId).toBe('discos');
  });
});

describe('próximas manutenções', () => {
  it('sem regra validada não inventa km nem data', () => {
    const s = sugerirProxima('cambioAutomatico', 'Câmbio', REGRAS_INICIAIS, veic('automatico'), '2026-10-26T15:00:00Z', 50000);
    expect(s.confirmavel).toBe(false);
    expect(s.kmPrevisto).toBeUndefined();
    expect(s.dataPrevista).toBeUndefined();
    expect(sugerirProxima('militec', 'Militec', REGRAS_INICIAIS, veic('manual'), '2026-10-26T15:00:00Z', 1).regra).toBeUndefined();
  });

  it('com regra validada calcula km e data e classifica futura/próxima/vencida/concluída', () => {
    // Óleo: 5, 7 ou 10 mil km conforme o óleo, ou 6 meses — o que vier primeiro.
    const semEscolha = sugerirProxima('oleoMotor', 'Óleo', REGRAS_INICIAIS, veic('manual'), '2026-10-26T15:00:00Z', 50000);
    expect(semEscolha.kmPrevisto).toBeUndefined();
    expect(semEscolha.opcoesKm).toEqual([5000, 7000, 10000]);
    expect(sugerirProxima('oleoMotor', 'Óleo', REGRAS_INICIAIS, veic('manual'), '2026-10-26T15:00:00Z', 50000, 8000).kmPrevisto).toBeUndefined();
    expect(sugerirProxima('oleoMotor', 'Óleo', REGRAS_INICIAIS, veic('manual'), '2026-10-26T15:00:00Z', 50000, 7000).kmPrevisto).toBe(57000);
    const s = sugerirProxima('oleoMotor', 'Óleo', REGRAS_INICIAIS, veic('manual'), '2026-10-26T15:00:00Z', 50000, 10000);
    expect(s.kmPrevisto).toBe(60000);
    expect(s.dataPrevista?.slice(0, 7)).toBe('2027-04');
    expect(s.motivo).toContain('o que vier primeiro');
    const m = { id: 'm', veiculoId: 'v', osOrigemId: 'o', descricao: 'Óleo', origem: 'interna' as const, fonte: 'x', registradoPor: 'u', registradoEm: '', kmPrevisto: 60000, dataPrevista: s.dataPrevista };
    const hoje = '2026-10-26T15:00:00Z';
    expect(statusManutencao(m, 55000, hoje)).toBe('futura');
    expect(statusManutencao(m, 59500, hoje)).toBe('proxima');
    expect(statusManutencao(m, 60100, hoje)).toBe('vencida');
    expect(statusManutencao({ ...m, concluidaPorOsId: 'z' }, 60100, hoje)).toBe('concluida');
    expect(statusManutencao({ ...m, kmPrevisto: undefined, dataPrevista: undefined }, 1, hoje)).toBe('acompanhar');
  });
});

describe('metas com vigência', () => {
  const meta = (): Meta => ({
    id: 'm', nome: 'M', descricao: '', indicador: 'itens_realizados', unidade: 'itens', regraCalculo: '', elegibilidade: '', escopo: { tipo: 'coletiva' }, responsavelId: 'l',
    versoes: [{ versao: 1, alvo: 20, vigenciaInicio: '2026-10-01', status: 'aprovada', definidaPor: 'l', definidaEm: '', justificativa: 'inicial' }],
  });

  it('não aceita vigência no passado, sem justificativa ou com outro rascunho aberto', () => {
    expect(() => proporVersao(meta(), 25, '2026-10-20', 'x', 'l', '', '2026-10-26')).toThrow(/passado/);
    expect(() => proporVersao(meta(), 25, '2026-11-01', ' ', 'l', '', '2026-10-26')).toThrow(/justificativa/);
    const m2 = proporVersao(meta(), 25, '2026-11-01', 'subir', 'l', '', '2026-10-26');
    expect(() => proporVersao(m2, 30, '2026-11-01', 'de novo', 'l', '', '2026-10-26')).toThrow(/aguardando/);
  });

  it('rascunho não vale; aprovar encerra a anterior na véspera sem reescrever o passado', () => {
    const m2 = proporVersao(meta(), 25, '2026-11-01', 'subir', 'l', '', '2026-10-26');
    expect(versaoEm(m2, '2026-11-05')?.alvo).toBe(20);
    const m3 = aprovarVersao(m2, 'd', '');
    expect(versaoEm(m3, '2026-10-15')?.alvo).toBe(20);
    expect(versaoEm(m3, '2026-11-05')?.alvo).toBe(25);
    expect(m3.versoes[0]).toMatchObject({ status: 'encerrada', vigenciaFim: '2026-10-31', alvo: 20 });
  });
});

describe('ocorrências', () => {
  const oc = (status: Ocorrencia['status']): Ocorrencia => ({ id: 'o', tipo: 'desconto', profissionalId: 'mec', dataHora: '', categoria: 'c', descricao: 'd', evidencias: [], regra: 'r', efeitoProposto: -2, registradaPor: 'lid', status, historico: [] });

  it('nada é aplicado sem aprovação da direção', () => {
    expect(() => transicaoOcorrencia(oc('em_revisao'), 'aplicar', usuario('direcao'))).toThrow();
    expect(() => transicaoOcorrencia(oc('em_revisao'), 'aprovar', usuario('lider', 'lid'))).toThrow(/direção/);
    expect(transicaoOcorrencia(oc('em_revisao'), 'aprovar', usuario('direcao'))).toBe('aprovada');
    expect(transicaoOcorrencia(oc('aprovada'), 'aplicar', usuario('direcao'))).toBe('aplicada');
  });

  it('só o profissional envolvido contesta, e só antes da aplicação', () => {
    expect(() => transicaoOcorrencia(oc('em_revisao'), 'contestar', usuario('mecanico', 'outro'))).toThrow();
    expect(transicaoOcorrencia(oc('em_revisao'), 'contestar', usuario('mecanico', 'mec'))).toBe('contestada');
    expect(() => transicaoOcorrencia(oc('aplicada'), 'contestar', usuario('mecanico', 'mec'))).toThrow();
  });
});

describe('remuneração (simulação)', () => {
  it('proposta do Playbook: faturamento × (faixa + acelerador) × (1 + fator do score)', () => {
    expect(calcularProposta({ faturamento: 90000, itensPctMeta: 125, score: 96 }).valor).toBeCloseTo(90000 * 0.01 * 1.1);
    expect(calcularProposta({ faturamento: 50000, itensPctMeta: 200, score: 100 }).valor).toBeCloseTo(50000 * 0.004 * 1.1);
    expect(calcularProposta({ faturamento: 160000, itensPctMeta: 100, score: 79 }).valor).toBeCloseTo(160000 * 0.014 * 0.8);
  });

  it('vigente: faixa pelo total ajustado e teto de câmbio por OS', () => {
    const r = calcularVigente({ upsellPorOS: [{ upsell: 10000, cambio: 2000 }], ajustes: 10 });
    // base 8.700 → faixa 5%; câmbio 1.740×5% = 87 → teto 50; serviços 6.960×5% = 348
    expect(r.detalhes.faixaPct).toBe(5);
    expect(r.valor).toBeCloseTo(348 + 50 - 10);
  });

  it('score: desconto do checklist em faixas e recuperação limitada a +5', () => {
    expect(descontoChecklist(100)).toBe(0);
    expect(descontoChecklist(85)).toBe(2);
    expect(descontoChecklist(70)).toBe(5);
    expect(descontoChecklist(50)).toBe(10);
    expect(descontoChecklist(null)).toBe(0);
    const rec = (n: number) => ({ tipo: 'reconhecimento', efeitoProposto: n }) as Ocorrencia;
    expect(scoreExecucao([rec(4), rec(4)], 10)).toBe(95);
  });
});

describe('permissões e utilitários', () => {
  it('perfil define o que pode; usuário desativado não pode nada', () => {
    expect(pode(usuario('mecanico'), 'os.abrir')).toBe(false);
    expect(pode(usuario('mecanico'), 'os.executar')).toBe(true);
    expect(pode(usuario('vendedor'), 'relatorio.revogar')).toBe(false);
    expect(pode(usuario('lider'), 'ocorrencia.decidir')).toBe(false);
    expect(pode(usuario('direcao'), 'ocorrencia.decidir')).toBe(true);
    expect(pode(usuario('direcao', 'x', false), 'operacao.ver')).toBe(false);
  });

  it('token do link tem 128 bits e não se repete; placas antigas e Mercosul são válidas', () => {
    const ts = new Set(Array.from({ length: 500 }, novoToken));
    expect(ts.size).toBe(500);
    expect([...ts][0]).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(placaValida('abc-1234')).toBe(true);
    expect(placaValida('ABC1D23')).toBe(true);
    expect(placaValida('AB12345')).toBe(false);
  });
});
