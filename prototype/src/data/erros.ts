export class ErroSalvamento extends Error {
  constructor(msg = 'Não foi possível salvar. Verifique a conexão e tente de novo.') { super(msg); this.name = 'ErroSalvamento'; }
}
