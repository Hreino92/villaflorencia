// Pruebas de las reglas de Firestore. Se ejecutan con: npm run test:rules
import { readFileSync } from 'node:fs';
import { after, before, beforeEach, test } from 'node:test';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore';

let env;

const house = (id, extra = {}) => ({
  id, poligono: id[0], lote: Number(id.slice(2)),
  owner: { name: 'Dueño', phone: '70000000', email: '', dui: '' },
  tenant: null, notifyTo: 'owner', visitorCodeBy: 'owner', customFee: null, notes: '', ...extra,
});
const visit = (code, houseId, extra = {}) => ({
  code, houseId, visitorName: 'Visita', dui: '00000000-0', date: '2026-10-27', reason: '',
  createdBy: 'x', createdAt: '2026-10-27T08:00:00', enteredAt: null, guardName: null, ...extra,
});

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-villaflorencia',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  });
});
after(() => env.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'config/general'), { name: 'Villa Florencia', nextReceiptNo: 1 });
    await setDoc(doc(db, 'users/admin'), { id: 'admin', role: 'admin', active: true });
    await setDoc(doc(db, 'users/guard'), { id: 'guard', role: 'vigilante', active: true });
    await setDoc(doc(db, 'users/ownerA1'), { id: 'ownerA1', role: 'residente', houseId: 'A-1', relation: 'owner', active: true });
    await setDoc(doc(db, 'users/ownerA2'), { id: 'ownerA2', role: 'residente', houseId: 'A-2', relation: 'owner', active: true });
    await setDoc(doc(db, 'users/tenantA2'), { id: 'tenantA2', role: 'residente', houseId: 'A-2', relation: 'tenant', active: true });
    await setDoc(doc(db, 'users/off'), { id: 'off', role: 'admin', active: false });
    await setDoc(doc(db, 'houses/A-1'), house('A-1'));
    await setDoc(doc(db, 'houses/A-2'), house('A-2', { tenant: { name: 'Inquilino' }, visitorCodeBy: 'tenant' }));
    await setDoc(doc(db, 'charges/A-1-2026-10'), { id: 'A-1-2026-10', houseId: 'A-1', amount: 22, paid: 0 });
    await setDoc(doc(db, 'charges/A-2-2026-10'), { id: 'A-2-2026-10', houseId: 'A-2', amount: 22, paid: 0 });
    await setDoc(doc(db, 'visits/AAAAAA'), visit('AAAAAA', 'A-1'));
  });
});

const as = (uid) => env.authenticatedContext(uid).firestore();

test('cualquiera lee la configuración, solo el admin la cambia', async () => {
  await assertSucceeds(getDoc(doc(env.unauthenticatedContext().firestore(), 'config/general')));
  await assertFails(updateDoc(doc(as('ownerA1'), 'config/general'), { nextReceiptNo: 99 }));
  await assertSucceeds(updateDoc(doc(as('admin'), 'config/general'), { nextReceiptNo: 2 }));
});

test('sin sesión no se lee nada privado', async () => {
  const db = env.unauthenticatedContext().firestore();
  await assertFails(getDoc(doc(db, 'houses/A-1')));
  await assertFails(getDoc(doc(db, 'users/admin')));
});

test('el residente solo ve su casa y sus cuotas', async () => {
  const db = as('ownerA1');
  await assertSucceeds(getDoc(doc(db, 'houses/A-1')));
  await assertFails(getDoc(doc(db, 'houses/A-2')));
  await assertSucceeds(getDocs(query(collection(db, 'charges'), where('houseId', '==', 'A-1'))));
  await assertFails(getDocs(query(collection(db, 'charges'), where('houseId', '==', 'A-2'))));
  await assertFails(getDocs(collection(db, 'charges')));
  await assertFails(setDoc(doc(db, 'charges/A-1-2026-10'), { id: 'A-1-2026-10', houseId: 'A-1', amount: 22, paid: 22 }));
});

test('el residente no puede cambiarse el rol ni ver otros usuarios', async () => {
  const db = as('ownerA1');
  await assertSucceeds(getDoc(doc(db, 'users/ownerA1')));
  await assertFails(getDoc(doc(db, 'users/admin')));
  await assertFails(updateDoc(doc(db, 'users/ownerA1'), { role: 'admin' }));
});

test('códigos de visita: según el permiso de la casa', async () => {
  await assertSucceeds(setDoc(doc(as('ownerA1'), 'visits/BBBBBB'), visit('BBBBBB', 'A-1')));
  await assertFails(setDoc(doc(as('ownerA1'), 'visits/CCCCCC'), visit('CCCCCC', 'A-2')));
  // En A-2 solo el inquilino genera códigos.
  await assertFails(setDoc(doc(as('ownerA2'), 'visits/DDDDDD'), visit('DDDDDD', 'A-2')));
  await assertSucceeds(setDoc(doc(as('tenantA2'), 'visits/EEEEEE'), visit('EEEEEE', 'A-2')));
  // No puede crearla ya marcada como ingresada.
  await assertFails(setDoc(doc(as('ownerA1'), 'visits/FFFFFF'), visit('FFFFFF', 'A-1', { enteredAt: '2026-10-27T09:00:00' })));
});

test('el vigilante solo marca la entrada, una vez', async () => {
  const db = as('guard');
  await assertSucceeds(getDocs(query(collection(db, 'visits'), where('date', '==', '2026-10-27'))));
  await assertFails(updateDoc(doc(db, 'visits/AAAAAA'), { houseId: 'A-2' }));
  await assertSucceeds(updateDoc(doc(db, 'visits/AAAAAA'), { enteredAt: '2026-10-27T09:00:00', guardName: 'Pedro' }));
  await assertFails(updateDoc(doc(db, 'visits/AAAAAA'), { enteredAt: '2026-10-27T10:00:00', guardName: 'Pedro' }));
  await assertFails(getDoc(doc(db, 'charges/A-1-2026-10')));
  await assertFails(deleteDoc(doc(db, 'visits/AAAAAA')));
});

test('una cuenta desactivada no ve nada', async () => {
  const db = as('off');
  await assertFails(getDoc(doc(db, 'houses/A-1')));
  await assertFails(getDocs(collection(db, 'users')));
});

test('los gastos solo los ve y registra la administración', async () => {
  const gasto = { id: 'g1', date: '2026-10-05', concept: 'Salario vigilante', amount: 400 };
  await assertSucceeds(setDoc(doc(as('admin'), 'expenses/g1'), gasto));
  await assertFails(getDoc(doc(as('ownerA1'), 'expenses/g1')));
  await assertFails(getDoc(doc(as('guard'), 'expenses/g1')));
  await assertFails(setDoc(doc(as('ownerA1'), 'expenses/g2'), gasto));
});

test('el admin gestiona todo', async () => {
  const db = as('admin');
  await assertSucceeds(getDocs(collection(db, 'users')));
  await assertSucceeds(setDoc(doc(db, 'users/nuevo'), { id: 'nuevo', role: 'vigilante', active: true }));
  await assertSucceeds(setDoc(doc(db, 'payments/p1'), { id: 'p1', houseId: 'A-1', amount: 22 }));
});

test('la configuración inicial solo se puede hacer una vez', async () => {
  // Ya hay configuración: un usuario nuevo no puede hacerse admin.
  await assertFails(setDoc(doc(as('intruso'), 'users/intruso'), { id: 'intruso', role: 'admin', active: true }));
  // Sin configuración: el primer usuario sí.
  await env.withSecurityRulesDisabled((ctx) => deleteDoc(doc(ctx.firestore(), 'config/general')));
  await assertSucceeds(setDoc(doc(as('primero'), 'users/primero'), { id: 'primero', role: 'admin', active: true }));
});
