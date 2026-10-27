# Decisões em aberto

Cada item mostra o assunto, o estado atual, as alternativas, o impacto, a recomendação, quem aprova e se bloqueia a Fase B.
Enquanto não houver decisão, o protótipo **preserva a regra vigente** e deixa a nova regra configurável e marcada como "em teste" ou "não aprovado".

Legenda de bloqueio:

- **Bloqueia**: a Fase B não começa sem esta decisão.
- **Bloqueia a etapa**: só a etapa indicada do plano de migração espera.
- **Não bloqueia**: dá para seguir com o padrão do protótipo e ajustar depois.

---

## Resumo

| # | Assunto | Aprovador | Bloqueio |
| --- | --- | --- | --- |
| D-01 | Autorizar a Fase B (implementação produtiva) | Direção | **Bloqueia** |
| D-02 | Fechar o acesso aberto à base atual (Firestore/Storage) | Direção + responsável técnico | **Urgente**, independente do protótipo |
| D-03 | Forma de login individual | Direção | **Bloqueia** |
| D-04 | Critérios técnicos do checklist e quando a foto é obrigatória | Direção + liderança técnica | Bloqueia a etapa 3 |
| D-05 | Tabela de intervalos de manutenção | Direção técnica | Bloqueia a etapa 4 (só o cálculo de km/data) |
| D-06 | Política de remuneração do playbook | Direção | Bloqueia a etapa 7 |
| D-07 | "Comissão por upsell acabou" × regra vigente | Direção | Bloqueia a etapa 7 |
| D-08 | Valor da meta "X%" de itens | Direção | Não bloqueia |
| D-09 | Divergências do playbook (N7/N8, melhoria, descontos do score) | Direção | Bloqueia a etapa 7 |
| D-10 | O que o relatório do cliente mostra (valores, nome do técnico) | Direção + comercial | Não bloqueia |
| D-11 | Referência de % de checklists auditados pela liderança | Direção | Não bloqueia |
| D-12 | Identidade visual (cores, fonte, tema) | Direção / marketing | Não bloqueia |
| D-13 | Números de OS duplicados no legado | Direção | Não bloqueia |
| D-14 | Fotos: armazenamento, retenção e LGPD | Direção + jurídico | Bloqueia a etapa 3 (fotos reais) |
| D-15 | Onde hospedar o protótipo e os documentos | Responsável técnico | Bloqueia qualquer merge na `main` |
| D-16 | Integração com o Tiny ERP | Direção | Não bloqueia |
| D-17 | Dia de exceção e "não oferecer" (frota): quem decide e limites | Direção + liderança | Não bloqueia |
| D-18 | Validade padrão do link do cliente | Comercial | Não bloqueia |
| D-19 | Backtest da política com faturamento real | Direção | Bloqueia a etapa 7 |

---

## D-01 — Autorizar a Fase B

- **Estado atual**: só existe o protótipo isolado na branch `prototipo/plataforma-operacional`. Nada foi publicado.
- **Alternativas**: (a) aprovar o plano por etapas de `PRODUCTION_MIGRATION_PLAN.md`; (b) aprovar só a etapa 1 (segurança e login) e reavaliar; (c) pedir ajustes no protótipo antes.
- **Impacto**: sem aprovação, nenhuma linha do sistema em uso muda.
- **Recomendação**: (b). A etapa 1 resolve o risco de segurança atual e é pré-requisito de todo o resto.
- **Aprovador**: direção da Master Óleo. **Bloqueia.**

## D-02 — Acesso aberto à base atual

- **Estado atual**: na auditoria (26/10/2026), a leitura anônima da base com a chave pública do app funcionou. Telefones e CPFs ficam legíveis para quem tiver a chave, e a chave está no HTML. **Não testei a escrita** (seria uma escrita na produção). As senhas ADM, do chefe e operacional estão no código-fonte, e as senhas de comissão ficam em texto no `config/global`.
- **Alternativas**: (a) regras do Firestore exigindo login (depende de D-03); (b) paliativo imediato com App Check + regras restritas por coleção; (c) manter como está.
- **Impacto**: risco de vazamento de dados pessoais (LGPD) e de alteração ou apagamento de OS por terceiros.
- **Recomendação**: confirmar as regras no console do Firebase **já**, sem esperar a Fase B; em seguida (a).
- **Aprovador**: direção + responsável técnico. **Urgente**, independe do protótipo.

## D-03 — Login individual

- **Estado atual**: senhas compartilhadas e "modo ADM" por aparelho; nenhuma ação é atribuível a uma pessoa. O protótipo simula login por troca de usuário.
- **Alternativas**: (a) e-mail + senha (Firebase Auth); (b) usuário + PIN de 4–6 dígitos no tablet da oficina, com sessão curta; (c) login com Google.
- **Impacto**: sem login individual, auditoria, ocorrências, metas individuais e trilha não têm valor de prova.
- **Recomendação**: (b) para a bancada (rápido, sem e-mail) e (a) para liderança e direção. A senha do dia (`master`+data) é aposentada.
- **Aprovador**: direção. **Bloqueia.**

## D-04 — Critérios do checklist e exigência de foto

- **Estado atual**: o protótipo tem 14 itens (Filtros, Motor, Câmbio, Freios, Demais itens) com instrução, estados permitidos e foto exigida em Atenção/Prioritário para a maioria. Esses critérios são **proposta**: o playbook lista os itens da fase 1, mas não define o que separa Atenção de Prioritário nem quando a foto é exigida. Trocador de calor e coxim do câmbio vieram de pedido da direção.
- **Alternativas**: (a) aprovar o catálogo do protótipo como versão 1; (b) a liderança técnica revisa item a item (texto da instrução, critério de cada estado, foto); (c) começar só com os itens de filtros e expandir.
- **Impacto**: critério vago gera checklist "tudo OK" e conflito na auditoria. Foto demais deixa a bancada lenta; foto de menos não prova a recomendação.
- **Recomendação**: (b) num encontro de 1 hora, usando a tela Admin › Catálogo. O catálogo é versionado: dá para ajustar depois sem afetar inspeções antigas.
- **Aprovador**: direção + liderança técnica. Bloqueia a etapa 3.

## D-05 — Intervalos de manutenção

- **Estado atual**: nenhum documento recebido traz intervalos. Os do protótipo são **fictícios** e marcados como tal: óleo 10.000 km/12 meses, fluido de freio 24 meses, filtro de ar 15.000 km. O câmbio automático aparece sem intervalo validado.
- **Alternativas**: (a) tabela interna Master Óleo por serviço (e por tipo de óleo/motor quando fizer diferença); (b) intervalo do fabricante cadastrado por modelo; (c) começar sem km/data, com tudo como "acompanhar", e cadastrar regras aos poucos.
- **Impacto**: um intervalo errado exposto ao cliente vira promessa da marca.
- **Recomendação**: (c) no lançamento, mais (a) para óleo de motor e filtros assim que a direção aprovar os números. O sistema só calcula km/data para regras com `validada = true`.
- **Aprovador**: direção técnica. Bloqueia a etapa 4 (só o cálculo; o histórico funciona sem).

## D-06 — Política de remuneração do playbook

- **Estado atual**: vigente é a comissão por upsell do sistema atual (faixas 0/3/5/7% sobre o upsell do período, teto de R$ 50 por OS no câmbio, fator de ajuste global, ajustes manuais). A proposta do playbook (07/10/2026) usa o faturamento da bancada:
  - faixas 55k 0,5% · 80k 0,75% · 100k 1,0% · 130k 1,2% · 150k 1,4%;
  - acelerador por itens: 120% → +0,25 p.p.; 150% → +0,40 p.p.;
  - fator do score: 95+ → +10%; 90–94 → 0; 80–89 → −10%; < 80 → −20%.

  O próprio documento diz que os percentuais são "proposta de backtest, não política final".
- **Perguntas em aberto**:
  1. O % incide **sobre o total** ou **só sobre o excedente** de cada faixa? "Sobre o total" cria degraus: R$ 1 a mais em 80k muda bastante o valor.
  2. O que acontece **acima de R$ 170 mil**?
  3. A meta de itens é por **volume** (quantidade) ou por **R$**?
  4. O fixo por nível fica fora do cálculo, como no playbook?
- **Recomendação**: rodar o simulador do protótipo com o faturamento real de 3 a 6 meses (D-19) antes de qualquer decisão; manter a vigente até lá. O simulador mostra as duas lado a lado e o botão "Aprovar como vigente" fica desativado.
- **Aprovador**: direção. Bloqueia a etapa 7.

## D-07 — "Comissão por upsell acabou"

- **Estado atual**: um trecho do playbook diz que a comissão por upsell acabou, mas o sistema em uso calcula e exibe essa comissão hoje (regra vigente).
- **Alternativas**: (a) manter a comissão por upsell até a nova política ser aprovada e comunicada; (b) encerrar em data definida, com comunicado; (c) rodar as duas em paralelo, só informativas, por 1–2 meses.
- **Impacto**: mudança de remuneração sem comunicação formal tem risco trabalhista e de confiança da equipe.
- **Recomendação**: (a) + (c). Nada muda no cálculo vigente sem decisão escrita com data de vigência.
- **Aprovador**: direção. Bloqueia a etapa 7.

## D-08 — Meta "X%" de itens

- **Estado atual**: o playbook cita uma meta de X% sem definir o valor. O protótipo permite criar a meta com qualquer alvo, sempre com versão e aprovação. Nenhum valor é imposto.
- **Recomendação**: definir o alvo depois de 1 mês de checklist real (linha de base), não antes.
- **Aprovador**: direção. Não bloqueia.

## D-09 — Divergências internas do playbook

- **Estado atual**: os documentos divergem entre si em pontos como o tempo para N7/N8 (8 × 9 meses) e o valor de "melhoria" (+1 × +2). Os descontos do score do checklist (0/2/5/10 por faixa de % completo) e as categorias de ocorrência foram implementados como **em teste**.
- **Recomendação**: uma versão única do playbook, com data, aprovada pela direção. O sistema registra a versão da política usada em cada fechamento mensal.
- **Aprovador**: direção. Bloqueia a etapa 7.

## D-10 — O que o relatório do cliente mostra

- **Estado atual (protótipo)**: mostra serviços, itens com estado e recomendação, fotos marcadas como visíveis, observação ao cliente, próximas manutenções com a origem e o **primeiro nome** do técnico. **Não** mostra valores, telefone, observação interna nem nome completo.
- **Alternativas**: (a) manter; (b) mostrar o valor total pago; (c) mostrar o orçamento das recomendações.
- **Impacto**: valores no link facilitam o "fecha depois", mas um link encaminhado expõe o preço praticado.
- **Recomendação**: (a) no lançamento; reavaliar (c) com o comercial.
- **Aprovador**: direção + comercial. Não bloqueia.

## D-11 — Referência de auditoria da liderança

- **Estado atual**: o protótipo mostra a % de checklists auditados com referência de **10%** (proposta deste protótipo, não do playbook).
- **Recomendação**: começar com 10% sorteado e subir para 20% nos mecânicos com correção recente.
- **Aprovador**: direção. Não bloqueia.

## D-12 — Identidade visual

- **Estado atual**: há três referências conflitantes:
  - o artefato "Design System" (`#CC0000`/`#003399`, DM Sans, tema escuro);
  - as cores do logotipo oficial (vermelho ≈ `#D80A0A`, azul `#0049AA`, marinho `#002266`);
  - o sistema atual (fonte "Archivo" referenciada e não carregada).

  O protótipo usa as cores do logo, DM Sans e **tema claro** (melhor leitura sob luz forte na bancada).
- **Recomendação**: adotar as cores do logo como fonte da verdade e atualizar o Design System; manter o tema claro na operação.
- **Aprovador**: direção / marketing. Não bloqueia.

## D-13 — Números de OS duplicados no legado

- **Estado atual**: 252 números repetidos em 510 documentos, todos anteriores a 19/10/2026; a numeração transacional resolveu daí em diante.
- **Alternativas**: (a) não renumerar; o histórico usa a chave interna do documento e mostra "#1234 (duplicado)"; (b) renumerar o legado.
- **Recomendação**: (a). Renumerar quebra a referência a papéis e conversas já trocadas com clientes.
- **Aprovador**: direção. Não bloqueia.

## D-14 — Fotos

- **Estado atual**: o protótipo comprime a foto no aparelho e a guarda no navegador. Em produção, a foto vai para o Storage com acesso restrito e a URL do relatório é assinada.
- **Perguntas em aberto**: quanto tempo guardar? Fotos podem mostrar placa, rosto ou documento; quem decide se a foto aparece para o cliente (no protótipo: aparece por padrão; liderança e direção podem ocultar na aba Fotos da OS)? É preciso aviso ao cliente na abertura da OS?
- **Recomendação**: guardar por 5 anos, junto com a OS; aviso no termo de entrada; orientar a fotografar só a peça.
- **Aprovador**: direção + jurídico. Bloqueia a etapa 3 (fotos reais).

## D-15 — Hospedagem do protótipo e dos documentos

- **Estado atual**: a Vercel publica a `main` automaticamente. Se esta branch for mesclada como está, `docs/` e `prototype/` passam a ser servidos publicamente junto com o sistema.
- **Alternativas**: (a) nunca mesclar `prototype/`; manter numa branch ou num repositório separado; (b) projeto Vercel separado, com proteção por senha; (c) `.vercelignore` para `docs/` e `prototype/`.
- **Recomendação**: (a) + (b) para quem for avaliar. A auditoria descreve falhas de segurança atuais e **não deve ficar pública**.
- **Aprovador**: responsável técnico. Bloqueia qualquer merge na `main`.

## D-16 — Integração com o Tiny ERP

- **Estado atual**: citada no planejamento, sem chave de API nem escopo definido. O protótipo não integra.
- **Recomendação**: definir o que sincronizar (cliente, veículo, valor da OS?) depois da etapa 2. A chave fica só no servidor, nunca no front-end.
- **Aprovador**: direção. Não bloqueia.

## D-17 — Dia de exceção e "não oferecer"

- **Estado atual (protótipo)**: a liderança declara o dia de exceção com motivo; o dia sai da base do checklist %. "Não oferecer" é marcado por OS, com o nome de quem alinhou, e as recomendações não contam como oportunidade.
- **Perguntas em aberto**: há limite de dias de exceção por mês? A lista de clientes de frota/locação deve ser cadastrada para marcar automaticamente?
- **Recomendação**: no máximo 2 dias por mês sem aprovação da direção; cadastro de clientes frota na etapa 2.
- **Aprovador**: direção + liderança. Não bloqueia.

## D-18 — Validade do link do cliente

- **Estado atual**: escolha entre 7, 30 e 90 dias; padrão de 30. O link pode ser revogado a qualquer momento.
- **Recomendação**: manter 30 dias. O histórico interno não expira.
- **Aprovador**: comercial. Não bloqueia.

## D-19 — Backtest da política com dados reais

- **Estado atual**: o volume da base de demonstração fica abaixo da primeira faixa da proposta (55k). Por isso o simulador tem botões de cenário (60k/90k/140k). Não usei dados reais de faturamento: o protótipo não pode conter dados reais.
- **Recomendação**: exportar, só para leitura e de forma anonimizada (mecânico A, B, C…), o faturamento mensal por mecânico de 6 meses e rodar o simulador fora do protótipo. Os resultados vão para a direção.
- **Aprovador**: direção. Bloqueia a etapa 7.
