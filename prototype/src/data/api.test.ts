import { beforeEach, describe, expect, it } from 'vitest';
import { ErroPermissao } from '../domain/permissions';
import type { Usuario } from '../domain/types';
import { fixarAgora } from '../domain/util';
import {
  abrirOS, acaoOcorrencia, adicionarEvidencia, auditarChecklist, buscarVeiculosEClientes, concluirChecklist, corrigirPlaca, ErroValidacao,
  finalizarOS, gerarLink, iniciarOS, obterRelatorioPublico, proximoDaFila, registrarItemChecklist, revogarLink, setStatusRodizio,
} from './api';
import { indicadoresMecanico } from './metricas';
import { gerarSeed } from './seed';
import { _definirDB, ErroSalvamento, getDB, setControle } from './store';

const U = (id: string): Usuario => getDB().usuarios.find(u => u.id === id)!;

beforeEach(() => {
  fixarAgora(new Date('2026-10-26T18:00:00Z')); // segunda-feira, 15h em Brasília
  _definirDB(gerarSeed());
  setControle({ latenciaMs: 0, falharProximo: false, offline: false });
});

const novaOS = (por = 'u_ven') => abrirOS(U(por), { veiculoId: 'v5', vendedorId: 'u_ven', servicos: [{ key: 'oleoMotor', origem: 'balcao', executado: false }], valorInicial: 300 });

describe('abertura de OS', () => {
  it('numera dentro da transação: aberturas simultâneas nunca repetem número', async () => {
    const r = await Promise.all([novaOS(), novaOS(), novaOS('u_lid')]);
    const nums = r.map(o => o.numero);
    expect(new Set(nums).size).toBe(3);
    const todos = getDB().os.map(o => o.numero);
    expect(new Set(todos).size).toBe(todos.length);
  });

  it('mecânico não abre OS (permissão na camada de dados, não só no botão)', async () => {
    await expect(novaOS('u_m1')).rejects.toBeInstanceOf(ErroPermissao);
  });

  it('falha de salvamento não deixa nada pela metade', async () => {
    const antes = getDB().os.length;
    setControle({ falharProximo: true });
    await expect(novaOS()).rejects.toBeInstanceOf(ErroSalvamento);
    expect(getDB().os.length).toBe(antes);
    await novaOS();
    expect(getDB().os.length).toBe(antes + 1);
  });
});

describe('rodízio', () => {
  it('mecânico fora da vez não assume; almoço tira da fila sem perder a posição', async () => {
    const d = getDB();
    const prox = proximoDaFila(d)!;
    const outro = d.usuarios.find(u => u.role === 'mecanico' && u.ativo && u.id !== prox.id && !d.os.some(o => o.mecanicoId === u.id && o.status === 'andamento'))!;
    const os = d.os.find(o => o.status === 'aguardando' && !o.retornoDeOsId)!;
    await expect(iniciarOS(outro, os.id, outro.id)).rejects.toThrow(/Não é a sua vez/);
    await setStatusRodizio(prox, prox.id, 'almoco');
    expect(proximoDaFila(getDB())?.id).not.toBe(prox.id);
    await setStatusRodizio(prox, prox.id, 'disponivel');
    expect(proximoDaFila(getDB())?.id).toBe(prox.id);
  });

  it('mecânico não marca ausência de outro; liderança designa fora da ordem só com motivo', async () => {
    await expect(setStatusRodizio(U('u_m1'), 'u_m2', 'almoco')).rejects.toBeInstanceOf(ErroPermissao);
    const d = getDB();
    const os = d.os.find(o => o.status === 'aguardando' && !o.retornoDeOsId)!;
    const livre = d.usuarios.find(u => u.role === 'mecanico' && u.ativo && u.id !== proximoDaFila(d)!.id && !d.os.some(o => o.mecanicoId === u.id && o.status === 'andamento') && d.rodizio.status[u.id] !== 'almoco')!;
    await expect(iniciarOS(U('u_lid'), os.id, livre.id)).rejects.toThrow(/motivo/);
    await iniciarOS(U('u_lid'), os.id, livre.id, 'Especialista em câmbio');
    expect(getDB().eventos.at(-1)?.motivo).toBe('Especialista em câmbio');
  });

  it('retorno vai para o mecânico do serviço original', async () => {
    const d = getDB();
    const ret = d.os.find(o => o.retornoDeOsId && o.status === 'aguardando')!;
    const dono = d.os.find(o => o.id === ret.retornoDeOsId)!.mecanicoId!;
    const outro = proximoDaFila(d)!.id === dono ? 'u_m4' : proximoDaFila(d)!.id;
    await expect(iniciarOS(U(outro), ret.id, outro)).rejects.toThrow(/Retorno/);
    await iniciarOS(U(dono), ret.id, dono);
    expect(getDB().os.find(o => o.id === ret.id)?.mecanicoId).toBe(dono);
  });
});

describe('checklist e finalização', () => {
  const emAndamento = () => getDB().os.find(o => o.status === 'andamento' && o.mecanicoId === 'u_m1')!;

  it('só o executor registra; foto obrigatória é exigida no servidor', async () => {
    const os = emAndamento();
    await expect(registrarItemChecklist(U('u_m3'), os.checklistId!, 'palhetas', 'ok', {})).rejects.toBeInstanceOf(ErroPermissao);
    await expect(registrarItemChecklist(U('u_m1'), os.checklistId!, 'discos', 'prioritario', {})).rejects.toThrow(/Foto obrigatória/);
    await adicionarEvidencia(U('u_m1'), os.checklistId!, 'discos', { url: 'data:,', demo: true });
    await registrarItemChecklist(U('u_m1'), os.checklistId!, 'discos', 'prioritario', { recomendacao: 'Trocar discos' });
    const op = getDB().oportunidades.find(o => o.osId === os.id && o.itemDefId === 'discos');
    expect(op?.situacao).toBe('nova');
  });

  it('não conclui com pendência e não finaliza sem checklist e KM', async () => {
    const os = emAndamento();
    await expect(concluirChecklist(U('u_m1'), os.checklistId!)).rejects.toThrow(/pendência/);
    await expect(finalizarOS(U('u_m1'), os.id, { km: null, servicos: [{ key: 'oleoMotor', executado: true }], proximas: [] })).rejects.toThrow(/Concluir o checklist.*quilometragem/);
    const c = getDB().checklists.find(x => x.id === os.checklistId)!;
    for (const d of c.defs) if (c.itens[d.id].estado === 'nao_verificado') await registrarItemChecklist(U('u_m1'), c.id, d.id, 'ok', {});
    await concluirChecklist(U('u_m1'), c.id);
    const v = getDB().veiculos.find(x => x.id === os.veiculoId)!;
    await expect(finalizarOS(U('u_m1'), os.id, { km: (v.kmAtual || 0) - 10, servicos: [{ key: 'oleoMotor', executado: true }], proximas: [] })).rejects.toThrow(/KM menor/);
    await finalizarOS(U('u_m1'), os.id, { km: (v.kmAtual || 0) + 500, servicos: os.servicos.map(s => ({ key: s.key, executado: true })), proximas: [] });
    expect(getDB().os.find(o => o.id === os.id)?.status).toBe('concluido');
  });

  it('auditoria não altera a inspeção; ninguém audita a própria', async () => {
    const os = getDB().os.find(o => o.status === 'concluido' && o.checklistId && o.mecanicoId === 'u_m2')!;
    const antes = JSON.stringify(getDB().checklists.find(c => c.id === os.checklistId)!.itens);
    await auditarChecklist(U('u_lid'), os.checklistId!, 'correcao_solicitada', [{ itemDefId: 'palhetas', descricao: 'rever' }], 'Foto ruim');
    const c = getDB().checklists.find(x => x.id === os.checklistId)!;
    expect(JSON.stringify(c.itens)).toBe(antes);
    expect(c.correcaoSolicitada?.itens).toEqual(['palhetas']);
    await expect(auditarChecklist(U('u_m1'), os.checklistId!, 'aprovado', [], '')).rejects.toBeInstanceOf(ErroPermissao);
  });
});

describe('relatório público', () => {
  it('projeção não expõe telefone, valores, notas internas ou dados de gestão', () => {
    const r = obterRelatorioPublico('Dm0Ativo7xQ2pL9vR4tY1w');
    expect(r.estado).toBe('ok');
    const txt = JSON.stringify(r);
    const d = getDB();
    const os = d.os.find(o => o.id === d.compartilhamentos.find(s => s.id === 'sh_ativo')!.osId)!;
    const cli = d.clientes.find(c => c.id === os.clienteId)!;
    expect(txt).not.toContain(cli.telefone!);
    expect(txt).not.toContain(cli.nome.split(' ')[1]);
    expect(txt).not.toMatch(/valor|valorInicial|obsInterna|mecanicoId|clienteId|telefone|meta|score|ocorr/i);
    if (r.estado === 'ok') expect(Object.keys(r.relatorio).sort()).toEqual(['atualizadoEm', 'checklistStatus', 'clientePrimeiroNome', 'data', 'fotos', 'itens', 'km', 'numero', 'observacao', 'proximas', 'servicos', 'tecnico', 'veiculo']);
  });

  it('revogado, expirado e inexistente não mostram nada; número da OS não é token', () => {
    expect(obterRelatorioPublico('Dm0Revog3kP8sN2bV6cX0z').estado).toBe('revogado');
    expect(obterRelatorioPublico('Dm0Expir5mQ1wE7rT3yU9i').estado).toBe('expirado');
    expect(obterRelatorioPublico('7001').estado).toBe('indisponivel');
    expect(obterRelatorioPublico('').estado).toBe('indisponivel');
  });

  it('conta acessos e respeita permissão de gerar e revogar', async () => {
    const antes = getDB().compartilhamentos.find(s => s.id === 'sh_ativo')!.acessos;
    obterRelatorioPublico('Dm0Ativo7xQ2pL9vR4tY1w');
    expect(getDB().compartilhamentos.find(s => s.id === 'sh_ativo')!.acessos).toBe(antes + 1);
    await expect(revogarLink(U('u_ven'), 'sh_ativo', '')).rejects.toBeInstanceOf(ErroPermissao);
    await revogarLink(U('u_lid'), 'sh_ativo', 'teste');
    expect(obterRelatorioPublico('Dm0Ativo7xQ2pL9vR4tY1w').estado).toBe('revogado');
    const aguardando = getDB().os.find(o => o.status === 'aguardando')!;
    await expect(gerarLink(U('u_ven'), aguardando.id, 30)).rejects.toBeInstanceOf(ErroValidacao);
    await expect(gerarLink(U('u_m1'), getDB().compartilhamentos[0].osId, 30)).rejects.toBeInstanceOf(ErroPermissao);
  });
});

describe('histórico e gestão', () => {
  it('troca de placa mantém o histórico e a busca encontra pela placa antiga', async () => {
    const v = getDB().veiculos.find(x => x.placa === 'DEM1A23')!;
    const visitas = getDB().os.filter(o => o.veiculoId === v.id).length;
    await expect(corrigirPlaca(U('u_lid'), v.id, 'DEM9Z99', 'x')).rejects.toBeInstanceOf(ErroPermissao);
    await corrigirPlaca(U('u_dir'), v.id, 'DEM9Z99', 'Conversão Mercosul');
    expect(getDB().os.filter(o => o.veiculoId === v.id).length).toBe(visitas);
    expect(buscarVeiculosEClientes(U('u_ven'), 'DEM1A23')[0]?.veiculo.id).toBe(v.id);
  });

  it('ocorrência segue o fluxo com decisão humana e manifestação do profissional', async () => {
    await expect(acaoOcorrencia(U('u_lid'), 'oc2', 'aprovar', 'ok')).rejects.toThrow(/direção/);
    await acaoOcorrencia(U('u_m4'), 'oc2', 'contestar', 'A ferramenta era da bancada vizinha.');
    await expect(acaoOcorrencia(U('u_dir'), 'oc2', 'aplicar', '')).rejects.toThrow();
    await acaoOcorrencia(U('u_dir'), 'oc2', 'rejeitar', 'Manifestação procede.');
    const o = getDB().ocorrencias.find(x => x.id === 'oc2')!;
    expect(o.status).toBe('rejeitada');
    expect(o.historico.map(h => h.status)).toEqual(['registrada', 'em_revisao', 'contestada', 'rejeitada']);
  });

  it('exceção autorizada não conta como checklist completo', () => {
    const d = getDB();
    for (const id of ['u_m1', 'u_m2', 'u_m3', 'u_m4', 'u_m5']) {
      const ind = indicadoresMecanico(d, id);
      const conc = d.os.filter(o => o.mecanicoId === id && o.status === 'concluido' && o.concluidaEm?.startsWith('2026-10'));
      const comp = conc.filter(o => d.checklists.find(c => c.id === o.checklistId)?.status === 'concluido').length;
      expect(ind.checklistCompletos).toBe(comp);
      expect(ind.checklistCompletos + ind.excecoes).toBeLessThanOrEqual(ind.carros);
    }
  });
});
