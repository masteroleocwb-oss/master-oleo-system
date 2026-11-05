// Indicadores. Cada indicador tem fórmula explícita (mostrada na interface) para
// ninguém precisar adivinhar como o número foi calculado.
import { checklistCompleto, fotosAtivasDoItem } from '../domain/checklist';
import { atendeOS } from '../domain/permissions';
import { descontoChecklist, scoreExecucao, versaoEm } from '../domain/gestao';
import type { DB, OrdemServico } from '../domain/types';
import { diaKey, diasUteis, diffMin, hojeKey, media, minutosTrabalhados, mesKey, pct, soma, ultimoDiaDoMes } from '../domain/util';
import { servicoNaOS, valoresOS } from './api';

export const DEFINICOES: Record<string, { nome: string; formula: string; porque: string }> = {
  carros: { nome: 'Carros atendidos', formula: 'OS concluídas por você no mês (retornos ficam fora: não são um carro novo).', porque: 'Volume sozinho não diz qualidade; por isso aparece ao lado do checklist.' },
  checklist: { nome: 'Checklist completo', formula: 'OS com checklist completo ÷ OS concluídas. Exceção autorizada NÃO conta como completo. Carro de loja (checklist opcional) só entra quando o checklist foi completado.', porque: 'É a base da recomendação ao cliente: sem inspeção completa, não há confiança no que foi recomendado.' },
  excecoes: { nome: 'Exceções autorizadas', formula: 'OS concluídas com checklist fechado por exceção aprovada pela liderança.', porque: 'Mostra quando a operação impediu a inspeção completa — separado para não punir nem esconder.' },
  evidencias: { nome: 'Evidência quando exigida', formula: 'Itens com foto obrigatória que têm foto ÷ itens com foto obrigatória.', porque: 'A foto sustenta a recomendação para o cliente e para a auditoria.' },
  identificados: { nome: 'Itens identificados', formula: 'Itens marcados Atenção ou Prioritário no checklist.', porque: 'Mede a inspeção, não a venda. Identificar não depende do cliente aceitar.' },
  realizados: { nome: 'Itens realizados', formula: 'Serviços vindos do checklist, aceitos pelo cliente e executados.', porque: 'É o indicador da meta individual (Playbook: meta em volume de itens).' },
  conversao: { nome: 'Aceite das recomendações', formula: 'Itens realizados ÷ itens identificados.', porque: 'Depende também do comercial; aparece para contexto, não para cobrança isolada.' },
  retornos: { nome: 'Retornos', formula: 'OS abertas como retorno de serviço feito por você.', porque: 'Qualidade de execução: retorno custa tempo e confiança.' },
  adicionais: { nome: 'Adicionais vendidos', formula: 'Serviços adicionais (militec, aditivo, flush…) oferecidos por você na bancada, aceitos e executados.', porque: 'Mostra a oferta na bancada, separada das recomendações do checklist.' },
  foraDaOrdem: { nome: 'Assumidas fora da ordem', formula: 'OS que você assumiu no lugar do mecânico previsto na fila (sempre com motivo).', porque: 'Transparência do rodízio: não é falta, mas a liderança acompanha o padrão.' },
  tempo: { nome: 'Tempo médio por OS', formula: 'Média de (conclusão − início − pausas) das OS concluídas. Tempo aguardando peça não conta.', porque: 'Só para contexto. Não é meta: pressa piora o checklist.' },
  score: { nome: 'Score de execução (proposta em teste)', formula: '100 − ocorrências aplicadas − desconto do checklist + reconhecimentos (até +5).', porque: 'Proposta do Playbook em teste. NÃO altera remuneração real neste protótipo.' },
};

export interface IndicadoresMecanico {
  mecanicoId: string;
  carros: number;
  carrosElegiveis: number;
  checklistCompletos: number;
  /** OS que contam para o checklist % (carro de loja sem checklist fica fora). */
  baseChecklist: number;
  excecoes: number;
  checklistPct: number | null;
  fotosExigidas: number;
  fotosFeitas: number;
  evidenciasPct: number | null;
  identificados: number;
  realizados: number;
  conversaoPct: number | null;
  faturamento: number;
  upsell: number;
  adicionais: number;
  ofertasAdicionais: number;
  foraDaOrdem: number;
  retornos: number;
  tempoMedioMin: number | null;
  tempoChecklistMin: number | null;
  score: number;
  descontoChecklist: number;
  meta?: { alvo: number; versao: number; progressoPct: number; projecao: number; ritmoNecessario: number | null };
}

const concluidasNoMes = (d: DB, mes: string) => d.os.filter(o => o.status === 'concluido' && o.concluidaEm && mesKey(o.concluidaEm) === mes);

export function indicadoresMecanico(d: DB, mecanicoId: string, mes = mesKey(hojeKey() + 'T15:00:00Z')): IndicadoresMecanico {
  const todas = concluidasNoMes(d, mes).filter(o => o.mecanicoId === mecanicoId);
  // Retorno não é um carro novo nem tem checklist: fica fora da base de carros e do checklist %.
  const os = todas.filter(o => !o.retornoDeOsId);
  const cks = os.map(o => d.checklists.find(c => c.id === o.checklistId));
  const comChecklist = cks.filter(Boolean);
  const completos = comChecklist.filter(c => checklistCompleto(c)).length;
  const excecoes = comChecklist.filter(c => c!.status === 'excecao_autorizada').length;
  let exig = 0, feitas = 0, ident = 0;
  comChecklist.forEach(c => c!.defs.forEach(def => {
    const it = c!.itens[def.id];
    if (it.estado === 'atencao' || it.estado === 'prioritario') ident++;
    if (it.estado !== 'nao_verificado' && def.fotoObrigatoriaEm.includes(it.estado)) {
      exig++;
      if (fotosAtivasDoItem(it, d.evidencias) > 0) feitas++;
    }
  }));
  const realizados = soma(os.map(o => o.servicos.filter(s => s.origem === 'checklist' && s.executado).length));
  const diasExc = new Set(d.diasExcecao.map(x => x.data));
  const elegiveis = os.filter(o => !diasExc.has(diaKey(o.abertaEm)) && !o.naoOferecer).length;
  const retornos = d.os.filter(o => o.retornoDeOsId && mesKey(o.abertaEm) === mes && d.os.find(x => x.id === o.retornoDeOsId)?.mecanicoId === mecanicoId).length;
  // Carro de loja tem checklist opcional: só entra na base do checklist % quando foi completado.
  const baseChecklist = os.filter((o, i) => !o.carroDeLoja || checklistCompleto(cks[i])).length;
  const checklistPct = baseChecklist ? pct(completos, baseChecklist) : null;
  const desc = descontoChecklist(checklistPct);
  const aplicadas = d.ocorrencias.filter(o => o.profissionalId === mecanicoId && o.status === 'aplicada' && mesKey(o.dataHora) === mes);
  const r: IndicadoresMecanico = {
    mecanicoId,
    carros: os.length,
    carrosElegiveis: elegiveis,
    checklistCompletos: completos,
    baseChecklist,
    excecoes,
    checklistPct,
    fotosExigidas: exig,
    fotosFeitas: feitas,
    evidenciasPct: exig ? pct(feitas, exig) : null,
    identificados: ident,
    realizados,
    conversaoPct: ident ? pct(realizados, ident) : null,
    faturamento: soma(os.map(o => valoresOS(o).total)),
    upsell: soma(os.map(o => valoresOS(o).upsell)),
    adicionais: soma(os.map(o => o.servicos.filter(s => s.origem === 'adicional' && s.executado).length)),
    ofertasAdicionais: soma(os.map(o => (o.ofertas || []).length)),
    foraDaOrdem: d.os.filter(o => o.mecanicoId === mecanicoId && o.foraDaOrdem && o.iniciadaEm && mesKey(o.iniciadaEm) === mes).length,
    retornos,
    tempoMedioMin: media(os.map(minutosTrabalhados).filter((x): x is number => x != null)),
    tempoChecklistMin: media(comChecklist.filter(c => c!.iniciadoEm && c!.concluidoEm).map(c => diffMin(c!.iniciadoEm!, c!.concluidoEm!))),
    score: scoreExecucao(aplicadas, desc),
    descontoChecklist: desc,
  };
  const metaInd = d.metas.find(m => m.indicador === 'itens_realizados' && m.escopo.tipo === 'individual' && m.escopo.usuarioId === mecanicoId);
  const hoje = hojeKey();
  const fimMes = ultimoDiaDoMes(mes);
  const ref = mes === mesKey(hoje + 'T15:00:00Z') ? hoje : fimMes;
  const v = metaInd ? versaoEm(metaInd, ref) : undefined;
  if (v) {
    const decorridos = diasUteis(`${mes}-01`, ref);
    const total = diasUteis(`${mes}-01`, fimMes);
    const restantes = Math.max(0, total - decorridos);
    r.meta = {
      alvo: v.alvo,
      versao: v.versao,
      progressoPct: Math.min(100, (realizados / v.alvo) * 100),
      projecao: decorridos ? Math.round((realizados / decorridos) * total) : 0,
      ritmoNecessario: restantes ? Math.max(0, (v.alvo - realizados) / restantes) : null,
    };
  }
  return r;
}

export function indicadoresEquipe(d: DB, mes = mesKey(hojeKey() + 'T15:00:00Z')) {
  const mecs = d.usuarios.filter(u => atendeOS(u) && u.ativo);
  const porMec = mecs.map(m => ({ usuario: m, ind: indicadoresMecanico(d, m.id, mes) }));
  const tot = (k: keyof IndicadoresMecanico) => soma(porMec.map(x => Number(x.ind[k]) || 0));
  const carros = tot('carros');
  return {
    porMec,
    carros,
    checklistPct: tot('baseChecklist') ? pct(tot('checklistCompletos'), tot('baseChecklist')) : null,
    excecoes: tot('excecoes'),
    evidenciasPct: tot('fotosExigidas') ? pct(tot('fotosFeitas'), tot('fotosExigidas')) : null,
    identificados: tot('identificados'),
    realizados: tot('realizados'),
    faturamento: tot('faturamento'),
    upsell: tot('upsell'),
    retornos: tot('retornos'),
  };
}

export function painelHoje(d: DB) {
  const hoje = hojeKey();
  const doDia = (o: OrdemServico) => diaKey(o.abertaEm) === hoje || o.status === 'aguardando' || o.status === 'andamento';
  const os = d.os.filter(o => o.status !== 'encerrada' && o.status !== 'cancelada' && doDia(o));
  const concluidasHoje = d.os.filter(o => o.status === 'concluido' && o.concluidaEm && diaKey(o.concluidaEm) === hoje);
  return {
    aguardando: os.filter(o => o.status === 'aguardando').sort((a, b) => a.abertaEm.localeCompare(b.abertaEm)),
    andamento: os.filter(o => o.status === 'andamento'),
    // Pausadas aparecem sempre (a peça pode chegar no dia seguinte).
    pausadas: d.os.filter(o => o.status === 'pausada'),
    concluidasHoje,
    faturamentoHoje: soma(concluidasHoje.map(o => valoresOS(o).total)),
    excecoesPendentes: d.checklists.filter(c => c.solicitacaoExcecao?.status === 'pendente'),
    correcoesPendentes: d.checklists.filter(c => c.correcaoSolicitada && !c.correcaoSolicitada.resolvidaEm),
    oportunidadesNovas: d.oportunidades.filter(o => o.situacao === 'nova' && !servicoNaOS(d.os.find(x => x.id === o.osId), o.servicoKey)),
    ocorrenciasDecisao: d.ocorrencias.filter(o => o.status === 'em_revisao' || o.status === 'contestada'),
    ocorrenciasRascunho: d.ocorrencias.filter(o => o.status === 'registrada'),
    ocorrenciasAplicar: d.ocorrencias.filter(o => o.status === 'aprovada'),
    metasAguardando: d.metas.filter(m => m.versoes.some(v => v.status === 'rascunho')),
  };
}

/** Indicadores da própria liderança: a gestão também é medida. */
export function indicadoresLideranca(d: DB, mes = mesKey(hojeKey() + 'T15:00:00Z')) {
  const concl = concluidasNoMes(d, mes).filter(o => o.checklistId);
  const auditadas = new Set(d.auditorias.filter(a => mesKey(a.em) === mes).map(a => a.checklistId));
  const decididas = d.checklists.filter(c => c.solicitacaoExcecao?.decididoEm && mesKey(c.solicitacaoExcecao.decididoEm) === mes);
  const planos = d.planosAcao;
  const hoje = hojeKey();
  const correcoes = d.auditorias.filter(a => a.resultado === 'correcao_solicitada');
  return {
    auditoriaPct: concl.length ? pct(auditadas.size, concl.length) : null,
    auditadas: auditadas.size,
    concluidas: concl.length,
    alvoAuditoriaPct: 10,
    excecoesDecididas: decididas.length,
    tempoDecisaoExcecaoMin: media(decididas.map(c => diffMin(c.solicitacaoExcecao!.em, c.solicitacaoExcecao!.decididoEm!))),
    excecoesPendentes: d.checklists.filter(c => c.solicitacaoExcecao?.status === 'pendente').length,
    correcoesAbertas: correcoes.filter(a => !a.resolvidaEm).length,
    planosAbertos: planos.filter(p => p.status === 'aberto').length,
    planosVencidos: planos.filter(p => p.status === 'aberto' && p.prazo < hoje).length,
    metasSemComunicar: d.metas.filter(m => !m.comunicadaEm).length,
    ocorrenciasParadas: d.ocorrencias.filter(o => o.status === 'registrada').length,
    foraDaOrdem: d.os.filter(o => o.foraDaOrdem && o.iniciadaEm && mesKey(o.iniciadaEm) === mes),
    pausadas: d.os.filter(o => o.status === 'pausada'),
  };
}

/** Série histórica: fechamentos imutáveis + mês atual calculado ao vivo. */
export function serieMecanico(d: DB, mecanicoId: string) {
  const mesAtual = mesKey(hojeKey() + 'T15:00:00Z');
  const fechados = d.fechamentos.filter(f => f.usuarioId === mecanicoId).sort((a, b) => a.mes.localeCompare(b.mes))
    .map(f => ({ mes: f.mes, carros: f.carros, checklistPct: f.checklistCompletoPct, itens: f.itensRealizados, faturamento: f.faturamento, retornos: f.retornos, fechado: true }));
  const atual = indicadoresMecanico(d, mecanicoId, mesAtual);
  return [...fechados, { mes: mesAtual, carros: atual.carros, checklistPct: atual.checklistPct, itens: atual.realizados, faturamento: atual.faturamento, retornos: atual.retornos, fechado: false }];
}
