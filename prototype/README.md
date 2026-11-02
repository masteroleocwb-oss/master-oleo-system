# Protótipo — Plataforma de Operação Master Óleo

Protótipo navegável da evolução do sistema de O.S.: operação, checklist técnico com fotos, histórico do veículo, relatório do cliente por link, performance individual e governança da liderança.

> **Ambiente de demonstração.** Todos os nomes, placas, telefones, valores e imagens são fictícios. O protótipo **não se conecta à base de produção**: não tem SDK do Firebase nem chave de projeto, e os dados ficam no `localStorage` do navegador. Nada daqui altera o sistema em uso na oficina.

Documentação em [`../docs/`](../docs):

- [PRODUCT_SPEC](../docs/PRODUCT_SPEC.md) — o que o produto faz;
- [PROTOTYPE_TEST_PLAN](../docs/PROTOTYPE_TEST_PLAN.md) — testes e roteiro por perfil;
- [DATA_MODEL_PROPOSAL](../docs/DATA_MODEL_PROPOSAL.md) — proposta de modelo de dados;
- [PRODUCTION_MIGRATION_PLAN](../docs/PRODUCTION_MIGRATION_PLAN.md) — plano de migração;
- [OPEN_DECISIONS](../docs/OPEN_DECISIONS.md) — decisões em aberto;
- [CURRENT_SYSTEM_AUDIT](../docs/CURRENT_SYSTEM_AUDIT.md) — auditoria do sistema atual.

## Como rodar

Requisitos: Node 20 ou mais novo. Para o teste E2E, também o Google Chrome.

```bash
cd prototype
npm install
npm run dev
```

Abra http://127.0.0.1:5180. Para testar no celular pela rede local: `npm run dev -- --host` e abra o endereço mostrado no terminal.

| Comando | O que faz |
| --- | --- |
| `npm run dev` | Servidor de desenvolvimento (porta 5180) |
| `npm run build` | Checagem de tipos + build em `dist/` |
| `npm run preview` | Serve o build (porta 5181) |
| `npm test` | Testes unitários (31) |
| `npm run test:e2e` | Fluxos completos no Chrome (17 cenários); capturas em `e2e/out/` |
| `npm run check:isolamento` | Falha se encontrar referência a Firebase/Google/credenciais |

Caminho do Chrome diferente do padrão do macOS: `CHROME_PATH=/caminho/do/chrome npm run test:e2e`.

## Usuários de demonstração

O perfil Comercial fica para o futuro e não aparece na demonstração.

A tela inicial tem o **login com usuário e senha** e, abaixo, os cartões das contas de demonstração (um toque entra, sem senha), enquanto a direção não desligar em Admin › Acessos.

Para testar o login: entre como **Gustavo Reis** → Administração › Usuários → **Novo usuário** (ou **Criar acesso** numa pessoa) → anote a senha provisória → **Sair** → entre com o login e a provisória → crie a sua senha → veja **Minha conta** (clique no nome) e Admin › Acessos. Tudo fica só neste navegador; o login real do time é Fase B (D-03).

| Usuário | Perfil | Para demonstrar |
| --- | --- | --- |
| André Costa | Mecânico (N3) | Fila com mecânico previsto, assumir (ou fora da vez com motivo), checklist, fotos, adicionais, pausar, finalizar, Meu mês |
| Rafael Moura | Mecânico | Atender o retorno reservado a ele (fotos antes/depois, solução, aviso ao cliente) |
| Eduardo Pires | Mecânico | Tem uma OS pausada aguardando peça; retomar |
| Diego Ramos, Marcos Lima | Mecânicos | Rodízio e comparação na liderança |
| Paulo Souza | Mecânico **inativo** | Não consegue entrar |
| Igor Martins, Juliana Prado | Vendedor | Nova OS, busca por placa, gerar link |
| Fernanda Alves | Liderança | Auditoria, exceções, ocorrências, propor metas, simular políticas, designar fora da vez |
| Gustavo Reis | Direção / ADM | Aprovar metas, decidir ocorrências, catálogo, intervalos, usuários, histórico, links |

Links do cliente prontos:

| Link | Estado |
| --- | --- |
| `#/r/Dm0Ativo7xQ2pL9vR4tY1w` | Ativo (OS de hoje) |
| `#/r/Dm0Histo4aZ6sX8dC2fV5g` | Ativo (veículo com várias visitas) |
| `#/r/Dm0Revog3kP8sN2bV6cX0z` | Revogado |
| `#/r/Dm0Expir5mQ1wE7rT3yU9i` | Expirado |

## Roteiro rápido de demonstração (10 minutos)

1. **Igor (vendedor)** → Nova OS → busque `EXM` → escolha um carro → marque óleo + filtro → salve. A OS entra na fila.
2. **Operação**: o cartão do rodízio mostra de quem é a vez. Entre com esse mecânico → **Assumir esta OS**.
3. **Checklist**: marque OK nos itens. Em "Pastilhas de freio", escolha **Prioritário**. Sem foto não salva → **Usar foto demonstrativa** → escreva a recomendação. Tente concluir antes do fim e veja a lista do que falta.
4. **Execução**: marque os serviços, informe o KM e veja as próximas manutenções (com regra → km/data; sem regra → "acompanhar") → **Finalizar OS**.
5. **Igor** → abra a OS → **Relatório do cliente** → gere o link → **Abrir**. É isso que o cliente vê (sem valores nem telefone).
6. **Veículos** → abra a placa: linha do tempo com as visitas, fotos e próximas manutenções.
7. **André → Meu mês**: meta, projeção e o "?" de cada indicador.
8. **Fernanda (liderança)** → Liderança: audite um checklist, registre uma ocorrência e crie uma meta. Em Metas › Políticas, simule vigente × proposta.
9. **Gustavo (direção)** → aprove a meta e a ocorrência → Admin › Histórico mostra quem fez o quê.

## Controles da demo

O botão **Controles da demo** (faixa amarela no topo) permite:

- **Falhar o próximo salvamento**: mostra o erro e o "tentar de novo".
- **Modo offline**: todo salvamento falha.
- **Latência**: simula rede lenta.
- **Restaurar dados da demo**: recria a base fictícia e descarta tudo o que foi feito neste navegador.

## Estrutura

```
src/
  domain/   regras puras (tipos, permissões, catálogo, checklist, manutenção, metas/políticas) + testes
  data/     base fictícia (seed), store local com transação, camada de serviço (api.ts) + testes, métricas
  ui/       componentes, estilos, captura de foto
  screens/  telas (Operação, Nova OS, Checklist, Execução, Detalhes, Relatório público, Veículos,
            Meu mês, Recomendações, Liderança, Metas, Admin)
  app/      rotas e sessão
e2e/        teste ponta a ponta (puppeteer-core + Chrome do sistema)
scripts/    checagem de isolamento
```

Toda ação passa por `src/data/api.ts`, que confere a permissão do perfil, valida a regra, grava numa transação (tudo ou nada) e registra um evento de auditoria. Esconder botões é só conveniência: a ação é recusada mesmo se chamada diretamente.
