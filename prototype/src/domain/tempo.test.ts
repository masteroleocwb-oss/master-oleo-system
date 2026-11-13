import { describe, expect, it } from 'vitest';
import { faixaTempo, foraDoExpediente, provavelEsquecida, registroForaDoTempoReal, tempoPadraoMin } from './tempo';

const os = (o: Record<string, unknown>) => ({ status: 'concluido', servicos: [], pausas: [], ...o }) as never;

describe('tempo de serviço', () => {
  it('padrão: óleo 30 min, com câmbio automático 2 h', () => {
    expect(tempoPadraoMin(os({ servicos: [{ key: 'oleoMotor' }] }))).toBe(30);
    expect(tempoPadraoMin(os({ servicos: [{ key: 'oleoMotor' }, { key: 'cambioAutomatico' }] }))).toBe(120);
  });
  it('faixas: verde até 80%, amarelo até o padrão, vermelho acima', () => {
    expect(faixaTempo(20, 30)).toBe('ok');
    expect(faixaTempo(25, 30)).toBe('perto');
    expect(faixaTempo(31, 30)).toBe('acima');
  });
  it('expediente em horário de Brasília', () => {
    expect(foraDoExpediente('2026-11-13T13:00:00Z')).toBe(false); // sex 10h
    expect(foraDoExpediente('2026-11-13T23:30:00Z')).toBe(true);  // sex 20h30
    expect(foraDoExpediente('2026-11-14T19:00:00Z')).toBe(true);  // sáb 16h
    expect(foraDoExpediente('2026-11-15T13:00:00Z')).toBe(true);  // dom
  });
  it('registro fora do tempo real: menos de 10 min ou fora do expediente; retorno pode ser curto', () => {
    expect(registroForaDoTempoReal(os({ iniciadaEm: '2026-11-13T13:00:00Z', concluidaEm: '2026-11-13T13:04:00Z' }))).toMatch(/4 min/);
    expect(registroForaDoTempoReal(os({ iniciadaEm: '2026-11-13T13:00:00Z', concluidaEm: '2026-11-13T13:04:00Z', retornoDeOsId: 'x' }))).toBeNull();
    expect(registroForaDoTempoReal(os({ iniciadaEm: '2026-11-13T21:00:00Z', concluidaEm: '2026-11-13T22:40:00Z' }))).toMatch(/fora do expediente/);
    expect(registroForaDoTempoReal(os({ iniciadaEm: '2026-11-13T13:00:00Z', concluidaEm: '2026-11-13T13:25:00Z' }))).toBeNull();
  });
  it('OS esquecida: em andamento além de 1,5× o padrão', () => {
    const o = os({ status: 'andamento', servicos: [{ key: 'oleoMotor' }], iniciadaEm: '2026-11-13T13:00:00Z' });
    expect(provavelEsquecida(o, '2026-11-13T13:40:00Z')).toBe(false);
    expect(provavelEsquecida(o, '2026-11-13T13:50:00Z')).toBe(true);
  });
});
