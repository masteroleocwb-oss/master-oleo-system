// Metas com vigência, políticas de remuneração (vigente × proposta) e o fluxo de ocorrências.
import type { Meta, Ocorrencia, Politica, StatusOcorrencia, Usuario, VersaoMeta } from './types';
import { addDias } from './util';

// ───────────────────────── Metas ─────────────────────────

/** Versão que vale num dia. Rascunho nunca vale; versões encerradas continuam valendo no seu período. */
export const versaoEm = (m: Meta, dia: string): VersaoMeta | undefined =>
  [...m.versoes]
    .filter(v => v.status !== 'rascunho' && v.vigenciaInicio <= dia && (!v.vigenciaFim || dia <= v.vigenciaFim))
    .sort((a, b) => b.versao - a.versao)[0];

export const STATUS_META_LABEL = (m: Meta, hoje: string) => {
  if (m.versoes.some(v => v.status === 'rascunho')) return 'Aguardando aprovação';
  const v = versaoEm(m, hoje);
  if (v) return 'Vigente';
  const futura = m.versoes.some(x => x.status === 'aprovada' && x.vigenciaInicio > hoje);
  return futura ? 'Aprovada (começa depois)' : 'Encerrada';
};

export const proporVersao = (m: Meta, alvo: number, inicio: string, justificativa: string, por: string, em: string, hoje: string): Meta => {
  if (!justificativa.trim()) throw new Error('Toda alteração de meta precisa de justificativa.');
  if (inicio < hoje) throw new Error('A nova vigência não pode começar no passado: o histórico não é reescrito.');
  if (m.versoes.some(v => v.status === 'rascunho')) throw new Error('Já existe uma versão aguardando aprovação.');
  const versao = Math.max(0, ...m.versoes.map(v => v.versao)) + 1;
  return { ...m, versoes: [...m.versoes, { versao, alvo, vigenciaInicio: inicio, status: 'rascunho', definidaPor: por, definidaEm: em, justificativa: justificativa.trim() }] };
};

/** Aprova o rascunho: a versão anterior é encerrada na véspera, sem perder seus valores. */
export const aprovarVersao = (m: Meta, por: string, em: string): Meta => {
  const rasc = m.versoes.find(v => v.status === 'rascunho');
  if (!rasc) throw new Error('Não há versão aguardando aprovação.');
  const vespera = addDias(rasc.vigenciaInicio + 'T12:00:00Z', -1).slice(0, 10);
  return {
    ...m,
    versoes: m.versoes.map(v => {
      if (v === rasc) return { ...v, status: 'aprovada', aprovadaPor: por, aprovadaEm: em };
      if (v.status === 'aprovada' && (!v.vigenciaFim || v.vigenciaFim >= rasc.vigenciaInicio) && v.vigenciaInicio < rasc.vigenciaInicio) {
        return { ...v, status: 'encerrada', vigenciaFim: vespera };
      }
      return v;
    }),
  };
};

export const descartarRascunho = (m: Meta): Meta => ({ ...m, versoes: m.versoes.filter(v => v.status !== 'rascunho') });

// ───────────────────── Remuneração ─────────────────────

export interface FaixaComissao { min: number; pct: number }

/** Regra VIGENTE no sistema atual (index.html, FAIXAS_COMISSAO e calcularComissaoLub). */
export const POLITICA_VIGENTE_PARAMS = {
  faixas: [{ min: 0, pct: 0 }, { min: 5000, pct: 3 }, { min: 8000, pct: 5 }, { min: 12000, pct: 7 }] as FaixaComissao[],
  tetoCambioPorOS: 50,
  fatorAjustePct: -13,
};

/** PROPOSTA EM TESTE (Playbook de Remuneração, 07/10/2026 — "não é política final"). */
export const POLITICA_PROPOSTA_PARAMS = {
  faixas: [
    { min: 0, pct: 0 }, { min: 55000, pct: 0.5 }, { min: 80000, pct: 0.75 }, { min: 100000, pct: 1.0 },
    { min: 130000, pct: 1.2 }, { min: 150000, pct: 1.4 },
  ] as FaixaComissao[],
  acelerador: [{ minPct: 120, pp: 0.25 }, { minPct: 150, pp: 0.4 }],
  fatorScore: [{ min: 95, fator: 0.10 }, { min: 90, fator: 0 }, { min: 80, fator: -0.10 }, { min: 0, fator: -0.20 }],
};

export const faixaPara = (faixas: FaixaComissao[], valor: number) => [...faixas].sort((a, b) => b.min - a.min).find(f => valor >= f.min) || faixas[0];

export interface EntradaVigente { upsellPorOS: { upsell: number; cambio: number }[]; ajustes: number }
export interface ResultadoCalculo { valor: number; premissas: string[]; detalhes: Record<string, number | string> }

export const calcularVigente = (e: EntradaVigente, p = POLITICA_VIGENTE_PARAMS): ResultadoCalculo => {
  const fator = 1 + p.fatorAjustePct / 100;
  const base = e.upsellPorOS.reduce((s, o) => s + o.upsell * fator, 0);
  const faixa = faixaPara(p.faixas, base);
  let cambio = 0, servicos = 0;
  e.upsellPorOS.forEach(o => {
    const c = o.cambio * fator, outros = (o.upsell - o.cambio) * fator;
    cambio += Math.min(c * faixa.pct / 100, p.tetoCambioPorOS);
    servicos += outros * faixa.pct / 100;
  });
  const valor = Math.max(0, servicos + cambio - e.ajustes);
  return {
    valor,
    premissas: [`Base = upsell × (1 ${p.fatorAjustePct}%)`, `Faixa ${faixa.pct}% pelo total do período`, `Câmbio com teto de R$ ${p.tetoCambioPorOS} por OS`, 'Ajustes do mês subtraídos'],
    detalhes: { base, faixaPct: faixa.pct, servicos, cambio, ajustes: e.ajustes },
  };
};

export interface EntradaProposta { faturamento: number; itensPctMeta: number; score: number }

export const fatorDoScore = (score: number, p = POLITICA_PROPOSTA_PARAMS) => [...p.fatorScore].sort((a, b) => b.min - a.min).find(f => score >= f.min)!.fator;

export const calcularProposta = (e: EntradaProposta, p = POLITICA_PROPOSTA_PARAMS): ResultadoCalculo => {
  const faixa = faixaPara(p.faixas, e.faturamento);
  const acel = [...p.acelerador].sort((a, b) => b.minPct - a.minPct).find(a => e.itensPctMeta >= a.minPct)?.pp || 0;
  const fator = fatorDoScore(e.score, p);
  const valor = e.faturamento * ((faixa.pct + acel) / 100) * (1 + fator);
  return {
    valor,
    premissas: [
      'Variável = faturamento × (taxa da faixa + acelerador) × (1 + fator do score)',
      `Taxa da faixa ${faixa.pct}% sobre o faturamento inteiro (decisão aberta: total ou excedente)`,
      `Acelerador +${acel} p.p. (itens a ${Math.round(e.itensPctMeta)}% da meta)`,
      `Fator do score ${fator >= 0 ? '+' : ''}${Math.round(fator * 100)}% (score ${e.score})`,
      'Fixo por nível não incluído',
    ],
    detalhes: { faturamento: e.faturamento, faixaPct: faixa.pct, acelerador: acel, fator },
  };
};

export const politicaLabel = (p: Politica) => p.status === 'vigente' ? 'VIGENTE' : 'PROPOSTA EM TESTE';

// ───────────────────── Ocorrências ─────────────────────

export type AcaoOcorrencia = 'enviar_revisao' | 'contestar' | 'aprovar' | 'rejeitar' | 'aplicar';

export const STATUS_OCORRENCIA_LABEL: Record<StatusOcorrencia, string> = {
  registrada: 'Registrada',
  em_revisao: 'Em revisão',
  contestada: 'Contestada',
  aprovada: 'Aprovada',
  rejeitada: 'Rejeitada',
  aplicada: 'Aplicada',
};

/** Máquina de estados. Nenhuma ocorrência vira efeito sem decisão humana registrada. */
export const transicaoOcorrencia = (o: Ocorrencia, acao: AcaoOcorrencia, ator: Usuario): StatusOcorrencia => {
  const erro = (m: string) => { throw new Error(m); };
  switch (acao) {
    case 'enviar_revisao':
      if (o.status !== 'registrada') erro('Só ocorrências registradas vão para revisão.');
      if (ator.id !== o.registradaPor && ator.role !== 'direcao') erro('Quem envia para revisão é quem registrou.');
      return 'em_revisao';
    case 'contestar':
      if (ator.id !== o.profissionalId) erro('Só o profissional envolvido pode contestar.');
      if (!['em_revisao', 'aprovada'].includes(o.status)) erro('Só é possível contestar antes da aplicação.');
      return 'contestada';
    case 'aprovar':
    case 'rejeitar':
      if (ator.role !== 'direcao') erro('A decisão é da direção.');
      if (!['em_revisao', 'contestada'].includes(o.status)) erro('Ocorrência não está aguardando decisão.');
      return acao === 'aprovar' ? 'aprovada' : 'rejeitada';
    case 'aplicar':
      if (ator.role !== 'direcao') erro('Só a direção aplica o efeito.');
      if (o.status !== 'aprovada') erro('Só ocorrências aprovadas podem ser aplicadas.');
      return 'aplicada';
  }
};

/** Score de execução — PROPOSTA EM TESTE do playbook. Não afeta valores reais. */
export const scoreExecucao = (aplicadas: Ocorrencia[], descontoChecklist: number) => {
  const descontos = aplicadas.filter(o => o.tipo === 'desconto').reduce((s, o) => s + Math.abs(o.efeitoProposto), 0) + descontoChecklist;
  const recup = Math.min(5, aplicadas.filter(o => o.tipo === 'reconhecimento').reduce((s, o) => s + Math.abs(o.efeitoProposto), 0));
  return Math.max(0, Math.min(100, 100 - descontos + recup));
};

/** Desconto automático por checklist (playbook, faixas não somam). */
export const descontoChecklist = (pctCompleto: number | null) => {
  if (pctCompleto == null) return 0;
  if (pctCompleto >= 100) return 0;
  if (pctCompleto >= 80) return 2;
  if (pctCompleto >= 60) return 5;
  return 10;
};

/** Catálogo de categorias do playbook (PROPOSTA EM TESTE). */
export const CATEGORIAS_OCORRENCIA: { categoria: string; tipo: Ocorrencia['tipo']; pontos: number; regra: string }[] = [
  { categoria: 'Carro voltou com problema', tipo: 'desconto', pontos: -3, regra: 'Playbook · Retrabalho/cliente' },
  { categoria: 'Retorno com custo acima de R$ 100', tipo: 'desconto', pontos: -5, regra: 'Playbook · Retrabalho/cliente' },
  { categoria: 'Reincidência no mesmo lugar', tipo: 'desconto', pontos: -8, regra: 'Playbook · Retrabalho/cliente' },
  { categoria: 'Reclamação formal', tipo: 'desconto', pontos: -3, regra: 'Playbook · Retrabalho/cliente' },
  { categoria: 'Oficina suja', tipo: 'desconto', pontos: -3, regra: 'Playbook · Bancada' },
  { categoria: 'Ferramenta fora do lugar', tipo: 'desconto', pontos: -2, regra: 'Playbook · Bancada' },
  { categoria: 'Pegou último insumo e não avisou', tipo: 'desconto', pontos: -2, regra: 'Playbook · Bancada' },
  { categoria: 'Atraso', tipo: 'desconto', pontos: -1, regra: 'Playbook · Conduta' },
  { categoria: 'Trouxe a solução', tipo: 'reconhecimento', pontos: 1, regra: 'Playbook · Recuperação' },
  { categoria: 'Rápido e bem feito em momento de volume', tipo: 'reconhecimento', pontos: 1, regra: 'Playbook · Recuperação' },
  { categoria: 'Ajudou no almoço no pico', tipo: 'reconhecimento', pontos: 1, regra: 'Playbook · Recuperação' },
];
