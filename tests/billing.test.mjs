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

test('corregir un pago lo reaplica y conserva el número de recibo', () => {
  const d0 = db({ charges: [charge('A-1', '2026-08'), charge('A-1', '2026-09'), charge('A-1', '2026-10')] });
  const first = pay(d0, 50); // 22 + 22 + 6
  const second = pay(first.db, 10); // termina octubre: 6 + 10 = 16
  const r = billing.editPayment(second.db, first.payment, { amount: 22, payerName: 'Y', note: 'corrección', date: '2026-10-28T10:00:00', editedBy: 'Admin' }, false);
  assert.equal(typeof r, 'object');
  const paid = Object.fromEntries(r.db.charges.map((c) => [c.period, c.paid]));
  // El pago corregido cubre solo agosto; el segundo pago (10) sigue aplicado donde estaba.
  assert.deepEqual(paid, { '2026-08': 22, '2026-09': 0, '2026-10': 10 });
  assert.equal(r.payment.id, first.payment.id);
  assert.equal(r.payment.receiptNo, 1);
  assert.equal(r.db.config.nextReceiptNo, 3);
  assert.equal(r.db.payments.length, 2);
  assert.equal(r.payment.editedBy, 'Admin');
});

test('corregir un pago mueve su saldo a favor', () => {
  const p = pay(db({ charges: [charge('A-1', '2026-10')] }), 30); // 8 a favor
  const r = billing.editPayment(p.db, p.payment, { amount: 40, payerName: 'X', note: '', date: p.payment.date, editedBy: 'Admin' }, true);
  assert.equal(r.db.credits['A-1'], 18);
  const r2 = billing.editPayment(p.db, p.payment, { amount: 22, payerName: 'X', note: '', date: p.payment.date, editedBy: 'Admin' }, true);
  assert.equal(r2.db.credits['A-1'], undefined);
});

test('no se corrige un pago cuyo saldo a favor ya se usó', () => {
  const p = pay(db({ charges: [charge('A-1', '2026-10')] }), 30); // 8 a favor
  const used = billing.runAutomations(p.db, '2026-11-05'); // noviembre usa esos 8
  const edit = { amount: 22, payerName: 'X', note: '', date: p.payment.date, editedBy: 'Admin' };
  assert.equal(typeof billing.editPayment(used, p.payment, edit, true), 'string');
  // Tampoco si un pago posterior ya usó ese saldo.
  assert.equal(typeof billing.editPayment(pay(p.db, 14).db, p.payment, edit, false), 'string');
});

// ---------- Pagos adelantados ----------

const periods = (d) => d.charges.filter((c) => c.paid >= c.amount).map((c) => c.period).sort();

test('al día y paga $100: cuatro meses adelantados y $12 a favor', () => {
  const { db: d, payment } = pay(db(), 100); // startPeriod 2026-11, pago del 28 de octubre
  assert.deepEqual(periods(d), ['2026-11', '2026-12', '2027-01', '2027-02']);
  assert.equal(d.credits['A-1'], 12);
  assert.equal(payment.credit, 12);
  assert.equal(payment.allocations.length, 4);
  assert.match(payment.allocations[0].description, /noviembre 2026 \(adelantada\)/);
  // Cuando llega noviembre no se vuelve a cobrar.
  assert.equal(billing.runAutomations(d, '2026-11-05').charges.length, 4);
});

test('debe $44 y paga $100: salda la deuda, dos meses adelantados y $12 a favor', () => {
  const { db: d } = pay(db({ charges: [charge('A-1', '2026-09'), charge('A-1', '2026-10')] }), 100);
  assert.deepEqual(periods(d), ['2026-09', '2026-10', '2026-11', '2026-12']);
  assert.equal(d.credits['A-1'], 12);
});

test('menos de una cuota queda solo como saldo a favor', () => {
  const { db: d, payment } = pay(db(), 15);
  assert.equal(d.charges.length, 0);
  assert.equal(d.credits['A-1'], 15);
  assert.equal(payment.allocations.length, 0);
});

test('el saldo a favor se suma al pago para completar un mes', () => {
  const { db: d, payment } = pay(db({ credits: { 'A-1': 12 } }), 10);
  assert.deepEqual(periods(d), ['2026-11']);
  assert.equal(d.credits['A-1'], undefined);
  assert.equal(payment.creditUsed, 12);
});

test('los meses adelantados conservan la cuota con que se pagaron', () => {
  const { db: d } = pay(db(), 22);
  const subida = billing.runAutomations({ ...d, config: { ...d.config, fee: 25 } }, '2026-12-05');
  assert.equal(subida.charges.find((c) => c.period === '2026-11').amount, 22);
  assert.equal(subida.charges.find((c) => c.period === '2026-12').amount, 25);
});

test('corregir un pago adelantado a menos quita los meses que ya no cubre', () => {
  const p = pay(db(), 66); // nov, dic, ene
  const r = billing.editPayment(p.db, p.payment, { amount: 22, payerName: 'X', note: '', date: p.payment.date, editedBy: 'Admin' }, true);
  assert.deepEqual(periods(r.db), ['2026-11']);
  assert.equal(r.db.charges.length, 1);
});

test('Gantt: meses adelantados pagados y los que cubre el saldo a favor', () => {
  const { db: d } = pay(db(), 44); // noviembre y diciembre pagados
  const conSaldo = { ...d, credits: { 'A-1': 22 } }; // y alcanza para enero
  const [row] = reports.housesInRange(conSaldo, '2026-10', '2027-02', '2026-10-28');
  assert.deepEqual(row.cells.map((c) => c.status), ['sin cargo', 'adelantado', 'adelantado', 'adelantado', 'sin cargo']);
  assert.equal(row.monthsAhead, 3);
  assert.equal(row.overall, 'adelantado');
  assert.equal(row.billed, 44); // lo que cubre el saldo no se cuenta como facturado
});

test('estado de cuenta: los meses pagados antes del sistema no quedan como deuda', () => {
  const d = db({ charges: [charge('A-1', '2026-03', { id: 'paid-A-1-2026-03', kind: 'opening', paid: 22, paidBeforeSystem: true })] });
  const rows = reports.statement(d, 'A-1');
  assert.equal(rows.at(-1).balance, 0);
});

test('saldo anterior: se corrige o quita solo si no descuadra los recibos', () => {
  const opening = (extra) => charge('A-1', '2026-09', { id: 'opening-A-1-2026-09', kind: 'opening', amount: 66, ...extra });
  const err = billing.openingChangeError;
  assert.equal(err(opening(), 44), null); // sin pagos: se corrige
  assert.equal(err(opening(), null), null); // sin pagos: se quita
  assert.equal(err(opening({ paid: 30 }), 30), null); // se puede bajar hasta lo pagado
  assert.match(err(opening({ paid: 30 }), 22), /no puede ser menor/);
  assert.match(err(opening({ paid: 30 }), null), /Corrige el monto/);
  assert.match(err(opening(), 0), /mayor que cero/);
  assert.match(err(charge('A-1', '2026-11'), 10), /saldos anteriores/); // las cuotas mensuales no
  assert.equal(err(opening({ paid: 66, paidBeforeSystem: true }), null), null); // pagado antes del sistema: se puede quitar
});

test('la etiqueta de la casa se arma desde su código', () => {
  assert.equal(billing.houseIdLabel('B-17'), 'Polígono B, Lote 17');
});
