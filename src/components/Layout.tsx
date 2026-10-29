import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
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
  const house = session.houseId ? db.houses.find((h) => h.id === session.houseId) : null;
  const [kind, name] = splitName(db.config.name);

  return (
    <div className="min-h-screen md:grid md:grid-cols-[248px_1fr]">
      <aside className="bg-emerald-900 text-emerald-50 md:sticky md:top-0 md:flex md:h-screen md:flex-col">
        <div className="flex items-center justify-between gap-3 px-5 py-4 md:py-6">
          <div className="flex min-w-0 items-center gap-3">
            <Veranera size={36} className="shrink-0" />
            <div className="min-w-0 leading-tight">
              {kind && <div className="text-[13px] text-emerald-200">{kind}</div>}
              <div className="truncate text-[19px] font-extrabold tracking-tight text-white">{name}</div>
            </div>
          </div>
          <button className="btn btn-sm border border-emerald-700 text-emerald-50 md:hidden" aria-expanded={open} onClick={() => setOpen(!open)}>
            Menú
          </button>
        </div>

        <nav className={`flex-col gap-0.5 px-3 pb-3 md:flex md:flex-1 ${open ? 'flex' : 'hidden'}`}>
          {NAV[session.role].map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `rounded-[10px] border-l-[3px] px-3 py-2.5 text-[15px] font-semibold ${
                  isActive ? 'border-veranera-500 bg-emerald-800 text-white' : 'border-transparent text-emerald-100 hover:bg-emerald-800/60'
                }`
              }
            >
              {n.label}
            </NavLink>
          ))}
          <div className="mt-3 border-t border-emerald-800 px-3 pt-3 md:mt-auto">
            <div className="truncate text-[15px] font-semibold text-white">{session.name}</div>
            <div className="truncate text-[13px] text-emerald-200">{house ? houseLabel(house) : ROLE_LABEL[session.role]}</div>
            <button className="btn btn-sm mt-3 w-full border border-emerald-700 text-emerald-50 hover:bg-emerald-800" onClick={logout}>
              Cerrar sesión
            </button>
          </div>
        </nav>
      </aside>

      <div className="min-w-0">
        {usingEmulators && (
          <div className="bg-sky-700 px-4 py-1.5 text-center text-[13px] font-semibold text-white">
            Modo de pruebas local: los datos están en los emuladores de esta computadora
          </div>
        )}
        {db.config.simulatedToday && (
          <div className="bg-amber-300 px-4 py-1.5 text-center text-[13px] font-semibold text-amber-950">
            Fecha simulada: {fmtDate(db.config.simulatedToday)}
          </div>
        )}
        {syncError && (
          <div role="alert" className="flex items-center justify-center gap-3 bg-red-700 px-4 py-2 text-sm text-white">
            {syncError}
            <button className="underline" onClick={clearSyncError}>Cerrar</button>
          </div>
        )}
        <main className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
