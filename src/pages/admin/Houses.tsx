import { useState } from 'react';
import { update, useDB, useToday } from '../../lib/store';
import { chargesOf, chargeStatus, compareHouses, feeFor, houseDebt, houseLabel, overdueDebt, pendingOf } from '../../lib/billing';
import { capitalize, fmtDate, money, periodLabel, periodOf } from '../../lib/dates';
import type { House, Person, Who } from '../../lib/types';
import { Field, Modal, PageTitle, StatusBadge } from '../../components/ui';

const WHO_LABEL: Record<Who, string> = { owner: 'Propietario', tenant: 'Inquilino', both: 'Ambos' };
const emptyPerson = (): Person => ({ name: '', phone: '', email: '', dui: '' });

export default function Houses() {
  const db = useDB();
  const today = useToday();
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<House | null>(null);
  const [detail, setDetail] = useState<House | null>(null);

  const term = q.trim().toLowerCase();
  const list = db.houses.filter(
    (h) =>
      !term ||
      houseLabel(h).toLowerCase().includes(term) ||
      h.owner.name.toLowerCase().includes(term) ||
      h.tenant?.name.toLowerCase().includes(term),
  );

  function newHouse() {
    setEditing({ id: '', poligono: '', lote: 0, owner: emptyPerson(), tenant: null, notifyTo: 'owner', visitorCodeBy: 'owner', customFee: null, notes: '' });
  }

  return (
    <>
      <PageTitle title="Casas" subtitle={`${db.houses.length} casas registradas`} actions={<button className="btn btn-primary" onClick={newHouse}>Agregar casa</button>} />
      <input className="input mb-4 max-w-sm" placeholder="Buscar por casa, propietario o inquilino" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="card overflow-x-auto p-0">
        <table className="table">
          <thead>
            <tr>
              <th>Casa</th><th>Propietario</th><th>Inquilino</th><th>Avisos a</th><th className="text-right">Cuota</th><th className="text-right">Saldo</th><th></th>
            </tr>
          </thead>
          <tbody>
            {list.map((h) => {
              const debt = houseDebt(db, h.id);
              const late = overdueDebt(db, h.id, today);
              return (
                <tr key={h.id} className="hover:bg-slate-50">
                  <td className="whitespace-nowrap font-semibold">{houseLabel(h)}</td>
                  <td>{h.owner.name}<div className="text-xs text-slate-500">{h.owner.phone}</div></td>
                  <td>{h.tenant ? <>{h.tenant.name}<div className="text-xs text-slate-500">{h.tenant.phone}</div></> : <span className="text-slate-400">—</span>}</td>
                  <td>{WHO_LABEL[h.tenant ? h.notifyTo : 'owner']}</td>
                  <td className="text-right">{money(feeFor(db, h))}{h.customFee !== null && <div className="text-xs text-sky-700">especial</div>}</td>
                  <td className="text-right whitespace-nowrap">
                    {debt > 0 ? <span className={late > 0 ? 'font-semibold text-red-600' : 'text-amber-600'}>{money(debt)}</span> : <span className="text-emerald-700">al día</span>}
                    {(db.credits[h.id] ?? 0) > 0 && <div className="text-xs text-emerald-700">a favor {money(db.credits[h.id])}</div>}
                  </td>
                  <td className="whitespace-nowrap text-right">
                    <button className="btn btn-secondary btn-sm mr-1" onClick={() => setDetail(h)}>Cuenta</button>
                    <button className="btn btn-secondary btn-sm" onClick={() => setEditing(h)}>Editar</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {editing && <HouseForm house={editing} onClose={() => setEditing(null)} />}
      {detail && <HouseAccount house={detail} onClose={() => setDetail(null)} />}
    </>
  );
}

function PersonFields({ value, onChange }: { value: Person; onChange: (p: Person) => void }) {
  const set = (k: keyof Person) => (e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...value, [k]: e.target.value });
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Nombre completo"><input className="input" value={value.name} onChange={set('name')} required /></Field>
      <Field label="Teléfono WhatsApp (8 dígitos)"><input className="input" value={value.phone} onChange={set('phone')} inputMode="tel" pattern="\d{4}-?\d{4}" placeholder="7123-4567" /></Field>
      <Field label="Correo (para entrar a la app)"><input className="input" type="email" value={value.email} onChange={set('email')} /></Field>
      <Field label="DUI"><input className="input" value={value.dui} onChange={set('dui')} placeholder="00000000-0" /></Field>
    </div>
  );
}

function HouseForm({ house, onClose }: { house: House; onClose: () => void }) {
  const db = useDB();
  const today = useToday();
  const [h, setH] = useState<House>(house);
  const [opening, setOpening] = useState('');
  const [openingDesc, setOpeningDesc] = useState('Saldo anterior (antes del sistema)');
  const isNew = !house.id;
  const id = isNew ? `${h.poligono.trim().toUpperCase()}-${h.lote}` : house.id;
  const duplicate = isNew && db.houses.some((x) => x.id === id);

  function save(e: React.FormEvent) {
    e.preventDefault();
    if (duplicate) return;
    const saved: House = { ...h, id, poligono: h.poligono.trim().toUpperCase(), notifyTo: h.tenant ? h.notifyTo : 'owner', visitorCodeBy: h.tenant ? h.visitorCodeBy : 'owner' };
    const amount = Number(opening);
    update((d) => ({
      ...d,
      houses: isNew ? [...d.houses, saved].sort(compareHouses) : d.houses.map((x) => (x.id === id ? saved : x)),
      charges:
        amount > 0
          ? [...d.charges, { id: `opening-${id}-${Date.now()}`, houseId: id, kind: 'opening', period: periodOf(today), description: openingDesc || 'Saldo anterior', amount, dueDate: today, paid: 0 }]
          : d.charges,
    }));
    onClose();
  }

  return (
    <Modal title={isNew ? 'Agregar casa' : `Editar ${houseLabel(house)}`} onClose={onClose} wide>
      <form onSubmit={save} className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Polígono"><input className="input" value={h.poligono} onChange={(e) => setH({ ...h, poligono: e.target.value })} disabled={!isNew} required /></Field>
          <Field label="Lote"><input className="input" type="number" min={1} value={h.lote || ''} onChange={(e) => setH({ ...h, lote: Number(e.target.value) })} disabled={!isNew} required /></Field>
          <Field label={`Cuota especial (vacío = ${money(db.config.fee)})`}>
            <input className="input" type="number" min={0} step="0.01" value={h.customFee ?? ''} onChange={(e) => setH({ ...h, customFee: e.target.value === '' ? null : Number(e.target.value) })} />
          </Field>
        </div>
        {duplicate && <p className="text-sm text-red-600">Ya existe una casa con ese polígono y lote.</p>}

        <section>
          <h3 className="mb-2 font-semibold text-emerald-800">Propietario</h3>
          <PersonFields value={h.owner} onChange={(owner) => setH({ ...h, owner })} />
        </section>

        <section>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="font-semibold text-emerald-800">Inquilino</h3>
            {h.tenant ? (
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setH({ ...h, tenant: null })}>Quitar inquilino</button>
            ) : (
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setH({ ...h, tenant: emptyPerson(), notifyTo: 'tenant', visitorCodeBy: 'tenant' })}>Agregar inquilino</button>
            )}
          </div>
          {h.tenant ? <PersonFields value={h.tenant} onChange={(tenant) => setH({ ...h, tenant })} /> : <p className="text-sm text-slate-500">La casa la habita el propietario.</p>}
        </section>

        {h.tenant && (
          <div className="grid gap-3 rounded-lg bg-slate-50 p-3 sm:grid-cols-2">
            <Field label="¿A quién se envían los avisos de cobro?">
              <select className="input" value={h.notifyTo} onChange={(e) => setH({ ...h, notifyTo: e.target.value as Who })}>
                <option value="owner">Solo al propietario</option>
                <option value="tenant">Solo al inquilino</option>
                <option value="both">A ambos</option>
              </select>
            </Field>
            <Field label="¿Quién puede generar códigos de visita?">
              <select className="input" value={h.visitorCodeBy} onChange={(e) => setH({ ...h, visitorCodeBy: e.target.value as Who })}>
                <option value="owner">Solo el propietario</option>
                <option value="tenant">Solo el inquilino</option>
                <option value="both">Ambos</option>
              </select>
            </Field>
          </div>
        )}

        <section className="rounded-lg border border-amber-200 bg-amber-50 p-3">
          <h3 className="mb-2 font-semibold text-amber-900">Agregar saldo pendiente anterior</h3>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Monto adeudado"><input className="input" type="number" min={0} step="0.01" value={opening} onChange={(e) => setOpening(e.target.value)} placeholder="0.00" /></Field>
            <Field label="Descripción" className="sm:col-span-2"><input className="input" value={openingDesc} onChange={(e) => setOpeningDesc(e.target.value)} /></Field>
          </div>
          <p className="mt-2 text-xs text-amber-800">Úsalo para cargar deudas de antes de usar el sistema. Queda como cargo vencido.</p>
        </section>

        <Field label="Notas internas"><textarea className="input" rows={2} value={h.notes} onChange={(e) => setH({ ...h, notes: e.target.value })} /></Field>

        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary">Guardar</button>
        </div>
      </form>
    </Modal>
  );
}

export function HouseAccount({ house, onClose }: { house: House; onClose: () => void }) {
  const db = useDB();
  const today = useToday();
  const charges = chargesOf(db, house.id).reverse();
  return (
    <Modal title={`Estado de cuenta: ${houseLabel(house)}`} onClose={onClose} wide>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm">
          Saldo pendiente: <b className="text-red-600">{money(houseDebt(db, house.id))}</b>
        </div>
        <button className="btn btn-secondary" onClick={async () => { const p = await import('../../lib/pdf'); p.openFile(p.statementPDF(db, house, today)); }}>Descargar PDF</button>
      </div>
      <div className="max-h-[60vh] overflow-y-auto">
        <table className="table">
          <thead><tr><th>Concepto</th><th>Vence</th><th className="text-right">Monto</th><th className="text-right">Pendiente</th><th>Estado</th></tr></thead>
          <tbody>
            {charges.map((c) => (
              <tr key={c.id}>
                <td>{c.kind === 'monthly' ? `Cuota ${capitalize(periodLabel(c.period))}` : c.description}</td>
                <td>{fmtDate(c.dueDate)}</td>
                <td className="text-right">{money(c.amount)}</td>
                <td className="text-right">{money(pendingOf(c))}</td>
                <td><StatusBadge status={chargeStatus(c, today)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}
