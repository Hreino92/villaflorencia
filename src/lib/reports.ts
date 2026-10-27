import type { DB, House, Payment } from './types';
import { chargesOf, houseDebt, houseLabel, overdueChargesOf, pendingOf } from './billing';
import { capitalize, periodLabel, periodOf, round2 } from './dates';

export function paymentsInPeriod(db: DB, period: string): Payment[] {
  return db.payments.filter((p) => periodOf(p.date) === period).sort((a, b) => a.receiptNo - b.receiptNo);
}

export function incomeSummary(db: DB, period: string) {
  const payments = paymentsInPeriod(db, period);
  const total = round2(payments.reduce((s, p) => s + p.amount, 0));
  const billed = round2(
    db.charges.filter((c) => c.kind === 'monthly' && c.period === period).reduce((s, c) => s + c.amount, 0),
  );
  const collectedForPeriod = round2(
    db.charges.filter((c) => c.kind === 'monthly' && c.period === period).reduce((s, c) => s + c.paid, 0),
  );
  return { payments, total, billed, collectedForPeriod, rate: billed ? collectedForPeriod / billed : 0 };
}

export interface MoraRow {
  house: House;
  months: string[];
  amount: number;
  totalDebt: number;
}

export function moraList(db: DB, today: string): MoraRow[] {
  return db.houses
    .map((house) => {
      const overdue = overdueChargesOf(db, house.id, today);
      return {
        house,
        months: overdue.map((c) => (c.kind === 'monthly' ? capitalize(periodLabel(c.period)) : c.description)),
        amount: round2(overdue.reduce((s, c) => s + pendingOf(c), 0)),
        totalDebt: houseDebt(db, house.id),
      };
    })
    .filter((r) => r.amount > 0)
    .sort((a, b) => b.amount - a.amount);
}

export interface StatementRow {
  date: string;
  concept: string;
  charge: number;
  payment: number;
  balance: number;
}

export function statement(db: DB, houseId: string): StatementRow[] {
  const events: { date: string; concept: string; charge: number; payment: number; order: number }[] = [];
  for (const c of chargesOf(db, houseId)) {
    events.push({ date: c.kind === 'monthly' ? `${c.period}-01` : `${c.period}-01`, concept: c.description, charge: c.amount, payment: 0, order: 0 });
  }
  for (const p of db.payments.filter((x) => x.houseId === houseId)) {
    events.push({ date: p.date.slice(0, 10), concept: `Pago en efectivo - Recibo No. ${p.receiptNo}`, charge: 0, payment: p.amount, order: 1 });
  }
  events.sort((a, b) => a.date.localeCompare(b.date) || a.order - b.order);
  let balance = 0;
  return events.map((e) => {
    balance = round2(balance + e.charge - e.payment);
    return { date: e.date, concept: e.concept, charge: e.charge, payment: e.payment, balance };
  });
}

export { houseLabel };
