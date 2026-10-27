import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useSession } from '../lib/store';
import type { Role } from '../lib/types';

export const HOME: Record<Role, string> = {
  admin: '/admin',
  residente: '/residente',
  vigilante: '/vigilante',
};

/**
 * Protección de rutas por rol (el "middleware" de cada tipo de usuario):
 * - sin sesión → al login, recordando a dónde quería ir;
 * - con otro rol → a la pantalla de inicio de su propio rol.
 * En producción, las reglas de Firestore aplican la misma restricción en el servidor.
 */
export default function RequireRole({ role, children }: { role: Role; children: ReactNode }) {
  const session = useSession();
  const location = useLocation();
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (session.role !== role) return <Navigate to={HOME[session.role]} replace state={{ denied: true }} />;
  return <>{children}</>;
}

/** Ruta raíz y rutas desconocidas: manda a cada quien a su inicio. */
export function HomeRedirect() {
  const session = useSession();
  return <Navigate to={session ? HOME[session.role] : '/login'} replace />;
}
