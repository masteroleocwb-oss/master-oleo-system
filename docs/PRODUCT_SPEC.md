# Especificação do produto — Plataforma de Operação Master Óleo

> Status: **protótipo para avaliação**. Nada aqui está em produção. A Fase B (implementação produtiva) só começa com aprovação explícita da direção (ver `PRODUCTION_MIGRATION_PLAN.md` e `OPEN_DECISIONS.md`).
> Protótipo navegável: `prototype/` (como rodar em `prototype/README.md`).

## 1. Objetivo

Hoje o sistema de O.S. registra a ordem e calcula upsell e comissão. A evolução proposta transforma a O.S. no centro de uma plataforma que também cobre:

1. **Operação**: abrir, distribuir (rodízio), executar e concluir a O.S.
2. **Inspeção técnica**: checklist item a item com estado explícito e foto ligada ao item.
3. **Histórico do veículo**: todas as visitas da mesma placa numa linha do tempo, com as próximas manutenções e a origem de cada regra.
4. **Experiência do cliente**: um relatório por link seguro (token), que mostra só o que é permitido, com validade e revogação.
5. **Performance individual**: o mecânico vê o próprio mês, a meta, a projeção e o que conta para cada indicador.
6. **Liderança e governança**: auditoria de checklist, exceções, ocorrências com contraditório, planos de ação, metas versionadas e simulação de políticas sem trocar a vigente.

Princípios adotados:

- **O que não foi verificado não conta como verificado.** Todo item começa "A verificar" e nada vem pré-marcado.
- **Exceção não é sucesso.** Um checklist liberado por exceção aparece separado do checklist completo.
- **Nenhuma consequência de RH é automática.** Indicadores informam; ocorrências precisam de revisão, manifestação do profissional e decisão da direção.
- **Nenhum histórico é apagado.** Exclusão é lógica, com autor, data e motivo; toda mutação gera um evento.
- **A regra vigente é preservada** até a direção aprovar outra. Propostas do playbook aparecem como "em teste".

## 2. Perfis e o que cada um faz

| Perfil | Usuário de demonstração | Pode | Não pode |
| --- | --- | --- | --- |
| **Mecânico** | André Costa (`u_m1`), Rafael, Diego, Eduardo, Marcos | Ver a operação; assumir a OS **quando for a vez dele** no rodízio (ou o próprio retorno); executar checklist e serviço **só das OS dele**; marcar o próprio almoço; ver o próprio mês e as ocorrências próprias (com manifestação); ver veículos | Abrir OS, ver contato do cliente, ver metas da equipe, políticas, auditoria, admin, ocorrências de outros, gerar link |
| **Vendedor** | Igor Martins (`u_ven`), Juliana Prado | Abrir OS (com busca por placa e rascunho automático); ver contato e valores; gerar link do relatório; tratar recomendações | Executar checklist, auditar, metas, admin |
| **Comercial** | Helena Duarte (`u_com`) | Tratar recomendações (apresentei / avaliar depois / recusou / aceitou com valor); gerar link; ver veículos | Abrir OS, executar, gestão |
| **Liderança da oficina** | Fernanda Alves (`u_lid`) | Tudo da operação; designar fora do rodízio (com motivo); decidir exceção de checklist; auditar; declarar dia de exceção; marcar "não oferecer" (frota); registrar ocorrência e plano de ação; **propor** metas; simular políticas; revogar link | Aprovar meta, aprovar política, decidir/aplicar ocorrência, admin |
| **Direção / ADM** | Gustavo Reis (`u_dir`) | Tudo da liderança + aprovar metas, decidir e aplicar ocorrências, catálogo de inspeção, regras de intervalo, usuários, histórico de alterações, links, correção de placa | Aprovar política como vigente **no protótipo** (desativado de propósito: é decisão de Fase B) |
| **Cliente** | sem conta | Abrir o link do relatório enquanto válido | Qualquer outra tela; ver valores, telefone, observação interna, fotos ocultas |

A matriz completa está em `prototype/src/domain/permissions.ts` e é aplicada **na camada de serviço** (`src/data/api.ts`). Esconder o botão é só conveniência: a ação é recusada mesmo se for chamada diretamente.

Usuário inativo (Paulo Souza, `u_ina`) não entra, não aparece no rodízio e não conta nas métricas.

## 3. Telas

| Ref. | Tela | Rota | Perfis |
| --- | --- | --- | --- |
| A | Entrada / troca de usuário | `#/login` | todos |
| B | Operação do dia (busca, KPIs, sua bancada, fila, rodízio) | `#/operacao` | todos menos cliente |
| C | Nova OS (busca por placa/nome/telefone, cadastro, serviços, flags "não fazer teste", rascunho) | `#/os/nova` | vendedor, liderança, direção |
| D | Checklist técnico (lista / compacto, só pendentes, foto por item, histórico do item) | `#/os/:id/checklist` | executor da OS |
| E | Execução e finalização (serviços, litros, KM, próximas manutenções, observações) | `#/os/:id/execucao` | executor da OS |
| F | Detalhes da OS (resumo, checklist, fotos, relatório, histórico) | `#/os/:id` | todos (conteúdo varia por perfil) |
| G | Relatório do cliente (público) | `#/r/:token` | cliente |
| H | Veículos e histórico (linha do tempo, próximas manutenções, recomendações em aberto, galeria) | `#/veiculos`, `#/veiculos/:id` | todos |
| I | Meu mês (meta, projeção, qualidade, resultado, série, planos, ocorrências) | `#/performance` | mecânico |
| J | Liderança (visão, mecânicos, auditoria, exceções, ocorrências, retornos, planos, gestão) | `#/lideranca/:aba` | liderança, direção |
| K | Metas e políticas (metas versionadas, simulador vigente × proposta) | `#/metas/:aba` | liderança, direção |
| — | Recomendações (comercial) | `#/oportunidades` | vendedor, comercial, liderança, direção |
| — | Admin (busca, catálogo, intervalos, usuários, histórico, links) | `#/admin/:aba` | direção |

Navegação: menu lateral em telas ≥ 960 px e barra inferior no celular. Rota inexistente mostra "Página não encontrada"; rota sem permissão mostra "Acesso não permitido para o seu perfil".

## 4. Fluxo principal da OS

```
Nova OS (vendedor) ─► Aguardando ─► Rodízio: o mecânico da vez assume ─► Em andamento
   │                                   (liderança pode designar outro, com motivo)
   ▼
Checklist técnico ──► cada item: OK | Atenção | Prioritário | Não se aplica | Avaliar depois
   │                  Atenção/Prioritário podem exigir foto (regra do item) e geram recomendação
   │                  "Concluir checklist" só com todos os itens decididos e as fotos exigidas
   │                  ou "Pedir exceção" (motivo) → liderança aprova/nega
   ▼
Execução ─► serviços realizados + KM (não pode ser menor que o último registrado)
   │        próximas manutenções: regra validada → km/data; sem regra → "acompanhar"
   ▼
Concluída ─► histórico do veículo atualizado ─► link do relatório para o cliente
```

### 4.1 Estados do item de checklist

| Estado | Significado | Regra |
| --- | --- | --- |
| A verificar | Ainda não olhado | Estado inicial de todo item. Bloqueia a conclusão |
| OK | Verificado e em ordem | — |
| Atenção | Precisa acompanhar ou trocar em breve | Gera recomendação; foto conforme regra do item |
| Prioritário | Precisa de ação agora | Gera recomendação; foto conforme regra do item |
| Não se aplica | O item não existe neste carro | Exige justificativa |
| Avaliar depois | Não deu para avaliar agora (ex.: motor quente, acesso bloqueado) | Exige observação dizendo o que impediu; conta como decidido, e o cliente vê "Avaliação pendente" |

O catálogo (versão 1) tem 14 itens em 5 grupos (Filtros, Motor, Câmbio, Freios, Demais itens), com a fonte marcada: `playbook_fase1`, `pedido_direcao` (trocador de calor, coxim do câmbio) ou `catalogo_atual`. Itens de câmbio aparecem conforme o tipo do câmbio do veículo. **Os critérios técnicos de cada estado e a exigência de foto são proposta** — ver `OPEN_DECISIONS.md` D-04.

O checklist guarda uma **cópia das definições** no momento da criação. Mudar o catálogo não altera inspeções antigas; o catálogo é versionado.

### 4.2 Flags preservadas do sistema atual

"NÃO FAZER TESTE — SÓ EXECUTAR" (freio e câmbio) aparece em faixa vermelha no checklist e na execução; o item correspondente pede só o aspecto visual.

### 4.3 Correção e auditoria

- A liderança audita checklists concluídos (nunca o próprio). O resultado pode ser aprovado, reprovado ou correção solicitada. **A auditoria nunca altera a inspeção**: ela registra inconsistências e, se for o caso, reabre só os itens apontados para o executor corrigir.
- O mecânico vê o alerta de correção na Operação e no checklist.

### 4.4 Rodízio (preservado e endurecido)

- A vez é de quem iniciou a última OS há mais tempo. Almoço/ausente tira da fila sem mudar a posição.
- O mecânico só assume a OS quando é a vez dele ("Não é a sua vez no rodízio"). A exceção é o retorno: volta para o mesmo mecânico.
- A liderança pode designar fora da ordem com motivo obrigatório. O motivo fica no histórico.

## 5. Histórico do veículo e próxima manutenção

- **Veículo é entidade própria**, com chave interna. A placa é um atributo; a correção de placa guarda as anteriores (`placasAnteriores`) e a busca encontra pela placa antiga.
- A linha do tempo mostra todas as OS da placa, com KM, serviços, status do checklist, mecânico e recomendações prioritárias.
- **Próxima manutenção** só calcula km/data quando existe **regra validada** para o serviço. Cada previsão mostra a origem:

| Origem | Rótulo interno | O que o cliente vê |
| --- | --- | --- |
| `fabricante` | Recomendação do fabricante | Recomendação do fabricante |
| `interna` | Regra interna Master Óleo | Padrão Master Óleo |
| `profissional` | Recomendação do profissional | Recomendação do nosso técnico |
| `estimativa` | Estimativa pelo histórico | Estimativa pelo uso do veículo |
| `nao_confirmada` | Não confirmada — acompanhar | Acompanhar na próxima visita |

- **Os intervalos do protótipo são fictícios** (óleo 10.000 km/12 meses, fluido de freio 24 meses, filtro de ar 15.000 km; câmbio automático sem intervalo validado). Não existe intervalo universal; a tabela real é decisão da direção (D-05).
- Status da previsão: futura, próxima (≤ 1.000 km ou ≤ 30 dias), vencida, acompanhar.

## 6. Relatório do cliente (link seguro)

- Gerado só para OS concluída, com validade de 7, 30 ou 90 dias. O token tem 128 bits e é imprevisível.
- **Projeção restrita**: o relatório contém só número, data, KM, veículo, primeiro nome do cliente, técnico, serviços, itens (estado + recomendação), fotos marcadas como visíveis ao cliente, observação ao cliente e próximas manutenções.
- **Não contém**: telefone, valores, observação interna, nome completo, fotos ocultas, dados de outras OS.
- Link revogado, expirado ou inválido mostra a mesma mensagem ("Este link não está disponível"), sem revelar o motivo nem se existiu.
- Toda foto aparece para o cliente por padrão; liderança e direção podem ocultar uma foto na aba Fotos da OS, e ela sai do relatório na hora.
- Cada abertura conta um acesso. A tela interna mostra o estado do link, os acessos e a pré-visualização do que o cliente vê.
- Compartilhar: copiar, WhatsApp (abre a conversa com o texto, sem envio automático), abrir.

## 7. Comercial — recomendações

Cada item Atenção/Prioritário com recomendação vira uma **oportunidade** ligada ao item e às fotos. A situação pode ser: nova → apresentada → aceita (com valor) / recusada / avaliar depois. Em OS marcada "não oferecer" (frota/locação), a oportunidade nasce como `nao_oferecer` e fica fora da conversão.

Um serviço aceito e executado vira serviço com origem `checklist`. A conversão mede `itens realizados ÷ itens identificados`.

## 8. Performance individual

Indicadores do mecânico no mês (cada um tem "?" com fórmula e por que importa — `src/data/metricas.ts`):

| Grupo | Indicador | Fórmula |
| --- | --- | --- |
| Volume | Carros atendidos | OS concluídas pelo mecânico no mês |
| Qualidade | Checklist completo % | completos ÷ carros elegíveis (fora dias de exceção e "não oferecer"); exceção conta à parte |
| Qualidade | Evidências % | itens com foto obrigatória que têm foto ÷ itens com foto obrigatória |
| Resultado | Itens identificados / realizados / conversão | recomendações geradas; serviços de origem checklist executados |
| Resultado | Faturamento, upsell | soma das OS concluídas; upsell = serviços que não eram de balcão |
| Qualidade | Retornos | OS de retorno atribuídas ao mecânico |
| Tempo | Tempo médio de serviço e de checklist | início → conclusão |
| Score | Score de execução | 100 − desconto do checklist − ocorrências aplicadas (proposta do playbook) |
| Meta | Progresso, projeção, ritmo necessário | sobre a versão da meta vigente no mês |

Meses anteriores vêm de **fechamentos mensais imutáveis**; o mês atual é calculado ao vivo.

## 9. Liderança e governança

- **Visão**: aguardando, em andamento, concluídas e faturamento do dia; pendências de exceção, correção, ocorrência e meta.
- **Indicadores da própria liderança**: % de checklists auditados (referência proposta de 10%), tempo de decisão de exceção, correções abertas, planos vencidos, metas não comunicadas, ocorrências paradas.
- **Exceções**: pedidos de exceção, dia de exceção (o dia sai da base do checklist % com motivo registrado) e lista de "não oferecer".
- **Ocorrências** (desconto ou reconhecimento): registrada → em revisão → (manifestação/contestação do profissional) → aprovada/rejeitada pela direção → aplicada. Cada passo exige texto e fica no histórico. Ninguém registra ocorrência para si mesmo. **Nenhum efeito salarial é automático**: "aplicada" significa que a direção confirmou o registro.
- **Planos de ação**: assunto, combinados, prazo, conclusão.
- **Metas**: nome, indicador, unidade, regra de cálculo, elegibilidade, escopo (individual/coletiva), responsável. Cada mudança cria uma **nova versão** (rascunho → aprovada pela direção). A versão anterior é encerrada no dia anterior à nova vigência e continua visível. A liderança marca quando a meta foi comunicada à equipe.
- **Políticas**: a política vigente (comissão por upsell do sistema atual) e a proposta do playbook (faturamento da bancada) lado a lado, com simulador por mecânico/mês e cenários. A aprovação como vigente está desativada no protótipo.

## 10. Classificação das regras de negócio

| Regra | Classificação | Onde está no protótipo |
| --- | --- | --- |
| Numeração transacional da OS | **Vigente** (preservada) | `abrirOS` |
| Rodízio (vez por início mais antigo; almoço não muda posição; retorno ao mesmo mecânico) | **Vigente** (preservada) | `filaRodizio`, `iniciarOS` |
| "Não fazer teste — só executar" (freio/câmbio) | **Vigente** | Nova OS, checklist, execução |
| 16 serviços e seus campos técnicos | **Vigente** | `SERVICOS` |
| Balcão não conta como upsell | **Vigente** | origem `balcao` × `checklist` |
| Comissão por upsell (faixas 0/3/5/7%, teto de câmbio R$ 50, fator de ajuste) | **Vigente** — mostrada e simulada, não alterada | Políticas › vigente |
| OS encerrada fora de listas e totais | **Vigente** | status `encerrada` |
| Checklist item a item sem pré-preenchimento | **Em teste** (novo) | checklist |
| Foto obrigatória por estado do item | **Em teste** — critérios a validar (D-04) | catálogo |
| Exceção de checklist separada do completo | **Em teste** | métricas |
| Dia de exceção; "não oferecer" para frota | **Em teste** (playbook operacional) | liderança |
| Remuneração por faturamento da bancada: faixas 55k 0,5% · 80k 0,75% · 100k 1,0% · 130k 1,2% · 150k 1,4%; acelerador 120% → +0,25 p.p., 150% → +0,40 p.p.; fator do score 95+ +10% / 90–94 0 / 80–89 −10% / < 80 −20% | **Em teste** — o próprio playbook diz "proposta de backtest, não política final" | Políticas › proposta |
| Descontos de score do checklist (0 / 2 / 5 / 10) | **Em teste** | `descontoChecklist` |
| Referência de 10% de auditoria | **Em teste** (proposta deste protótipo) | indicadores da liderança |
| "Comissão por upsell acabou" | **Não aprovado** — conflita com a regra vigente (D-07) | não aplicado |
| Meta "X%" de itens | **Não aprovado** — valor não definido (D-08) | meta configurável sem valor imposto |
| Intervalos de manutenção | **Não aprovado** — nenhum documento traz intervalos; os do protótipo são fictícios (D-05) | regras de intervalo |
| Exibir valores no relatório do cliente | **Não aprovado** — oculto por padrão (D-10) | projeção do relatório |

## 11. Requisitos não funcionais atendidos no protótipo

- **Isolamento**: sem SDK Firebase, sem chave, sem chamadas externas (verificado por script e pelo teste E2E de rede).
- **Celular primeiro**: checklist utilizável em 390 px sem rolagem horizontal; botões principais e campos com altura mínima de toque (botões secundários "sm" têm 36 px); modo compacto; câmera traseira (`capture="environment"`) e compressão da foto para 960 px.
- **Falhas visíveis**: cada item mostra "Salvando… / Salvo / Falhou — tentar de novo". Os controles da demo simulam falha, modo offline e latência.
- **Rascunho**: a Nova OS salva rascunho local e oferece recuperar após recarregar.
- **Trilha**: todo comando gera evento com autor, data, antes/depois e motivo (Admin › Histórico).
- **Acessibilidade básica**: rótulos em campos, foco visível, estado sempre escrito em texto além da cor. Contraste e leitor de tela **não foram auditados formalmente** (pendência para a Fase B).

## 12. Fora do escopo do protótipo

Login real (o protótipo usa troca de usuário), envio automático de WhatsApp, integração com o Tiny ERP, armazenamento real de fotos, cálculo de folha, impressão de etiqueta, multiloja.
