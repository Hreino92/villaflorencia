import type { DB, Expense, House, Payment } from './types';
import { chargesOf, chargeStatus, feeFor, houseDebt, houseLabel, overdueChargesOf, pendingOf, type ChargeStatus } from './billing';
import { addMonths, capitalize, periodLabel, periodOf, round2 } from './dates';

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
    events.push({ date: `${c.period}-01`, concept: c.description, charge: c.amount, payment: 0, order: 0 });
    // Meses pagados según el registro anterior: no tienen recibo en la app, el abono se muestra aquí.
    if (c.paidBeforeSystem) events.push({ date: `${c.period}-01`, concept: 'Pagado antes del sistema', charge: 0, payment: c.paid, order: 1 });
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

// ---------- Reportes por rango de meses ----------

export function periodsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let p = from; p <= to; p = addMonths(p, 1)) out.push(p);
  return out;
}

export function rangeLabel(from: string, to: string): string {
  return from === to ? capitalize(periodLabel(from)) : `${capitalize(periodLabel(from))} a ${periodLabel(to)}`;
}

export interface FinancialSummary {
  months: { period: string; income: number; expenses: number }[];
  income: number;
  expenses: number;
  balance: number;
  byCategory: { category: string; amount: number }[];
  payments: Payment[];
  expenseList: Expense[];
}

/** Ingresos (pagos recibidos) contra gastos, mes a mes, en el rango. */
export function financialSummary(db: DB, from: string, to: string): FinancialSummary {
  const periods = periodsBetween(from, to);
  const inRange = (date: string) => periodOf(date) >= from && periodOf(date) <= to;
  const payments = db.payments.filter((p) => inRange(p.date)).sort((a, b) => a.date.localeCompare(b.date) || a.receiptNo - b.receiptNo);
  const expenseList = db.expenses.filter((e) => inRange(e.date)).sort((a, b) => a.date.localeCompare(b.date));
  const months = periods.map((period) => ({
    period,
    income: round2(payments.filter((p) => periodOf(p.date) === period).reduce((s, p) => s + p.amount, 0)),
    expenses: round2(expenseList.filter((e) => periodOf(e.date) === period).reduce((s, e) => s + e.amount, 0)),
  }));
  const cat = new Map<string, number>();
  for (const e of expenseList) cat.set(e.category, round2((cat.get(e.category) ?? 0) + e.amount));
  const income = round2(months.reduce((s, m) => s + m.income, 0));
  const expenses = round2(months.reduce((s, m) => s + m.expenses, 0));
  return {
    months,
    income,
    expenses,
    balance: round2(income - expenses),
    byCategory: [...cat].map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount),
    payments,
    expenseList,
  };
}

export type CellStatus = ChargeStatus | 'adelantado' | 'sin cargo';

export interface HouseRangeRow {
  house: House;
  cells: { period: string; amount: number; paid: number; status: CellStatus }[];
  billed: number;
  paid: number;
  pending: number;
  totalDebt: number; // incluye saldos anteriores y meses fuera del rango
  monthsAhead: number; // meses futuros ya cubiertos (pagados o por su saldo a favor)
  overall: 'mora' | 'adelantado' | 'al día';
}

/**
 * Situación de cada casa, mes por mes, en el rango (el informe tipo Gantt).
 * Un mes futuro ya pagado es "adelantado". Si la casa tiene saldo a favor, los meses futuros sin cuota
 * que ese saldo alcanza a cubrir también se muestran como adelantados (sin sumarlos a lo facturado).
 */
export function housesInRange(db: DB, from: string, to: string, today: string): HouseRangeRow[] {
  const periods = periodsBetween(from, to);
  const current = periodOf(today);
  return db.houses.map((house) => {
    const mine = db.charges.filter((c) => c.houseId === house.id);
    const byPeriod = (p: string) => mine.filter((c) => c.period === p);

    // Meses futuros que el saldo a favor alcanza a cubrir, en orden.
    const fee = feeFor(db, house);
    const covered = new Set<string>();
    let credit = db.credits[house.id] ?? 0;
    for (let p = addMonths(current, 1); fee > 0 && credit >= fee && p <= addMonths(current, 120); p = addMonths(p, 1)) {
      if (byPeriod(p).length) continue;
      covered.add(p);
      credit = round2(credit - fee);
    }

    const cells = periods.map((period) => {
      // Todas las cuotas del mes: la mensual y las de saldo anterior (las importadas son de este tipo).
      const cs = byPeriod(period);
      if (!cs.length) return { period, amount: 0, paid: 0, status: (covered.has(period) ? 'adelantado' : 'sin cargo') as CellStatus };
      const amount = round2(cs.reduce((s, c) => s + c.amount, 0));
      const paid = round2(cs.reduce((s, c) => s + c.paid, 0));
      const dueDate = cs.map((c) => c.dueDate).sort()[0];
      const status: CellStatus = period > current && paid >= amount ? 'adelantado' : chargeStatus({ ...cs[0], amount, paid, dueDate }, today);
      return { period, amount, paid, status };
    });
    const billed = round2(cells.reduce((s, c) => s + c.amount, 0));
    const paid = round2(cells.reduce((s, c) => s + c.paid, 0));
    const monthsAhead = mine.filter((c) => c.kind === 'monthly' && c.period > current && c.paid >= c.amount).length + covered.size;
    const overall = overdueChargesOf(db, house.id, today).length ? 'mora' : monthsAhead > 0 ? 'adelantado' : 'al día';
    return { house, cells, billed, paid, pending: round2(billed - paid), totalDebt: houseDebt(db, house.id), monthsAhead, overall };
  });
}

export { houseLabel };
