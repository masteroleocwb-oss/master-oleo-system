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
| **Mecânico** | André Costa (`u_m1`), Rafael, Diego, Eduardo, Marcos | Ver a operação e a fila numerada com o mecânico previsto; assumir a OS prevista para ele, ou **fora da vez informando o motivo** (o previsto pode estar indisponível); pausar a própria OS com motivo e retomar; lançar adicionais vendidos na bancada; executar checklist e serviço **só das OS dele**; marcar o próprio almoço; ver o próprio mês e as ocorrências próprias (com manifestação); ver veículos | Abrir OS, ver contato do cliente, ver metas da equipe, políticas, auditoria, admin, ocorrências de outros, gerar link |
| **Vendedor** | Igor Martins (`u_ven`), Juliana Prado | Abrir OS (com busca por placa e rascunho automático); ver contato e valores; gerar link do relatório; tratar recomendações | Executar checklist, auditar, metas, admin |
| **Liderança da oficina** | Fernanda Alves (`u_lid`) | Tudo da operação; designar fora do rodízio (com motivo); decidir exceção de checklist; auditar; declarar dia de exceção; marcar "não oferecer" (frota); registrar ocorrência e plano de ação; **propor** metas; simular políticas; revogar link | Aprovar meta, aprovar política, decidir/aplicar ocorrência, admin |
| **Direção / ADM** | Gustavo Reis (`u_dir`) | Tudo da liderança + aprovar metas, decidir e aplicar ocorrências, catálogo de inspeção, regras de intervalo, usuários, histórico de alterações, links, correção de placa | Aprovar política como vigente **no protótipo** (desativado de propósito: é decisão de Fase B) |
| **Cliente** | sem conta | Abrir o link do relatório enquanto válido | Qualquer outra tela; ver valores, telefone, observação interna, fotos ocultas |

O perfil **Comercial** fica para o futuro (decisão de 27/10/2026): continua na matriz de permissões, mas não tem usuário de demonstração nem aparece no cadastro de usuários. Hoje o vendedor trata as recomendações.

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
Nova OS (vendedor) ─► Aguardando (fila numerada, mecânico previsto) ─► Em andamento ⇄ Pausada
   │                  previsto assume; outro assume fora da vez com motivo; liderança designa
   ▼
Checklist técnico ──► cada item: OK | Atenção | Prioritário | Não se aplica | Avaliar depois
   │                  Atenção/Prioritário podem exigir foto (regra do item) e geram recomendação
   │                  "Concluir checklist" só com todos os itens decididos e as fotos exigidas
   │                  ou "Pedir exceção" (motivo) → liderança aprova/nega
   ▼
Execução ─► serviços realizados + adicionais vendidos + KM (não pode ser menor que o último)
   │        óleo: o mecânico escolhe 5, 7 ou 10 mil km; vale o que vier primeiro com 6 meses
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

O catálogo (versão 1) tem 14 itens em 5 grupos (sem "vazamento no motor", que a oficina não faz) (Filtros, Motor, Câmbio, Freios, Demais itens), com a fonte marcada: `playbook_fase1`, `pedido_direcao` (trocador de calor, coxim do câmbio) ou `catalogo_atual`. Itens de câmbio aparecem conforme o tipo do câmbio do veículo: um carro manual vê 12 itens, um automático vê 13. **Os critérios técnicos de cada estado e a exigência de foto são proposta** — ver `OPEN_DECISIONS.md` D-04.

O checklist guarda uma **cópia das definições** no momento da criação. Mudar o catálogo não altera inspeções antigas; o catálogo é versionado.

### 4.2 Flags preservadas do sistema atual

"NÃO FAZER TESTE — SÓ EXECUTAR" (freio e câmbio) aparece em faixa vermelha no checklist e na execução; o item correspondente pede só o aspecto visual.

### 4.3 Correção e auditoria

- A liderança audita checklists concluídos (nunca o próprio). O resultado pode ser aprovado, reprovado ou correção solicitada. **A auditoria nunca altera a inspeção**: ela registra inconsistências e, se for o caso, reabre só os itens apontados para o executor corrigir.
- O mecânico vê o alerta de correção na Operação e no checklist.

### 4.4 Rodízio e fila de espera

- A vez é de quem iniciou a última OS há mais tempo. Almoço/ausente tira da fila sem mudar a posição.
- A fila "Aguardando" é numerada por ordem de chegada (1º, 2º, 3º…). Cada OS mostra o **mecânico previsto**: o retorno fica reservado ao mecânico do serviço original; as demais vão, na ordem, para os mecânicos livres e disponíveis, pela ordem do rodízio. Quando não há mecânico livre para aquela posição, o cartão diz "Aguardando mecânico livre". A previsão é só informativa e se refaz a cada mudança.
- O mecânico previsto vê "Assumir esta OS". Outro mecânico livre e disponível pode **assumir fora da vez**, escolhendo ou escrevendo o motivo (ex.: previsto no almoço). O motivo fica na OS (`foraDaOrdem`), no histórico e no painel da liderança. Mecânico em almoço/ausente não assume.
- Retorno de outro mecânico continua bloqueado para mecânicos; a liderança pode designar outra pessoa, com motivo.
- Cada cartão em andamento ou pausado mostra **"Com: nome"** de quem está com o carro.

### 4.5 Pausa (ex.: aguardando peça)

- O mecânico pausa a OS em andamento com motivo (aguardando peça, aguardando aprovação do cliente, outro) e um detalhe opcional. A OS vai para "Pausadas" e o mecânico fica livre para assumir outra.
- Nada é registrado numa OS pausada. Para retomar, o mecânico não pode ter outra OS em andamento ("Finalize a atual para retomar"). A liderança também pode retomar.
- O tempo pausado não conta no tempo de serviço. Pausas ficam na OS (`pausas[]`) e na Gestão da liderança.

### 4.6 Retorno

- Na Nova OS, "É retorno" pede a OS original (do mesmo veículo, últimos 90 dias) e o problema relatado pelo cliente. Retorno não tem serviço vendido nem valor.
- O retorno **não refaz o checklist**. A tela de atendimento foca no problema: foto do problema (obrigatória), diagnóstico (interno), se tem relação com o serviço anterior (sim / não / não deu para saber), solução aplicada, foto depois (ou o motivo de não ter), o que foi avisado ao cliente e o KM.
- O relatório do cliente mostra o que ele relatou, o que foi feito, a orientação e as fotos antes/depois. Diagnóstico interno e classificação não aparecem.
- Retornos não entram na base de carros e checklist das métricas; aparecem na aba Retornos da liderança com a classificação.

### 4.7 Adicionais vendidos na bancada

- Na execução, o cartão "Adicionais oferecidos ao cliente" lista o que faz sentido para o carro: Militec/Nano no motor, aditivo no radiador, flush do câmbio (só automático), higienização do ar-condicionado e palhetas. Quando o checklist marcou o item relacionado como Atenção/Prioritário, o adicional aparece com "Indicado pelo checklist".
- Para cada um, o mecânico marca "Cliente aceitou" (informa produto, quantidade e valor, se souber) ou "Ofereci, recusou". Aceito vira serviço executado com origem `adicional`; recusado fica registrado como oferta.
- "Vendeu outro serviço?" permite lançar qualquer outro serviço aplicável ao carro (ex.: troca do óleo do câmbio manual).
- O "Meu mês" e a liderança mostram adicionais vendidos e a taxa de aceite. **Quem define o preço e se o adicional entra na remuneração é decisão aberta (D-21).**

### 4.8 Checklist por tipo de câmbio e itens que não se aplicam ao modelo

- Carro manual não vê fluido nem trocador de calor do câmbio automático; carro automático não vê óleo do câmbio manual. O trocador de calor fica no grupo Câmbio, só para automático. O item "vazamento no motor" saiu do catálogo (a oficina não faz).
- Quando um item é marcado "Não se aplica" em pelo menos 3 inspeções e em 80% ou mais delas para a mesma marca + modelo + motor, ele aparece como **sugestão** no Admin › Catálogo. A direção confirma "Não mostrar para este modelo" e pode desfazer. Inspeções antigas não mudam; o catálogo ganha nova versão. O ano ainda não entra na regra (D-22).

### 4.9 Nova OS

- Marca e modelo são listas (marcas e modelos mais comuns no Brasil, com "Outra marca…"/"Outro modelo…" para digitar). Ano também é lista.
- Telefone do cliente é obrigatório (10 ou 11 dígitos, com máscara). Cliente antigo sem telefone precisa informar antes de salvar.
- Os serviços de câmbio aparecem conforme o câmbio do veículo.
- **Como o cliente conheceu a Master Óleo, cidade e bairro são obrigatórios** (02/11/2026). Cidade tem sugestões de Curitiba e região, mas aceita qualquer uma. "Outro" em como conheceu pede descrição. Cliente antigo sem esses dados vê "Complete o cadastro do cliente" na próxima OS; o que for preenchido fica gravado no cliente (com evento no histórico).
- **Nº do pedido no Olist** (**obrigatório** desde 02/11/2026, exceto no retorno em garantia): o vendedor informa na abertura; nos detalhes da OS dá para corrigir, mas não apagar. Aparece no cartão da OS e a busca de veículos encontra pelo número do pedido.
- Ao escolher um veículo, a Nova OS lista o que foi recomendado nas visitas anteriores e ainda não foi feito, com o estado e a resposta do cliente, para o vendedor oferecer de novo.

### 4.10 Recomendações que o cliente não fez

- Todo item marcado **Atenção** (desgaste), **Prioritário** (mau estado) ou **Avaliar depois** que não foi feito na visita entra nas **próximas manutenções recomendadas**, mesmo que o cliente tenha recusado. O mecânico não consegue desmarcar, e o servidor registra mesmo que a tela não mande.
- Não vira recomendação se o cliente aceitou e o serviço foi feito, ou se o serviço ligado ao item foi feito na mesma OS.
- A recomendação guarda o estado do item e mostra a resposta do cliente (não quis fazer agora, vai avaliar, apresentada sem resposta, ainda não apresentada).
- Onde aparece: na execução (travada), no histórico do veículo (prioritário primeiro, antes das manutenções por intervalo), na Nova OS do mesmo carro, no item do checklist da próxima visita ("Recomendado antes" e o que foi dito) e no relatório do cliente ("Recomendamos fazer o quanto antes / programar"; "Apresentado em dd/mm; você preferiu deixar para depois. Continua recomendado.").
- Some quando uma visita posterior marca o item como OK ou executa o serviço ligado a ele. Se o item continuar ruim, a recomendação nova substitui a antiga.

### 4.11 Login, perfis e registro de acessos (protótipo, 02/11/2026)

- **Login individual** com e-mail ou usuário e senha. A mensagem de erro é a mesma para login inexistente e senha errada ("Usuário ou senha incorretos.").
- **A administração cria o acesso** (Admin › Usuários): nome, perfil (define o que a pessoa vê e pode fazer), login e uma **senha provisória** gerada pelo sistema. A senha provisória aparece uma única vez para ser passada à pessoa. No primeiro acesso a pessoa é obrigada a criar a própria senha; ninguém mais a vê. "Redefinir senha" gera nova provisória e invalida a anterior.
- **Regras de senha**: mínimo de 6 caracteres; recusa sequências, repetições, a senha igual ao login e o nome da oficina.
- **Bloqueio**: 5 senhas erradas seguidas bloqueiam o acesso por 15 minutos; a administração pode desbloquear antes. Desativar a pessoa bloqueia na hora, mesmo com a senha certa.
- **Sessão** de 12 horas (um turno); depois pede login de novo. "Sair" encerra a sessão.
- **Registro de acessos** (Admin › Acessos): entrou, saiu, sessão expirou, senha errada, login inexistente, bloqueado, desativado e troca de senha, com data, pessoa (ou o login digitado) e aparelho (navegador e sistema). Filtros por pessoa e resultado; contador de falhas nas últimas 24 h. Cada pessoa vê os próprios últimos acessos em **Minha conta** (clicando no nome, no topo).
- **Contas de demonstração**: enquanto ligadas, a tela de entrada mostra as pessoas fictícias e entra-se com um toque. A direção desliga em Admin › Acessos; só é possível desligar se houver alguém da direção com senha.
- **Senha nunca é guardada**: só o hash (PBKDF2-SHA256, 120 mil iterações, sal por pessoa). O histórico de ações não registra o hash.
- **Limite do protótipo**: contas e registros ficam no navegador de quem testa. Não serve como segurança real nem leva contas para outros aparelhos. O login real é Fase B (D-03).

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

- **Óleo de motor (regra definida pela direção em 27/10/2026)**: 5, 7 ou 10 mil km conforme o óleo aplicado, ou 6 meses, o que vier primeiro. O mecânico escolhe o intervalo na finalização (obrigatório quando troca o óleo); a recomendação mostra "X km ou dd/mm/aaaa, o que vier primeiro" na execução, no checklist (referência da última troca), no histórico e no relatório do cliente.
- Os demais intervalos do protótipo continuam **fictícios** (fluido de freio 24 meses, filtro de ar 15.000 km; câmbio automático sem intervalo validado). Não existe intervalo universal; a tabela real é decisão da direção (D-05).
- Status da previsão: futura, próxima (≤ 1.000 km ou ≤ 30 dias), vencida, acompanhar.

## 6. Relatório do cliente (link seguro)

- Gerado só para OS concluída, com validade de 7, 30 ou 90 dias. O token tem 128 bits e é imprevisível.
- **Projeção restrita**: o relatório contém só número, data, KM, veículo, primeiro nome do cliente, técnico, serviços, itens (estado + recomendação), fotos marcadas como visíveis ao cliente, observação ao cliente e próximas manutenções.
- **Não contém**: telefone, valores, observação interna, nome completo, fotos ocultas, dados de outras OS.
- Link revogado, expirado ou inválido mostra a mesma mensagem ("Este link não está disponível"), sem revelar o motivo nem se existiu.
- Toda foto aparece para o cliente por padrão; liderança e direção podem ocultar uma foto na aba Fotos da OS, e ela sai do relatório na hora.
- Cada abertura conta um acesso. A tela interna mostra o estado do link, os acessos e a pré-visualização do que o cliente vê.
- Compartilhar: copiar, WhatsApp (abre a conversa com o texto, sem envio automático), abrir.

## 7. Recomendações (vendedor; perfil Comercial no futuro)

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
| Intervalos de manutenção | Óleo de motor **definido pela direção** (5/7/10 mil km ou 6 meses, o que vier primeiro, 27/10/2026); os demais **não aprovados** e fictícios no protótipo (D-05) | regras de intervalo |
| Exibir valores no relatório do cliente | **Não aprovado** — oculto por padrão (D-10) | projeção do relatório |

## 11. Requisitos não funcionais atendidos no protótipo

- **Isolamento**: sem SDK Firebase, sem chave, sem chamadas externas (verificado por script e pelo teste E2E de rede).
- **Celular primeiro**: checklist utilizável em 390 px sem rolagem horizontal; botões principais e campos com altura mínima de toque (botões secundários "sm" têm 36 px); modo compacto; câmera traseira (`capture="environment"`) e compressão da foto para 960 px.
- **Falhas visíveis**: cada item mostra "Salvando… / Salvo / Falhou — tentar de novo". Os controles da demo simulam falha, modo offline e latência.
- **Rascunho**: a Nova OS salva rascunho local e oferece recuperar após recarregar.
- **Trilha**: todo comando gera evento com autor, data, antes/depois e motivo (Admin › Histórico).
- **Senhas**: só o hash fica gravado (PBKDF2 com sal); nenhuma senha real ou do sistema atual aparece no código do protótipo.
- **Acessibilidade básica**: rótulos em campos, foco visível, estado sempre escrito em texto além da cor. Contraste e leitor de tela **não foram auditados formalmente** (pendência para a Fase B).

## 12. Fora do escopo do protótipo

Login real (o protótipo simula login com senha no próprio navegador; ver §4.11 e D-03), envio automático de WhatsApp, integração com o Tiny ERP, armazenamento real de fotos, cálculo de folha, impressão de etiqueta, multiloja.
