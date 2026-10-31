import { useMemo, useState } from 'react';
import { registerPayment, updatePayment, useDB, useSession, useToday } from '../../lib/store';
import { applyPayment, houseDebt, houseLabel, openChargesOf, overdueDebt, pendingOf } from '../../lib/billing';
import { fmtDate, fmtDateTime, localISODate, money } from '../../lib/dates';
import type { Payment } from '../../lib/types';
import { Empty, Field, Modal, PageTitle } from '../../components/ui';
import ReceiptActions from '../../components/ReceiptActions';

export default function Payments() {
  const db = useDB();
  const [q, setQ] = useState('');
  const [registering, setRegistering] = useState(false);
  const [done, setDone] = useState<Payment | null>(null);
  const [editing, setEditing] = useState<Payment | null>(null);

  const term = q.trim().toLowerCase();
  const list = useMemo(
    () =>
      [...db.payments]
        .sort((a, b) => b.receiptNo - a.receiptNo)
        .filter((p) => {
          if (!term) return true;
          const h = db.houses.find((x) => x.id === p.houseId);
          return String(p.receiptNo).includes(term) || p.payerName.toLowerCase().includes(term) || (h && houseLabel(h).toLowerCase().includes(term));
        })
        .slice(0, 100),
    [db, term],
  );

  return (
    <>
      <PageTitle title="Pagos y recibos" subtitle="Pagos en efectivo recibidos por la administración" actions={<button className="btn btn-primary" onClick={() => setRegistering(true)}>Registrar pago</button>} />
      <input className="input mb-4 max-w-sm" placeholder="Buscar por recibo, casa o nombre" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="card overflow-x-auto p-0">
        <table className="table">
          <thead><tr><th>Recibo</th><th>Fecha</th><th>Casa</th><th>Pagado por</th><th>Aplicado a</th><th className="text-right">Monto</th><th></th></tr></thead>
          <tbody>
            {list.map((p) => {
              const h = db.houses.find((x) => x.id === p.houseId);
              return (
                <tr key={p.id}>
                  <td className="font-mono">{String(p.receiptNo).padStart(6, '0')}</td>
                  <td className="whitespace-nowrap">{fmtDate(p.date)}</td>
                  <td className="whitespace-nowrap">{h ? houseLabel(h) : p.houseId}</td>
                  <td>{p.payerName}</td>
                  <td className="text-xs text-slate-500">{p.allocations.map((a) => a.description).join(', ')}{p.credit > 0 && ` + ${money(p.credit)} a favor`}</td>
                  <td className="text-right font-semibold">{money(p.amount)}{p.editedAt && <div className="text-xs font-normal text-amber-800">corregido</div>}</td>
                  <td><button className="btn btn-secondary btn-sm" onClick={() => setDone(p)}>Recibo</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {list.length === 0 && <div className="p-4"><Empty>No hay pagos que coincidan.</Empty></div>}
      </div>

      {registering && (
        <RegisterPayment
          onClose={() => setRegistering(false)}
          onDone={(p) => {
            setRegistering(false);
            setDone(p);
          }}
        />
      )}
      {done && (
        <Modal title={`Recibo No. ${String(done.receiptNo).padStart(6, '0')}`} onClose={() => setDone(null)}>
          <div className="mb-4 rounded-lg bg-emerald-50 p-3 text-sm">
            <div><b>{money(done.amount)}</b> recibidos de {done.payerName}</div>
            <div className="text-slate-600">{fmtDateTime(done.date)} · {done.allocations.map((a) => a.description).join(', ')}</div>
            {done.credit > 0 && <div className="text-emerald-700">Quedan {money(done.credit)} a favor para el próximo mes.</div>}
            {done.editedAt && <div className="text-amber-800">Corregido el {fmtDateTime(done.editedAt)} por {done.editedBy}.</div>}
          </div>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <ReceiptActions db={db} payment={done} />
            <button className="btn btn-secondary btn-sm" onClick={() => { setEditing(done); setDone(null); }}>Editar pago</button>
          </div>
        </Modal>
      )}
      {editing && (
        <EditPaymentForm
          payment={editing}
          onClose={() => setEditing(null)}
          onDone={(p) => {
            setEditing(null);
            setDone(p);
          }}
        />
      )}
    </>
  );
}

function RegisterPayment({ onClose, onDone }: { onClose: () => void; onDone: (p: Payment) => void }) {
  const db = useDB();
  const today = useToday();
  const [houseId, setHouseId] = useState('');
  const house = db.houses.find((h) => h.id === houseId);
  const open = house ? openChargesOf(db, house.id) : [];
  const debt = house ? houseDebt(db, house.id) : 0;
  const credit = house ? db.credits[house.id] ?? 0 : 0;
  const [amount, setAmount] = useState('');
  const [payer, setPayer] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<Payment | null>(null);
  const session = useSession()!;

  function pickHouse(id: string) {
    setHouseId(id);
    const h = db.houses.find((x) => x.id === id);
    if (!h) return;
    const d = houseDebt(db, id);
    setAmount(d > 0 ? d.toFixed(2) : (h.customFee ?? db.config.fee).toFixed(2));
    setPayer(h.tenant && h.notifyTo === 'tenant' ? h.tenant.name : h.owner.name);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!house) return;
    const value = Number(amount);
    if (!(value > 0)) return;
    // La hora real se conserva aunque la fecha esté simulada.
    const now = new Date();
    const time = now.toTimeString().slice(0, 8);
    const date = db.config.simulatedToday ? `${today}T${time}` : `${localISODate(now)}T${time}`;
    const input = { houseId: house.id, amount: value, payerName: payer || house.owner.name, receivedBy: session.name, note, date };
    // Primero se muestra cómo se aplicará (deudas, meses adelantados, saldo a favor) y el administrador confirma.
    if (!preview) {
      setPreview(applyPayment(db, input).payment);
      return;
    }
    setBusy(true);
    setError('');
    try {
      const payment = await registerPayment(input);
      onDone(payment);
    } catch (err) {
      console.error(err);
      setError('No se pudo registrar el pago. Revisa tu conexión a internet e intenta de nuevo.');
      setBusy(false);
    }
  }

  return (
    <Modal title="Registrar pago en efectivo" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Casa">
          <select className="input" value={houseId} onChange={(e) => { pickHouse(e.target.value); setPreview(null); }} required>
            <option value="">Selecciona una casa…</option>
            {db.houses.map((h) => (
              <option key={h.id} value={h.id}>
                {houseLabel(h)} · {h.owner.name}
                {houseDebt(db, h.id) > 0 ? ` · debe ${money(houseDebt(db, h.id))}` : ''}
              </option>
            ))}
          </select>
        </Field>

        {house && (
          <>
            <div className="rounded-lg bg-slate-50 p-3 text-sm">
              {open.length === 0 ? (
                <p className="text-emerald-700">
                  La casa está al día{credit > 0 && ` y tiene ${money(credit)} a favor`}. Cada cuota completa que alcance se aplica a los meses siguientes; lo que no complete una cuota queda a favor.
                </p>
              ) : (
                <>
                  <p className="mb-1 font-semibold">Pendiente ({money(debt)}, de lo cual {money(overdueDebt(db, house.id, today))} en mora):</p>
                  <ul className="space-y-0.5">
                    {open.map((c) => (
                      <li key={c.id} className="flex justify-between">
                        <span>{c.description} <span className="text-xs text-slate-400">vence {fmtDate(c.dueDate)}</span></span>
                        <span>{money(pendingOf(c))}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-xs text-slate-500">El pago se aplica primero a lo más antiguo.</p>
                </>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Monto recibido (USD)">
                <input className="input text-lg font-semibold" type="number" min={0.01} step="0.01" value={amount} onChange={(e) => { setAmount(e.target.value); setPreview(null); }} required />
              </Field>
              <Field label="Pagado por">
                <input className="input" list="payers" value={payer} onChange={(e) => setPayer(e.target.value)} required />
                <datalist id="payers">
                  <option value={house.owner.name} />
                  {house.tenant && <option value={house.tenant.name} />}
                </datalist>
              </Field>
            </div>
            <Field label="Nota (opcional)">
              <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej.: billetes de $20" />
            </Field>
          </>
        )}
        {preview && (
          <div className="rounded-lg border-2 border-emerald-600 bg-emerald-50 p-3 text-sm">
            <p className="mb-2 font-semibold">Así se aplicará el pago de {money(preview.amount)}:</p>
            <ul className="space-y-0.5">
              {preview.allocations.map((a) => (
                <li key={a.chargeId} className="flex justify-between gap-2">
                  <span className={a.description.endsWith('(adelantada)') ? 'font-semibold text-violet-800' : ''}>{a.description}</span>
                  <span>{money(a.amount)}</span>
                </li>
              ))}
              {(preview.creditUsed ?? 0) > 0 && (
                <li className="flex justify-between gap-2 text-slate-600"><span>Menos saldo a favor que ya tenía</span><span>−{money(preview.creditUsed!)}</span></li>
              )}
              {preview.credit > 0 && (
                <li className="flex justify-between gap-2 text-emerald-800"><span>Queda a favor</span><span>{money(preview.credit)}</span></li>
              )}
            </ul>
          </div>
        )}
        {error && <p className="rounded-md bg-red-50 p-2 text-sm text-red-700">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-secondary" onClick={preview ? () => setPreview(null) : onClose}>{preview ? 'Cambiar datos' : 'Cancelar'}</button>
          <button className="btn btn-primary" disabled={!house || busy}>{busy ? 'Registrando…' : preview ? 'Confirmar y generar recibo' : 'Revisar pago'}</button>
        </div>
      </form>
    </Modal>
  );
}

function EditPaymentForm({ payment, onClose, onDone }: { payment: Payment; onClose: () => void; onDone: (p: Payment) => void }) {
  const db = useDB();
  const session = useSession()!;
  const house = db.houses.find((h) => h.id === payment.houseId);
  const [amount, setAmount] = useState(payment.amount.toFixed(2));
  const [payer, setPayer] = useState(payment.payerName);
  const [day, setDay] = useState(payment.date.slice(0, 10));
  const [note, setNote] = useState(payment.note);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const value = Number(amount);
    if (!(value > 0)) return setError('El monto debe ser mayor que cero.');
    setBusy(true);
    setError('');
    try {
      const updated = await updatePayment(payment.id, payment.houseId, {
        amount: value,
        payerName: payer.trim() || payment.payerName,
        note,
        date: `${day}${payment.date.slice(10)}`, // se corrige el día; se conserva la hora original
        editedBy: session.name,
      });
      onDone(updated);
    } catch (err) {
      console.error(err);
      // Los mensajes de la corrección (p. ej. saldo a favor ya usado) se muestran tal cual; el resto es de conexión.
      const msg = err instanceof Error && !('code' in err) ? err.message : 'No se pudo guardar la corrección. Revisa tu conexión a internet e intenta de nuevo.';
      setError(msg);
      setBusy(false);
    }
  }

  return (
    <Modal title={`Editar recibo No. ${String(payment.receiptNo).padStart(6, '0')}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
          {house ? houseLabel(house) : payment.houseId}. El pago se vuelve a aplicar a las cuotas más antiguas con el monto nuevo. El recibo conserva su número y queda marcado como corregido.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Monto recibido (USD)">
            <input className="input text-lg font-semibold" type="number" min={0.01} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          </Field>
          <Field label="Fecha del pago">
            <input className="input" type="date" max={localISODate()} value={day} onChange={(e) => setDay(e.target.value)} required />
          </Field>
        </div>
        <Field label="Pagado por">
          <input className="input" value={payer} onChange={(e) => setPayer(e.target.value)} required />
        </Field>
        <Field label="Nota">
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej.: se corrigió el monto recibido" />
        </Field>
        {error && <p role="alert" className="rounded-md bg-red-50 p-2 text-sm text-red-700">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={busy}>{busy ? 'Guardando…' : 'Guardar corrección'}</button>
        </div>
      </form>
    </Modal>
  );
}
