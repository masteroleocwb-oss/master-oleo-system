// Permissões mínimas por perfil. No produto final, as mesmas regras vão para as
// Security Rules do Firestore/Storage e para as funções de servidor — aqui são
// aplicadas na camada de serviço (src/data/api.ts), nunca só escondendo botões.
import type { Role, Usuario } from './types';

export type Capacidade =
  | 'operacao.ver'
  | 'os.abrir'
  | 'os.iniciar'
  | 'os.executar'          // checklist + execução (só o executor)
  | 'os.cancelar'
  | 'os.ver_valores'
  | 'cliente.ver_contato'
  | 'checklist.autorizar_excecao'
  | 'checklist.auditar'
  | 'excecao.declarar'
  | 'relatorio.gerar_link'
  | 'relatorio.revogar'
  | 'oportunidade.ver'
  | 'oportunidade.tratar'
  | 'performance.propria'
  | 'performance.time'
  | 'metas.ver'
  | 'metas.propor'
  | 'metas.aprovar'
  | 'politicas.simular'
  | 'politicas.aprovar'
  | 'ocorrencia.registrar'
  | 'ocorrencia.decidir'
  | 'ocorrencia.aplicar'
  | 'plano_acao.registrar'
  | 'rodizio.almoco_proprio'
  | 'rodizio.gerenciar'
  | 'admin.usuarios'
  | 'admin.catalogo'
  | 'admin.historico'
  | 'admin.compartilhamentos'
  | 'veiculo.ver'
  | 'veiculo.corrigir_cadastro';

const MATRIZ: Record<Role, Capacidade[]> = {
  mecanico: [
    'operacao.ver', 'os.iniciar', 'os.executar', 'performance.propria', 'rodizio.almoco_proprio', 'veiculo.ver', 'oportunidade.ver',
  ],
  vendedor: [
    'operacao.ver', 'os.abrir', 'cliente.ver_contato', 'relatorio.gerar_link', 'oportunidade.ver', 'oportunidade.tratar', 'veiculo.ver', 'os.ver_valores',
  ],
  comercial: [
    'operacao.ver', 'cliente.ver_contato', 'relatorio.gerar_link', 'oportunidade.ver', 'oportunidade.tratar', 'veiculo.ver', 'os.ver_valores',
  ],
  lider: [
    'operacao.ver', 'os.abrir', 'os.iniciar', 'os.cancelar', 'os.ver_valores', 'cliente.ver_contato',
    'checklist.autorizar_excecao', 'checklist.auditar', 'excecao.declarar',
    'relatorio.gerar_link', 'relatorio.revogar', 'oportunidade.ver', 'oportunidade.tratar',
    'performance.time', 'metas.ver', 'metas.propor', 'politicas.simular',
    'ocorrencia.registrar', 'plano_acao.registrar', 'rodizio.gerenciar', 'veiculo.ver',
  ],
  direcao: [
    'operacao.ver', 'os.abrir', 'os.cancelar', 'os.ver_valores', 'cliente.ver_contato',
    'checklist.autorizar_excecao', 'checklist.auditar', 'excecao.declarar',
    'relatorio.gerar_link', 'relatorio.revogar', 'oportunidade.ver', 'oportunidade.tratar',
    'performance.time', 'metas.ver', 'metas.propor', 'metas.aprovar', 'politicas.simular', 'politicas.aprovar',
    'ocorrencia.registrar', 'ocorrencia.decidir', 'ocorrencia.aplicar', 'plano_acao.registrar', 'rodizio.gerenciar',
    'admin.usuarios', 'admin.catalogo', 'admin.historico', 'admin.compartilhamentos', 'veiculo.ver', 'veiculo.corrigir_cadastro',
  ],
};

export const ROLE_LABEL: Record<Role, string> = {
  mecanico: 'Mecânico',
  vendedor: 'Vendedor',
  comercial: 'Comercial',
  lider: 'Liderança da oficina',
  direcao: 'Direção / ADM',
};

export const pode = (u: Usuario | null | undefined, c: Capacidade) => !!u && u.ativo && MATRIZ[u.role].includes(c);

export class ErroPermissao extends Error {
  constructor(public capacidade: Capacidade, msg?: string) {
    super(msg || 'Seu perfil não tem permissão para esta ação.');
    this.name = 'ErroPermissao';
  }
}

export const exigir = (u: Usuario | null | undefined, c: Capacidade, msg?: string) => {
  if (!pode(u, c)) throw new ErroPermissao(c, msg);
};

export const capacidadesDe = (r: Role) => MATRIZ[r];
