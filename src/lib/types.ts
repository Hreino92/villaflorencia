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
  credit: number; // excedente que queda a favor
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

export interface MonthlyReport {
  period: string; // YYYY-MM del mes cerrado
  generatedAt: string;
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

/** Cuenta de acceso. En producción, el correo y la contraseña los guarda Firebase Auth (cifrada). */
export interface User {
  id: string;
  name: string;
  email: string;
  password: string; // solo demo: texto plano en el navegador
  role: Role;
  houseId?: string; // residentes
  relation?: Relation; // residentes: propietario o inquilino
  active: boolean;
}

export interface DB {
  version: number;
  config: Config;
  houses: House[];
  charges: Charge[];
  payments: Payment[];
  credits: Record<string, number>; // saldo a favor por casa
  notifications: NotificationLog[];
  visits: Visit[];
  reports: MonthlyReport[];
  users: User[];
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
