import { describe, expect, it } from 'vitest';
import type { Usuario } from '../domain/types';
import { brDeISO, camposAlterados, derivarCadastros, isoDeBR, legadoDeOS, MapaNomes, osDeLegado } from './legado';

const usuarios: Usuario[] = [
  { id: 'uidCaio', nome: 'Caio Ferreira', role: 'mecanico', ativo: true, criadoEm: '' },
  { id: 'uidFaust', nome: 'Fausto Lima', role: 'vendedor', ativo: true, criadoEm: '', nomeLegado: 'Faust' },
];

/** OS concluída gravada pelo sistema atual (formato real, valores fictícios). */
const legado = {
  numeroOrdem: 7001, status: 'concluido', dataHora: '2026-11-03T12:00:00.000Z', vendedor: 'Faust', lubrificador: 'caio silva',
  cliente: 'Cliente Teste', tel: '(41) 99999-0000', placa: 'ABC-1234', marca: 'VW', modelo: 'Gol', motor: '1.0', ano: '2015', cambio: 'Manual', combustivel: 'Flex',
  oleoMotor: true, oleoMarca: 'Marca X', oleoQuantidade: '4', filtroOleo: true, filtroOleoTipo: 'PH123', arMotor: false, arMotorCodigo: '',
  valorInicial: '250.00', km: '80000', obsCarro: 'ok', inicio: '03/11/2026, 09:10:00', fim: '03/11/2026, 09:55:00',
  upsells: { arMotor: { oferecido: true, aceito: 'sim', valor: '60' }, palhetas: { oferecido: true, aceito: 'nao', valor: '' } },
  valorUpsell: 60, valorTotal: 310, fezUpsell: true, execFreioSemQuestionar: true, execCambioSemQuestionar: false,
};

describe('ponte com o sistema atual', () => {
  it('datas no formato do sistema atual (Brasília) vão e voltam sem mudar', () => {
    const iso = isoDeBR('03/11/2026, 09:10:00')!;
    expect(iso).toBe('2026-11-03T12:10:00.000Z');
    expect(brDeISO(iso)).toBe('03/11/2026, 09:10:00');
  });

  it('lê a OS do sistema atual: nomes viram contas, serviços, upsell e recusas', () => {
    const nomes = new MapaNomes(usuarios);
    const os = osDeLegado('doc1', legado, nomes);
    expect(os.numero).toBe(7001);
    expect(os.mecanicoId).toBe('uidCaio');
    expect(os.vendedorId).toBe('uidFaust');
    expect(os.veiculoId).toBe('v_ABC1234');
    expect(os.servicos.filter(s => s.origem === 'balcao').map(s => s.key)).toEqual(['oleoMotor', 'filtroOleo']);
    expect(os.servicos.find(s => s.key === 'arMotor')).toMatchObject({ origem: 'adicional', executado: true, valor: 60 });
    expect(os.ofertas?.find(o => o.key === 'palhetas')?.resultado).toBe('recusado');
    expect(os.km).toBe(80000);
    expect(os.naoFazerTesteCambio).toBe(false);
  });

  it('carro de loja grava km por mês 0 e a marcação no formato do sistema atual', () => {
    const nomes = new MapaNomes(usuarios);
    const os = osDeLegado('doc6', { ...legado, carroDeLoja: true, kmPorMes: 0 }, nomes);
    expect(os.carroDeLoja).toBe(true);
    const d = legadoDeOS(os, undefined, undefined, nomes);
    expect(d.kmPorMes).toBe(0);
    expect(d.carroDeLoja).toBe(true);
  });

  it('filtro do câmbio automático (opcional) vai e volta no campo do sistema atual', () => {
    const nomes = new MapaNomes(usuarios);
    const com = osDeLegado('doc5', { ...legado, cambioAutomatico: true, cambioAutomaticoMarca: 'ATF', cambioAutomaticoTemFiltro: true, cambioAutomaticoFiltroCodigo: 'CAF5678' }, nomes);
    expect(com.servicos.find(s => s.key === 'cambioAutomatico')?.codigo).toBe('CAF5678');
    const d = legadoDeOS(com, undefined, undefined, nomes);
    expect(d.cambioAutomaticoFiltroCodigo).toBe('CAF5678');
    expect(d.cambioAutomaticoTemFiltro).toBe(true);
    const sem = legadoDeOS({ ...com, servicos: com.servicos.map(s => s.key === 'cambioAutomatico' ? { ...s, codigo: undefined } : s) }, undefined, undefined, nomes);
    expect(sem.cambioAutomaticoTemFiltro).toBe(false);
  });

  it('OS devolvida para a fila volta sem lubrificador e sem início no sistema atual', () => {
    const nomes = new MapaNomes(usuarios);
    const os = osDeLegado('doc7', { ...legado, status: 'andamento', inicio: '05/11/2026, 09:00:00' }, nomes);
    const d = legadoDeOS({ ...os, status: 'aguardando', mecanicoId: undefined, iniciadaEm: undefined }, undefined, undefined, nomes);
    expect([d.status, d.lubrificador, d.inicio]).toEqual(['aguardando', '', '']);
  });

  it('câmbio automático: total de litros e litros dentro do câmbio (cárter) vão e voltam', () => {
    const nomes = new MapaNomes(usuarios);
    const os = osDeLegado('doc6', { ...legado, cambioAutomatico: true, cambioAutomaticoQuantidade: '9', cambioAutomaticoFluidoCarter: '4.5' }, nomes);
    expect(os.servicos.find(s => s.key === 'cambioAutomatico')).toMatchObject({ quantidade: '9', carter: '4.5' });
    expect(legadoDeOS(os, undefined, undefined, nomes)).toMatchObject({ cambioAutomaticoQuantidade: '9', cambioAutomaticoFluidoCarter: '4.5' });
  });

  it('tipo do câmbio automático informado pelo mecânico vai e volta', () => {
    const nomes = new MapaNomes(usuarios);
    const os = osDeLegado('doc8', { ...legado, cambioAutomatico: true, cambioAutomaticoQuantidade: '9' }, nomes);
    const feito = { ...os, servicos: os.servicos.map(s => s.key === 'cambioAutomatico' ? { ...s, executado: true, intervaloKm: 40000, tipoCambio: 'cvt' as const } : s) };
    const volta = osDeLegado('doc8', legadoDeOS(feito, undefined, undefined, nomes), nomes);
    expect(volta.servicos.find(s => s.key === 'cambioAutomatico')).toMatchObject({ tipoCambio: 'cvt', intervaloKm: 40000 });
  });

  it('"não fazer teste" só vale quando a OS tem o serviço (fluido de freio / câmbio)', () => {
    const nomes = new MapaNomes(usuarios);
    // Campo ausente no sistema atual = marcado, mas lá o aviso só aparece com o serviço.
    const sem = osDeLegado('doc3', { ...legado, execFreioSemQuestionar: undefined, execCambioSemQuestionar: undefined }, nomes);
    expect(sem.naoFazerTesteFreio).toBe(false);
    expect(sem.naoFazerTesteCambio).toBe(false);
    const com = osDeLegado('doc4', { ...legado, fluidoFreio: true, cambioAutomatico: true, execFreioSemQuestionar: undefined, execCambioSemQuestionar: undefined }, nomes);
    expect(com.naoFazerTesteFreio).toBe(true);
    expect(com.naoFazerTesteCambio).toBe(true);
  });

  it('nome do sistema atual sem conta vira pessoa inativa (não entra no rodízio)', () => {
    const nomes = new MapaNomes(usuarios);
    const os = osDeLegado('doc2', { ...legado, lubrificador: 'Joilson da Silva' }, nomes);
    expect(os.mecanicoId).toBe('legado:Joilson');
    expect(nomes.semConta.get('legado:Joilson')?.ativo).toBe(false);
  });

  it('gravar de volta mantém a conta do sistema atual (valorUpsell, valorTotal, upsells)', () => {
    const nomes = new MapaNomes(usuarios);
    const os = osDeLegado('doc1', legado, nomes);
    const { veiculos, clientes } = derivarCadastros([['doc1', legado]]);
    const d = legadoDeOS(os, veiculos[0], clientes[0], nomes);
    expect(d).toMatchObject({ status: 'concluido', vendedor: 'Faust', lubrificador: 'Caio', valorInicial: '250.00', valorUpsell: 60, valorTotal: 310, fezUpsell: true, quantidadeItensUpsell: 1, oleoMotor: true, oleoMarca: 'Marca X', filtroOleoTipo: 'PH123', fim: '03/11/2026, 09:55:00', km: '80000' });
    expect((d.upsells as Record<string, { aceito: string }>).arMotor.aceito).toBe('sim');
    expect((d.upsells as Record<string, { aceito: string }>).palhetas.aceito).toBe('nao');
    expect(d.tempoServico).toBe('0h 45min');
  });

  it('ler e gravar sem mudança nenhuma não altera campo algum', () => {
    const nomes = new MapaNomes(usuarios);
    const os = osDeLegado('doc1', legado, nomes);
    const a = legadoDeOS(os, undefined, undefined, nomes);
    const b = legadoDeOS(osDeLegado('doc1', legado, nomes), undefined, undefined, nomes);
    expect(camposAlterados(a, b)).toEqual([]);
  });

  it('veículo e cliente saem da OS mais recente da placa; km atual da última concluída', () => {
    const antiga = { ...legado, cliente: 'Nome Antigo', km: '70000', dataHora: '2026-05-01T12:00:00.000Z', fim: '01/05/2026, 10:00:00', kmPorMes: 1500 };
    const { veiculos, clientes } = derivarCadastros([['a', antiga], ['b', legado]]);
    expect(veiculos).toHaveLength(1);
    expect(veiculos[0]).toMatchObject({ placa: 'ABC1234', kmAtual: 80000, kmPorMes: 1500, cambio: 'manual', ano: 2015 });
    expect(clientes[0].nome).toBe('Cliente Teste');
  });
});
