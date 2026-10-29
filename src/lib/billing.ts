import type { Charge, DB, House, Payment, Person, Relation, Who } from './types';
import { addDays, addMonths, capitalize, dueDateFor, periodLabel, periodOf, round2 } from './dates';

export const houseLabel = (h: House) => `Polígono ${h.poligono}, Lote ${h.lote}`;

/** Orden natural: Polígono A lote 1, 2, …, 10; después Polígono B. */
export const compareHouses = (a: House, b: House) => a.poligono.localeCompare(b.poligono) || a.lote - b.lote;

export const feeFor = (db: DB, h: House) => h.customFee ?? db.config.fee;

export const pendingOf = (c: Charge) => round2(c.amount - c.paid);

export type ChargeStatus = 'pagado' | 'pendiente' | 'vencido' | 'parcial';

export function chargeStatus(c: Charge, today: string): ChargeStatus {
  if (pendingOf(c) <= 0) return 'pagado';
  if (c.dueDate < today) return 'vencido';
  return c.paid > 0 ? 'parcial' : 'pendiente';
}

export function chargesOf(db: DB, houseId: string): Charge[] {
  return db.charges
    .filter((c) => c.houseId === houseId)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.kind.localeCompare(b.kind));
}

export function openChargesOf(db: DB, houseId: string): Charge[] {
  return chargesOf(db, houseId).filter((c) => pendingOf(c) > 0);
}

export function overdueChargesOf(db: DB, houseId: string, today: string): Charge[] {
  return openChargesOf(db, houseId).filter((c) => c.dueDate < today);
}

export function houseDebt(db: DB, houseId: string): number {
  return round2(openChargesOf(db, houseId).reduce((s, c) => s + pendingOf(c), 0));
}

export function overdueDebt(db: DB, houseId: string, today: string): number {
  return round2(overdueChargesOf(db, houseId, today).reduce((s, c) => s + pendingOf(c), 0));
}

export function recipients(h: House, who: Who): { relation: Relation; person: Person }[] {
  const out: { relation: Relation; person: Person }[] = [];
  if (who === 'owner' || who === 'both' || !h.tenant) out.push({ relation: 'owner', person: h.owner });
  if ((who === 'tenant' || who === 'both') && h.tenant) out.push({ relation: 'tenant', person: h.tenant });
  return out;
}

export function canCreateVisits(h: House, relation: Relation): boolean {
  if (!h.tenant) return relation === 'owner';
  return h.visitorCodeBy === 'both' || h.visitorCodeBy === relation;
}

/**
 * Simula las Cloud Functions programadas: crea los cargos mensuales hasta el mes actual,
 * aplica saldos a favor y registra los reportes de los meses ya cerrados.
 */
export function runAutomations(db: DB, today: string): DB {
  const current = periodOf(today);
  const charges = [...db.charges];
  const credits = { ...db.credits };
  const exists = new Set(charges.filter((c) => c.kind === 'monthly').map((c) => `${c.houseId}|${c.period}`));

  for (let p = db.config.startPeriod; p <= current; p = addMonths(p, 1)) {
    for (const h of db.houses) {
      if (exists.has(`${h.id}|${p}`)) continue;
      const amount = feeFor(db, h);
      const credit = Math.min(credits[h.id] ?? 0, amount);
      if (credit > 0) credits[h.id] = round2(credits[h.id] - credit);
      charges.push({
        id: `${h.id}-${p}`,
        houseId: h.id,
        kind: 'monthly',
        period: p,
        description: `Cuota ${periodLabel(p)}`,
        amount,
        dueDate: dueDateFor(p, db.config.dueDay),
        paid: credit,
      });
    }
  }

  const reports = [...db.reports];
  const have = new Set(reports.map((r) => r.period));
  for (let p = db.config.startPeriod; p < current; p = addMonths(p, 1)) {
    if (!have.has(p)) reports.push({ period: p, generatedAt: `${addMonths(p, 1)}-01T01:00:00` });
  }

  if (charges.length === db.charges.length && reports.length === db.reports.length) return db;
  return { ...db, charges, credits, reports };
}

/** Registra un pago en efectivo, lo aplica a los cargos más antiguos y asigna el número de recibo. */
export function applyPayment(
  db: DB,
  input: { houseId: string; amount: number; payerName: string; receivedBy: string; note: string; date: string },
): { db: DB; payment: Payment } {
  let left = round2(input.amount);
  const updated = new Map<string, Charge>();
  const allocations: Payment['allocations'] = [];
  for (const c of openChargesOf(db, input.houseId)) {
    if (left <= 0) break;
    const take = Math.min(left, pendingOf(c));
    updated.set(c.id, { ...c, paid: round2(c.paid + take) });
    allocations.push({ chargeId: c.id, description: c.description, amount: round2(take) });
    left = round2(left - take);
  }
  const payment: Payment = {
    id: `pay-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    houseId: input.houseId,
    receiptNo: db.config.nextReceiptNo,
    date: input.date,
    amount: round2(input.amount),
    payerName: input.payerName,
    receivedBy: input.receivedBy,
    note: input.note,
    allocations,
    credit: left,
  };
  const credits = { ...db.credits };
  if (left > 0) credits[input.houseId] = round2((credits[input.houseId] ?? 0) + left);
  return {
    payment,
    db: {
      ...db,
      config: { ...db.config, nextReceiptNo: db.config.nextReceiptNo + 1 },
      charges: db.charges.map((c) => updated.get(c.id) ?? c),
      payments: [...db.payments, payment],
      credits,
    },
  };
}

export interface QueueItem {
  key: string;
  type: 'advance' | 'overdue';
  house: House;
  relation: Relation;
  person: Person;
  amount: number;
  months: string[];
  dueDate: string;
  sent: boolean;
}

/** Cola de avisos del día (lo que en producción arma la función diaria). */
export function notificationQueue(db: DB, today: string): QueueItem[] {
  const items: QueueItem[] = [];
  const sentKeys = new Set(db.notifications.map((n) => n.key));
  const current = periodOf(today);

  for (const h of db.houses) {
    const overdue = overdueChargesOf(db, h.id, today);
    const currentCharge = db.charges.find((c) => c.houseId === h.id && c.kind === 'monthly' && c.period === current);
    // Una casa en mora recibe solo el aviso de mora, no dos mensajes el mismo día.
    const advance =
      overdue.length === 0 &&
      currentCharge &&
      pendingOf(currentCharge) > 0 &&
      today <= currentCharge.dueDate &&
      today >= addDays(currentCharge.dueDate, -db.config.advanceDays);

    for (const { relation, person } of recipients(h, h.notifyTo)) {
      if (overdue.length) {
        const key = `overdue|${h.id}|${relation}|${today}`;
        items.push({
          key,
          type: 'overdue',
          house: h,
          relation,
          person,
          amount: round2(overdue.reduce((s, c) => s + pendingOf(c), 0)),
          months: overdue.map((c) => (c.kind === 'monthly' ? capitalize(periodLabel(c.period)) : c.description)),
          dueDate: overdue[0].dueDate,
          sent: sentKeys.has(key),
        });
      }
      if (advance && currentCharge) {
        const key = `advance|${h.id}|${relation}|${current}`;
        items.push({
          key,
          type: 'advance',
          house: h,
          relation,
          person,
          amount: pendingOf(currentCharge),
          months: [capitalize(periodLabel(current))],
          dueDate: currentCharge.dueDate,
          sent: sentKeys.has(key),
        });
      }
    }
  }
  return items;
}

const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function newVisitCode(db: DB): string {
  const used = new Set(db.visits.map((v) => v.code));
  for (;;) {
    let code = '';
    for (let i = 0; i < 6; i++) code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    if (!used.has(code)) return code;
  }
}
