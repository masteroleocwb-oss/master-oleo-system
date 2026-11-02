import { beforeEach, describe, expect, it } from 'vitest';
import { ErroPermissao } from '../domain/permissions';
import type { Usuario } from '../domain/types';
import { fixarAgora, minutosTrabalhados } from '../domain/util';
import { sugestoesOcultar } from '../domain/checklist';
import {
  abrirOS, acaoOcorrencia, adicionarEvidencia, adicionarFotoRetorno, auditarChecklist, buscarVeiculosEClientes, concluirChecklist, corrigirPlaca, ErroValidacao,
  filaRodizio, finalizarOS, finalizarRetorno, gerarLink, iniciarOS, obterRelatorioPublico, ocultarItemPara, pausarOS, previsaoFila, projetarRelatorio, proximoDaFila,
  recomendacoesAbertas, definirPedidoOlist, registrarItemChecklist, retomarOS, revogarLink, salvarRetorno, setStatusRodizio, valoresOS,
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
  it('fila prevista: cada OS aguardando tem posição e mecânico previsto; fora da vez só com motivo', async () => {
    const d = getDB();
    const prev = previsaoFila(d);
    const aguardando = d.os.filter(o => o.status === 'aguardando').sort((a, b) => a.abertaEm.localeCompare(b.abertaEm));
    expect(aguardando.map(o => prev.get(o.id)?.posicao)).toEqual(aguardando.map((_, i) => i + 1));
    const ret = aguardando.find(o => o.retornoDeOsId)!;
    expect(prev.get(ret.id)?.mecanicoId).toBe(d.os.find(o => o.id === ret.retornoDeOsId)!.mecanicoId);
    const os = aguardando.find(o => !o.retornoDeOsId)!;
    const previsto = prev.get(os.id)!.mecanicoId!;
    const outro = filaRodizio(d).find(f => !f.ocupado && f.status === 'disponivel' && f.mecanico.id !== previsto)!.mecanico;
    // O previsto pode estar indisponível: outro mecânico assume, mas precisa dizer por quê.
    await expect(iniciarOS(outro, os.id, outro.id)).rejects.toThrow(/motivo/);
    await iniciarOS(outro, os.id, outro.id, 'O previsto está no elevador com outro carro');
    const depois = getDB().os.find(o => o.id === os.id)!;
    expect(depois.mecanicoId).toBe(outro.id);
    expect(depois.foraDaOrdem).toEqual({ previsto, motivo: 'O previsto está no elevador com outro carro' });
  });

  it('almoço tira da fila sem perder a posição; quem está em almoço não assume', async () => {
    const d = getDB();
    const os = d.os.find(o => o.status === 'aguardando' && !o.retornoDeOsId)!;
    const prox = proximoDaFila(d)!;
    await setStatusRodizio(prox, prox.id, 'almoco');
    expect(proximoDaFila(getDB())?.id).not.toBe(prox.id);
    await expect(iniciarOS(prox, os.id, prox.id, 'teste')).rejects.toThrow(/almoço/);
    await setStatusRodizio(prox, prox.id, 'disponivel');
    expect(proximoDaFila(getDB())?.id).toBe(prox.id);
  });

  it('mecânico não marca ausência de outro; liderança designa fora da ordem só com motivo', async () => {
    await expect(setStatusRodizio(U('u_m1'), 'u_m2', 'almoco')).rejects.toBeInstanceOf(ErroPermissao);
    const d = getDB();
    const os = d.os.find(o => o.status === 'aguardando' && !o.retornoDeOsId)!;
    const previsto = previsaoFila(d).get(os.id)!.mecanicoId;
    const livre = d.usuarios.find(u => u.role === 'mecanico' && u.ativo && u.id !== previsto && !d.os.some(o => o.mecanicoId === u.id && o.status === 'andamento') && d.rodizio.status[u.id] !== 'almoco')!;
    await expect(iniciarOS(U('u_lid'), os.id, livre.id)).rejects.toThrow(/motivo/);
    await iniciarOS(U('u_lid'), os.id, livre.id, 'Especialista em câmbio');
    expect(getDB().eventos.at(-1)?.motivo).toBe('Especialista em câmbio');
  });

  it('retorno: sem checklist completo; exige fotos, diagnóstico, solução e aviso; cliente não vê o diagnóstico', async () => {
    const d = getDB();
    const ret = d.os.find(o => o.retornoDeOsId && o.status === 'aguardando')!;
    const dono = d.os.find(o => o.id === ret.retornoDeOsId)!.mecanicoId!;
    if (getDB().os.some(o => o.status === 'andamento' && o.mecanicoId === dono)) {
      await pausarOS(U(dono), getDB().os.find(o => o.status === 'andamento' && o.mecanicoId === dono)!.id, 'peca');
    }
    await iniciarOS(U(dono), ret.id, dono);
    expect(getDB().os.find(o => o.id === ret.id)?.checklistId).toBeUndefined();
    const km = (getDB().veiculos.find(v => v.id === ret.veiculoId)!.kmAtual || 0) + 100;
    await expect(finalizarRetorno(U(dono), ret.id, km)).rejects.toThrow(/Foto do problema.*diagnóstico.*solução.*avisado/);
    await adicionarFotoRetorno(U(dono), ret.id, 'antes', { url: 'data:,a', demo: true });
    await salvarRetorno(U(dono), ret.id, { diagnostico: 'Anel do bujão mal assentado', relacaoServicoAnterior: 'sim', solucao: 'Troca do anel e reaperto', semFotoDepois: 'Sem vazamento visível', avisoCliente: 'Observar a garagem por 3 dias' });
    await finalizarRetorno(U(dono), ret.id, km);
    const fim = getDB().os.find(o => o.id === ret.id)!;
    expect(fim.status).toBe('concluido');
    const rel = projetarRelatorio(getDB(), fim);
    expect(rel.retorno?.solucao).toBe('Troca do anel e reaperto');
    expect(JSON.stringify(rel)).not.toContain('Anel do bujão');
    // Retorno não entra na base de carros nem no checklist % do mecânico.
    const ind = indicadoresMecanico(getDB(), dono);
    expect(getDB().os.filter(o => o.mecanicoId === dono && o.status === 'concluido' && !o.retornoDeOsId && o.concluidaEm?.startsWith('2026-10')).length).toBe(ind.carros);
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
    const todos = os.servicos.map(s => ({ key: s.key, executado: true }));
    await expect(finalizarOS(U('u_m1'), os.id, { km: (v.kmAtual || 0) + 500, servicos: todos, proximas: [] })).rejects.toThrow(/intervalo do óleo/);
    await finalizarOS(U('u_m1'), os.id, { km: (v.kmAtual || 0) + 500, servicos: todos.map(s => s.key === 'oleoMotor' ? { ...s, intervaloKm: 7000 } : s), proximas: [] });
    const fim = getDB().os.find(o => o.id === os.id)!;
    expect(fim.status).toBe('concluido');
    expect(fim.servicos.find(s => s.key === 'oleoMotor')?.intervaloKm).toBe(7000);
  });

  it('adicionais vendidos na bancada viram serviço "adicional", contam no upsell e respeitam o câmbio', async () => {
    const os = emAndamento();
    const c = getDB().checklists.find(x => x.id === os.checklistId)!;
    for (const d of c.defs) if (c.itens[d.id].estado === 'nao_verificado') await registrarItemChecklist(U('u_m1'), c.id, d.id, 'ok', {});
    await concluirChecklist(U('u_m1'), c.id);
    const v = getDB().veiculos.find(x => x.id === os.veiculoId)!;
    const servicos = os.servicos.map(s => ({ key: s.key, executado: true, intervaloKm: s.key === 'oleoMotor' ? 10000 : undefined }));
    const base = { km: (v.kmAtual || 0) + 400, servicos, proximas: [] };
    if (v.cambio === 'manual') await expect(finalizarOS(U('u_m1'), os.id, { ...base, adicionais: [{ key: 'flush' }] })).rejects.toThrow(/câmbio/);
    await finalizarOS(U('u_m1'), os.id, { ...base, adicionais: [{ key: 'militec', valor: 90 }], recusados: ['aditivo'] });
    const fim = getDB().os.find(o => o.id === os.id)!;
    const mil = fim.servicos.find(s => s.key === 'militec')!;
    expect(mil.origem).toBe('adicional');
    expect(mil.adicionadoPor).toBe('u_m1');
    expect(valoresOS(fim).upsell).toBeGreaterThanOrEqual(90);
    expect(fim.ofertas?.map(o => `${o.key}:${o.resultado}`)).toEqual(['militec:aceito', 'aditivo:recusado']);
  });

  it('pausa libera o mecânico para outra OS; nada é registrado na OS pausada; tempo pausado não conta', async () => {
    const os = emAndamento();
    await expect(pausarOS(U('u_m1'), os.id, 'outro', '')).rejects.toThrow(/motivo/);
    await expect(pausarOS(U('u_m3'), os.id, 'peca')).rejects.toBeInstanceOf(ErroPermissao);
    await pausarOS(U('u_m1'), os.id, 'peca', 'Filtro de combustível');
    expect(getDB().os.find(o => o.id === os.id)?.status).toBe('pausada');
    expect(filaRodizio(getDB()).find(f => f.mecanico.id === 'u_m1')?.ocupado).toBe(false);
    await expect(registrarItemChecklist(U('u_m1'), os.checklistId!, 'palhetas', 'ok', {})).rejects.toThrow(/pausada/);
    // Assume outro carro enquanto espera a peça; só retoma depois de terminar ou pausar o outro.
    const outra = getDB().os.find(o => o.status === 'aguardando' && !o.retornoDeOsId)!;
    await iniciarOS(U('u_m1'), outra.id, 'u_m1', 'Aguardando peça na outra OS');
    await expect(retomarOS(U('u_m1'), os.id)).rejects.toThrow(/outra OS em andamento/);
    await pausarOS(U('u_m1'), outra.id, 'aprovacao_cliente');
    await retomarOS(U('u_m1'), os.id);
    expect(getDB().os.find(o => o.id === os.id)?.status).toBe('andamento');
    expect(minutosTrabalhados({ iniciadaEm: '2026-10-26T12:00:00Z', concluidaEm: '2026-10-26T14:00:00Z', pausas: [{ inicio: '2026-10-26T12:30:00Z', fim: '2026-10-26T13:30:00Z' }] })).toBe(60);
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

describe('abertura: telefone obrigatório', () => {
  it('veículo novo sem telefone não abre; cliente antigo sem telefone precisa informar', async () => {
    const novo = { placa: 'QAT2B34', marca: 'Fiat', modelo: 'Argo', ano: 2021, motor: '1.3', cambio: 'manual' as const, combustivel: 'Flex' as const };
    const base = { vendedorId: 'u_ven', servicos: [{ key: 'oleoMotor' as const, origem: 'balcao' as const, executado: false }], valorInicial: 300 };
    const cad = { comoConheceu: 'Google', cidade: 'Curitiba', bairro: 'Portão' };
    await expect(abrirOS(U('u_ven'), { ...base, novoVeiculo: novo, novoCliente: { nome: 'Cliente Teste', telefone: '', ...cad } })).rejects.toThrow(/telefone/);
    await abrirOS(U('u_ven'), { ...base, novoVeiculo: novo, novoCliente: { nome: 'Cliente Teste', telefone: '(41) 98888-7777', ...cad } });
    const v = getDB().veiculos.find(x => x.id === 'v5')!;
    getDB().clientes.find(c => c.id === v.clienteId)!.telefone = undefined;
    await expect(abrirOS(U('u_ven'), { ...base, veiculoId: 'v5' })).rejects.toThrow(/telefone/);
    await abrirOS(U('u_ven'), { ...base, veiculoId: 'v5', completarCliente: { telefone: '(41) 97777-6666' } });
    expect(getDB().clientes.find(c => c.id === v.clienteId)!.telefone).toBe('(41) 97777-6666');
  });

  it('retorno exige o problema relatado e não exige serviço nem valor', async () => {
    const orig = getDB().os.find(o => o.status === 'concluido' && o.veiculoId === 'v5')
      || getDB().os.find(o => o.status === 'concluido' && o.checklistId)!;
    const base = { veiculoId: orig.veiculoId, vendedorId: 'u_ven', servicos: [], valorInicial: 0, retornoDeOsId: orig.id };
    getDB().clientes.find(c => c.id === orig.clienteId)!.telefone ||= '(41) 90000-0000';
    await expect(abrirOS(U('u_ven'), base)).rejects.toThrow(/problema/);
    const os = await abrirOS(U('u_ven'), { ...base, problemaRelatado: 'Luz do óleo acendeu' });
    expect(os.retorno?.problemaRelatado).toBe('Luz do óleo acendeu');
  });
});

describe('histórico e gestão', () => {
  it('item que quase nunca se aplica a um modelo é sugerido e, com decisão da direção, some só para esse modelo', async () => {
    const d = getDB();
    const sug = sugestoesOcultar(d.checklists, d.veiculos, d.catalogo);
    expect(sug.length).toBeGreaterThan(0);
    const g = sug[0];
    expect(g.pct).toBeGreaterThanOrEqual(80);
    await expect(ocultarItemPara(U('u_lid'), g.defId, g, 'x')).rejects.toBeInstanceOf(ErroPermissao);
    await ocultarItemPara(U('u_dir'), g.defId, { marca: g.marca, modelo: g.modelo, motor: g.motor }, 'Sugestão do sistema');
    const v = getDB().veiculos.find(x => x.marca === g.marca && x.modelo === g.modelo && x.motor === g.motor)!;
    const os = await abrirOS(U('u_ven'), { veiculoId: v.id, vendedorId: 'u_ven', servicos: [{ key: 'oleoMotor', origem: 'balcao', executado: false }], valorInicial: 200 });
    await iniciarOS(U('u_lid'), os.id, previsaoFila(getDB()).get(os.id)?.mecanicoId || 'u_m4', 'teste');
    const c = getDB().checklists.find(x => x.osId === os.id)!;
    expect(c.defs.some(x => x.id === g.defId)).toBe(false);
    expect(sugestoesOcultar(getDB().checklists, getDB().veiculos, getDB().catalogo).some(x => x.defId === g.defId && x.modelo === g.modelo && x.motor === g.motor)).toBe(false);
  });

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

describe('base de demonstração', () => {
  // O link beta quebrou em 02/11: no começo do mês não havia histórico para montar o retorno de exemplo.
  it('é gerada em qualquer dia, inclusive no dia 1º, em domingos e na virada do ano', () => {
    for (const d of ['2026-11-01T13:00:00Z', '2026-11-02T13:00:00Z', '2026-12-01T22:00:00Z', '2027-01-01T11:00:00Z', '2027-01-04T13:00:00Z', '2027-03-01T13:00:00Z', '2026-10-31T23:30:00Z']) {
      fixarAgora(new Date(d));
      const db = gerarSeed();
      expect(db.os.some(o => o.retornoDeOsId && o.status === 'aguardando'), d).toBe(true);
      expect(db.os.filter(o => o.status === 'concluido').length, d).toBeGreaterThan(20);
    }
  });
});

describe('cadastro do cliente e pedido do Olist na abertura', () => {
  const base = { vendedorId: 'u_ven', servicos: [{ key: 'oleoMotor' as const, origem: 'balcao' as const, executado: false }], valorInicial: 300 };
  const novo = { placa: 'QAT3C45', marca: 'Fiat', modelo: 'Argo', ano: 2021, motor: '1.3', cambio: 'manual' as const, combustivel: 'Flex' as const };

  it('cliente novo exige como conheceu, cidade e bairro; "Outro" exige descrição', async () => {
    const cli = { nome: 'Cliente Novo', telefone: '(41) 98888-1111' };
    await expect(abrirOS(U('u_ven'), { ...base, novoVeiculo: novo, novoCliente: { ...cli, comoConheceu: '', cidade: '', bairro: '' } }))
      .rejects.toThrow(/conheceu.*cidade.*bairro/);
    await expect(abrirOS(U('u_ven'), { ...base, novoVeiculo: novo, novoCliente: { ...cli, comoConheceu: 'Outro', cidade: 'Curitiba', bairro: 'Batel' } })).rejects.toThrow(/Outro/);
    const os = await abrirOS(U('u_ven'), { ...base, novoVeiculo: novo, pedidoOlist: ' 104523 ', novoCliente: { ...cli, comoConheceu: 'Outro', comoConheceuDetalhe: 'Evento da rua', cidade: 'Curitiba', bairro: 'Batel' } });
    const c = getDB().clientes.find(x => x.id === os.clienteId)!;
    expect([c.comoConheceu, c.comoConheceuDetalhe, c.cidade, c.bairro]).toEqual(['Outro', 'Evento da rua', 'Curitiba', 'Batel']);
    expect(getDB().os.find(o => o.id === os.id)!.pedidoOlist).toBe('104523');
    expect(buscarVeiculosEClientes(U('u_ven'), '104523')[0]?.motivo).toMatch(/pedido Olist 104523/);
  });

  it('cliente antigo sem os dados completa na abertura, e o cadastro fica gravado', async () => {
    const v = getDB().veiculos.find(x => x.clienteId === 'c_legado')!;
    await expect(abrirOS(U('u_ven'), { ...base, veiculoId: v.id })).rejects.toThrow(/conheceu/);
    await abrirOS(U('u_ven'), { ...base, veiculoId: v.id, completarCliente: { comoConheceu: 'Google', cidade: 'Pinhais', bairro: 'Centro' } });
    expect(getDB().clientes.find(c => c.id === 'c_legado')).toMatchObject({ comoConheceu: 'Google', cidade: 'Pinhais', bairro: 'Centro' });
    await abrirOS(U('u_ven'), { ...base, veiculoId: v.id }); // segunda visita: nada a pedir
    expect(getDB().eventos.some(e => e.tipo === 'cliente.atualizado' && e.entidadeId === 'c_legado')).toBe(true);
  });

  it('pedido do Olist pode ser informado depois, só por quem abre OS', async () => {
    const os = getDB().os.find(o => o.status === 'aguardando')!;
    await expect(definirPedidoOlist(U('u_m1'), os.id, '555')).rejects.toBeInstanceOf(ErroPermissao);
    await expect(definirPedidoOlist(U('u_ven'), os.id, 'pedido 1')).rejects.toThrow(/inválido/);
    await definirPedidoOlist(U('u_ven'), os.id, '555');
    expect(getDB().os.find(o => o.id === os.id)!.pedidoOlist).toBe('555');
  });
});

describe('recomendações não feitas continuam nas próximas manutenções', () => {
  it('item em mau estado recusado pelo cliente fica recomendado (relatório e próxima visita) até ser resolvido', async () => {
    const os = getDB().os.find(o => o.status === 'andamento' && o.mecanicoId === 'u_m1')!;
    const c = getDB().checklists.find(x => x.id === os.checklistId)!;
    await adicionarEvidencia(U('u_m1'), c.id, 'pastilhas', { url: 'data:,', demo: true });
    await registrarItemChecklist(U('u_m1'), c.id, 'pastilhas', 'prioritario', { recomendacao: 'Trocar pastilhas dianteiras' });
    for (const d of c.defs) if (getDB().checklists.find(x => x.id === c.id)!.itens[d.id].estado === 'nao_verificado') await registrarItemChecklist(U('u_m1'), c.id, d.id, 'ok', {});
    await concluirChecklist(U('u_m1'), c.id);
    getDB().oportunidades.find(o => o.osId === os.id && o.itemDefId === 'pastilhas')!.situacao = 'recusada';
    const v = getDB().veiculos.find(x => x.id === os.veiculoId)!;
    // A tela não mandou a recomendação: o servidor registra mesmo assim.
    await finalizarOS(U('u_m1'), os.id, { km: (v.kmAtual || 0) + 300, servicos: os.servicos.map(s => ({ key: s.key, executado: true, intervaloKm: s.key === 'oleoMotor' ? 10000 : undefined })), proximas: [] });
    const rec = recomendacoesAbertas(getDB(), v.id).find(r => r.m.itemDefId === 'pastilhas')!;
    expect(rec).toMatchObject({ estado: 'prioritario', situacao: 'recusada' });
    expect(rec.m.descricao).toBe('Trocar pastilhas dianteiras');
    const rel = projetarRelatorio(getDB(), getDB().os.find(o => o.id === os.id)!);
    expect(rel.proximas.find(p => p.descricao === 'Trocar pastilhas dianteiras')).toMatchObject({ estadoItem: 'prioritario', clienteAdiou: true });
    expect(rel.proximas[0].estadoItem).toBe('prioritario'); // prioritários primeiro

    // Próxima visita: o item volta OK (cliente trocou em outro lugar ou aqui) → a recomendação é resolvida.
    const os2 = await abrirOS(U('u_ven'), { veiculoId: v.id, vendedorId: 'u_ven', servicos: [{ key: 'oleoMotor', origem: 'balcao', executado: false }], valorInicial: 250 });
    await iniciarOS(U('u_lid'), os2.id, 'u_m2', 'teste');
    const c2 = getDB().checklists.find(x => x.osId === os2.id)!;
    for (const d of c2.defs) await registrarItemChecklist(U('u_m2'), c2.id, d.id, 'ok', {});
    await concluirChecklist(U('u_m2'), c2.id);
    await finalizarOS(U('u_m2'), os2.id, { km: (v.kmAtual || 0) + 300, servicos: [{ key: 'oleoMotor', executado: true, intervaloKm: 5000 }], proximas: [] });
    expect(recomendacoesAbertas(getDB(), v.id).some(r => r.m.itemDefId === 'pastilhas')).toBe(false);
  });
});
