# Plano de migração para produção (Fase B)

> **Este documento não autoriza nada.** Ele descreve como a Fase B seria feita **se** a direção aprovar (D-01 em `OPEN_DECISIONS.md`). Até lá, o sistema em uso (`index.html` na `main`, publicado pela Vercel) não muda.

## 1. Premissas

- **Incremental e reversível.** Cada etapa entra atrás de uma chave de funcionalidade (*feature flag*) e pode ser desligada sem perder dados.
- **O sistema atual continua funcionando** durante toda a migração. Nenhuma funcionalidade listada em `CURRENT_SYSTEM_AUDIT.md` §7 é removida antes de a substituta estar em uso e aprovada.
- **Nenhum dado real é apagado nem reescrito.** Os dados novos ficam em coleções novas; as OS antigas ficam em `orders`.
- **A regra de remuneração vigente não muda** sem decisão escrita da direção, com data de vigência (D-06, D-07).
- **Tudo é testado antes no Firebase Emulator e num projeto Firebase de staging**, nunca direto na base da oficina.

## 2. Pré-requisitos (antes da etapa 1)

| Item | Responsável | Observação |
| --- | --- | --- |
| Aprovação da direção (D-01) | Direção | Por escrito, por etapa |
| Confirmar as regras atuais do Firestore/Storage no console (D-02) | Responsável técnico | Urgente, independente da Fase B |
| Projeto Firebase de **staging** separado | Responsável técnico | Dados fictícios; mesmo esquema |
| Projeto Vercel separado para preview, com proteção | Responsável técnico | D-15: `docs/` e `prototype/` **não** podem ir para a `main` como estão |
| Backup/export do Firestore de produção | Responsável técnico | Antes de cada etapa que grava em produção |
| Build com versões fixas (Vite) | Engenharia | Substitui React/Babel por CDN sem versão exata |

## 3. Etapas

| # | Etapa | O que entra | Reversão | Critério para seguir |
| --- | --- | --- | --- | --- |
| 1 | **Segurança e login** | Firebase Auth (D-03); perfis por *custom claims*; regras do Firestore/Storage fechando a leitura anônima; fim das senhas no código e da senha do dia | Regras antigas guardadas; *flag* de login | Ninguém sem login lê dados; todas as telas atuais funcionam logadas |
| 2 | **Veículo e cliente como entidades** | Coleções `veiculos`/`clientes` criadas a partir de `orders` (leitura) + vínculo nas OS novas; busca por placa/nome/telefone; tela de histórico do veículo | Apagar só as coleções novas; `orders` intacta | Histórico de 404 placas com mais de uma visita confere com a busca atual |
| 3 | **Checklist técnico e fotos** | Catálogo aprovado (D-04); checklist item a item no lugar da inspeção pré-marcada; fotos no Storage (D-14); exceção e correção | *Flag* volta para a inspeção atual | Piloto de 2 semanas com 2 mecânicos; tempo de checklist medido; 0 perdas de foto |
| 4 | **Próxima manutenção** | Regras de intervalo aprovadas (D-05); previsões por OS; lista de vencidos | *Flag*; previsões ficam como "acompanhar" | A direção revisa 20 previsões reais |
| 5 | **Relatório do cliente** | Função HTTPS com token; projeção restrita; validade e revogação; WhatsApp sem envio automático | Revogar todos os links; *flag* | Teste de segurança do link (token, revogado, expirado) em staging |
| 6 | **Comercial e liderança** | Recomendações; auditoria; ocorrências com contraditório; planos de ação; trilha de eventos | *Flag* por tela | Liderança usa por 1 mês; nenhuma ocorrência aplicada sem decisão da direção |
| 7 | **Metas e políticas** | Metas versionadas; simulador; fechamento mensal imutável. **Nova política só depois de D-06, D-07, D-09 e D-19** | A vigente continua sendo calculada em paralelo | Backtest aprovado; comunicado formal à equipe com data |

As etapas 4 e 5 podem andar juntas depois da 3. A 7 depende de decisões, não de código.

## 4. Riscos e mitigação

| Risco | Mitigação |
| --- | --- |
| Fechar as regras do Firestore derruba um aparelho que ainda roda a versão antiga do app | Publicar o app com login **antes** de fechar as regras; manter, por 1 semana, uma regra de transição com leitura só para usuários logados |
| Checklist deixa a bancada lenta | Modo compacto; OK com um toque; meta de tempo medida no piloto; exceção com aprovação rápida |
| Equipe entende o indicador como desconto automático | Comunicar que nenhum efeito salarial é automático; ocorrência só vale com decisão da direção |
| Foto expõe dados pessoais | Orientação de enquadramento; ocultar foto do relatório; retenção definida (D-14) |
| Números duplicados confundem a busca | Mostrar "(duplicado)" e usar o id do documento (D-13) |
| `docs/` publicado por engano | `.vercelignore` + revisão do PR; a auditoria descreve falhas de segurança |
| Custo de leitura do Firestore sobe | Documento de rodízio por dia; consultas por janela; histórico sob demanda (já é assim hoje) |

## 5. O que reaproveitar do protótipo

- **Domínio** (`src/domain/*`): regras de checklist, manutenção, metas, ocorrências e cálculo, com os testes. Pode ir quase como está.
- **Camada de serviço** (`src/data/api.ts`): vira Cloud Functions mais *Security Rules*. As validações e os eventos são os mesmos.
- **Telas** (`src/screens/*`): base para o app novo; trocar o `store` local por chamadas ao Firebase.
- **Testes E2E** (`e2e/run.mjs`): adaptar para o Emulator; continuam como portão de cada etapa.
- **Não reaproveitar**: a base de demonstração (`seed.ts`) e a troca de usuário sem senha.

## 6. Fora deste plano

Integração com o Tiny ERP (D-16), multiloja e aplicativo nativo.
