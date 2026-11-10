// OS nova chega no celular do mecânico mesmo com a conexão ao vivo parada (só contra o Firebase Emulator).
// Simula o caso real: a conexão que traz as OS morre em silêncio; quem abriu a página não recebe erro nenhum.
import puppeteer from 'puppeteer-core';

const P = 'masteroleo-1ed99';
const NOVO = 'http://127.0.0.1:5180/?emulador=1';
const FS = `http://127.0.0.1:8080/v1/projects/${P}/databases/(default)/documents`;
const DONO = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
const val = v => typeof v === 'boolean' ? { booleanValue: v } : typeof v === 'number' ? { integerValue: String(v) } : typeof v === 'string' ? { stringValue: v } : { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, val(x)])) } };
const gravar = async (c, d) => { const r = await fetch(`${FS}/${c}`, { method: 'PATCH', headers: DONO, body: JSON.stringify({ fields: Object.fromEntries(Object.entries(d).map(([k, v]) => [k, val(v)])) }) }); if (!r.ok) throw new Error(await r.text()); };
const esperar = ms => new Promise(r => setTimeout(r, ms));
const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
const os = (n, placa, modelo) => ({ cliente: 'Cliente Teste', tel: '(41) 99999-1111', placa, marca: 'VW', modelo, motor: '1.0', ano: '2015', cambio: 'Manual', combustivel: 'Flex', numeroOrdem: n, status: 'aguardando', vendedor: 'Faust', lubrificador: '', dataHora: new Date().toISOString(), oleoMotor: true, valorInicial: '250.00', execFreioSemQuestionar: true, execCambioSemQuestionar: true });

await fetch(`http://127.0.0.1:8080/emulator/v1/projects/${P}/databases/(default)/documents`, { method: 'DELETE' });
await fetch(`http://127.0.0.1:9099/emulator/v1/projects/${P}/accounts`, { method: 'DELETE' });
const conta = await (await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=x', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'caio@teste.dev', password: 'tigre-azul-77', returnSecureToken: true }) })).json();
await gravar(`usuarios/${conta.localId}`, { nome: 'Caio Ferreira', email: 'caio@teste.dev', perfil: 'mecanico', ativo: true, trocarSenha: false });
await gravar('sistema/inicio', { uid: conta.localId, email: 'caio@teste.dev', em: new Date().toISOString() });
await gravar('config/global', { fatorAjuste: 100, rodizio: { dia: hoje, status: {} }, comissao: { ajustes: {} } });
await gravar('orders/antiga', os(7001, 'ABC1D23', 'Modelo Antigo'));

const b = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new' });
let falhou = false;
try {
  const p = await b.newPage();
  await p.setViewport({ width: 390, height: 844 });
  await p.goto(NOVO + '#/login'); await p.waitForSelector('#login-email');
  await p.type('#login-email', 'caio@teste.dev'); await p.type('#login-senha', 'tigre-azul-77');
  await p.evaluate(() => [...document.querySelectorAll('button')].find(x => x.textContent.trim().startsWith('Entrar')).click());
  await p.waitForSelector('.topbar', { timeout: 20000 });
  await p.waitForFunction(() => document.body.innerText.includes('Modelo Antigo'), { timeout: 20000 });
  console.log('  ✓ Mecânico vê a fila');

  await p.setRequestInterception(true);
  let parar = true;
  p.on('request', r => { if (parar && /Firestore\/(Listen|Write)\/channel/.test(r.url())) return; void r.continue(); });
  await p.setOfflineMode(true); await esperar(1000); await p.setOfflineMode(false); await esperar(3000);
  await gravar('orders/nova', os(7002, 'XYZ9A88', 'Modelo Novo'));
  await esperar(6000);
  if (await p.evaluate(() => document.body.innerText.includes('Modelo Novo'))) throw new Error('o teste não parou a conexão ao vivo');
  console.log('  ✓ Conexão ao vivo parada: a OS nova não chegou sozinha');

  parar = false;
  const t0 = Date.now();
  await p.waitForFunction(() => document.body.innerText.includes('Modelo Novo'), { timeout: 45000 });
  console.log(`  ✓ OS nova apareceu sem recarregar a página, ${Math.round((Date.now() - t0) / 1000)} s depois`);
  const marcar = horas => p.evaluate(h => localStorage.setItem('mo2:sessaoDesde', String(Date.now() - h * 3600e3)), horas);
  await marcar(13); await p.reload(); await p.waitForSelector('.topbar', { timeout: 20000 }); await esperar(1500);
  if (!await p.$('.topbar')) throw new Error('caiu a sessão depois de 13 h');
  console.log('  ✓ Sessão continua depois de 13 h');
  await marcar(24 * 31); await p.reload(); await p.waitForSelector('#login-email', { timeout: 80000 });
  console.log('  ✓ Depois de 31 dias sem usar, pede login');
  console.log('\nTudo certo.');
} catch (e) { falhou = true; console.log('FALHOU: ' + e.message.slice(0, 300)); }
await b.close();
process.exit(falhou ? 1 : 0);
