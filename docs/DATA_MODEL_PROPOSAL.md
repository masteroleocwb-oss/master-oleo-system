# Proposta de modelo de dados

> Base: o modelo do protótipo (`prototype/src/domain/types.ts`), pensado para o Firestore em produção. **Proposta**: nada foi criado na base real.

## 1. Princípios

1. **Entidades separadas e ligadas por id interno.** Hoje a OS é o único registro e o "veículo" é uma busca por texto da placa. Na proposta, cliente, veículo, OS, checklist, evidência e oportunidade são documentos próprios.
2. **A placa não é chave.** O veículo tem id próprio; a placa é atributo normalizado (`ABC1D23`), e as placas anteriores ficam guardadas.
3. **Nada se apaga.** Cancelamento, remoção de foto e desativação de usuário são lógicos, com autor, data e motivo.
4. **Autoria em tudo.** Todo documento tem `criadaPor`/`registradoPor` com o **uid do login** (não texto livre como os 22 nomes de lubrificador de hoje).
5. **Trilha de eventos.** Toda mutação gera um `Evento` com antes/depois e motivo.
6. **Versão em vez de sobrescrita** para o que muda regra: catálogo de inspeção, metas, políticas e regras de intervalo.
7. **Fechamento mensal imutável.** Os indicadores do mês fechado são gravados com a versão da política usada e não são recalculados.
8. **O legado não é migrado.** As 4.219 OS atuais continuam em `orders`. A ligação com o novo modelo é feita por placa normalizada, criando `veiculos` a partir das OS sem alterar as OS.

## 2. Coleções

| Coleção | Documento | Chave | Observações |
| --- | --- | --- | --- |
| `usuarios` | `Usuario` | uid do Firebase Auth | `role`, `ativo`, `nivel`. Desativar ≠ apagar |
| `clientes` | `Cliente` | auto | `tipo: particular \| frota`. Telefone só para perfis com `cliente.ver_contato` |
| `veiculos` | `Veiculo` | auto | `placa` normalizada + `placasAnteriores[]`, `kmAtual` com data, `cambio`, `motor` |
| `ordens` | `OrdemServico` | auto; `numero` pela transação em `config/contadores` | `status` com `encerrada` e `cancelada` (nunca apagada); `servicos[].origem: balcao \| checklist`; flags "não fazer teste"; `retornoDeOsId` |
| `checklists` | `Checklist` | auto, 1 por OS | **cópia das definições** (`defs`) do momento da criação; `itens[defId]` com `historico[]`; exceção e correção dentro do documento |
| `evidencias` | `Evidencia` | auto | metadados; o arquivo fica no Storage em `evidencias/{osId}/{id}.jpg`; `itemDefId` liga a foto ao item; `visivelCliente`; `removida{}` |
| `oportunidades` | `Oportunidade` | auto | nasce do item Atenção/Prioritário; `situacao` + `historico[]` |
| `catalogoInspecao` | `ItemInspecaoDef` | id estável do item | `versao` incrementa a cada alteração; inativar em vez de apagar |
| `regrasIntervalo` | `RegraIntervalo` | auto | `origem`, `fonte`, `validada`, `validadaPor`; só regra validada calcula km/data |
| `manutencoesPrevistas` | `ManutencaoPrevista` | auto | ligada ao veículo e à OS de origem; `concluidaPorOsId` quando atendida |
| `compartilhamentos` | `Compartilhamento` | auto; **`token` com 128 bits**, indexado | `expiraEm`, `revogadoEm/Por/motivo`, `acessos` |
| `metas` | `Meta` | auto | `versoes[]` (rascunho → aprovada → encerrada); `comunicadaEm` |
| `politicas` | `Politica` | auto | `status: vigente \| proposta_em_teste`; parâmetros versionados |
| `ocorrencias` | `Ocorrencia` | auto | máquina de estados + `historico[]`; `manifestacao` do profissional |
| `auditorias` | `Auditoria` | auto | nunca altera o checklist; só aponta inconsistências |
| `planosAcao` | `PlanoAcao` | auto | — |
| `diasExcecao` | `DiaExcecao` | data `AAAA-MM-DD` | motivo e quem declarou |
| `fechamentos` | `FechamentoMensal` | `{AAAA-MM}_{uid}` | imutável; guarda `politicaVersao` |
| `eventos` | `Evento` | auto | só inserção (append-only) |
| `config` | `contadores`, `rodizio/{dia}` | — | o rodízio sai do `config/global` para um documento por dia (menos disparos de atualização em todos os aparelhos) |

Os tipos completos, campo a campo, estão em `prototype/src/domain/types.ts`.

## 3. Relacionamentos

```
Cliente 1─N Veiculo 1─N OrdemServico 1─1 Checklist 1─N ItemRegistro (embutido)
                                │               └── N Evidencia (por itemDefId)
                                ├── N Oportunidade (por item com recomendação)
                                ├── N ManutencaoPrevista ──► RegraIntervalo (se validada)
                                ├── N Compartilhamento (token)
                                └── 0..1 retornoDeOsId ──► OrdemServico
Usuario 1─N Meta (escopo individual) · Ocorrencia · PlanoAcao · FechamentoMensal
Toda mutação ──► Evento
```

## 4. Histórico e autoria

| Situação | Como fica registrado |
| --- | --- |
| Mecânico muda o estado de um item | Novo registro em `itens[defId].historico[]` (estado, observação, por, em, motivo) + evento |
| Foto removida | `removida{por, em, motivo}`; o arquivo continua no Storage |
| OS cancelada | `status: cancelada` + `canceladaMotivo` + evento; continua no histórico do veículo |
| Placa corrigida | `placasAnteriores.push({placa, ate, motivo})` + evento com antes/depois |
| Catálogo alterado | `versao + 1`; checklists antigos guardam a própria cópia |
| Meta ajustada | nova entrada em `versoes[]`; a anterior é encerrada na véspera da nova vigência |
| Ocorrência | cada transição em `historico[]` com texto obrigatório |
| Liderança designa fora do rodízio | evento `os.iniciada` com `motivo` |

## 5. Regras de segurança (rascunho para a Fase B)

A matriz de capacidades do protótipo (`permissions.ts`) vira:

1. **Firestore Security Rules** para leitura e para escritas simples, com `request.auth.uid` e o `role` vindo de *custom claims*.
2. **Cloud Functions** para operações que precisam de transação ou de regra de negócio:
   - abrir OS (numeração);
   - iniciar OS (rodízio);
   - concluir checklist (pendências e fotos);
   - finalizar OS (KM);
   - gerar e revogar link;
   - servir o relatório público (projeção);
   - decidir ocorrência;
   - aprovar meta;
   - fechar o mês.

Exemplos de regra:

```
match /checklists/{id} {
  allow read: if signedIn();
  // escrita só pela função, que valida executor, estado e fotos
  allow write: if false;
}
match /eventos/{id} {
  allow read: if hasRole(['lider', 'direcao']);
  allow create, update, delete: if false; // só funções gravam
}
match /compartilhamentos/{id} {
  allow read: if hasRole(['vendedor', 'comercial', 'lider', 'direcao']);
  allow write: if false;
}
// Relatório público: nenhuma regra de leitura anônima.
// A função HTTPS recebe o token, confere validade/revogação e devolve só a projeção.
```

Storage: `evidencias/{osId}/{arquivo}` legível por usuários logados. O relatório público usa URL assinada de curta duração, gerada pela função, e só para fotos com `visivelCliente = true`.

## 6. Índices previstos

- `veiculos`: `placa`; `placasAnteriores.placa` (campo auxiliar `placasBusca[]` com `array-contains`).
- `ordens`: `veiculoId + abertaEm desc`; `status + abertaEm`; `mecanicoId + concluidaEm`.
- `compartilhamentos`: `token` (único); `osId`.
- `oportunidades`: `situacao + criadaEm`.
- `eventos`: `entidadeId + em desc`; `por + em desc`.

## 7. Convivência com o legado

| Legado (`orders`) | Novo |
| --- | --- |
| `placa` em texto | `veiculos` criados por leitura das OS (script **somente leitura** sobre `orders`, gravando só em `veiculos`), com `legadoOrderIds[]` |
| `lubrificador` em texto (22 grafias) | mapeado para `uid` numa tabela de-para revisada pela direção, sem reescrever as OS |
| números duplicados | permanecem; a tela mostra "#1234 (duplicado)" e usa o id do documento (D-13) |
| inspeção de vazamento pré-marcada | exibida como "registro antigo, sem checklist" — não conta como verificado |
| fotos base64 dentro da OS | permanecem; novas fotos vão para o Storage |

## 8. Estimativa de volume

A base atual tem cerca de 12 OS por dia (4.219 OS de 10/11/2025 a 26/10/2026). Com até 15 OS/dia e 14 itens por checklist, o documento de checklist fica abaixo de 15 KB, porque as fotos ficam fora dele. As fotos comprimidas para 960 px têm entre 80 e 150 KB: em torno de 4 fotos por OS × 15 OS × 26 dias ≈ 150–230 MB/mês no Storage. Os números de volume são estimativa e devem ser confirmados no piloto.
