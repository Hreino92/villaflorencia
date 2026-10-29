// Pruebas de la lógica de cobros. Se ejecutan con: npm test
// Usa el Vite ya instalado para cargar el código TypeScript, sin dependencias extra.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';

let vite, billing, reports;

before(async () => {
  vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
  billing = await vite.ssrLoadModule('/src/lib/billing.ts');
  reports = await vite.ssrLoadModule('/src/lib/reports.ts');
});
after(() => vite.close());

const house = (id) => ({ id, poligono: id[0], lote: Number(id.slice(2)), owner: { name: 'Dueño', phone: '', email: '', dui: '' }, tenant: null, notifyTo: 'owner', visitorCodeBy: 'owner', customFee: null, notes: '' });
const charge = (houseId, period, extra = {}) => ({ id: `${houseId}-${period}`, houseId, kind: 'monthly', period, description: `Cuota ${period}`, amount: 22, dueDate: `${period}-28`, paid: 0, ...extra });
const db = (extra = {}) => ({
  config: { name: 'X', fee: 22, dueDay: 30, advanceDays: 3, startPeriod: '2026-11', nextReceiptNo: 1, simulatedToday: null, templates: {} },
  houses: [house('A-1')],
  charges: [],
  payments: [],
  credits: {},
  notifications: [],
  visits: [],
  users: [],
  expenses: [],
  ...extra,
});
const pay = (d, amount) => billing.applyPayment(d, { houseId: 'A-1', amount, payerName: 'X', receivedBy: 'Admin', note: '', date: '2026-10-28T10:00:00' });

test('un pago se aplica primero a las cuotas más antiguas', () => {
  const d = db({ charges: [charge('A-1', '2026-09'), charge('A-1', '2026-08'), charge('A-1', '2026-10')] });
  const { db: after, payment } = pay(d, 50);
  const paid = Object.fromEntries(after.charges.map((c) => [c.period, c.paid]));
  assert.deepEqual(paid, { '2026-08': 22, '2026-09': 22, '2026-10': 6 });
  assert.equal(payment.receiptNo, 1);
  assert.equal(after.config.nextReceiptNo, 2);
  assert.equal(payment.credit, 0);
});

test('lo que sobra de un pago queda como saldo a favor', () => {
  const { db: after, payment } = pay(db({ charges: [charge('A-1', '2026-10')] }), 30);
  assert.equal(payment.credit, 8);
  assert.equal(after.credits['A-1'], 8);
});

test('el saldo a favor se aplica a la cuota nueva y no se usa dos veces', () => {
  const d = billing.runAutomations(db({ credits: { 'A-1': 44 } }), '2026-11-05');
  const nov = d.charges.find((c) => c.period === '2026-11');
  assert.equal(nov.paid, 22);
  assert.equal(d.credits['A-1'], 22);
  // Correr de nuevo el mismo día no crea otra cuota ni descuenta otra vez.
  assert.equal(billing.runAutomations(d, '2026-11-05'), d);
});

test('si el mes es más corto, vence el último día', () => {
  const d = billing.runAutomations(db({ config: { ...db().config, startPeriod: '2027-02' } }), '2027-02-10');
  assert.equal(d.charges[0].dueDate, '2027-02-28');
});

test('el reporte de casas incluye las cuotas importadas (saldo anterior)', () => {
  const d = db({ charges: [charge('A-1', '2026-09', { id: 'opening-A-1-2026-09', kind: 'opening', dueDate: '2026-09-30' })] });
  const [row] = reports.housesInRange(d, '2026-09', '2026-10', '2026-10-28');
  assert.equal(row.cells[0].status, 'vencido');
  assert.equal(row.cells[1].status, 'sin cargo');
  assert.equal(row.pending, 22);
});

test('la etiqueta de la casa se arma desde su código', () => {
  assert.equal(billing.houseIdLabel('B-17'), 'Polígono B, Lote 17');
});
