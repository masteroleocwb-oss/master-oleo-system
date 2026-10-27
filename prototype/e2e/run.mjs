// Testes ponta a ponta do protótipo (Fluxos 1–10 do pedido + erros, permissões e celular).
// Sobe o Vite localmente, dirige o Chrome instalado e registra TODA requisição de rede:
// qualquer host fora de 127.0.0.1 reprova o teste (Fluxo 10 — integridade).
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { createServer } from 'vite';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(RAIZ, 'e2e', 'out');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORTA = 5199;
const BASE = `http://127.0.0.1:${PORTA}/`;

const server = await createServer({ root: RAIZ, logLevel: 'error', server: { port: PORTA, host: '127.0.0.1', strictPort: true } });
await server.listen();
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-first-run'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 900 });

const externas = [];
const errosPagina = [];
page.on('request', r => { const u = r.url(); if (!u.startsWith(BASE) && !u.startsWith('data:') && !u.startsWith('blob:')) externas.push(u); });
page.on('pageerror', e => errosPagina.push(e.message));
page.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) errosPagina.push(m.text()); });

// ───────── helpers ─────────
const esperar = ms => new Promise(r => setTimeout(r, ms));
const visivel = `e => e.offsetParent !== null && !e.disabled`;
const ir = async hash => { await page.goto(BASE + '#' + hash); await esperar(150); };
const texto = () => page.evaluate(() => document.body.innerText);
const aguardarTexto = (t, timeout = 8000) => page.waitForFunction(x => document.body.innerText.includes(x), { timeout }, t);
const semTexto = async t => { if ((await texto()).includes(t)) throw new Error(`Texto inesperado na tela: "${t}"`); };
async function clicar(rotulo, { escopo = 'body', seletor = 'button, a', exato = false } = {}) {
  await page.waitForFunction((esc, sel, r, ex, vis) => {
    const ok = eval(vis);
    return [...document.querySelectorAll(esc)].some(c => [...c.querySelectorAll(sel)].some(e => ok(e) && (ex ? e.textContent.trim() === r : e.textContent.includes(r))));
  }, { timeout: 8000 }, escopo, seletor, rotulo, exato, visivel);
  await page.evaluate((esc, sel, r, ex, vis) => {
    const ok = eval(vis);
    for (const c of document.querySelectorAll(esc)) {
      const el = [...c.querySelectorAll(sel)].find(e => ok(e) && (ex ? e.textContent.trim() === r : e.textContent.includes(r)));
      if (el) { el.click(); return; }
    }
  }, escopo, seletor, rotulo, exato, visivel);
  await esperar(80);
}
/** Clica num botão dentro do cartão (section.card) que contém um texto. */
async function clicarNoCartao(textoCartao, rotulo) {
  await page.waitForFunction((tc, r) => [...document.querySelectorAll('section.card, .os-card')].some(c => c.innerText.includes(tc) && [...c.querySelectorAll('button')].some(b => b.textContent.includes(r) && !b.disabled)), { timeout: 8000 }, textoCartao, rotulo);
  await page.evaluate((tc, r) => {
    const c = [...document.querySelectorAll('section.card')].find(x => x.innerText.includes(tc) && [...x.querySelectorAll('button')].some(b => b.textContent.includes(r) && !b.disabled));
    [...c.querySelectorAll('button')].find(b => b.textContent.includes(r) && !b.disabled).click();
  }, textoCartao, rotulo);
  await esperar(80);
}
async function preencher(sel, valor) {
  await page.waitForSelector(sel, { visible: true });
  await page.evaluate((s, v) => {
    const el = document.querySelector(s);
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
    el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  }, sel, valor);
}
/** Toque num elemento (via DOM, imune a rolagem suave em andamento). */
async function tocar(sel) {
  await page.waitForSelector(sel, { visible: true });
  await page.$eval(sel, e => { e.scrollIntoView({ block: 'center' }); e.click(); });
  await esperar(60);
}
const semSheet = () => page.waitForFunction(() => !document.querySelector('.sheet'), { timeout: 5000 });
async function entrar(id) { await ir('/login'); await page.waitForSelector(`[data-user="${id}"]`); await tocar(`[data-user="${id}"]`); await esperar(200); }
const db = () => page.evaluate(() => JSON.parse(localStorage.getItem('mo-proto:db:v1')));
const foto = nome => page.screenshot({ path: join(OUT, `${nome}.png`) });
const PRIMEIRO = { André: 'u_m1', Rafael: 'u_m2', Diego: 'u_m3', Eduardo: 'u_m4', Marcos: 'u_m5' };

async function marcarItem(id, estado) {
  const aberto = await page.$(`[data-item="${id}"] .ck-body:not([hidden])`);
  if (!aberto) await tocar(`[data-item="${id}"] .ck-head`);
  await page.waitForSelector(`[data-item="${id}"] [data-estado="${estado}"]`, { visible: true });
  await tocar(`[data-item="${id}"] [data-estado="${estado}"]`);
}
async function checklistTudoOk(exceto = []) {
  const ids = await page.$$eval('[data-item]', es => es.map(e => e.getAttribute('data-item')));
  for (const id of ids) {
    if (exceto.includes(id)) continue;
    const ja = await page.$eval(`[data-item="${id}"] .ck-head`, e => !e.textContent.includes('A verificar'));
    if (ja) continue;
    await marcarItem(id, 'ok');
    await page.waitForFunction(i => !document.querySelector(`[data-item="${i}"] .ck-head`).textContent.includes('A verificar'), { timeout: 8000 }, id);
  }
}
async function semRolagemHorizontal(rotulo) {
  const r = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: window.innerWidth }));
  if (r.sw > r.w + 1) throw new Error(`Rolagem horizontal em ${rotulo}: ${r.sw}px > ${r.w}px`);
}

// ───────── execução ─────────
const resultados = [];
async function fluxo(nome, fn) {
  const t0 = Date.now();
  try { await fn(); resultados.push({ nome, ok: true, ms: Date.now() - t0 }); console.log(`  ✓ ${nome}`); }
  catch (e) { resultados.push({ nome, ok: false, erro: e.message }); console.log(`  ✗ ${nome}\n      ${e.message}`); await foto(`falha-${nome.slice(0, 20).replace(/\W+/g, '-')}`).catch(() => {}); }
}

await page.goto(BASE);
await page.evaluate(() => { localStorage.clear(); localStorage.setItem('mo-proto:demo-ctrl', JSON.stringify({ falharProximo: false, offline: false, latenciaMs: 0 })); });
await page.goto(BASE + '#/login');
await page.reload();

const ctx = { placa: 'QAT1E23', osId: null, numero: null, token: null };

console.log('Fluxos obrigatórios');
await fluxo('Fluxo 1 — OS completa (abrir → checklist → evidência → finalizar → histórico → relatório)', async () => {
  await entrar('u_ven');
  await ir('/os/nova');
  await clicar('Cadastrar veículo novo');
  await preencher('#placa', ctx.placa); await preencher('#marca', 'Fiat'); await preencher('#modelo', 'Argo'); await preencher('#ano', '2021');
  await preencher('#motor', '1.3'); await preencher('#cli-nome', 'Cliente Teste Automatizado'); await preencher('#cli-tel', '(41) 90000-0001'); await preencher('#valor', '350');
  await clicar('Salvar e colocar na fila');
  await aguardarTexto('criada e colocada na fila');
  const d = await db();
  const os = d.os.find(o => d.veiculos.find(v => v.id === o.veiculoId)?.placa === ctx.placa);
  ctx.osId = os.id; ctx.numero = os.numero;
  await foto('f1-os-criada');

  await ir('/operacao');
  const vez = await page.$$eval('.badge', bs => bs.map(b => b.textContent).find(t => t.startsWith('Vez:')));
  const mec = PRIMEIRO[vez.replace('Vez: ', '').trim()];
  ctx.mec1 = mec;
  await entrar(mec);
  await page.waitForSelector(`[data-os="${ctx.numero}"]`);
  await page.evaluate(n => [...document.querySelector(`[data-os="${n}"]`).parentElement.querySelectorAll('button')].find(b => b.textContent.includes('Assumir')).click(), ctx.numero);
  await aguardarTexto('Checklist técnico');
  await foto('f1-checklist-inicio');
});

await fluxo('Fluxo 2 — Checklist incompleto indica exatamente os itens pendentes', async () => {
  const ids = await page.$$eval('[data-item]', es => es.map(e => e.getAttribute('data-item')));
  for (const id of ids.slice(0, 3)) {
    await marcarItem(id, 'ok');
    await page.waitForFunction(i => !document.querySelector(`[data-item="${i}"] .ck-head`).textContent.includes('A verificar'), {}, id);
  }
  await clicar('Concluir checklist');
  await aguardarTexto(`Faltam ${ids.length - 3} pendência(s) para concluir`);
  const nomes = await page.$$eval('.alert-box li a', as => as.map(a => a.textContent));
  const esperado = (await db()).checklists.find(c => c.osId === ctx.osId).defs.slice(3).map(d => d.nome).slice(0, 8);
  if (JSON.stringify(nomes) !== JSON.stringify(esperado)) throw new Error(`Pendências listadas ${nomes} ≠ ${esperado}`);
  await foto('f2-pendencias');
});

await fluxo('Fluxo 3 — Evidência obrigatória bloqueia até anexar a foto', async () => {
  await marcarItem('pastilhas', 'prioritario');
  await preencher('#rec-pastilhas', 'Trocar pastilhas dianteiras');
  await clicar('Salvar item', { escopo: '[data-item="pastilhas"]' });
  await aguardarTexto('Foto obrigatória para "Prioritário"');
  await clicar('Concluir checklist');
  await page.waitForFunction(() => [...document.querySelectorAll('.alert-box li')].some(l => l.textContent.includes('Pastilhas de freio')));
  await foto('f3-sem-foto');
  if (!(await page.$('[data-item="pastilhas"] .ck-body:not([hidden])'))) await tocar('[data-item="pastilhas"] .ck-head');
  await page.waitForFunction(() => document.querySelector('[data-item="pastilhas"] [data-estado="prioritario"]').getAttribute('aria-checked') === 'true');
  await tocar('[data-item="pastilhas"] .foto-add');
  await clicar('Usar foto demonstrativa', { escopo: '.sheet' });
  await preencher('#legenda-foto', 'Desgaste acentuado (demo)');
  await clicar('Usar esta foto', { escopo: '.sheet' });
  await aguardarTexto('Foto salva no item');
  await clicar('Salvar item', { escopo: '[data-item="pastilhas"]' });
  await page.waitForFunction(() => document.querySelector('[data-item="pastilhas"] .ck-head').textContent.includes('Prioritário'));
  await checklistTudoOk(['pastilhas']);
  await clicar('Concluir checklist');
  await aguardarTexto('Execução e finalização');
  const d = await db();
  const ev = d.evidencias.find(e => e.osId === ctx.osId);
  if (!ev || ev.itemDefId !== 'pastilhas') throw new Error('Foto não ficou ligada ao item Pastilhas');
});

await fluxo('Fluxo 5 — Próxima manutenção por regra validada (parte 1: registro)', async () => {
  await preencher('#km', '45000');
  await aguardarTexto('Previsto: 55.000 km');
  await aguardarTexto('Regra interna Master Óleo');
  await foto('f5-proximas');
  await clicar('Finalizar OS');
  await aguardarTexto(`OS #${ctx.numero}`);
  await aguardarTexto('Concluída');
  const d = await db();
  const m = d.manutencoes.find(x => x.osOrigemId === ctx.osId && x.servicoKey === 'oleoMotor');
  if (m?.kmPrevisto !== 55000 || !m.dataPrevista) throw new Error('Próxima troca de óleo não registrada com km e data');
  if (!d.manutencoes.some(x => x.osOrigemId === ctx.osId && x.itemDefId === 'pastilhas' && x.origem === 'profissional')) throw new Error('Recomendação do item prioritário não virou acompanhamento');
});

await fluxo('Fluxo 6 — Link do cliente: gerar, ver só o permitido, revogar', async () => {
  await entrar('u_ven');
  await ir(`/os/${ctx.osId}`);
  await clicar('Relatório do cliente');
  await clicar('Gerar link do relatório');
  await aguardarTexto('Link criado');
  const href = await page.$$eval('a', as => as.map(a => a.getAttribute('href')).find(h => h?.startsWith('#/r/')));
  ctx.token = href.slice(4);
  if (!/^[A-Za-z0-9_-]{22}$/.test(ctx.token)) throw new Error('Token fora do padrão: ' + ctx.token);
  await ir(`/r/${ctx.token}`);
  await aguardarTexto('Nossas recomendações');
  const t = await texto();
  for (const deve of ['Pastilhas de freio', 'Trocar pastilhas dianteiras', 'Óleo de motor', 'Próximas manutenções', '55.000 km', 'Olá, Cliente']) if (!t.includes(deve)) throw new Error(`Relatório sem "${deve}"`);
  for (const nao of ['90000-0001', 'Automatizado', 'R$', 'Interna', 'Score', 'Vendedor']) if (t.includes(nao)) throw new Error(`Relatório expõe "${nao}"`);
  if (!(await page.$('.rel img[src^="data:image"]'))) throw new Error('Foto não aparece no relatório');
  await foto('f6-relatorio');
  await entrar('u_lid');
  await ir(`/os/${ctx.osId}`);
  await clicar('Fotos (');
  await clicar('Ocultar do cliente');
  await aguardarTexto('Foto oculta do relatório');
  await ir(`/r/${ctx.token}`);
  await aguardarTexto('Nossas recomendações');
  if (await page.$('.rel img[src^="data:image"]')) throw new Error('Foto oculta continua no relatório');
  await ir(`/os/${ctx.osId}`);
  await clicar('Relatório do cliente');
  await clicar('Revogar', { exato: true });
  await preencher('#motivo-rev', 'Teste automatizado');
  await clicar('Revogar', { escopo: '.sheet-foot', exato: true });
  await aguardarTexto('Link revogado');
  await semSheet();
  await ir(`/r/${ctx.token}`);
  await aguardarTexto('Este link não está disponível');
  await semTexto('Pastilhas');
  await ir('/r/7001');
  await aguardarTexto('Este link não está disponível');
});

await fluxo('Fluxo 4 — Segunda OS do mesmo veículo; histórico mostra as duas', async () => {
  await entrar('u_ven');
  await ir('/os/nova');
  await preencher('#busca-veic', ctx.placa);
  await clicar('Argo', { seletor: 'button.li' });
  await aguardarTexto('Últimas visitas');
  await preencher('#valor', '280');
  await clicar('Salvar e colocar na fila');
  await aguardarTexto('criada e colocada na fila');
  const d1 = await db();
  const os2 = d1.os.filter(o => d1.veiculos.find(v => v.id === o.veiculoId)?.placa === ctx.placa).find(o => o.status === 'aguardando');
  ctx.os2 = os2;
  await entrar('u_lid');
  await ir('/operacao');
  await page.waitForSelector(`[data-os="${os2.numero}"]`);
  await page.evaluate(n => [...document.querySelector(`[data-os="${n}"]`).parentElement.querySelectorAll('button')].find(b => b.textContent.includes('Designar')).click(), os2.numero);
  await clicar('Iniciar com este mecânico', { escopo: '.sheet' });
  await aguardarTexto('OS iniciada');
  const mec = (await db()).os.find(o => o.id === os2.id).mecanicoId;
  await entrar(mec);
  await ir(`/os/${os2.id}/checklist`);
  await aguardarTexto('Checklist técnico');
  await checklistTudoOk();
  await clicar('Concluir checklist');
  await aguardarTexto('Execução e finalização');
  await preencher('#km', '44000');
  await clicar('Finalizar OS');
  await aguardarTexto('KM menor que o último registrado');
  await preencher('#km', '50000');
  await clicar('Finalizar OS');
  await aguardarTexto('Concluída');

  await entrar('u_ven');
  await ir('/veiculos');
  await preencher('#busca-veiculos', ctx.placa.slice(0, 5));
  await clicar('Argo', { seletor: 'a.li' });
  await aguardarTexto('Linha do tempo');
  const t = await texto();
  for (const n of [ctx.numero, os2.numero]) if (!t.includes(`OS #${n}`)) throw new Error(`Linha do tempo sem OS #${n}`);
  await foto('f4-historico');
});

await fluxo('Fluxo 5 — Próxima manutenção (parte 2: histórico mostra a referência correta)', async () => {
  const t = await page.$$eval('section.card', cs => cs.find(c => c.innerText.includes('Próximas manutenções')).innerText);
  if (!t.includes('60.000 km')) throw new Error('Próxima troca de óleo deveria ser 60.000 km');
  if (t.includes('55.000 km')) throw new Error('Referência antiga (55.000 km) deveria estar concluída');
  if (!t.includes('Regra interna Master Óleo')) throw new Error('Origem da regra não exibida');
});

await fluxo('Fluxo 7 — Permissões por perfil', async () => {
  await entrar('u_m1');
  for (const r of ['/metas', '/metas/politicas', '/admin', '/lideranca', '/os/nova']) { await ir(r); await aguardarTexto('Acesso não permitido para o seu perfil'); }
  await foto('f7-negado');
  await entrar('u_lid');
  const nav = await page.$$eval('.sidenav a', as => as.map(a => a.textContent));
  for (const deve of ['Operação', 'Liderança', 'Metas e políticas']) if (!nav.some(n => n.includes(deve))) throw new Error(`Liderança sem menu ${deve}`);
  if (nav.some(n => n.includes('Administração'))) throw new Error('Liderança não deveria ver Administração');
  await ir('/admin'); await aguardarTexto('Acesso não permitido');
  await ir('/metas/politicas'); await aguardarTexto('Simular para um mecânico'); await semTexto('Aprovar como vigente');
  await entrar('u_com');
  await ir('/os/nova'); await aguardarTexto('Acesso não permitido');
  await entrar('u_dir');
  await ir('/admin'); await aguardarTexto('Histórico de ações');
});

await fluxo('Fluxo 8 — Meta: criar, alterar vigência, versão anterior preservada', async () => {
  await entrar('u_lid');
  await ir('/metas');
  await clicar('Criar meta');
  await preencher('#nm-nome', 'Meta automatizada'); await preencher('#nm-alvo', '10'); await preencher('#nm-just', 'Teste');
  await clicar('Criar rascunho', { escopo: '.sheet' });
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('mo-proto:db:v1')).metas.some(m => m.nome === 'Meta automatizada'), { timeout: 8000 });
  await semSheet();
  await entrar('u_dir');
  await ir('/metas');
  await clicarNoCartao('Meta automatizada', 'Aprovar');
  await aguardarTexto('Versão aprovada');
  await entrar('u_lid');
  await ir('/metas');
  await clicarNoCartao('Meta automatizada', 'Propor ajuste');
  const fut = new Date(Date.now() + 12 * 864e5).toISOString().slice(0, 10);
  await preencher('#aj-alvo', '15'); await preencher('#aj-ini', fut); await preencher('#aj-just', 'Ajuste de teste');
  await clicar('Propor', { escopo: '.sheet-foot', exato: true });
  await aguardarTexto('Proposta enviada para aprovação');
  await semSheet();
  await entrar('u_dir');
  await ir('/metas');
  await clicarNoCartao('Meta automatizada', 'Aprovar');
  await aguardarTexto('Versão aprovada');
  const m = (await db()).metas.find(x => x.nome === 'Meta automatizada');
  if (m.versoes.length !== 2 || m.versoes[0].status !== 'encerrada' || m.versoes[0].alvo !== 10 || m.versoes[1].alvo !== 15) throw new Error('Histórico de versões incorreto: ' + JSON.stringify(m.versoes));
  await page.evaluate(() => [...document.querySelectorAll('section.card')].find(c => c.innerText.includes('Meta automatizada')).querySelector('details').open = true);
  await foto('f8-versoes');
});

await fluxo('Fluxo 9 — Ocorrência: registrar → revisão → decisão → aplicação → histórico', async () => {
  await entrar('u_lid');
  await ir('/lideranca/ocorrencias');
  await clicar('Registrar', { exato: true });
  await preencher('#oc-prof', 'u_m3'); await preencher('#oc-cat', '4'); await preencher('#oc-desc', 'Bancada 2 com resíduo de óleo ao fim do turno (teste).');
  await clicar('Registrar', { escopo: '.sheet-foot', exato: true });
  await aguardarTexto('Registrada. Envie para revisão');
  await semSheet();
  await clicarNoCartao('resíduo de óleo', 'Enviar para revisão');
  await aguardarTexto('Enviada para revisão');
  await entrar('u_dir');
  await ir('/lideranca/ocorrencias');
  await clicarNoCartao('resíduo de óleo', 'Aprovar');
  await preencher('#obs-dec', 'Fato confirmado pela liderança.');
  await clicar('Aprovar ocorrência', { escopo: '.sheet-foot' });
  await aguardarTexto('Decisão registrada');
  await clicarNoCartao('resíduo de óleo', 'Aplicar efeito');
  await clicar('Aplicar efeito', { escopo: '.sheet-foot' });
  await aguardarTexto('Decisão registrada');
  await ir('/admin/historico');
  await preencher('#h-f', 'Oficina suja');
  await aguardarTexto('aplicada');
  const t = await texto();
  for (const s of ['em_revisao', 'aprovada', 'aplicada']) if (!t.includes(`"Oficina suja": ${s}`)) throw new Error(`Histórico sem a etapa ${s}`);
  await foto('f9-historico');
});

console.log('Erros, dados ausentes e formulários');
await fluxo('Erro de salvamento: mostra falha e permite tentar de novo', async () => {
  await entrar('u_m1');
  const osA = (await db()).os.find(o => o.status === 'andamento' && o.mecanicoId === 'u_m1');
  await ir(`/os/${osA.id}/checklist`);
  await aguardarTexto('Checklist técnico');
  await clicar('Controles da demo');
  await page.evaluate(() => document.querySelector('.sheet input[type=checkbox]').click());
  await clicar('Fechar', { escopo: '.sheet' });
  const pend = await page.$$eval('[data-item]', es => es.find(e => e.querySelector('.ck-head').textContent.includes('A verificar')).getAttribute('data-item'));
  await marcarItem(pend, 'ok');
  await aguardarTexto('Não foi possível salvar');
  await aguardarTexto('Falha ao salvar');
  await foto('erro-salvamento');
  await clicar('Tentar salvar de novo', { escopo: `[data-item="${pend}"]` });
  await page.waitForFunction(i => document.querySelector(`[data-item="${i}"] .ck-head`).textContent.includes('OK'), {}, pend);
  const it = (await db()).checklists.find(c => c.id === osA.checklistId).itens[pend];
  if (it.estado !== 'ok' || it.historico.length !== 1) throw new Error('Item não salvo corretamente após nova tentativa');
});

await fluxo('Formulário incompleto e dados ausentes', async () => {
  await entrar('u_ven');
  await ir('/os/nova');
  await clicar('Salvar e colocar na fila');
  await aguardarTexto('Falta preencher');
  await aguardarTexto('Escolha um veículo ou cadastre um novo.');
  await ir('/os/inexistente'); await aguardarTexto('OS não encontrada');
  await ir('/veiculos/inexistente'); await aguardarTexto('Veículo não encontrado');
  await ir('/rota/que/nao/existe'); await aguardarTexto('Página não encontrada');
});

await fluxo('Rascunho da Nova OS é recuperado após recarregar', async () => {
  await ir('/os/nova');
  await preencher('#busca-veic', 'Mariana');
  await esperar(900);
  await page.reload();
  await aguardarTexto('Há um cadastro não finalizado neste aparelho');
  await clicar('Recuperar rascunho');
  const v = await page.$eval('#busca-veic', e => e.value);
  if (v !== 'Mariana') throw new Error('Rascunho não recuperado');
  await clicar('Cancelar');
});

console.log('Navegação e celular');
await fluxo('Todos os menus de todos os perfis abrem sem erro', async () => {
  for (const u of ['u_m2', 'u_ven', 'u_com', 'u_lid', 'u_dir']) {
    await entrar(u);
    const rotas = await page.$$eval('.sidenav a', as => as.map(a => a.getAttribute('href')));
    for (const r of rotas) { await page.goto(BASE + r); await esperar(120); const t = await texto(); if (/Página não encontrada|Acesso não permitido/.test(t)) throw new Error(`${u} → ${r}`); }
  }
  for (const r of ['visao', 'mecanicos', 'auditoria', 'excecoes', 'ocorrencias', 'retornos', 'planos', 'gestao']) { await ir(`/lideranca/${r}`); await esperar(80); }
  for (const r of ['busca', 'catalogo', 'intervalos', 'usuarios', 'historico', 'links']) { await ir(`/admin/${r}`); await esperar(80); }
});

await fluxo('Celular (390 px): sem rolagem horizontal e checklist utilizável', async () => {
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await entrar('u_m1');
  for (const r of ['/operacao', '/performance', '/veiculos/v1']) { await ir(r); await esperar(200); await semRolagemHorizontal(r); }
  const osA = (await db()).os.find(o => o.status === 'andamento' && o.mecanicoId === 'u_m1');
  await ir(`/os/${osA.id}/checklist`);
  await semRolagemHorizontal('checklist');
  const alvo = await page.$eval('[data-item] .ck-head', e => e.getBoundingClientRect().height);
  if (alvo < 48) throw new Error(`Área de toque pequena no item: ${alvo}px`);
  if (!(await page.$eval('.bottomnav', e => e.offsetParent !== null || getComputedStyle(e).display !== 'none'))) throw new Error('Menu inferior ausente');
  await foto('mobile-checklist');
  await entrar('u_lid');
  for (const r of ['/lideranca', '/lideranca/ocorrencias', '/metas']) { await ir(r); await esperar(200); await semRolagemHorizontal(r); }
  await ir(`/r/Dm0Ativo7xQ2pL9vR4tY1w`); await esperar(200); await semRolagemHorizontal('relatório');
  await foto('mobile-relatorio');
  await page.setViewport({ width: 768, height: 1024 });
  await ir('/lideranca'); await esperar(200); await semRolagemHorizontal('tablet liderança');
  await page.setViewport({ width: 1280, height: 900 });
});

await fluxo('Fluxo 10 — Integridade: nenhuma requisição fora do protótipo', async () => {
  if (externas.length) throw new Error('Requisições externas: ' + [...new Set(externas)].slice(0, 5).join(', '));
  const html = await page.content();
  if (/firebase|firestore|gstatic|masteroleo-1ed99/i.test(html)) throw new Error('Referência a Firebase na página');
});

await fluxo('Sem erros de JavaScript durante os testes', async () => {
  if (errosPagina.length) throw new Error(errosPagina.slice(0, 5).join(' | '));
});

await browser.close();
await server.close();
writeFileSync(join(OUT, 'resultados.json'), JSON.stringify({ em: new Date().toISOString(), resultados, requisicoesExternas: externas }, null, 2));
const falhas = resultados.filter(r => !r.ok);
console.log(`\n${resultados.length - falhas.length}/${resultados.length} cenários aprovados. Capturas em e2e/out/.`);
process.exit(falhas.length ? 1 : 0);
