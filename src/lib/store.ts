// Almacenamiento de la demo en el navegador (localStorage).
// En la versión con Firebase, este archivo es lo único que se reemplaza por lecturas/escrituras a Firestore.
import { useSyncExternalStore } from 'react';
import type { DB, Session } from './types';
import { createSeed } from './seed';
import { runAutomations } from './billing';
import { localISODate } from './dates';

const DB_KEY = 'villaflorencia-db-v2';
const SESSION_KEY = 'villaflorencia-session-v2';

function load(): DB {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) return JSON.parse(raw) as DB;
  } catch {
    /* datos dañados o almacenamiento bloqueado: se vuelve a la demo */
  }
  return createSeed();
}

let db: DB = load();
db = runAutomations(db, todayOf(db));
persist();

const listeners = new Set<() => void>();

function persist() {
  try {
    localStorage.setItem(DB_KEY, JSON.stringify(db));
  } catch {
    /* sin almacenamiento: la demo funciona solo en memoria */
  }
}

function emit() {
  persist();
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function todayOf(d: DB): string {
  return d.config.simulatedToday ?? localISODate();
}

export function getDB(): DB {
  return db;
}

export function useDB(): DB {
  return useSyncExternalStore(subscribe, () => db);
}

export function useToday(): string {
  return todayOf(useDB());
}

/** Aplica un cambio y vuelve a correr las tareas automáticas (cargos del mes, reportes). */
export function update(fn: (d: DB) => DB) {
  const next = fn(db);
  db = runAutomations(next, todayOf(next));
  emit();
}

export function resetDemo() {
  db = createSeed();
  emit();
}

// ---- Sesión (en producción: Firebase Auth con correo y contraseña) ----

// Solo se guarda el id del usuario; rol, nombre y casa se leen de su cuenta,
// así un cambio de rol o una desactivación aplica de inmediato.
let sessionUserId: string | null = (() => {
  try {
    return localStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
})();
const sessionListeners = new Set<() => void>();

function sessionFor(d: DB, userId: string | null): Session | null {
  const u = userId ? d.users.find((x) => x.id === userId) : undefined;
  if (!u || !u.active) return null;
  if (u.role === 'residente' && !d.houses.some((h) => h.id === u.houseId)) return null;
  return { userId: u.id, email: u.email, role: u.role, name: u.name, houseId: u.houseId, relation: u.relation };
}

export function useSession(): Session | null {
  const d = useDB();
  const id = useSyncExternalStore(
    (l) => {
      sessionListeners.add(l);
      return () => sessionListeners.delete(l);
    },
    () => sessionUserId,
  );
  return sessionFor(d, id);
}

function setSessionUser(id: string | null) {
  sessionUserId = id;
  try {
    if (id) localStorage.setItem(SESSION_KEY, id);
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignorado */
  }
  sessionListeners.forEach((l) => l());
}

/** Inicia sesión con correo y contraseña. Devuelve la sesión o un mensaje de error. */
export function login(email: string, password: string): Session | string {
  const mail = email.trim().toLowerCase();
  const u = db.users.find((x) => x.email.toLowerCase() === mail);
  if (!u || u.password !== password) return 'Correo o contraseña incorrectos.';
  if (!u.active) return 'Esta cuenta está desactivada. Contacta a la administración.';
  const s = sessionFor(db, u.id);
  if (!s) return 'La cuenta no tiene una casa asignada. Contacta a la administración.';
  setSessionUser(u.id);
  return s;
}

export function logout() {
  setSessionUser(null);
}
