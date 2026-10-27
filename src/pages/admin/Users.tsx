import { useState } from 'react';
import { update, useDB, useSession } from '../../lib/store';
import { houseLabel } from '../../lib/billing';
import type { DB, Relation, Role, User } from '../../lib/types';
import { Empty, Field, Modal, PageTitle } from '../../components/ui';

const ROLE_LABEL: Record<Role, string> = { admin: 'Administrador', vigilante: 'Vigilante', residente: 'Residente' };
const ROLE_STYLE: Record<Role, string> = {
  admin: 'bg-purple-100 text-purple-800',
  vigilante: 'bg-sky-100 text-sky-800',
  residente: 'bg-emerald-100 text-emerald-800',
};

const activeAdmins = (db: DB) => db.users.filter((u) => u.role === 'admin' && u.active).length;

export default function Users() {
  const db = useDB();
  const session = useSession()!;
  const [q, setQ] = useState('');
  const [role, setRole] = useState<Role | 'all'>('all');
  const [editing, setEditing] = useState<User | null>(null);

  const term = q.trim().toLowerCase();
  const list = db.users
    .filter((u) => (role === 'all' || u.role === role) && (!term || u.name.toLowerCase().includes(term) || u.email.toLowerCase().includes(term)))
    .sort((a, b) => a.role.localeCompare(b.role) || a.name.localeCompare(b.name));

  function toggleActive(u: User) {
    update((d) => ({ ...d, users: d.users.map((x) => (x.id === u.id ? { ...x, active: !x.active } : x)) }));
  }

  function remove(u: User) {
    if (confirm(`¿Eliminar la cuenta de ${u.name}? Ya no podrá entrar a la app.`)) update((d) => ({ ...d, users: d.users.filter((x) => x.id !== u.id) }));
  }

  const isLastAdmin = (u: User) => u.role === 'admin' && u.active && activeAdmins(db) === 1;

  return (
    <>
      <PageTitle
        title="Usuarios"
        subtitle={`${db.users.length} cuentas · ${db.users.filter((u) => u.active).length} activas`}
        actions={
          <button className="btn btn-primary" onClick={() => setEditing({ id: '', name: '', email: '', password: '', role: 'residente', active: true })}>
            Crear usuario
          </button>
        }
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <input className="input max-w-sm" placeholder="Buscar por nombre o correo" value={q} onChange={(e) => setQ(e.target.value)} />
        {(['all', 'admin', 'vigilante', 'residente'] as const).map((r) => (
          <button key={r} className={`btn btn-sm ${role === r ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setRole(r)}>
            {r === 'all' ? 'Todos' : ROLE_LABEL[r]}
          </button>
        ))}
      </div>
      <div className="card overflow-x-auto p-0">
        <table className="table">
          <thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Casa</th><th>Estado</th><th></th></tr></thead>
          <tbody>
            {list.map((u) => {
              const h = u.houseId ? db.houses.find((x) => x.id === u.houseId) : undefined;
              const self = u.id === session.userId;
              return (
                <tr key={u.id} className={u.active ? '' : 'opacity-50'}>
                  <td className="font-semibold">{u.name}{self && <span className="ml-1 text-xs font-normal text-slate-400">(tú)</span>}</td>
                  <td>{u.email}</td>
                  <td><span className={`badge ${ROLE_STYLE[u.role]}`}>{ROLE_LABEL[u.role]}</span></td>
                  <td className="whitespace-nowrap">
                    {u.role === 'residente' ? (h ? <>{houseLabel(h)}<div className="text-xs text-slate-500">{u.relation === 'tenant' ? 'Inquilino' : 'Propietario'}</div></> : <span className="text-red-600">Sin casa</span>) : <span className="text-slate-400">—</span>}
                  </td>
                  <td>{u.active ? <span className="text-emerald-700">Activo</span> : <span className="text-slate-500">Desactivado</span>}</td>
                  <td className="whitespace-nowrap text-right">
                    <button className="btn btn-secondary btn-sm mr-1" onClick={() => setEditing(u)}>Editar</button>
                    <button className="btn btn-secondary btn-sm mr-1" disabled={self || isLastAdmin(u)} onClick={() => toggleActive(u)}>{u.active ? 'Desactivar' : 'Activar'}</button>
                    <button className="btn btn-secondary btn-sm text-red-600" disabled={self || isLastAdmin(u)} onClick={() => remove(u)}>Eliminar</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {list.length === 0 && <div className="p-4"><Empty>No hay usuarios que coincidan.</Empty></div>}
      </div>
      {editing && <UserForm user={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function UserForm({ user, onClose }: { user: User; onClose: () => void }) {
  const db = useDB();
  const session = useSession()!;
  const isNew = !user.id;
  const self = user.id === session.userId;
  const [u, setU] = useState<User>(user);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const house = db.houses.find((h) => h.id === u.houseId);

  // Rellena nombre y correo con los datos registrados en la casa.
  function fillFromHouse(houseId: string | undefined, relation: Relation | undefined) {
    const h = db.houses.find((x) => x.id === houseId);
    const p = h && (relation === 'tenant' ? h.tenant : h.owner);
    setU((prev) => ({ ...prev, houseId, relation, ...(p && isNew ? { name: p.name, email: p.email } : {}) }));
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    const email = u.email.trim().toLowerCase();
    if (db.users.some((x) => x.id !== u.id && x.email.toLowerCase() === email)) return setError('Ya existe un usuario con ese correo.');
    if ((isNew || password) && password.length < 8) return setError('La contraseña debe tener al menos 8 caracteres.');
    if (u.role === 'residente' && (!u.houseId || !u.relation)) return setError('Selecciona la casa y si es propietario o inquilino.');
    if (u.role === 'residente' && u.relation === 'tenant' && !house?.tenant) return setError('Esa casa no tiene inquilino registrado. Agrégalo primero en Casas.');
    if (self && u.role !== 'admin') return setError('No puedes quitarte el rol de administrador a ti mismo.');

    const saved: User = {
      ...u,
      email,
      name: u.name.trim(),
      password: password || u.password,
      houseId: u.role === 'residente' ? u.houseId : undefined,
      relation: u.role === 'residente' ? u.relation : undefined,
      id: u.id || `u-${Date.now()}`,
    };
    update((d) => ({ ...d, users: isNew ? [...d.users, saved] : d.users.map((x) => (x.id === saved.id ? saved : x)) }));
    onClose();
  }

  return (
    <Modal title={isNew ? 'Crear usuario' : `Editar ${user.name}`} onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <Field label="Rol">
          <select className="input" value={u.role} disabled={self} onChange={(e) => setU({ ...u, role: e.target.value as Role })}>
            <option value="residente">Residente (propietario o inquilino)</option>
            <option value="vigilante">Vigilante</option>
            <option value="admin">Administrador</option>
          </select>
        </Field>

        {u.role === 'residente' && (
          <div className="grid gap-3 rounded-lg bg-slate-50 p-3 sm:grid-cols-2">
            <Field label="Casa">
              <select className="input" value={u.houseId ?? ''} onChange={(e) => fillFromHouse(e.target.value || undefined, u.relation ?? 'owner')} required>
                <option value="">Selecciona…</option>
                {db.houses.map((h) => (
                  <option key={h.id} value={h.id}>{houseLabel(h)}</option>
                ))}
              </select>
            </Field>
            <Field label="Es">
              <select className="input" value={u.relation ?? 'owner'} onChange={(e) => fillFromHouse(u.houseId, e.target.value as Relation)}>
                <option value="owner">Propietario{house ? ` (${house.owner.name})` : ''}</option>
                <option value="tenant" disabled={!!house && !house.tenant}>Inquilino{house ? (house.tenant ? ` (${house.tenant.name})` : ' (no hay)') : ''}</option>
              </select>
            </Field>
            {isNew && <p className="text-xs text-slate-500 sm:col-span-2">El nombre y correo se toman de los datos de la casa; puedes cambiarlos.</p>}
          </div>
        )}

        <Field label="Nombre completo"><input className="input" value={u.name} onChange={(e) => setU({ ...u, name: e.target.value })} required /></Field>
        <Field label="Correo (usuario para entrar)"><input className="input" type="email" value={u.email} onChange={(e) => setU({ ...u, email: e.target.value })} required /></Field>
        <Field label={isNew ? 'Contraseña (mínimo 8 caracteres)' : 'Nueva contraseña (déjalo vacío para no cambiarla)'}>
          <input className="input" type="text" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required={isNew} />
        </Field>
        {!self && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={u.active} onChange={(e) => setU({ ...u, active: e.target.checked })} /> Cuenta activa (puede entrar a la app)
          </label>
        )}
        {error && <p className="rounded-md bg-red-50 p-2 text-sm text-red-700">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary">{isNew ? 'Crear usuario' : 'Guardar'}</button>
        </div>
      </form>
    </Modal>
  );
}
