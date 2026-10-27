// Verifica que o protótipo não tem nenhuma ligação com o Firebase de produção.
// Roda sobre o código-fonte e sobre o build (dist/), se existir.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const PROIBIDO = /firebase|firestore|gstatic\.com|googleapis\.com|masteroleo-1ed99|AIza[0-9A-Za-z_-]{20,}/i;
const ALVOS = ['src', 'index.html', 'public', 'dist', 'package.json'];
const IGNORAR = new Set(['node_modules', 'e2e', 'scripts']);
const achados = [];

const varrer = p => {
  if (!existsSync(p)) return;
  const st = statSync(p);
  if (st.isDirectory()) { for (const f of readdirSync(p)) if (!IGNORAR.has(f)) varrer(join(p, f)); return; }
  if (/\.(png|jpe?g|webp|woff2?|ttf)$/i.test(p)) return;
  const linhas = readFileSync(p, 'utf8').split('\n');
  linhas.forEach((l, i) => {
    // Comentários que explicam o isolamento podem citar "Firebase"; código não.
    const codigo = l.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '').replace(/^\s*\*.*$/, '');
    if (PROIBIDO.test(codigo)) achados.push(`${relative(RAIZ, p)}:${i + 1}: ${l.trim().slice(0, 120)}`);
  });
};
ALVOS.forEach(a => varrer(join(RAIZ, a)));
const deps = Object.keys({ ...JSON.parse(readFileSync(join(RAIZ, 'package.json'), 'utf8')).dependencies });
if (deps.some(d => /firebase/i.test(d))) achados.push('package.json: dependência de Firebase');

if (achados.length) { console.error('✗ Referências proibidas encontradas:\n' + achados.join('\n')); process.exit(1); }
console.log(`✓ Isolamento OK: nenhuma referência a Firebase/Google/credenciais em ${ALVOS.filter(a => existsSync(join(RAIZ, a))).join(', ')}.`);
