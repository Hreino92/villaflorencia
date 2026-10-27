import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { logout, useDB, useSession } from '../lib/store';
import { fmtDate } from '../lib/dates';
import { houseLabel } from '../lib/billing';

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

export default function Layout() {
  const db = useDB();
  const session = useSession()!;
  const [open, setOpen] = useState(false);
  const house = session.houseId ? db.houses.find((h) => h.id === session.houseId) : null;

  return (
    <div className="min-h-screen">
      {db.config.simulatedToday && (
        <div className="bg-amber-400 px-4 py-1 text-center text-xs font-semibold text-amber-950">
          Modo demo: fecha simulada {fmtDate(db.config.simulatedToday)}
        </div>
      )}
      <header className="bg-emerald-800 text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <div className="min-w-0">
            <div className="truncate font-bold">{db.config.name}</div>
            <div className="truncate text-xs text-emerald-100">
              {ROLE_LABEL[session.role]} · {session.name}
              {house && ` · ${houseLabel(house)}`}
            </div>
          </div>
          <button className="rounded-md border border-emerald-600 px-3 py-1 text-sm md:hidden" onClick={() => setOpen(!open)}>
            Menú
          </button>
          <button className="hidden rounded-md border border-emerald-600 px-3 py-1 text-sm hover:bg-emerald-700 md:block" onClick={logout}>
            Salir
          </button>
        </div>
        <nav className={`mx-auto max-w-6xl gap-1 px-4 pb-2 md:flex ${open ? 'flex flex-col' : 'hidden'}`}>
          {NAV[session.role].map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end
              onClick={() => setOpen(false)}
              className={({ isActive }) => `rounded-md px-3 py-1.5 text-sm font-medium ${isActive ? 'bg-white text-emerald-800' : 'text-emerald-50 hover:bg-emerald-700'}`}
            >
              {n.label}
            </NavLink>
          ))}
          <button className="rounded-md px-3 py-1.5 text-left text-sm text-emerald-50 md:hidden" onClick={logout}>
            Salir
          </button>
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
