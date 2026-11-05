// Teste das regras de segurança (firebase/*.rules) contra o Firebase Emulator — nada toca a base real.
// Confere o que cada perfil pode e NÃO pode fazer direto no banco (fora das telas).
// Uso: emuladores rodando com as regras do repositório; depois `node e2e/regras.mjs`.
import { initializeApp, deleteApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { connectFirestoreEmulator, deleteDoc, doc, getDoc, getFirestore, setDoc, Timestamp, updateDoc } from 'firebase/firestore';
import { connectStorageEmulator, deleteObject, getStorage, ref, uploadBytes } from 'firebase/storage';

const P = 'masteroleo-1ed99';
const FS = `http://127.0.0.1:8080/v1/projects/${P}/databases/(default)/documents`;
const DONO = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
const FOTO = Date.now();
const SENHA = 'regras-teste-' + Math.random().toString(36).slice(2, 8);

const val = v => v === null ? { nullValue: null } : typeof v === 'boolean' ? { booleanValue: v } : typeof v === 'number' ? { integerValue: String(v) }
  : typeof v === 'string' ? { stringValue: v } : v instanceof Date ? { timestampValue: v.toISOString() } : Array.isArray(v) ? { arrayValue: { values: v.map(val) } }
  : { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, val(x)])) } };
const gravar = async (caminho, dados) => { const r = await fetch(`${FS}/${caminho}`, { method: 'PATCH', headers: DONO, body: JSON.stringify({ fields: Object.fromEntries(Object.entries(dados).map(([k, v]) => [k, val(v)])) }) }); if (!r.ok) throw new Error(`seed ${caminho}: ${await r.text()}`); };
const criarConta = async email => (await (await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=x', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: SENHA, returnSecureToken: true }) })).json()).localId;

await fetch(`http://127.0.0.1:8080/emulator/v1/projects/${P}/databases/(default)/documents`, { method: 'DELETE' });
await fetch(`http://127.0.0.1:9099/emulator/v1/projects/${P}/accounts`, { method: 'DELETE' });
const ids = {};
for (const [chave, email, perfil] of [['direcao', 'dir@teste.dev', 'direcao'], ['lider', 'lid@teste.dev', 'lider'], ['vendedor', 'vend@teste.dev', 'vendedor'], ['mecanico', 'caio@teste.dev', 'mecanico'], ['mecanico2', 'joi@teste.dev', 'mecanico']]) {
  ids[chave] = await criarConta(email);
  await gravar(`usuarios/${ids[chave]}`, { nome: email, email, perfil, ativo: true, trocarSenha: false });
}
await gravar('config/global', { fatorAjuste: 100, rodizio: { dia: '2026-11-05', status: {} }, comissao: { ajustes: {} } });
await gravar('orders/fila', { status: 'aguardando', numeroOrdem: 1 });
await gravar('orders/feita', { status: 'concluido', numeroOrdem: 2 });
await gravar('orders/feita2', { status: 'concluido', numeroOrdem: 3 });
await gravar('auditorias/a1', { id: 'a1', checklistId: 'c1', resultado: 'correcao' });
await gravar('ocorrencias/o1', { id: 'o1', profissionalId: ids.mecanico, status: 'em_revisao', historico: [] });
await gravar('ocorrencias/o2', { id: 'o2', profissionalId: ids.mecanico2, status: 'em_revisao', historico: [] });
await gravar('oportunidades/nova', { id: 'nova', situacao: 'nova' });
await gravar('oportunidades/tratada', { id: 'tratada', situacao: 'aceita' });
const passado = new Date(Date.now() - 864e5), futuro = new Date(Date.now() + 864e5);
await gravar('relatorios/tokenvalido000000000', { osId: 'x', relatorio: { veiculo: { placa: 'ABC1D23' } }, expiraTs: futuro });
await gravar('relatorios/tokenvencido00000000', { osId: 'x', relatorio: { veiculo: { placa: 'ABC1D23' } }, expiraTs: passado });
await gravar('relatorios/tokenrevogado0000000', { osId: 'x', relatorio: null, revogadoEm: '2026-11-01', expiraTs: passado });
await gravar('relatorios/tokenantigo000000000', { osId: 'x', relatorio: { veiculo: { placa: 'ABC1D23' } }, expiraEm: '2026-01-01T00:00:00.000Z' });

let falhas = 0;
const conferir = async (nome, esperado, f) => {
  let ok = true;
  try { await f(); } catch (e) { if (!/permission|unauthorized|PERMISSION_DENIED|storage\/unauthorized/i.test(String(e?.code || e))) { console.log(`  ✗ ${nome}: erro inesperado ${e?.code || e}`); falhas++; return; } ok = false; }
  if (ok === esperado) console.log(`  ✓ ${nome}`); else { console.log(`  ✗ ${nome}: ${ok ? 'deixou' : 'barrou'}`); falhas++; }
};
const como = async (email, testes) => {
  const app = initializeApp({ apiKey: 'x', projectId: P, storageBucket: `${P}.appspot.com` }, email || 'anon');
  const auth = getAuth(app); connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const db = getFirestore(app); connectFirestoreEmulator(db, '127.0.0.1', 8080);
  const st = getStorage(app); connectStorageEmulator(st, '127.0.0.1', 9199);
  if (email) await signInWithEmailAndPassword(auth, email, SENHA);
  console.log(email || 'sem login');
  await testes(db, st);
  await deleteApp(app);
};

await como('caio@teste.dev', async (db, st) => {
  await conferir('mecânico cancela OS aguardando (✕ da fila)', true, () => deleteDoc(doc(db, 'orders/fila')));
  await conferir('mecânico NÃO apaga OS concluída', false, () => deleteDoc(doc(db, 'orders/feita')));
  await conferir('mecânico atualiza OS', true, () => updateDoc(doc(db, 'orders/feita'), { km: '1000' }));
  await conferir('mecânico muda o rodízio', true, () => updateDoc(doc(db, 'config/global'), { 'rodizio.status.Caio': 'almoco', rodizioAtualizadoEm: Timestamp.now() }));
  await conferir('mecânico NÃO muda comissão', false, () => updateDoc(doc(db, 'config/global'), { comissao: { ajustes: { x: 1 } } }));
  await conferir('mecânico NÃO muda fator de ajuste', false, () => updateDoc(doc(db, 'config/global'), { fatorAjuste: 1 }));
  await conferir('mecânico grava contador da OS', true, () => setDoc(doc(db, 'config/contadores'), { numeroOrdem: 9 }, { merge: true }));
  await conferir('mecânico grava relógio', true, () => setDoc(doc(db, 'config/relogio'), { agora: Timestamp.now() }));
  await conferir('mecânico NÃO cria meta', false, () => setDoc(doc(db, 'metas/m1'), { id: 'm1' }));
  await conferir('mecânico NÃO cria auditoria', false, () => setDoc(doc(db, 'auditorias/a2'), { id: 'a2' }));
  await conferir('mecânico marca correção enviada', true, () => updateDoc(doc(db, 'auditorias/a1'), { resolvidaEm: '2026-11-05T12:00:00Z' }));
  await conferir('mecânico NÃO muda resultado da auditoria', false, () => updateDoc(doc(db, 'auditorias/a1'), { resultado: 'ok' }));
  await conferir('mecânico contesta ocorrência dele', true, () => updateDoc(doc(db, 'ocorrencias/o1'), { status: 'contestada', historico: [{ status: 'contestada' }], manifestacao: { texto: 'x' } }));
  await conferir('mecânico NÃO contesta ocorrência de outro', false, () => updateDoc(doc(db, 'ocorrencias/o2'), { status: 'contestada', historico: [{ status: 'contestada' }] }));
  await conferir('mecânico NÃO aprova a própria ocorrência', false, () => updateDoc(doc(db, 'ocorrencias/o1'), { status: 'rejeitada' }));
  await conferir('mecânico NÃO declara dia de exceção', false, () => setDoc(doc(db, 'diasExcecao/d1'), { data: '2026-11-05' }));
  await conferir('recomendação nova pode sair', true, () => deleteDoc(doc(db, 'oportunidades/nova')));
  await conferir('recomendação tratada NÃO se apaga', false, () => deleteDoc(doc(db, 'oportunidades/tratada')));
  await conferir('foto (imagem) sobe', true, () => uploadBytes(ref(st, `vazamentos/os1/${FOTO}_a.jpg`), new Uint8Array([1, 2, 3]), { contentType: 'image/jpeg' }));
  await conferir('foto NÃO é substituída', false, () => uploadBytes(ref(st, `vazamentos/os1/${FOTO}_a.jpg`), new Uint8Array([4]), { contentType: 'image/jpeg' }));
  await conferir('foto NÃO se apaga', false, () => deleteObject(ref(st, `vazamentos/os1/${FOTO}_a.jpg`)));
  await conferir('arquivo que não é imagem NÃO sobe', false, () => uploadBytes(ref(st, 'vazamentos/os1/x.html'), new Uint8Array([1]), { contentType: 'text/html' }));
});

await como('vend@teste.dev', async db => {
  await conferir('vendedor NÃO apaga OS concluída', false, () => deleteDoc(doc(db, 'orders/feita')));
  await conferir('vendedor NÃO muda metas de upsell', false, () => updateDoc(doc(db, 'config/global'), { metasUpsell: { x: 1 } }));
  await conferir('vendedor NÃO cria ocorrência', false, () => setDoc(doc(db, 'ocorrencias/o3'), { id: 'o3' }));
});

await como('lid@teste.dev', async db => {
  await conferir('liderança cria meta', true, () => setDoc(doc(db, 'metas/m1'), { id: 'm1' }));
  await conferir('liderança cria auditoria', true, () => setDoc(doc(db, 'auditorias/a3'), { id: 'a3' }));
  await conferir('liderança remove OS', true, () => deleteDoc(doc(db, 'orders/feita2')));
  await conferir('liderança NÃO muda comissão', false, () => updateDoc(doc(db, 'config/global'), { comissao: { ajustes: { y: 1 } } }));
});

await como('dir@teste.dev', async db => {
  await conferir('direção muda comissão', true, () => updateDoc(doc(db, 'config/global'), { comissao: { ajustes: { z: 1 } } }));
  await conferir('direção apaga OS', true, () => deleteDoc(doc(db, 'orders/feita')));
});

await como(null, async db => {
  const ler = async t => { const s = await getDoc(doc(db, `relatorios/${t}`)); return s.exists(); };
  await conferir('cliente abre link válido', true, () => ler('tokenvalido000000000'));
  await conferir('cliente NÃO abre link vencido', false, () => ler('tokenvencido00000000'));
  await conferir('link revogado responde (sem conteúdo)', true, () => ler('tokenrevogado0000000'));
  await conferir('link inexistente responde "não existe"', true, () => ler('tokeninexistente0000'));
  await conferir('link antigo (sem data no banco) continua abrindo', true, () => ler('tokenantigo000000000'));
  await conferir('sem login NÃO lê OS', false, () => getDoc(doc(db, 'orders/fila')));
});

console.log(falhas ? `\n${falhas} falha(s).` : '\nRegras conferidas.');
process.exit(falhas ? 1 : 0);
