import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStatus, useSession, useSetupNeeded } from '../lib/store';
import type { Role } from '../lib/types';

export const HOME: Record<Role, string> = {
  admin: '/admin',
  residente: '/residente',
  vigilante: '/vigilante',
};

export function Loading({ text = 'Cargando…' }: { text?: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center text-slate-500">
      <div className="flex items-center gap-3">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-emerald-700 border-t-transparent" />
        {text}
      </div>
    </div>
  );
}

/**
 * Protección de rutas por rol (el "middleware" de cada tipo de usuario):
 * - mientras se verifica la sesión → pantalla de carga;
 * - sin sesión → al login, recordando a dónde quería ir;
 * - con otro rol → a la pantalla de inicio de su propio rol.
 * Las reglas de Firestore aplican la misma restricción en el servidor.
 */
export default function RequireRole({ role, children }: { role: Role; children: ReactNode }) {
  const status = useAuthStatus();
  const session = useSession();
  const location = useLocation();
  if (status === 'loading') return <Loading />;
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (session.role !== role) return <Navigate to={HOME[session.role]} replace />;
  return <>{children}</>;
}

/** Ruta raíz y rutas desconocidas: manda a cada quien a su inicio. */
export function HomeRedirect() {
  const status = useAuthStatus();
  const session = useSession();
  const setupNeeded = useSetupNeeded();
  if (status === 'loading' || setupNeeded === null) return <Loading />;
  if (setupNeeded) return <Navigate to="/setup" replace />;
  return <Navigate to={session ? HOME[session.role] : '/login'} replace />;
}
