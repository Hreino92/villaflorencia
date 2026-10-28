import type { Config, DB, House, Person } from './types';
import { addMonths, dueDateFor, localISODate, periodOf } from './dates';
import { applyPayment, runAutomations } from './billing';

export const DEFAULT_TEMPLATES = {
  advance:
    'Estimado(a) {nombre}: le recordamos que la cuota de vigilancia y mantenimiento de {casa} correspondiente a {meses} por {monto} vence el {vence}. Puede cancelarla en efectivo con la administración. Gracias. — {residencial}',
  overdue:
    'Estimado(a) {nombre}: {casa} tiene un saldo pendiente de {monto} por {meses}. Le solicitamos ponerse al día a la brevedad en la administración. Si ya realizó el pago, por favor omita este mensaje. — {residencial}',
  receipt:
    'Estimado(a) {nombre}: confirmamos la recepción de su pago de {monto} para {casa}. Recibo No. {recibo}. ¡Gracias! — {residencial}',
  visit:
    'Hola {visitante}, tu código de acceso a {residencial} es *{codigo}*, válido el {fecha}. Presenta tu DUI en la caseta. Casa que visitas: {casa}.',
};

const FIRST = ['Carlos', 'María', 'José', 'Ana', 'Luis', 'Carmen', 'Jorge', 'Rosa', 'Mario', 'Patricia', 'Ricardo', 'Sandra', 'Francisco', 'Gloria', 'Roberto', 'Claudia', 'Miguel', 'Verónica', 'Óscar', 'Lorena', 'Manuel', 'Karla', 'René', 'Beatriz', 'Ernesto', 'Silvia', 'Rafael', 'Marta', 'Héctor', 'Elena', 'Víctor', 'Diana'];
const LAST = ['Hernández', 'Martínez', 'López', 'García', 'Rodríguez', 'Pérez', 'Flores', 'Ramírez', 'Rivera', 'Cruz', 'Mejía', 'Alvarado', 'Romero', 'Castillo', 'Guzmán', 'Henríquez', 'Portillo', 'Ayala', 'Menjívar', 'Escobar'];

// Generador pseudoaleatorio con semilla, para que la demo sea igual en cada reinicio.
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

/** Configuración con la que arranca una residencial nueva. */
export function defaultConfig(name: string, today: string): Config {
  return {
    name,
    fee: 22,
    dueDay: 30,
    advanceDays: 3,
    startPeriod: periodOf(today),
    nextReceiptNo: 1,
    simulatedToday: null,
    templates: { ...DEFAULT_TEMPLATES },
  };
}

function person(r: () => number, i: number, email: string): Person {
  const name = `${FIRST[i % FIRST.length]} ${LAST[Math.floor(r() * LAST.length)]} ${LAST[Math.floor(r() * LAST.length)]}`;
  const dui = `0${Math.floor(1000000 + r() * 8999999)}-${Math.floor(r() * 10)}`;
  const phone = `7${Math.floor(1000000 + r() * 8999999)}`;
  return { name, phone, email, dui };
}

/** Datos de ejemplo (casas, cuotas, pagos y visitas) para probar una residencial recién creada. */
export function createSeed(base: Config): DB {
  const r = rng(42);
  const today = localISODate();
  const current = periodOf(today);
  const startPeriod = addMonths(current, -5);

  const houses: House[] = [];
  let i = 0;
  for (const poligono of ['A', 'B', 'C', 'D']) {
    for (let lote = 1; lote <= 6; lote++) {
      const hasTenant = i % 3 === 1;
      houses.push({
        id: `${poligono}-${lote}`,
        poligono,
        lote,
        owner: person(r, i * 2, `propietario.${poligono.toLowerCase()}${lote}@villaflorencia.com`),
        tenant: hasTenant ? person(r, i * 2 + 1, `inquilino.${poligono.toLowerCase()}${lote}@villaflorencia.com`) : null,
        notifyTo: hasTenant ? (i % 2 ? 'tenant' : 'both') : 'owner',
        visitorCodeBy: hasTenant ? 'tenant' : 'owner',
        customFee: poligono === 'D' && lote === 6 ? 30 : null,
        notes: poligono === 'D' && lote === 6 ? 'Casa esquinera con local comercial: cuota especial.' : '',
      });
      i++;
    }
  }

  let db: DB = {
    version: 1,
    config: { ...base, startPeriod, nextReceiptNo: 1 },
    houses,
    charges: [
      {
        id: 'opening-B-4',
        houseId: 'B-4',
        kind: 'opening',
        period: startPeriod,
        description: 'Saldo anterior (antes del sistema)',
        amount: 66,
        dueDate: dueDateFor(startPeriod, 1),
        paid: 0,
      },
      {
        id: 'opening-C-2',
        houseId: 'C-2',
        kind: 'opening',
        period: startPeriod,
        description: 'Saldo anterior (antes del sistema)',
        amount: 44,
        dueDate: dueDateFor(startPeriod, 1),
        paid: 0,
      },
    ],
    payments: [],
    credits: {},
    notifications: [],
    visits: [],
    reports: [],
    users: [], // las cuentas se crean en Firebase Auth desde la pantalla Usuarios
  };

  db = runAutomations(db, today);

  // Historial de pagos: la mayoría al día, algunas casas con 1 a 3 meses de atraso.
  const behind: Record<string, number> = { 'A-3': 1, 'B-2': 2, 'B-4': 3, 'C-5': 1, 'D-1': 2, 'C-2': 1 };
  for (let p = startPeriod; p < current; p = addMonths(p, 1)) {
    for (const h of houses) {
      if (p > addMonths(current, -1 - (behind[h.id] ?? 0))) continue;
      const day = String(5 + Math.floor(r() * 20)).padStart(2, '0');
      const amount = h.customFee ?? db.config.fee;
      db = applyPayment(db, {
        houseId: h.id,
        amount,
        payerName: h.tenant && h.notifyTo !== 'owner' ? h.tenant.name : h.owner.name,
        receivedBy: 'Administración',
        note: '',
        date: `${p}-${day}T10:${String(Math.floor(r() * 60)).padStart(2, '0')}:00`,
      }).db;
    }
  }
  // Algunas casas ya pagaron el mes actual.
  for (const id of ['A-1', 'A-5', 'C-4', 'D-3']) {
    const h = houses.find((x) => x.id === id)!;
    db = applyPayment(db, {
      houseId: id,
      amount: h.customFee ?? db.config.fee,
      payerName: h.owner.name,
      receivedBy: 'Administración',
      note: '',
      date: `${today}T08:30:00`,
    }).db;
  }

  db.visits = [
    { code: 'K7M4TQ', houseId: 'A-2', visitorName: 'Fernando Aguilar', dui: '04512378-1', date: today, reason: 'Visita familiar', createdBy: houses[1].tenant!.name, createdAt: `${today}T07:15:00`, enteredAt: null, guardName: null },
    { code: 'P3XH8R', houseId: 'C-1', visitorName: 'Técnico de Internet (Tigo)', dui: '05123987-4', date: today, reason: 'Instalación de servicio', createdBy: houses[12].owner.name, createdAt: `${today}T06:50:00`, enteredAt: `${today}T09:05:00`, guardName: 'Pedro Sorto' },
    { code: 'W9BN2C', houseId: 'B-5', visitorName: 'Lucía Benítez', dui: '03344556-7', date: today, reason: 'Limpieza', createdBy: houses[10].owner.name, createdAt: `${today}T06:00:00`, enteredAt: null, guardName: null },
  ];
  return db;
}
