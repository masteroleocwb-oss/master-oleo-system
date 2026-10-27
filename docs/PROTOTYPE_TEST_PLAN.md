# Plano e resultado dos testes do protótipo

> Ambiente: protótipo isolado (`prototype/`), dados fictícios, sem conexão com a base de produção.
> Última execução completa: **26/10/2026**, no macOS com Node 25 e Chrome do sistema (puppeteer-core).

## 1. Resumo

| Camada | Ferramenta | Resultado |
| --- | --- | --- |
| Regras de domínio | vitest (`src/domain/dominio.test.ts`) | **16/16** |
| Camada de serviço: permissões, transação, projeção | vitest (`src/data/api.test.ts`) | **15/15** |
| Fluxos ponta a ponta no navegador | puppeteer (`e2e/run.mjs`) | **17/17 cenários** |
| Isolamento: nenhuma referência a Firebase/Google/credenciais | `scripts/check-isolamento.mjs` | **OK** |
| Build de produção do protótipo | `tsc -b && vite build` | **OK** (JS 381 kB, 114 kB gzip) |
| Requisições de rede fora do protótipo durante o E2E | monitor do puppeteer | **0** |
| Erros de JavaScript durante o E2E | monitor do puppeteer | **0** |

Como rodar:

```bash
cd prototype && npm test && npm run test:e2e && npm run check:isolamento
```

O E2E sobe o Vite em `127.0.0.1:5199`, usa o Chrome instalado (`/Applications/Google Chrome.app`; outro caminho pela variável `CHROME_PATH`) e grava capturas e `resultados.json` em `prototype/e2e/out/`. A pasta é limpa a cada execução.

## 2. Fluxos obrigatórios (seção 20 do pedido)

| # | Fluxo | Como é testado (automático) | Resultado | Captura |
| --- | --- | --- | --- | --- |
| 1 | OS completa: abrir → iniciar → verificar todos os itens → evidência → finalizar checklist → serviços → concluir → histórico → relatório | Vendedor cadastra um veículo novo (`QAT1E23`) e abre a OS; o mecânico da vez assume; marca os 14 itens (pastilhas como Prioritário, com foto e recomendação); conclui o checklist; registra serviços e KM; finaliza; confere o histórico e o relatório | ✓ | `f1-*.png` |
| 2 | Checklist incompleto lista exatamente o que falta | Tenta concluir com itens pendentes; confere a lista nominal de pendências e os links para cada item | ✓ | `f2-pendencias.png` |
| 3 | Foto obrigatória bloqueia e libera | Item em Prioritário sem foto não salva ("foto obrigatória"); depois de anexar, salva | ✓ | `f3-sem-foto.png` |
| 4 | Duas OS do mesmo veículo | Segunda OS pela busca de placa (reaproveita o cadastro, mostra "Últimas visitas"); a linha do tempo mostra as duas | ✓ | `f4-historico.png` |
| 5 | Próxima manutenção por regra validada | Óleo trocado a 50.000 km → previsão 60.000 km / +12 meses com origem "Regra interna"; pastilhas sem regra → "Acompanhar" com origem "Recomendação do profissional" | ✓ | `f5-proximas.png` |
| 6 | Link do cliente | Gera link (token de 22 caracteres); a página pública mostra recomendações, serviços e próximas manutenções e **não** mostra telefone, sobrenome, R$, observação interna, score nem vendedor; liderança **oculta a foto** e ela sai do relatório; revoga; o link e um número de OS usado como token mostram "Este link não está disponível" | ✓ | `f6-relatorio.png` |
| 7 | Permissões | Mecânico recebe "Acesso não permitido" em metas, políticas, admin, liderança e nova OS; liderança vê Liderança e Metas, não vê Administração nem "Aprovar como vigente"; comercial não abre OS; direção abre o Admin | ✓ | `f7-negado.png` |
| 8 | Meta: criar, mudar vigência, versão anterior preservada | Liderança cria o rascunho; direção aprova; liderança propõe alvo 15 com vigência futura; direção aprova; confere v1 encerrada (alvo 10) e v2 aprovada (alvo 15) | ✓ | `f8-versoes.png` |
| 9 | Ocorrência | Liderança registra; manda para revisão; direção aprova com observação; aplica; o histórico mostra cada passo e o autor. A manifestação/contestação do mecânico é coberta no teste unitário e no roteiro manual | ✓ | `f9-historico.png` |
| 10 | Integridade | Toda requisição do navegador é registrada; o teste falha se alguma sair de `127.0.0.1:5199` (exceto `data:`/`blob:`). Além disso, a checagem estática não encontra `firebase`, `firestore`, `gstatic`, `googleapis`, o id do projeto nem chaves `AIza…` | ✓ | — |

## 3. Erros, dados ausentes, permissões e celular

| Cenário | Como é testado | Resultado |
| --- | --- | --- |
| Erro de salvamento | Liga "falhar o próximo salvamento" nos controles da demo; o item mostra "Falhou — tentar de novo"; ao tentar de novo, salva | ✓ |
| Formulário incompleto | Salvar a Nova OS vazia mostra "Falta preencher" e o motivo | ✓ |
| Dados ausentes | OS, veículo e rota inexistentes mostram mensagem própria, sem tela branca | ✓ |
| Rascunho | Preenche a Nova OS, recarrega a página, recupera o rascunho | ✓ |
| Permissão insuficiente na camada de dados | Testes unitários chamam o serviço direto (sem tela) com o perfil errado e esperam `ErroPermissao` | ✓ |
| Navegação completa | Abre todos os itens de menu de todos os perfis e falha em erro de JS ou "Página não encontrada" | ✓ |
| Celular (390 px) | Operação, checklist e relatório sem rolagem horizontal; checklist marcável | ✓ (`mobile-*.png`) |
| Tablet (768 px) | Menus e telas principais sem rolagem horizontal | ✓ |

## 4. Testes unitários — o que cobrem

**Domínio** (`dominio.test.ts`):

- Checklist:
  - todos os itens começam "A verificar", sem pré-preenchimento;
  - itens de câmbio por tipo de câmbio;
  - justificativa e observação obrigatórias;
  - o histórico acumula alterações;
  - lista exata de pendências.
- Manutenção: sem regra validada não inventa km nem data; com regra, calcula e classifica (futura, próxima, vencida, acompanhar).
- Metas:
  - não aceita vigência no passado nem rascunho duplicado;
  - rascunho não vale;
  - aprovar encerra a anterior na véspera sem reescrever.
- Ocorrências: nada é aplicado sem a direção; só o profissional envolvido contesta.
- Remuneração: cálculo da proposta e da vigente (faixa pelo total ajustado, teto de câmbio); descontos do score.
- Permissões, token de 128 bits e placa antiga/Mercosul.

**Serviço** (`api.test.ts`):

- Numeração transacional sem repetição com aberturas simultâneas; mecânico não abre OS; falha de salvamento não deixa nada pela metade.
- Rodízio:
  - fora da vez não assume;
  - almoço não perde posição;
  - ninguém marca a ausência de outro;
  - designar fora da ordem exige motivo;
  - retorno vai para o mecânico original.
- Execução:
  - só o executor registra;
  - foto obrigatória validada no serviço;
  - não conclui com pendência;
  - não finaliza sem checklist e KM;
  - KM menor que o último é recusado.
- Auditoria não altera a inspeção; ninguém audita a si mesmo.
- Relatório público:
  - projeção com as chaves exatas;
  - revogado, expirado e inexistente são iguais;
  - contagem de acessos;
  - permissão de gerar e revogar.
- Gestão:
  - troca de placa mantém o histórico e a busca pela placa antiga;
  - ocorrência com decisão humana;
  - exceção autorizada não conta como completo.

## 5. Problemas encontrados e corrigidos durante os testes

| # | Problema | Como apareceu | Correção |
| --- | --- | --- | --- |
| 1 | Ações sem retorno (concluir checklist, revogar, criar meta…) eram tratadas como falha pela tela: não navegavam e as janelas não fechavam | E2E, Fluxos 1, 6, 8 | `useAcao.executar` devolve `true` quando a ação termina sem erro; o E2E passou a conferir que a janela fecha |
| 2 | No modo de desenvolvimento (React StrictMode), o item ficava em "Salvando…" para sempre | E2E, Fluxo 1 | A referência "montado" é restaurada dentro do efeito |
| 3 | Recolher um item perdia a escolha ainda não salva | Teste manual no celular | O editor do item fica montado e só é escondido |
| 4 | Rascunho da Nova OS não era salvo enquanto o aviso de rascunho antigo estava aberto | E2E, rascunho | Digitar descarta o rascunho antigo e salva o novo; o aviso explica isso |
| 5 | Erro 404 do favicon no console | E2E, monitor de rede | Favicon próprio (gota do logo) |
| 6 | "Fluido de freio" duplicado na base de demonstração | Revisão visual | Correção no `seed.ts` |
| 7 | Data com todas as palavras em maiúscula ("Segunda-Feira, 26 De Outubro") | Revisão visual | Só a primeira letra |
| 8 | Fotos pequenas demais no relatório do cliente | Revisão visual | Galeria com fotos maiores |
| 9 | Função de ocultar foto do cliente existia no serviço mas não tinha botão | Revisão para esta documentação | Botão "Ocultar do cliente / Mostrar ao cliente" na aba Fotos (liderança/direção) + verificação no Fluxo 6 |
| 10 | Placa de teste inválida no E2E (`E2E1A11`) | E2E (o app recusou corretamente) | Placa de teste `QAT1E23` |
| 11 | Clique do puppeteer falhava durante a rolagem suave | E2E intermitente | Clique pelo DOM depois de `scrollIntoView` |
| 12 | Fluxo 8 intermitente ao esperar o aviso (toast) | E2E, 1 em 3 execuções | Espera pelo estado gravado em vez do aviso |

## 6. Roteiro de teste manual por perfil

Rode `npm run dev` em `prototype/` e abra http://127.0.0.1:5180. Use **Controles da demo › Restaurar dados da demo** para recomeçar.

### Vendedor — Igor Martins

1. Entre como Igor e abra **Nova OS**.
2. Busque `EXM` e escolha um veículo. Confira as "Últimas visitas".
3. Marque Óleo de motor e Filtro de óleo, informe o valor e salve. A OS entra na fila.
4. Abra uma OS concluída hoje › **Relatório do cliente** › escolha 30 dias › **Gerar link do relatório** › **Abrir**. Confira que não há valores nem telefone.

### Mecânico — André Costa

1. Entre como André. Se for a vez dele, **Assumir esta OS**; se não, a tela explica de quem é a vez.
2. No checklist, marque OK nos itens. Em um item, escolha **Prioritário** sem foto: o item não salva.
3. Use **Usar foto demonstrativa**, escreva a recomendação e salve.
4. Tente **Concluir checklist** com itens pendentes e confira a lista do que falta.
5. Complete os itens, conclua, registre os serviços e o KM e **Finalize**.
6. Abra **Meu mês**: meta, projeção e o "?" de cada indicador.
7. Tente abrir `#/metas` ou `#/admin`: aparece "Acesso não permitido".

### Comercial — Helena Duarte

1. Abra **Recomendações** › **Em aberto**.
2. Abra uma recomendação, veja a foto e marque **Aceitou** com valor, ou **Avaliar depois**.

### Liderança — Fernanda Alves

1. **Liderança › Visão**: pendências do dia e indicadores da liderança.
2. **Auditoria**: audite um checklist de outro mecânico e peça correção de 1 item. Entre como o mecânico e veja o alerta.
3. **Exceções**: decida um pedido de exceção; declare um dia de exceção com motivo.
4. **Ocorrências**: registre uma ocorrência com OS vinculada e mande para revisão. Entre como o mecânico em **Meu mês** e registre a manifestação.
5. **Metas**: crie uma meta (rascunho) e proponha um ajuste com vigência futura.
6. **Metas › Políticas**: simule um mecânico nos cenários de 60k/90k/140k. O botão de aprovar fica desativado.
7. Na Operação, **Designar mecânico** fora da vez: o motivo é obrigatório.

### Direção — Gustavo Reis

1. **Metas**: aprove o rascunho e o ajuste; abra as versões.
2. **Liderança › Ocorrências**: aprove ou rejeite com observação e aplique.
3. **Admin**:
   - **Catálogo**: altere a instrução de um item e veja a versão subir.
   - **Intervalos**: confira a origem de cada regra.
   - **Usuários**: desative e reative um usuário.
   - **Histórico**: filtre e veja o antes/depois.
   - **Links**: revogue um link.
4. Corrija a placa de um veículo e depois busque pela placa antiga.

### Cliente (sem conta)

- Link ativo: `#/r/Dm0Ativo7xQ2pL9vR4tY1w`.
- Link com histórico de várias visitas: `#/r/Dm0Histo4aZ6sX8dC2fV5g`.
- Revogado (`#/r/Dm0Revog3kP8sN2bV6cX0z`) e expirado (`#/r/Dm0Expir5mQ1wE7rT3yU9i`): devem mostrar a mesma mensagem.

### Celular

Use o modo de dispositivo do navegador (390 × 844) ou abra no telefone pela rede local (`npm run dev -- --host`). Percorra o checklist no modo **Compacto** e o relatório do cliente.

## 7. Limitações conhecidas dos testes

- A troca de usuário substitui o login; as regras de segurança do Firestore só podem ser testadas na Fase B (Emulator).
- A foto real usa a câmera do aparelho; o E2E usa a foto demonstrativa.
- Leitor de tela e contraste não foram auditados.
- O desempenho foi observado em notebook; não foi medido em celular de entrada.
- A base de demonstração anterior à sessão não tem trilha de eventos completa (a aba Histórico avisa).
