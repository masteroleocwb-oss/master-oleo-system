# Auditoria do sistema atual — Master Óleo Curitiba

> Base auditada: branch `main`, commit `cdc73d8` (21/10/2026), arquivo `index.html` (7.461 linhas).
> Dados de produção consultados em 26/10/2026 **somente leitura** (HTTP GET), apenas contagens agregadas — nenhum dado pessoal foi copiado para este documento.
> Senhas não são reproduzidas aqui de propósito: o documento cita a constante e a linha onde estão.

---

## 1. Arquitetura identificada

| Camada | O que existe | Onde |
| --- | --- | --- |
| Repositório | Apenas `index.html` e `README.md` (sem `package.json`, sem build, sem testes, sem `firestore.rules`, sem `vercel.json`) | raiz |
| UI | React 18 UMD via unpkg (`react@18`, **versão menor não fixada**), JSX transpilado no navegador por `@babel/standalone@7.29.7` | `index.html:7-9` |
| Renderização | `ReactDOM.render` (API legada), `ErrorBoundary` e vigia de 12 s ("Sistema não carregou") | `:7334`, `:613-635` |
| Banco | Firebase Firestore (SDK compat 9.22.0), projeto `masteroleo-1ed99` | `:10-12`, `:641-656` |
| Arquivos | Firebase Storage (compat 9.22.0) | `:656`, `:669-697`, `:5202` |
| Autenticação | **Nenhuma.** Não há Firebase Auth. Acesso protegido por senhas no front-end | ver §9 |
| Hospedagem | Vercel, deploy automático a cada push na `main` (sem ambientes de staging configurados no repo) | — |
| Rotas | Não há roteador. Navegação por estado `activeTab` (`ordens`, `consulta`, `metaupsell`, `volumetria`) + modais | `:2401` |
| Estado | `useState`/`useMemo` no componente `App` (~950 linhas), `localStorage` para preferências por aparelho | `:2379` |
| Tempo real | `onSnapshot` na coleção `orders` filtrada por `dataHora >= início da janela` (90 dias ou início do mês vigente, o que for menor) e em `config/global` | `:2477-2497`, `:2595-2631` |
| Histórico | Leitura única e sob demanda de toda a coleção (`orderBy numeroOrdem desc`), disparada por Consulta, Meta Upsell, Volumetria e filtros longos | `:2515` |
| Relógio | Sincronização com hora do servidor (`config/relogio`, `serverTimestamp`) no início e a cada 30 min | `:873`, `:2634-2640` |
| Integrações externas | Nenhuma além de Firebase e CDNs | — |

### Componentes principais

| Componente | Função | Linha |
| --- | --- | --- |
| `App` | Estado global, listeners, abas, handlers | 2379 |
| `RodizioPainel` | Fila "Próximos a atender", status, painel do chefe | 3355 |
| `CardAguardando` / `CardEmAndamento` / `CardConcluido` | Cartões da fila | 3484 / 3558 / 3618 |
| `BannerExecucaoNaoTeste` | Faixa "NÃO É TESTE" | 3339 |
| `ConsultaTab` | Busca no histórico concluído | 3683 |
| `NovaOrdemModal` | Abertura de OS (3 etapas) | 3807 |
| `ExecutarServicoModal` | Inspeção inicial, upsell, finalização | 4833 |
| `RegrasUpsellPanel` | Regras de upsell e comissão (texto) | 4775 |
| `DetalhesModal` | Ficha da OS, edição, retorno, exclusão ADM | 5497 |
| `EditarOrdemModal` | Edição de OS aguardando/andamento | 6006 |
| `ConfiguracoesModal` | Área ADM (metas, período, alertas, fator, comissões) | 6383 |
| `EditarUpsellModal`, `EditarHorariosForm` | Correções ADM | 6972, 7027 |
| `MetaUpsellTab`, `VolumetriaTab`, `ComissaoModal` | Indicadores e comissão | 1465, 1671, 2224 |
| `PortaoDeSenha` / `RaizComSenha` | Senha do dia | 7374 / 7434 |
| `BuscarClienteModal` | **Código morto** (nunca aberto) | 7128 |

---

## 2. Funcionalidades existentes e localização

| # | Funcionalidade | Situação | Onde |
| --- | --- | --- | --- |
| 1 | Abertura de OS em 3 etapas (Cliente → Serviços → Finalização) | Ativa | `NovaOrdemModal` 3807 |
| 2 | Busca de cliente já atendido (placa, nome, telefone, nº OS; mín. 3 caracteres; cache 10 min; só concluídas) | Ativa | 1224-1288 |
| 3 | Cadastro de veículo **dentro da OS** (placa, ano, câmbio, combustível, marca, modelo, motor). Não existe entidade veículo nem cliente | Ativa | NovaOrdem etapa 1 |
| 4 | Marcas/modelos/motores fixos + "+" que grava **só no aparelho** (`customMarcas`, `customModelos`, `customMotores`) | Ativa | NovaOrdem |
| 5 | Vendedor (lista fixa de 5 nomes) | Ativa | 4218-4225 |
| 6 | 16 serviços com marca/quantidade/código; higienização grátis; flags "NÃO FAZER TESTE — SÓ EXECUTAR" (freio e câmbio, ligadas por padrão) | Ativa | 3971-3972, 4473+ |
| 7 | Numeração da OS por transação em `config/contadores` (max(contador, maior nº existente)+1) | Ativa desde 19/10/2026 | `criarOrdemComNumero` 834 |
| 8 | Fila do dia: Aguardando / Em andamento (só OS abertas hoje, ordem fixa) / Concluídos (pelo filtro) | Ativa | 2694-2702 |
| 9 | Iniciar atendimento com mecânico pré-selecionado pelo rodízio | Ativa | `handleIniciarAtendimento` 2729 |
| 10 | Rodízio: pool de 30 dias, exclusões, ordenação por fim do último carro → carros no dia anterior → alfabética; status disponível/almoço/ausente; "em atendimento" automático | Ativa desde 10/09, revisado 21/10 | 2742-2783, 914-932 |
| 11 | Almoço com senha operacional; ausência pelo painel do chefe | Ativa | `alterarAlmoco` 2798 |
| 12 | Painel do chefe: carros e faturamento por operador (diário/semanal/mensal) | Ativa | `RodizioPainel` |
| 13 | Execução: lubrificador, KM obrigatório, inspeção de vazamento (radio **pré-marcado "não"**), fotos de vazamento no Storage | Ativa | 4833-5220 |
| 14 | Upsell: 16 itens, pitch de venda para 9, foto opcional de filtro (base64 ≤500 KB), aceito/não/sem estoque, valor | Ativa | 5023-5080 |
| 15 | Finalização: calcula `valorUpsell`, `valorTotal`, tempos, taxa de conversão; salvamento automático a cada 2 s | Ativa | 4918-5020, 4854-4875 |
| 16 | Consulta do histórico concluído com filtros (texto, lubrificador, vendedor, serviço, datas, só upsell) e KM | Ativa | `ConsultaTab` 3683 |
| 17 | Detalhes da OS (dados, serviços, tempos, valores, ofertas, inspeção, retorno) | Ativa | `DetalhesModal` 5497 |
| 18 | Edição de OS sem senha; edição ADM de horários e de valor de upsell | Ativa | 6006, 7027, 6972 |
| 19 | Retorno/retrabalho: checklist de retorno (motivo, descrição, fotos) em **dois formatos diferentes** | Ativa | Detalhes e EditarOrdem |
| 20 | Cancelar OS aguardando (apaga, só confirmação) | Ativa | 2715-2726 |
| 21 | Remover OS em andamento (apaga, senha operacional) | Ativa | 2806-2819 |
| 22 | Excluir OS concluída (apaga, só ADM) | Ativa | DetalhesModal |
| 23 | Status `encerrada` (633 OS antigas presas, fechamento em massa de 21/10/2026, reversível por `encerramentoAutomatico`) | Ativa | 2655 |
| 24 | Meta Upsell: meta por item, realizado, ticket, projeção, % carros, drill-down recebeu/não recebeu, edição ADM | Ativa | 1465-1666 |
| 25 | Volumetria por lubrificador, comissão estimada borrada, edição/zeragem ADM | Ativa | 1671-2219 |
| 26 | Comissão por faixas de upsell com teto de câmbio, ajustes ADM por mês, senha individual | Ativa | 935-1004, 2224 |
| 27 | Alertas de performance (taxa de upsell × meta do técnico) | Ativa | 1295-1357, 2975-3039 |
| 28 | Configurações ADM: Metas, Período, Alertas (por aparelho), Fator de ajuste e Comissões (globais) | Ativa | 6383 |
| 29 | Senha do dia (`master`+data, vira às 05h Brasília, por aparelho) | Ativa | 1041-1067, 7374 |
| 30 | Normalização de nomes de lubrificador (22 grafias distintas na base) | Ativa | 1402-1460 |

---

## 3. Regras de negócio encontradas

1. **Dia operacional** em America/Sao_Paulo pela hora do servidor; senha diária troca às 05h.
2. **Fila** de aguardando/andamento só considera OS com `dataHora` de hoje; ordenação fixa por número.
3. **Rodízio**: excluídos por constante `RODIZIO_EXCLUIDOS` (`:860`); almoço não altera posição; status gravados por chave via transação; zera na virada do dia.
4. **Upsell conta** apenas se `upsells[k].aceito === 'sim'` **e** o item não era serviço-base da OS (balcão não conta) — `:1498-1500`.
5. **Fator de ajuste** global (`config/global.fatorAjuste`) aplicado só a valores de upsell (Volumetria e comissão).
6. **Comissão** (`FAIXAS_COMISSAO`, `:935`): faixas 0/3/5/7% sobre o upsell do período com fator; parcela de câmbio limitada a R$ 50 por OS; ajustes manuais subtraídos; nunca negativa.
7. **Retorno**: desconto de R$ 30 por retorno é só texto informativo; aplicado manualmente como ajuste.
8. **Inativos** (`LUBRIFICADORES_INATIVOS`, `:730`) fora de métricas, rodízio e comissão.
9. **"NÃO FAZER TESTE — SÓ EXECUTAR"**: `execFreioSemQuestionar` e `execCambioSemQuestionar`, ligados por padrão, exibem faixa vermelha nos cartões e na execução.
10. **Higienização grátis** (`higienizacaoACGratis`) sem valor/comissão.
11. **Metas de upsell por item** (`METAS_UPSELL_DEFAULT`, `:807`, sobrescritas por `config/global.metasUpsell`).
12. **OS encerradas** não entram em listas, totais, faturamento, upsell nem comissão.

---

## 4. Estrutura de dados (verificada na base em 26/10/2026)

| Item | Valor |
| --- | --- |
| Coleções conhecidas | `orders`, `config` (docs `global`, `contadores`, `relogio`). Listagem de coleções raiz negada (403) — **pendência**: confirmar se existem outras |
| Total de OS | 4.219 (3.581 concluídas, 633 encerradas, 3 em andamento, 2 aguardando) |
| Período | primeira OS em 10/11/2025; maior nº 4006 |
| Campos distintos em `orders` | 95 (esquema livre, campos duplicados para retorno) |
| Tamanho dos documentos | mediana 2,8 KB, p99 4,2 KB, máx 4,9 KB |
| Placas distintas | 3.656, sendo 404 com mais de uma visita; 0 placas fora do padrão |
| Qualidade dos dados (concluídas) | KM 99,9% · telefone 29,7% · CPF 6,5% · mapa de upsells 38,6% · inspeção 57,2% |
| Vazamento | 27 "sim", 2.021 "não" — **nenhuma** com foto anexada |
| Retornos registrados | 5 |
| Números de OS duplicados (legado) | 252 números repetidos envolvendo 510 documentos (anteriores a 19/10/2026) |

Modelo atual: **a OS é o único registro**. Cliente e veículo não existem como entidades; o "histórico do veículo" é uma busca por placa sobre as OS. Fotos: Storage (`vazamentos/{orderId}/`, `retornos/{orderId}/`) ou base64 dentro da OS (filtros, retorno pelo Detalhes).

---

## 5. Dependências críticas

| Dependência | Risco |
| --- | --- |
| `unpkg.com/react@18` sem versão exata | Uma publicação nova da linha 18 muda o app sem deploy |
| `@babel/standalone` no navegador | Já causou tela branca (hotfix 17/06/2026); compila 7 mil linhas a cada abertura (lento em celular) |
| Firebase compat 9.22.0 via gstatic | API compat é legada; migração para modular exigirá refatoração |
| `config/contadores` | Ponto único da numeração; transação depende dele |
| `config/global` | Um documento concentra rodízio, metas, senhas de comissão e fator; toda escrita dispara snapshot em todos os aparelhos |

---

## 6. Problemas técnicos identificados

1. Modais `ConfiguracoesModal`, `EditarUpsellModal`, `EditarHorariosForm` e `BuscarClienteModal` usam classes `.modal-overlay`/`.modal-container` **inexistentes no CSS**: abrem no fim da página.
2. `DetalhesModal` exibe "Concluído" para OS em andamento (`:5580`).
3. Volumetria calcula datas padrão em UTC: à noite a data fim vem com +1 dia.
4. Editar/zerar upsell na Volumetria não atualiza `valorTotal` nem o mapa `upsells` (Meta Upsell diverge).
5. Checkbox de freio na etapa 3 grava `fluidoFreio=true`, fazendo upsell de freio virar "balcão" e sair da Meta Upsell.
6. `EditarHorariosForm` não recalcula `tempoServico`.
7. Retorno gravado em dois formatos (`retorno{}` e campos soltos `isRetorno`/`retornoData`...).
8. Lubrificadores criados pelo "+" ficam só no aparelho que os criou.
9. Barra de abas corta "Volumetria" no celular; fonte "Archivo" referenciada e não carregada; sem logo/favicon.
10. Inspeção de vazamento vem **pré-marcada "Não"**: o dado não prova que houve verificação.
11. Código morto: `BuscarClienteModal`, `uploadImagem`/`uploadMultiplasImagens`, `salvarFatorAjuste`, `FATOR_AJUSTE_UPSELL`, estados de busca não usados.
12. Sem testes automatizados, sem ambiente de staging, sem Firebase Emulator configurado.

---

## 7. Funcionalidades que precisam ser preservadas

Numeração transacional · fila do dia idêntica entre aparelhos · rodízio e suas regras anti-burla · flags "NÃO É TESTE" · os 16 serviços e seus campos técnicos · regra "balcão não conta" · fator de ajuste · comissão vigente (faixas, teto de câmbio, ajustes) · Meta Upsell e drill-down · Volumetria · painel do chefe · Consulta com KM · histórico completo pesquisável · status `encerrada` · tempos de espera/serviço · sincronização de relógio · custo de leitura reduzido (janela + histórico sob demanda).

---

## 8. Riscos para a integridade do histórico

| Risco | Evidência | Gravidade |
| --- | --- | --- |
| Exclusão física de OS (cancelar, remover, excluir) sem registro de quem/quando | `.delete()` em 3 fluxos | Alta |
| Edição sem trilha: qualquer pessoa edita OS aguardando/andamento e valores no Detalhes sem senha e sem log | EditarOrdem, DetalhesModal | Alta |
| Números duplicados legados | 252 números / 510 docs | Média (não corrigir; tratar com chave interna) |
| Ajustes ADM de upsell divergem dos itens | §6.4 | Média |
| Inspeção pré-preenchida | §6.10 | Média |
| Nomes de pessoas como texto livre (22 grafias) | normalização em tempo de leitura | Média |
| Esquema livre (95 campos) | campos duplicados de retorno | Baixa |

---

## 9. Problemas de segurança e acesso

1. **Banco sem autenticação**: as regras do Firestore/Storage não estão no repositório; a leitura anônima via REST com a chave pública do app funcionou durante esta auditoria — qualquer pessoa com a chave (visível no HTML) lê clientes, telefones e CPFs. **Pendência crítica**: confirmar as regras no console e se a escrita anônima também está aberta (não testado, por ser escrita).
2. **Senhas no código-fonte**: senha ADM (`SYSTEM_CONFIG.ADMIN_PASSWORD`, `:702`), do chefe (`RODIZIO_SENHA_CHEFE`, `:861`), operacional (`SENHA_OPERACIONAL`, `:863`), regra da senha do dia (`:1064`) e senhas de comissão em texto puro em `config/global.comissao.senhas`.
3. **Senhas compartilhadas**: ações não são atribuíveis a uma pessoa.
4. **Modo ADM** vale até recarregar a página; não há logout.
5. Comissão sem senha cadastrada abre para qualquer pessoa; desfoque da comissão é só visual.
6. Ações destrutivas sem autoria (ver §8).
7. Fotos no Storage acessíveis pela mesma regra aberta (pendência: confirmar).

---

## 10. Oportunidades de melhoria (priorizadas)

1. Login individual + regras de acesso no banco (pré-requisito para tudo que é "auditável").
2. Checklist técnico item a item, sem pré-preenchimento, com evidência vinculada ao item.
3. Entidade **veículo** (chave = placa normalizada) ligando todas as OS, sem migrar as OS.
4. Exclusão lógica + trilha de eventos para todas as alterações relevantes.
5. Relatório do cliente por link com token e projeção restrita no servidor.
6. Metas e políticas com vigência e versão; simulação separada do vigente.
7. Build com versões fixas (Vite) e testes automatizados; Firebase Emulator para desenvolvimento.

---

## 11. Plano de isolamento do protótipo

| Medida | Como foi aplicada |
| --- | --- |
| Branch dedicada | `prototipo/plataforma-operacional`; nada é enviado para a `main` |
| Sem Firebase | O protótipo (`prototype/`) **não importa nenhum SDK do Firebase** nem contém a chave do projeto; os dados vivem em memória + `localStorage` do navegador |
| Dados fictícios | Base de demonstração gerada em código (`prototype/src/data/seed.ts`); nenhum nome, placa ou telefone real |
| Verificação automática | Teste que varre o código do protótipo por `firebase`, `firestore`, `gstatic`, `masteroleo` e falha se encontrar; teste E2E monitora as requisições de rede e falha se houver chamada a domínios Google/Firebase |
| Sem deploy | Protótipo roda localmente (`npm run dev`) ou em preview isolado; a `main` e a Vercel de produção não são tocadas |
| Leitura da produção | Só para esta auditoria: contagens agregadas via GET, sem armazenar dados pessoais |
| Aviso visível | Faixa "AMBIENTE DE DEMONSTRAÇÃO — dados fictícios" em todas as telas do protótipo |

### Pendências que não foi possível verificar

- Regras de segurança efetivas do Firestore e do Storage (console Firebase).
- Existência de outras coleções além de `orders` e `config`.
- Configuração do projeto na Vercel (preview por branch ligado ou não, domínios, variáveis).
- Conteúdo do "Playbook Operacional" (checklist fase 1, dia de exceção, frota/locação) além do que consta nos artefatos de remuneração — ver `OPEN_DECISIONS.md`.
