// Modelo de datos. Cada colección corresponde a una colección de Firestore en la versión real.

export type Role = 'admin' | 'residente' | 'vigilante';
export type Relation = 'owner' | 'tenant';
export type Who = 'owner' | 'tenant' | 'both';

export interface Person {
  name: string;
  phone: string; // 8 dígitos de El Salvador, sin el 503
  email: string;
  dui: string;
}

export interface House {
  id: string;
  poligono: string;
  lote: number;
  owner: Person;
  tenant: Person | null;
  notifyTo: Who; // a quién se envían los cobros
  visitorCodeBy: Who; // quién puede generar códigos de visita
  customFee: number | null; // null = cuota general
  notes: string;
}

export interface Charge {
  id: string;
  houseId: string;
  kind: 'monthly' | 'opening';
  period: string; // YYYY-MM (en saldos iniciales, el mes en que se cargó)
  description: string;
  amount: number;
  dueDate: string; // YYYY-MM-DD
  paid: number;
  paidBeforeSystem?: boolean; // mes que ya estaba pagado según el registro anterior (sin recibo en la app)
  adjustment?: number; // parte que se dio por pagada con "Poner al día" (sin recibo, no es ingreso)
  adjustedAt?: string;
  adjustedBy?: string;
}

export interface Allocation {
  chargeId: string;
  description: string;
  amount: number;
}

export interface Payment {
  id: string;
  houseId: string;
  receiptNo: number;
  date: string; // ISO
  amount: number;
  payerName: string;
  receivedBy: string;
  note: string;
  allocations: Allocation[];
  credit: number; // saldo a favor de la casa después de este pago
  creditUsed?: number; // saldo a favor anterior que este pago consumió (pagos anteriores: no lo tienen = 0)
  editedAt?: string; // si se corrigió: cuándo y quién (los pagos anteriores no lo tienen)
  editedBy?: string;
  voidedAt?: string; // si se anuló: cuándo, quién y por qué (ya no cuenta como pago)
  voidedBy?: string;
  voidReason?: string;
}

export interface NotificationLog {
  key: string;
  houseId: string;
  type: 'advance' | 'overdue';
  recipient: Relation;
  sentAt: string;
  by: string;
}

export interface Visit {
  code: string;
  houseId: string;
  visitorName: string;
  dui: string;
  date: string; // YYYY-MM-DD
  reason: string;
  createdBy: string;
  createdAt: string;
  enteredAt: string | null;
  guardName: string | null;
}

export const EXPENSE_CATEGORIES = [
  'Vigilancia',
  'Mantenimiento y reparaciones',
  'Jardinería y limpieza',
  'Agua y energía eléctrica',
  'Administración',
  'Materiales y suministros',
  'Otros',
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const PAYMENT_METHODS = ['Efectivo', 'Transferencia', 'Cheque'] as const;

/** Gasto de la residencial (salarios de vigilancia, reparaciones, servicios, etc.). */
export interface Expense {
  id: string;
  date: string; // YYYY-MM-DD
  concept: string;
  category: ExpenseCategory;
  amount: number;
  provider: string; // a quién se le pagó
  paymentMethod: (typeof PAYMENT_METHODS)[number];
  document: string; // número de factura, recibo o comprobante
  details: string;
  registeredBy: string;
  createdAt: string;
}

export interface Config {
  name: string;
  fee: number;
  dueDay: number;
  advanceDays: number;
  startPeriod: string;
  nextReceiptNo: number;
  simulatedToday: string | null; // solo demo: permite probar otra fecha
  templates: {
    advance: string;
    overdue: string;
    receipt: string;
    visit: string;
  };
}

/** Perfil y rol de una cuenta (users/{uid}). La contraseña la guarda Firebase Auth, nunca la app. */
export interface User {
  id: string; // uid de Firebase Auth
  name: string;
  email: string;
  role: Role;
  houseId?: string; // residentes
  relation?: Relation; // residentes: propietario o inquilino
  active: boolean;
}

export interface DB {
  config: Config;
  houses: House[];
  charges: Charge[];
  payments: Payment[];
  credits: Record<string, number>; // saldo a favor por casa
  notifications: NotificationLog[];
  visits: Visit[];
  users: User[];
  expenses: Expense[];
}

/** Datos del usuario que inició sesión (se arman a partir de su cuenta en cada render). */
export interface Session {
  userId: string;
  email: string;
  role: Role;
  name: string;
  houseId?: string;
  relation?: Relation;
}
