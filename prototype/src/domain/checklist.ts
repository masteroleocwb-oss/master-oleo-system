// Regras do checklist técnico. Funções puras, testadas em checklist.test.ts.
import { ESTADOS } from './catalogo';
import type { Checklist, EstadoItem, Evidencia, ItemInspecaoDef, ItemRegistro, OrdemServico, Veiculo } from './types';

export const defsAplicaveis = (catalogo: ItemInspecaoDef[], v: Pick<Veiculo, 'cambio'>) =>
  catalogo.filter(d => d.ativo && (!d.aplicavelA?.cambio || d.aplicavelA.cambio === v.cambio));

export const novoChecklist = (id: string, os: OrdemServico, v: Veiculo, catalogo: ItemInspecaoDef[]): Checklist => {
  const defs = defsAplicaveis(catalogo, v).map(d => ({ ...d }));
  // Todo item começa "A verificar": nada é preenchido sem ação real do mecânico.
  const itens: Record<string, ItemRegistro> = {};
  defs.forEach(d => { itens[d.id] = { defId: d.id, estado: 'nao_verificado', evidenciaIds: [], historico: [] }; });
  return { id, osId: os.id, veiculoId: v.id, status: 'nao_iniciado', defs, itens };
};

export interface DadosItem {
  observacao?: string;
  justificativa?: string;
  recomendacao?: string;
}

export interface Pendencia { defId: string; nome: string; motivo: string }

/** Erros que impedem salvar o item com o estado escolhido. */
export const validarItem = (def: ItemInspecaoDef, estado: EstadoItem, dados: DadosItem, fotosAtivas: number): string[] => {
  const erros: string[] = [];
  if (estado === 'nao_verificado') erros.push('Escolha a condição do item.');
  if (!def.estadosPermitidos.includes(estado)) erros.push('Condição não permitida para este item.');
  if (estado === 'nao_aplicavel' && !dados.justificativa?.trim()) erros.push('Diga por que não se aplica.');
  if (estado === 'pendente_avaliacao' && !dados.observacao?.trim()) erros.push('Diga o que impediu a avaliação.');
  if (def.fotoObrigatoriaEm.includes(estado) && fotosAtivas === 0) erros.push(`Foto obrigatória para "${ESTADOS[estado].curto}".`);
  return erros;
};

export const fotosAtivasDoItem = (reg: ItemRegistro, evidencias: Evidencia[]) =>
  reg.evidenciaIds.filter(id => evidencias.some(e => e.id === id && !e.removida)).length;

export const registrarItem = (
  c: Checklist, defId: string, estado: EstadoItem, dados: DadosItem, por: string, em: string, motivoAlteracao?: string,
): Checklist => {
  const reg = c.itens[defId];
  if (!reg) throw new Error('Item não pertence a este checklist.');
  const novo: ItemRegistro = {
    ...reg,
    estado,
    observacao: dados.observacao?.trim() || undefined,
    justificativa: estado === 'nao_aplicavel' ? dados.justificativa?.trim() : undefined,
    recomendacao: (estado === 'atencao' || estado === 'prioritario') ? (dados.recomendacao?.trim() || undefined) : undefined,
    registradoPor: por,
    registradoEm: em,
    // Histórico só cresce: alterações posteriores não apagam o registro anterior.
    historico: [...reg.historico, { estado, observacao: dados.observacao?.trim() || undefined, por, em, motivo: motivoAlteracao }],
  };
  return {
    ...c,
    status: c.status === 'nao_iniciado' ? 'em_andamento' : c.status,
    iniciadoPor: c.iniciadoPor || por,
    iniciadoEm: c.iniciadoEm || em,
    itens: { ...c.itens, [defId]: novo },
  };
};

export interface Progresso {
  total: number;
  verificados: number;
  pendentes: number;
  comRecomendacao: number;
  comFoto: number;
  pct: number;
}

export const progresso = (c: Checklist, evidencias: Evidencia[]): Progresso => {
  const regs = c.defs.map(d => c.itens[d.id]);
  const verificados = regs.filter(r => r.estado !== 'nao_verificado').length;
  return {
    total: regs.length,
    verificados,
    pendentes: regs.length - verificados,
    comRecomendacao: regs.filter(r => r.estado === 'atencao' || r.estado === 'prioritario').length,
    comFoto: regs.filter(r => fotosAtivasDoItem(r, evidencias) > 0).length,
    pct: regs.length ? Math.round((verificados / regs.length) * 100) : 0,
  };
};

/** Lista exata do que falta para concluir. Vazia = pode concluir. */
export const pendenciasParaConcluir = (c: Checklist, evidencias: Evidencia[]): Pendencia[] => {
  const out: Pendencia[] = [];
  for (const d of c.defs) {
    const r = c.itens[d.id];
    if (r.estado === 'nao_verificado') { out.push({ defId: d.id, nome: d.nome, motivo: 'Não verificado' }); continue; }
    const erros = validarItem(d, r.estado, r, fotosAtivasDoItem(r, evidencias));
    erros.forEach(m => out.push({ defId: d.id, nome: d.nome, motivo: m }));
  }
  return out;
};

export const STATUS_CHECKLIST_LABEL: Record<Checklist['status'], string> = {
  nao_iniciado: 'Não iniciado',
  em_andamento: 'Em andamento',
  concluido: 'Completo',
  excecao_autorizada: 'Exceção autorizada',
};

/** Checklist conta como "completo" para indicadores só quando concluído sem exceção. */
export const checklistCompleto = (c?: Checklist) => c?.status === 'concluido';
