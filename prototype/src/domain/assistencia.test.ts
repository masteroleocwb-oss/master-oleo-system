import { describe, expect, it } from 'vitest';
import { indicadoresAssistencia } from './assistencia';
import type { DB, Evento, OrdemServico, Usuario } from './types';

const mec = (id: string): Usuario => ({ id, nome: id, role: 'mecanico', ativo: true, criadoEm: '' });
// 04/11/2026, horário de Brasília (UTC-3)
const h = (hhmm: string) => `2026-11-04T${String(Number(hhmm.slice(0, 2)) + 3).padStart(2, '0')}:${hhmm.slice(3)}:00.000Z`;
const os = (id: string, m: string, ini: string, fim: string, extra: Partial<OrdemServico> = {}): OrdemServico => ({
  id, numero: 1, status: 'concluido', veiculoId: 'v', clienteId: 'c', vendedorId: 'x', abertaEm: h(ini), servicos: [], valorInicial: 0, criadaPor: 'x',
  mecanicoId: m, iniciadaEm: h(ini), concluidaEm: h(fim), ...extra,
});
const base = (oss: OrdemServico[], eventos: Evento[] = []): Pick<DB, 'os' | 'usuarios' | 'eventos'> =>
  ({ os: oss, usuarios: [mec('caio'), mec('maciel'), mec('jackson')], eventos });
const linha = (r: ReturnType<typeof indicadoresAssistencia>, id: string) => r.find(l => l.mecanicoId === id)!;

describe('assistência', () => {
  const carroCaio = os('A', 'caio', '09:00', '10:00', { assistencias: [{ mecanicoId: 'jackson', inicio: h('09:40'), fim: h('10:00'), chamadoPor: 'caio' }] });
  const oss = [carroCaio, os('B', 'maciel', '09:00', '09:30'), os('C', 'maciel', '10:30', '11:00'), os('D', 'jackson', '08:00', '09:30')];

  it('conta quem estava livre 10+ min com carro de outro rodando, e quem ajudou', () => {
    const r = indicadoresAssistencia(base(oss), '2026-11-04', '2026-11-04', h('18:00'));
    expect(linha(r, 'maciel')).toMatchObject({ podia: 1, ajudou: 0, minutosLivre: 30 });
    expect(linha(r, 'jackson')).toMatchObject({ podia: 1, ajudou: 1, minutosAjudando: 20 });
    expect(linha(r, 'caio')).toMatchObject({ podia: 0, ajudou: 0 });
  });

  it('almoço marcado no rodízio não conta como tempo livre', () => {
    const ev = (em: string, depois: string): Evento => ({ id: em, em: h(em), por: 'maciel', tipo: 'rodizio.status', entidade: 'usuario', entidadeId: 'maciel', resumo: '', depois });
    const r = indicadoresAssistencia(base(oss, [ev('09:30', 'almoco'), ev('10:20', 'disponivel')]), '2026-11-04', '2026-11-04', h('18:00'));
    expect(linha(r, 'maciel')).toMatchObject({ podia: 0, minutosLivre: 0 });
  });

  it('OS esquecida aberta por horas não vira oportunidade', () => {
    const r = indicadoresAssistencia(base([os('E', 'caio', '08:00', '23:00'), os('F', 'maciel', '08:00', '08:10'), os('G', 'maciel', '20:00', '20:10')]), '2026-11-04', '2026-11-04', h('23:30'));
    expect(linha(r, 'maciel').podia).toBe(0);
  });
});
