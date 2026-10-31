// Datos de la app sobre Firebase (Auth + Firestore).
//
// Las pantallas trabajan con un objeto DB en memoria (useDB) y lo cambian con update(fn).
// Este archivo mantiene ese objeto sincronizado con Firestore:
//   - lectura: listeners en tiempo real, distintos según el rol (cada quien solo descarga lo suyo);
//   - escritura: update() compara el DB anterior con el nuevo y escribe solo los documentos que cambiaron.
// Las reglas de firestore.rules validan en el servidor que cada rol solo lea y escriba lo permitido.
import { useSyncExternalStore } from 'react';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import {
  DocumentReference,
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  runTransaction,
  where,
  writeBatch,
  type Query,
  type Unsubscribe,
} from 'firebase/firestore';
import type { Charge, Config, DB, House, Payment, Relation, Role, Session, User } from './types';
import { auth, creatorAuth, fs } from './firebase';
import { applyPayment, compareHouses, editPayment, runAutomations } from './billing';
import { defaultConfig, createSeed } from './seed';
import { addDays, localISODate } from './dates';

// ---------- Estado en memoria ----------

export type AuthStatus = 'loading' | 'signedOut' | 'signedIn';

interface State {
  db: DB;
  status: AuthStatus;
  user: User | null;
  setupNeeded: boolean | null; // null = todavía no se sabe
  error: string | null;
}

function emptyDB(config: Config = defaultConfig('Residencial', localISODate())): DB {
  return { config, houses: [], charges: [], payments: [], credits: {}, notifications: [], visits: [], users: [], expenses: [] };
}

let state: State = { db: emptyDB(), status: 'loading', user: null, setupNeeded: null, error: null };
const listeners = new Set<() => void>();

function set(patch: Partial<State>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

function useStore<T>(pick: (s: State) => T): T {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => pick(state),
  );
}

export const useDB = () => useStore((s) => s.db);
export const useAuthStatus = () => useStore((s) => s.status);
export const useSetupNeeded = () => useStore((s) => s.setupNeeded);
export const useSyncError = () => useStore((s) => s.error);
export const clearSyncError = () => set({ error: null });
export const getDB = () => state.db;

export function todayOf(d: DB): string {
  return d.config.simulatedToday ?? localISODate();
}

export function useToday(): string {
  return todayOf(useDB());
}

const sessionCache = new WeakMap<User, Session>();
export function useSession(): Session | null {
  const user = useStore((s) => s.user);
  if (!user) return null;
  let s = sessionCache.get(user);
  if (!s) {
    s = { userId: user.id, email: user.email, role: user.role, name: user.name, houseId: user.houseId, relation: user.relation };
    sessionCache.set(user, s);
  }
  return s;
}

// ---------- Escritura: diferencias entre el DB anterior y el nuevo ----------

// Colección de Firestore → campo que sirve de id del documento.
const KEYS = {
  houses: 'id',
  charges: 'id',
  payments: 'id',
  notifications: 'key',
  visits: 'code',
  users: 'id',
  expenses: 'id',
} as const;
type ListName = keyof typeof KEYS;

type Op = { ref: DocumentReference; data: object | null };

function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v)
      .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
      .sort()
      .map((k) => `${k}:${stable((v as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(v);
}

function diff(prev: DB, next: DB): Op[] {
  const ops: Op[] = [];
  if (prev.config !== next.config && stable(prev.config) !== stable(next.config)) {
    ops.push({ ref: doc(fs, 'config', 'general'), data: next.config });
  }
  for (const name of Object.keys(KEYS) as ListName[]) {
    if (prev[name] === next[name]) continue;
    const key = KEYS[name];
    const id = (x: object) => String((x as Record<string, unknown>)[key]);
    const before = new Map((prev[name] as object[]).map((x) => [id(x), x]));
    const after = new Map((next[name] as object[]).map((x) => [id(x), x]));
    for (const [k, v] of after) {
      const old = before.get(k);
      if (old !== v && (!old || stable(old) !== stable(v))) ops.push({ ref: doc(fs, name, k), data: v });
    }
    for (const k of before.keys()) if (!after.has(k)) ops.push({ ref: doc(fs, name, k), data: null });
  }
  if (prev.credits !== next.credits) {
    for (const k of new Set([...Object.keys(prev.credits), ...Object.keys(next.credits)])) {
      if (prev.credits[k] === next.credits[k]) continue;
      ops.push({ ref: doc(fs, 'credits', k), data: next.credits[k] ? { amount: next.credits[k] } : null });
    }
  }
  return ops;
}

async function commit(ops: Op[]) {
  // Un lote de Firestore admite 500 operaciones.
  for (let i = 0; i < ops.length; i += 450) {
    const batch = writeBatch(fs);
    for (const op of ops.slice(i, i + 450)) {
      if (op.data) batch.set(op.ref, op.data);
      else batch.delete(op.ref);
    }
    await batch.commit();
  }
}

function reportError(e: unknown) {
  console.error(e);
  const code = (e as { code?: string }).code ?? '';
  set({
    error:
      code === 'permission-denied'
        ? 'No tienes permiso para hacer ese cambio. Se descartó.'
        : 'No se pudo guardar el último cambio. Revisa tu conexión a internet.',
  });
}

const isAdmin = () => state.user?.role === 'admin' && state.user.active;

/** Tareas automáticas (cuotas del mes, saldo a favor, reportes): las ejecuta la sesión del administrador. */
function withAutomations(d: DB): DB {
  return isAdmin() && dataReady && !loadFailed ? runAutomations(d, todayOf(d)) : d;
}

/** Aplica un cambio en pantalla de inmediato y lo guarda en Firestore. */
export function update(fn: (d: DB) => DB) {
  const prev = state.db;
  const next = withAutomations(fn(prev));
  if (next === prev) return;
  set({ db: next });
  commit(diff(prev, next)).catch(reportError);
}

// ---------- Lectura: listeners según el rol ----------

let dataUnsubs: Unsubscribe[] = [];
let userUnsub: Unsubscribe | null = null;
let subscribedFor = '';
let pending = new Set<string>();
let dataReady = false;
let loadFailed = false; // con datos incompletos no se generan cuotas (podría sobrescribir pagos)

function stopData() {
  dataUnsubs.forEach((u) => u());
  dataUnsubs = [];
  subscribedFor = '';
  dataReady = false;
  loadFailed = false;
}

function markLoaded(name: string) {
  if (!pending.delete(name) || pending.size > 0 || dataReady) return;
  dataReady = true;
  // Primera carga completa: el administrador genera lo que falte (cuotas del mes, reportes).
  if (isAdmin()) update((d) => d);
  if (state.user) set({ status: 'signedIn' });
}

/** Un listener que falla deja de bloquear la carga y muestra el aviso de error. */
function failed(name: string) {
  return (e: unknown) => {
    loadFailed = true;
    reportError(e);
    markLoaded(name);
  };
}

function listenList(name: ListName, q: Query) {
  pending.add(name);
  dataUnsubs.push(
    onSnapshot(
      q,
      (snap) => {
        const docs = snap.docs.map((d) => d.data());
        // Firestore ordena por id como texto ("A-10" antes que "A-2"): las casas se ordenan por número.
        if (name === 'houses') (docs as House[]).sort(compareHouses);
        set({ db: { ...state.db, [name]: docs } });
        markLoaded(name);
      },
      failed(name),
    ),
  );
}

function listenDocAsList(name: ListName, ref: DocumentReference) {
  pending.add(name);
  dataUnsubs.push(
    onSnapshot(
      ref,
      (snap) => {
        set({ db: { ...state.db, [name]: snap.exists() ? [snap.data()] : [] } });
        markLoaded(name);
      },
      failed(name),
    ),
  );
}

function listenCredits(q: Query | DocumentReference) {
  pending.add('credits');
  const apply = (entries: [string, number][]) => {
    set({ db: { ...state.db, credits: Object.fromEntries(entries.filter(([, v]) => v > 0)) } });
    markLoaded('credits');
  };
  dataUnsubs.push(
    q instanceof DocumentReference
      ? onSnapshot(q, (s) => apply(s.exists() ? [[s.id, (s.data() as { amount: number }).amount]] : []), failed('credits'))
      : onSnapshot(q, (s) => apply(s.docs.map((d) => [d.id, (d.data() as { amount: number }).amount])), failed('credits')),
  );
}

function startData(user: User) {
  const signature = `${user.id}|${user.role}|${user.houseId ?? ''}|${user.active}`;
  if (signature === subscribedFor) return;
  stopData();
  subscribedFor = signature;
  pending = new Set();
  set({ db: emptyDB(state.db.config), status: 'loading' });
  const col = (n: string) => collection(fs, n);

  const today = localISODate();
  if (user.role === 'admin') {
    // Avisos y visitas crecen sin límite y ninguna pantalla usa los viejos: solo los recientes,
    // para no gastar el límite diario de lecturas del plan gratuito.
    const recent: Partial<Record<ListName, Query>> = {
      notifications: query(col('notifications'), where('sentAt', '>=', `${today.slice(0, 8)}01`)),
      visits: query(col('visits'), where('date', '>=', addDays(today, -30))),
    };
    for (const name of Object.keys(KEYS) as ListName[]) listenList(name, recent[name] ?? col(name));
    listenCredits(col('credits'));
  } else if (user.role === 'vigilante') {
    // ">=" y no "==": la tablet de la caseta queda abierta pasada la medianoche y debe ver las visitas del día nuevo.
    listenList('visits', query(col('visits'), where('date', '>=', today)));
  } else if (user.houseId) {
    const h = user.houseId;
    listenDocAsList('houses', doc(fs, 'houses', h));
    listenList('charges', query(col('charges'), where('houseId', '==', h)));
    listenList('payments', query(col('payments'), where('houseId', '==', h)));
    listenList('visits', query(col('visits'), where('houseId', '==', h)));
    listenCredits(doc(fs, 'credits', h));
  }
  if (pending.size === 0) {
    dataReady = true;
    set({ status: 'signedIn' });
  }
}

// La configuración es pública (nombre de la residencial en el login) y dice si falta la configuración inicial.
onSnapshot(
  doc(fs, 'config', 'general'),
  (snap) => {
    const config = snap.exists() ? (snap.data() as Config) : state.db.config;
    set({ setupNeeded: !snap.exists(), db: { ...state.db, config } });
  },
  (e) => {
    reportError(e);
    set({ setupNeeded: false });
  },
);

onAuthStateChanged(auth, (fbUser) => {
  userUnsub?.();
  userUnsub = null;
  stopData();
  if (!fbUser) {
    set({ user: null, status: 'signedOut', db: emptyDB(state.db.config) });
    return;
  }
  set({ status: 'loading' });
  userUnsub = onSnapshot(
    doc(fs, 'users', fbUser.uid),
    { includeMetadataChanges: true }, // para enterarse cuando el servidor confirma el perfil
    (snap) => {
      // Se espera a que el servidor confirme el perfil: las reglas lo leen del servidor,
      // y abrir los listeners antes (p. ej. justo al crear la residencial) sería rechazado.
      if (snap.metadata.hasPendingWrites) return;
      const user = snap.exists() ? (snap.data() as User) : null;
      if (!user || !user.active || (user.role === 'residente' && !user.houseId)) {
        // Sin perfil (o desactivado): no ve nada. Al crear la residencial, el perfil llega un instante después.
        stopData();
        set({ user: null, status: 'signedOut', db: emptyDB(state.db.config) });
        return;
      }
      set({ user });
      startData(user);
    },
    (e) => {
      reportError(e);
      set({ user: null, status: 'signedOut' });
    },
  );
});

// ---------- Autenticación ----------

function authMessage(e: unknown): string {
  const code = (e as { code?: string }).code ?? '';
  if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found' || code === 'auth/invalid-email')
    return 'Correo o contraseña incorrectos.';
  if (code === 'auth/too-many-requests') return 'Demasiados intentos. Espera unos minutos o restablece tu contraseña.';
  if (code === 'auth/email-already-in-use') return 'Ya existe una cuenta con ese correo.';
  if (code === 'auth/weak-password') return 'La contraseña debe tener al menos 8 caracteres.';
  if (code === 'auth/network-request-failed') return 'Sin conexión a internet.';
  console.error(e);
  return 'Ocurrió un error. Intenta de nuevo.';
}

/** Inicia sesión. Devuelve el rol (para llevar al usuario a su pantalla) o un mensaje de error. */
export async function login(email: string, password: string): Promise<{ role: Role } | string> {
  try {
    const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
    const snap = await getDoc(doc(fs, 'users', cred.user.uid));
    const user = snap.exists() ? (snap.data() as User) : null;
    if (!user) {
      await signOut(auth);
      return 'Tu cuenta no tiene acceso a la app. Contacta a la administración.';
    }
    if (!user.active) {
      await signOut(auth);
      return 'Esta cuenta está desactivada. Contacta a la administración.';
    }
    return { role: user.role };
  } catch (e) {
    return authMessage(e);
  }
}

export function logout() {
  void signOut(auth);
}

export async function resetPassword(email: string): Promise<string | null> {
  try {
    await sendPasswordResetEmail(auth, email.trim());
    return null;
  } catch (e) {
    return authMessage(e);
  }
}

// ---------- Operaciones especiales ----------

/** Crea la cuenta en Firebase Auth (sin cerrar la sesión del administrador) y su perfil con el rol. */
export async function createAccount(input: {
  name: string;
  email: string;
  password: string;
  role: Role;
  houseId?: string;
  relation?: Relation;
  active: boolean;
}): Promise<string | null> {
  try {
    const creator = creatorAuth();
    const cred = await createUserWithEmailAndPassword(creator, input.email.trim(), input.password);
    await signOut(creator);
    const { password: _omit, ...profile } = input;
    void _omit;
    update((d) => ({ ...d, users: [...d.users, { ...profile, id: cred.user.uid, email: input.email.trim().toLowerCase() }] }));
    return null;
  } catch (e) {
    return authMessage(e);
  }
}

/**
 * Cambia los pagos de una casa en una transacción: lee del servidor la configuración, las cuotas,
 * el saldo a favor y (si se corrige) el pago original, así nunca se trabaja con datos viejos
 * y dos administradores al mismo tiempo nunca obtienen el mismo número de recibo.
 */
function paymentTransaction(
  houseId: string,
  paymentId: string | null,
  compute: (before: DB, old: Payment | null) => { db: DB; payment: Payment } | string,
): Promise<Payment> {
  const chargeIds = state.db.charges.filter((c) => c.houseId === houseId).map((c) => c.id);
  return runTransaction(fs, async (tx) => {
    const cfgRef = doc(fs, 'config', 'general');
    const creditRef = doc(fs, 'credits', houseId);
    const cfg = await tx.get(cfgRef);
    const charges = (await Promise.all(chargeIds.map((id) => tx.get(doc(fs, 'charges', id)))))
      .filter((s) => s.exists())
      .map((s) => s.data() as Charge);
    const credit = await tx.get(creditRef);
    const house = await tx.get(doc(fs, 'houses', houseId)); // su cuota decide cuántos meses adelantados cubre
    const oldSnap = paymentId ? await tx.get(doc(fs, 'payments', paymentId)) : null;
    if (oldSnap && !oldSnap.exists()) throw new Error('El pago ya no existe.');
    const old = (oldSnap?.data() as Payment | undefined) ?? null;
    const before: DB = {
      ...emptyDB(cfg.data() as Config),
      houses: house.exists() ? [house.data() as House] : [],
      charges,
      payments: old ? [old] : [],
      credits: credit.exists() ? { [houseId]: (credit.data() as { amount: number }).amount } : {},
    };
    const result = compute(before, old);
    if (typeof result === 'string') throw new Error(result);
    const { db: after, payment } = result;
    if (after.config.nextReceiptNo !== before.config.nextReceiptNo) tx.update(cfgRef, { nextReceiptNo: after.config.nextReceiptNo });
    for (const c of after.charges) {
      if (c !== charges.find((x) => x.id === c.id)) tx.set(doc(fs, 'charges', c.id), c);
    }
    // Meses adelantados que una corrección dejó sin pagar.
    for (const c of charges) if (!after.charges.some((x) => x.id === c.id)) tx.delete(doc(fs, 'charges', c.id));
    tx.set(doc(fs, 'payments', payment.id), payment);
    if (after.credits[houseId] !== before.credits[houseId]) {
      if (after.credits[houseId]) tx.set(creditRef, { amount: after.credits[houseId] });
      else if (credit.exists()) tx.delete(creditRef);
    }
    return payment;
  });
}

/** Registra un pago en efectivo con el siguiente número de recibo. */
export function registerPayment(input: Parameters<typeof applyPayment>[1]): Promise<Payment> {
  return paymentTransaction(input.houseId, null, (before) => applyPayment(before, input));
}

/** Corrige un pago ya registrado (monto, quién pagó, fecha o nota); el recibo conserva su número. */
export function updatePayment(id: string, houseId: string, input: Parameters<typeof editPayment>[2]): Promise<Payment> {
  // El administrador tiene todos los pagos cargados: así se sabe si hay uno posterior de la misma casa.
  const mine = state.db.payments.filter((p) => p.houseId === houseId);
  const target = mine.find((p) => p.id === id);
  const isLatest = !!target && mine.every((p) => p.receiptNo <= target.receiptNo);
  return paymentTransaction(houseId, id, (before, old) => editPayment(before, old!, input, isLatest));
}

export interface HouseImport {
  startPeriod: string;
  houses: House[];
  charges: Charge[];
  credits: Record<string, number>;
}

/** Lee y valida el archivo de importación de casas. Devuelve los datos o un mensaje de error. */
export function parseHouseImport(text: string): HouseImport | string {
  let d: Partial<HouseImport> & { format?: string };
  try {
    d = JSON.parse(text);
  } catch {
    return 'El archivo no es un JSON válido.';
  }
  if (d.format !== 'villaflorencia-import-v1') return 'Este archivo no es un archivo de importación de casas.';
  if (!/^\d{4}-\d{2}$/.test(d.startPeriod ?? '')) return 'El archivo no indica desde qué mes se cobra.';
  if (!Array.isArray(d.houses) || !d.houses.length || !Array.isArray(d.charges) || typeof d.credits !== 'object' || !d.credits) return 'Al archivo le faltan casas o cuotas.';
  const ids = new Set<string>();
  for (const h of d.houses) {
    if (!h?.id || !h.poligono || !(h.lote > 0) || !h.owner?.name) return `Casa con datos incompletos: ${JSON.stringify(h).slice(0, 80)}`;
    if (ids.has(h.id)) return `Casa repetida: ${h.id}`;
    ids.add(h.id);
  }
  for (const c of d.charges) {
    if (!c?.id || !ids.has(c.houseId) || !(c.amount > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(c.dueDate)) return `Cuota con datos incompletos: ${JSON.stringify(c).slice(0, 80)}`;
  }
  for (const [k, v] of Object.entries(d.credits)) if (!ids.has(k) || !(v > 0)) return `Saldo a favor inválido para ${k}.`;
  return d as HouseImport;
}

/**
 * Reemplaza casas, cuotas, pagos, visitas, avisos y gastos por los del archivo.
 * Conserva administradores, vigilantes y la configuración (el cobro automático empieza en startPeriod).
 */
export async function importHouses(data: HouseImport): Promise<void> {
  const prev = state.db;
  const next: DB = {
    ...prev,
    config: { ...prev.config, startPeriod: data.startPeriod, nextReceiptNo: 1 },
    houses: data.houses,
    charges: data.charges,
    credits: data.credits,
    payments: [],
    notifications: [],
    visits: [],
    expenses: [],
    // Las cuentas de residentes apuntaban a las casas anteriores (una "A-1" de ejemplo daría acceso a la A-1 real):
    // se quitan todas. Administradores y vigilantes se quedan.
    users: prev.users.filter((u) => u.role !== 'residente'),
  };
  set({ db: next });
  await commit(diff(prev, next));
}

/** Lee el archivo de meses pagados antes del sistema. Devuelve las cuotas o un mensaje de error. */
export function parsePaidHistory(text: string): Charge[] | string {
  let d: { format?: string; charges?: Charge[] };
  try {
    d = JSON.parse(text);
  } catch {
    return 'El archivo no es un JSON válido.';
  }
  if (d.format !== 'villaflorencia-paid-history-v1' || !Array.isArray(d.charges)) return 'Este archivo no es de meses pagados.';
  for (const c of d.charges) {
    if (!c?.id || !c.houseId || !/^\d{4}-\d{2}$/.test(c.period) || !(c.amount > 0) || c.paid !== c.amount || c.paidBeforeSystem !== true) {
      return `Mes pagado con datos incompletos: ${JSON.stringify(c).slice(0, 80)}`;
    }
  }
  return d.charges;
}

/**
 * Solo AGREGA los meses pagados antes del sistema: no borra ni cambia nada.
 * Se salta los de casas que no existen y los meses que la casa ya tiene registrados (pagados o no).
 */
export async function addPaidHistory(charges: Charge[]): Promise<number> {
  const prev = state.db;
  const houses = new Set(prev.houses.map((h) => h.id));
  const taken = new Set(prev.charges.map((c) => `${c.houseId}|${c.period}`));
  const add = charges.filter((c) => houses.has(c.houseId) && !taken.has(`${c.houseId}|${c.period}`));
  if (!add.length) return 0;
  const next: DB = { ...prev, charges: [...prev.charges, ...add] };
  set({ db: next });
  await commit(diff(prev, next));
  return add.length;
}

/** Configuración inicial: crea la cuenta del primer administrador y la residencial. */
export async function setupResidential(input: {
  residential: string;
  adminName: string;
  email: string;
  password: string;
  withDemo: boolean;
}): Promise<string | null> {
  try {
    const cred = await createUserWithEmailAndPassword(auth, input.email.trim(), input.password);
    const admin: User = { id: cred.user.uid, name: input.adminName.trim(), email: input.email.trim().toLowerCase(), role: 'admin', active: true };
    const config = defaultConfig(input.residential.trim(), localISODate());
    const batch = writeBatch(fs);
    batch.set(doc(fs, 'users', admin.id), admin);
    batch.set(doc(fs, 'config', 'general'), config);
    await batch.commit();
    if (input.withDemo) {
      const seed = createSeed(config);
      await commit(diff(emptyDB(config), { ...seed, users: [] }));
    }
    return null;
  } catch (e) {
    return authMessage(e);
  }
}
