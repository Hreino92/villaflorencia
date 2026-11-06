import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { clearSyncError, logout, useDB, useSession, useSyncError } from '../lib/store';
import { fmtDate } from '../lib/dates';
import { houseLabel } from '../lib/billing';
import { usingEmulators } from '../lib/firebase';
import { Veranera } from './ui';

const NAV = {
  admin: [
    { to: '/admin', label: 'Inicio' },
    { to: '/admin/casas', label: 'Casas' },
    { to: '/admin/pagos', label: 'Pagos' },
    { to: '/admin/avisos', label: 'Avisos WhatsApp' },
    { to: '/admin/reportes', label: 'Reportes' },
    { to: '/admin/usuarios', label: 'Usuarios' },
    { to: '/admin/configuracion', label: 'Configuración' },
  ],
  residente: [
    { to: '/residente', label: 'Mi cuenta' },
    { to: '/residente/visitas', label: 'Mis visitas' },
  ],
  vigilante: [{ to: '/vigilante', label: 'Caseta' }],
};

const ROLE_LABEL = { admin: 'Administración', residente: 'Residente', vigilante: 'Vigilancia' };

/** "Residencial Villa Florencia" → ["Residencial", "Villa Florencia"] para la marca. */
export function splitName(name: string): [string, string] {
  const m = name.match(/^(Residencial|Colonia|Urbanización|Condominio)\s+(.+)$/i);
  return m ? [m[1], m[2]] : ['', name];
}

export default function Layout() {
  const db = useDB();
  const session = useSession()!;
  const syncError = useSyncError();
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const house = session.houseId ? db.houses.find((h) => h.id === session.houseId) : null;
  const [kind, name] = splitName(db.config.name);

  return (
    <div className="min-h-screen md:grid md:grid-cols-[248px_1fr]">
      <aside className="border-b border-slate-200 bg-slate-50 md:sticky md:top-0 md:flex md:h-screen md:flex-col md:border-r md:border-b-0">
        <div className="flex items-center justify-between gap-3 px-5 py-4 md:py-6">
          <div className="flex min-w-0 items-center gap-3">
            <Veranera size={36} className="shrink-0" />
            <div className="min-w-0 leading-tight">
              {kind && <div className="text-[13px] text-slate-500">{kind}</div>}
              <div className="truncate text-[18px] font-semibold tracking-tight text-terracota-700">{name}</div>
            </div>
          </div>
          <button className="btn btn-sm btn-secondary md:hidden" aria-expanded={open} onClick={() => setOpen(!open)}>
            Menú
          </button>
        </div>

        <nav className={`flex-col gap-0.5 px-3 pb-3 md:flex md:flex-1 ${open ? "flex animate-fade md:animate-none" : "hidden"}`}>
          {NAV[session.role].map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `flex min-h-11 items-center rounded-lg border-l-2 px-3 text-[15px] transition-colors duration-150 ${
                  isActive ? 'border-terracota-500 bg-terracota-100 font-medium text-terracota-700' : 'border-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`
              }
            >
              {n.label}
            </NavLink>
          ))}
          <div className="mt-4 border-t border-slate-200 px-3 pt-4 md:mt-auto">
            <div className="truncate text-[15px] font-medium text-slate-900">{session.name}</div>
            <div className="truncate text-[13px] text-slate-500">{house ? houseLabel(house) : ROLE_LABEL[session.role]}</div>
            <button className="btn btn-sm btn-secondary mt-3 w-full" onClick={logout}>
              Cerrar sesión
            </button>
          </div>
        </nav>
      </aside>

      <div className="min-w-0">
        {usingEmulators && (
          <div className="bg-sky-100 px-4 py-1.5 text-center text-[13px] text-sky-800">
            Modo de pruebas local: los datos están en los emuladores de esta computadora
          </div>
        )}
        {db.config.simulatedToday && (
          <div className="bg-amber-100 px-4 py-1.5 text-center text-[13px] text-amber-900">
            Fecha simulada: {fmtDate(db.config.simulatedToday)}
          </div>
        )}
        {syncError && (
          <div role="alert" className="flex items-center justify-center gap-3 bg-red-100 px-4 py-2 text-sm text-red-800">
            {syncError}
            <button className="min-h-11 cursor-pointer font-medium underline" onClick={clearSyncError}>Cerrar</button>
          </div>
        )}
        <main className="mx-auto max-w-6xl px-4 py-6 md:px-10 md:py-10">
          {/* La clave reinicia la animación de entrada en cada pantalla. */}
          <div key={pathname} className="animate-rise">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
