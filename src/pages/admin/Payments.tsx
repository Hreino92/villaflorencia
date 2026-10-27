import { useMemo, useState } from 'react';
import { getDB, update, useDB, useToday } from '../../lib/store';
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
                  <td className="text-right font-semibold">{money(p.amount)}</td>
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
          </div>
          <ReceiptActions db={db} payment={done} />
        </Modal>
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
  const [amount, setAmount] = useState('');
  const [payer, setPayer] = useState('');
  const [note, setNote] = useState('');

  function pickHouse(id: string) {
    setHouseId(id);
    const h = db.houses.find((x) => x.id === id);
    if (!h) return;
    const d = houseDebt(db, id);
    setAmount(d > 0 ? d.toFixed(2) : (h.customFee ?? db.config.fee).toFixed(2));
    setPayer(h.tenant && h.notifyTo === 'tenant' ? h.tenant.name : h.owner.name);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!house) return;
    const value = Number(amount);
    if (!(value > 0)) return;
    // La hora real se conserva aunque la fecha esté simulada.
    const now = new Date();
    const time = now.toTimeString().slice(0, 8);
    const date = db.config.simulatedToday ? `${today}T${time}` : `${localISODate(now)}T${time}`;
    let created: Payment | null = null;
    update((d) => {
      const r = applyPayment(d, { houseId: house.id, amount: value, payerName: payer || house.owner.name, receivedBy: 'Administración', note, date });
      created = r.payment;
      return r.db;
    });
    const saved = getDB().payments.find((p) => p.id === (created as Payment | null)?.id);
    if (saved) onDone(saved);
  }

  return (
    <Modal title="Registrar pago en efectivo" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Casa">
          <select className="input" value={houseId} onChange={(e) => pickHouse(e.target.value)} required>
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
                <p className="text-emerald-700">La casa está al día. El pago quedará como saldo a favor.</p>
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
                <input className="input text-lg font-semibold" type="number" min={0.01} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
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
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={!house}>Registrar y generar recibo</button>
        </div>
      </form>
    </Modal>
  );
}
