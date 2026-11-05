// Teste ponta a ponta do PILOTO contra o Firebase Emulator (nada toca a base real).
// Sobe: emuladores (auth 9099, firestore 8080, storage 9199) com firebase/*.rules,
// sistema novo em modo base real (VITE_BASE=real, porta 5180) e o sistema atual (index.html da main, porta 5190).
// Confere que os dois sistemas trabalham sobre as MESMAS OS, no formato do sistema atual.
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const P = 'masteroleo-1ed99';
const NOVO = 'http://127.0.0.1:5180/?emulador=1';
const ATUAL = 'http://127.0.0.1:5190/?emulador=1';
const OUT = join(dirname(fileURLToPath(import.meta.url)), 'out-piloto'); mkdirSync(OUT, { recursive: true });
const FS = `http://127.0.0.1:8080/v1/projects/${P}/databases/(default)/documents`;
const DONO = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };

// ───── Firestore REST (como "dono", ignora as regras: só para preparar e conferir) ─────
const val = v => v === null ? { nullValue: null } : typeof v === 'boolean' ? { booleanValue: v } : typeof v === 'number' ? (Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v })
  : typeof v === 'string' ? { stringValue: v } : Array.isArray(v) ? { arrayValue: { values: v.map(val) } } : { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, val(x)])) } };
const de = x => 'nullValue' in x ? null : 'booleanValue' in x ? x.booleanValue : 'integerValue' in x ? Number(x.integerValue) : 'doubleValue' in x ? x.doubleValue : 'stringValue' in x ? x.stringValue
  : 'timestampValue' in x ? x.timestampValue : 'arrayValue' in x ? (x.arrayValue.values || []).map(de) : 'mapValue' in x ? Object.fromEntries(Object.entries(x.mapValue.fields || {}).map(([k, y]) => [k, de(y)])) : undefined;
const gravarDoc = async (caminho, dados) => { const r = await fetch(`${FS}/${caminho}`, { method: 'PATCH', headers: DONO, body: JSON.stringify({ fields: Object.fromEntries(Object.entries(dados).map(([k, v]) => [k, val(v)])) }) }); if (!r.ok) throw new Error(`seed ${caminho}: ${await r.text()}`); };
const lerDoc = async caminho => { const r = await fetch(`${FS}/${caminho}`, { headers: DONO }); if (!r.ok) return null; const j = await r.json(); return Object.fromEntries(Object.entries(j.fields || {}).map(([k, v]) => [k, de(v)])); };
const listar = async col => { const r = await fetch(`${FS}/${col}?pageSize=300`, { headers: DONO }); const j = await r.json(); return (j.documents || []).map(d => ({ id: d.name.split('/').pop(), ...Object.fromEntries(Object.entries(d.fields || {}).map(([k, v]) => [k, de(v)])) })); };
const criarConta = async (email, senha) => { const r = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=x', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: senha, returnSecureToken: true }) }); return (await r.json()).localId; };

const hojeBR = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
const ontem = new Date(Date.now() - 864e5);
const ontemBR = ontem.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
const hojeISO = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

async function preparar() {
  await fetch(`http://127.0.0.1:8080/emulator/v1/projects/${P}/databases/(default)/documents`, { method: 'DELETE' });
  await fetch(`http://127.0.0.1:9099/emulator/v1/projects/${P}/accounts`, { method: 'DELETE' });
  const pessoas = [
    { email: 'dir@teste.dev', nome: 'Direcao Teste', perfil: 'direcao', nomeLegado: 'Leo' },
    { email: 'vend@teste.dev', nome: 'Fausto Vendas', perfil: 'vendedor', nomeLegado: 'Faust' },
    { email: 'caio@teste.dev', nome: 'Caio Ferreira', perfil: 'mecanico' },
    { email: 'joi@teste.dev', nome: 'Joilson Souza', perfil: 'mecanico' },
  ];
  const ids = {};
  for (const p of pessoas) {
    ids[p.email] = await criarConta(p.email, 'tigre-azul-77');
    await gravarDoc(`usuarios/${ids[p.email]}`, { nome: p.nome, email: p.email, perfil: p.perfil, ativo: true, trocarSenha: false, ...(p.nomeLegado ? { nomeLegado: p.nomeLegado } : {}) });
  }
  await gravarDoc('sistema/inicio', { uid: ids['dir@teste.dev'], email: 'dir@teste.dev', em: new Date().toISOString() });
  await gravarDoc('config/global', { fatorAjuste: 100, rodizio: { dia: hojeISO, status: {} }, comissao: { ajustes: {} } });
  await gravarDoc('config/contadores', { numeroOrdem: 7005 });
  const base = { cliente: 'Cliente Legado', tel: '(41) 99999-1111', placa: 'ABC-1234', marca: 'VW', modelo: 'Gol', motor: '1.0', ano: '2015', cambio: 'Manual', combustivel: 'Flex', cpf: '', dataNascimento: '',
    oleoMotor: true, oleoMarca: 'Marca X', oleoQuantidade: '4', filtroOleo: true, filtroOleoTipo: 'PH1', execFreioSemQuestionar: true, execCambioSemQuestionar: true, valorInicial: '250.00' };
  // Visita de ontem, feita no sistema atual pelo Caio.
  await gravarDoc('orders/legado1', { ...base, numeroOrdem: 7004, status: 'concluido', vendedor: 'Faust', lubrificador: 'Caio', dataHora: new Date(ontem.getTime() - 3600e3).toISOString(),
    inicio: `${ontemBR}, 09:00:00`, fim: `${ontemBR}, 09:40:00`, km: '80000', upsells: {}, valorUpsell: 0, valorTotal: 250, fezUpsell: false });
  // OS aberta hoje no sistema atual, ainda aguardando.
  await gravarDoc('orders/legado2', { ...base, placa: 'XYZ9A88', cliente: 'Outro Cliente', numeroOrdem: 7005, status: 'aguardando', vendedor: 'Faust', lubrificador: '', dataHora: new Date(Date.now() - 600e3).toISOString() });
  return ids;
}

// ───── Navegador ─────
const b = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new' });
const reais = [], errosJs = [];
const nova = async () => {
  const ctx = await b.createBrowserContext(); const p = await ctx.newPage();
  await p.setViewport({ width: 1280, height: 900 });
  p.on('request', r => { const u = new URL(r.url()); if (/googleapis\.com|firebaseio|firebasestorage\.app|firebaseapp\.com/.test(u.hostname)) reais.push(u.href); });
  p.on('pageerror', e => errosJs.push(e.message));
  p.on('dialog', d => d.accept());
  return p;
};
const esperar = ms => new Promise(r => setTimeout(r, ms));
const txt = p => p.evaluate(() => document.body.innerText);
const ate = async (p, t, ms = 20000) => { try { await p.waitForFunction(x => document.body.innerText.includes(x), { timeout: ms }, t); } catch { throw new Error(`Não apareceu: "${t}"\n--- tela ---\n${(await txt(p)).slice(0, 900)}`); } };
const preencher = async (p, sel, v) => { await p.waitForSelector(sel, { visible: true }); await p.evaluate((s, v) => { const e = document.querySelector(s); const pr = e.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : e.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(pr, 'value').set.call(e, v); e.dispatchEvent(new Event(e.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); }, sel, v); };
const clicar = (p, rot, escopo = 'body') => p.evaluate((r, es) => { const e = [...document.querySelector(es).querySelectorAll('button')].find(x => x.textContent.trim().startsWith(r) && !x.disabled); if (!e) throw new Error('Botão não encontrado: ' + r); e.scrollIntoView({ block: 'center' }); e.click(); }, rot, escopo);
const tocar = async (p, sel) => { await p.waitForSelector(sel, { visible: true }); await p.$eval(sel, e => { e.scrollIntoView({ block: 'center' }); e.click(); }); await esperar(80); };
const foto = (p, n) => p.screenshot({ path: join(OUT, n + '.png') });
const ok = (c, m) => { if (!c) throw new Error('FALHOU: ' + m); console.log('  ✓ ' + m); };
const entrarNovo = async (p, email) => {
  await p.goto(NOVO + '#/login'); await p.waitForSelector('#login-email');
  await preencher(p, '#login-email', email); await preencher(p, '#login-senha', 'tigre-azul-77'); await clicar(p, 'Entrar');
  await p.waitForSelector('.topbar', { timeout: 20000 });
};

try {
  console.log('Preparando o emulador (dados fictícios no formato do sistema atual)');
  await preparar();

  console.log('1. Vendedor abre a OS no sistema novo, para um carro que já veio pelo sistema atual');
  const vend = await nova();
  await entrarNovo(vend, 'vend@teste.dev');
  await vend.goto(NOVO + '#/os/nova');
  await preencher(vend, '#busca-veic', 'ABC1234');
  await vend.waitForSelector('.li'); await tocar(vend, '.li');
  await ate(vend, 'Cliente Legado');
  ok((await txt(vend)).includes('80.000 km'), 'Veículo vem do histórico do sistema atual (km 80.000)');
  await preencher(vend, '#km-mes', '2000');
  await preencher(vend, '#cli-como', 'Google'); await preencher(vend, '#cli-cidade', 'Curitiba'); await preencher(vend, '#cli-bairro', 'Batel');
  await preencher(vend, '#valor', '300'); await preencher(vend, '#pedido-olist', '555123');
  await foto(vend, '01-nova-os');
  await clicar(vend, 'Salvar e colocar na fila');
  await ate(vend, 'OS #7006');
  const doc = (await listar('orders')).find(o => o.numeroOrdem === 7006);
  ok(!!doc, 'OS gravada em `orders` com o número seguinte (7006)');
  ok(doc.status === 'aguardando' && doc.vendedor === 'Faust' && doc.placa === 'ABC1234' && doc.oleoMotor === true && doc.valorInicial === '300.00', 'Formato do sistema atual (status, vendedor, placa, serviços, valor)');
  ok(doc.kmPorMes === 2000 && doc.pedidoOlist === '555123' && doc.cidade === 'Curitiba', 'Km por mês, pedido Olist e cadastro ficam na OS');
  ok((await lerDoc('config/contadores')).numeroOrdem === 7006, 'Contador do sistema atual avançou');

  console.log('2. O sistema atual enxerga a OS aberta no novo');
  const atual = await nova();
  await atual.goto(ATUAL); await atual.waitForSelector('#login-email');
  await preencher(atual, '#login-email', 'dir@teste.dev'); await preencher(atual, '#login-senha', 'tigre-azul-77');
  await atual.evaluate(() => [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Entrar').click());
  await ate(atual, '7006');
  await foto(atual, '02-sistema-atual-fila');
  ok(true, 'OS #7006 aparece na fila do sistema atual');

  console.log('3. Mecânico assume no sistema novo, faz o checklist e finaliza com adicional');
  const mec = await nova();
  await entrarNovo(mec, 'caio@teste.dev');
  await mec.goto(NOVO + '#/operacao');
  await mec.waitForSelector('[data-os="7006"]');
  await mec.evaluate(() => [...document.querySelector('[data-os="7006"]').parentElement.querySelectorAll('button')].find(x => x.textContent.includes('Assumir')).click());
  await esperar(400);
  if (await mec.$('.sheet #motivo-assumir')) { await preencher(mec, '#motivo-assumir', 'Teste do piloto'); await clicar(mec, 'Assumir', '.sheet-foot'); }
  await ate(mec, 'Checklist técnico');
  const emAndamento = (await listar('orders')).find(o => o.numeroOrdem === 7006);
  ok(emAndamento.status === 'andamento' && emAndamento.lubrificador === 'Caio' && /^\d{2}\/\d{2}\/\d{4}, \d{2}:\d{2}:\d{2}$/.test(emAndamento.inicio), 'Assumir grava status, lubrificador e início como o sistema atual');
  // Ajuda: o mecânico da OS registra quem veio ajudar.
  await clicar(mec, 'Chamar ajuda');
  await ate(mec, 'Quem veio ajudar');
  await mec.evaluate(() => { const li = [...document.querySelectorAll('.sheet .li')].find(x => x.textContent.includes('Joilson')); li.querySelector('button').click(); });
  await ate(mec, 'Ajuda: Joilson');
  const comAjuda = (await listar('orders')).find(o => o.numeroOrdem === 7006);
  const aj = comAjuda.plataforma?.assistencias?.[0];
  ok(aj && !aj.fim && comAjuda.lubrificador === 'Caio', 'Ajuda registrada na OS (sem mudar o mecânico do sistema atual)');
  const ids = await mec.$$eval('[data-item]', es => es.map(e => e.getAttribute('data-item')));
  for (const id of ids) {
    if (!(await mec.$(`[data-item="${id}"] .ck-body:not([hidden])`))) await tocar(mec, `[data-item="${id}"] .ck-head`);
    await tocar(mec, `[data-item="${id}"] [data-estado="ok"]`);
    await mec.waitForFunction(i => !document.querySelector(`[data-item="${i}"] .ck-head`).textContent.includes('A verificar'), { timeout: 15000 }, id);
  }
  await clicar(mec, 'Concluir checklist');
  await mec.waitForSelector('#km', { timeout: 20000 });
  await preencher(mec, '#km', '81000');
  await clicar(mec, 'Finalizar OS');
  await ate(mec, 'Escolha o intervalo conforme o óleo aplicado');
  await tocar(mec, '[data-intervalo="10000"]');
  await clicar(mec, 'Cliente aceitou', '[data-adicional="militec"]');
  await preencher(mec, '[aria-label="Valor de Militec/Nano"]', '89');
  await clicar(mec, 'Ofereci, recusou', '[data-adicional="aditivo"]');
  await foto(mec, '03-execucao');
  await clicar(mec, 'Finalizar OS');
  await ate(mec, 'Concluída');
  const fim = (await listar('orders')).find(o => o.numeroOrdem === 7006);
  ok(fim.status === 'concluido' && fim.km === '81000' && /^\d{2}\/\d{2}\/\d{4}, /.test(fim.fim), 'Finalização grava status, km e fim no formato do sistema atual');
  ok(fim.valorUpsell === 89 && fim.valorTotal === 389 && fim.fezUpsell === true && fim.quantidadeItensUpsell === 1, 'Upsell e total corretos para comissão/faturamento do sistema atual');
  ok(fim.upsells?.militec?.aceito === 'sim' && fim.upsells?.aditivo?.aceito === 'nao', 'Ofertas aceitas e recusadas no mapa `upsells`');
  ok(!!fim.plataforma?.assistencias?.[0]?.fim, 'Ajuda encerra sozinha quando a OS é concluída');
  ok(!!fim.plataforma?.checklistId && (await listar('checklists')).some(c => c.id === fim.plataforma.checklistId && c.status === 'concluido'), 'Checklist concluído salvo e ligado à OS');
  const mp = (await listar('manutencoes')).find(m => m.osOrigemId === fim.plataforma && false) || (await listar('manutencoes')).find(m => m.servicoKey === 'oleoMotor');
  ok(mp && mp.kmPrevisto === 91000 && !!mp.dataPrevista, 'Próxima troca: 91.000 km e data prevista');
  const meses = (Date.parse(mp.dataPrevista) - Date.now()) / (30.4 * 864e5);
  ok(meses > 4.5 && meses < 5.5, `Data prevista pelos km/mês (10 mil km a 2.000/mês ≈ 5 meses; deu ${meses.toFixed(1)})`);
  const evs = await listar('eventos');
  ok(evs.length >= 4 && evs.every(e => e.por && !e.por.startsWith('u_')), 'Histórico gravado em nome de quem fez');

  console.log('4. O sistema atual vê a OS concluída e o valor');
  await atual.reload(); await ate(atual, '7006');
  ok(errosJs.length === 0, 'Sistema atual abre sem erros de JavaScript com as OS do sistema novo');

  console.log('5. Rodízio compartilhado: almoço marcado no novo vale no atual');
  await mec.goto(NOVO + '#/operacao');
  await ate(mec, 'Sair para almoço');
  await clicar(mec, 'Sair para almoço');
  await esperar(1500);
  ok((await lerDoc('config/global')).rodizio.status.Caio === 'almoco', 'config/global.rodizio.status.Caio = almoco');

  console.log('6. Link do relatório para o cliente (sem login)');
  await vend.goto(NOVO + `#/os/${fim.id}?aba=relatorio`);
  await ate(vend, 'OS #7006');
  await vend.evaluate(() => [...document.querySelectorAll('button, [role=tab]')].find(x => x.textContent.trim() === 'Relatório do cliente')?.click());
  await ate(vend, 'Gerar link do relatório');
  await clicar(vend, 'Gerar link do relatório');
  await esperar(1500);
  const sh = (await listar('compartilhamentos'))[0];
  ok(!!sh && !!(await lerDoc(`relatorios/${sh.token}`))?.relatorio, 'Relatório público gravado pelo token');
  const cliente = await nova();
  await cliente.goto(NOVO + `#/r/${sh.token}`);
  await ate(cliente, 'ABC-1234');
  const tc = await txt(cliente);
  ok(!tc.includes('99999-1111') && !tc.includes('300') , 'Cliente vê o relatório sem telefone nem valores');
  await foto(cliente, '06-relatorio-cliente');
  await cliente.goto(NOVO + '#/r/7006'); await ate(cliente, 'Este link não está disponível');
  ok(true, 'Número da OS na URL não abre nada');

  console.log('7. Segurança');
  const anon = await nova();
  await anon.goto(NOVO + '#/login'); await anon.waitForSelector('#login-email');
  const leitura = await fetch(`${FS}/orders`).then(r => r.status);
  ok(leitura === 403, 'Sem login, a base de OS não abre (403)');
  ok(reais.length === 0, `Nenhuma chamada ao Firebase real${reais.length ? ': ' + reais.slice(0, 3).join(', ') : ''}`);
  ok(errosJs.length === 0, `Sem erros de JavaScript${errosJs.length ? ': ' + errosJs.slice(0, 3).join(' | ') : ''}`);
  console.log('\nTudo certo.');
} catch (e) {
  console.error('\n' + e.message);
  process.exitCode = 1;
} finally {
  await b.close();
}
