import { useDB, useSession, useToday } from '../../lib/store';
import { chargesOf, chargeStatus, houseDebt, houseLabel, overdueDebt, pendingOf } from '../../lib/billing';
import { capitalize, fmtDate, money, periodLabel } from '../../lib/dates';
import { Empty, PageTitle, Stat, StatusBadge } from '../../components/ui';
import ReceiptActions from '../../components/ReceiptActions';

export default function MyAccount() {
  const db = useDB();
  const today = useToday();
  const session = useSession()!;
  const house = db.houses.find((h) => h.id === session.houseId);
  if (!house) return <Empty>No se encontró la casa asociada a tu cuenta.</Empty>;

  const debt = houseDebt(db, house.id);
  const late = overdueDebt(db, house.id, today);
  const charges = chargesOf(db, house.id).reverse();
  const payments = db.payments.filter((p) => p.houseId === house.id).sort((a, b) => b.receiptNo - a.receiptNo);
  const credit = db.credits[house.id] ?? 0;

  return (
    <>
      <PageTitle
        title="Mi cuenta"
        subtitle={houseLabel(house)}
        actions={<button className="btn btn-secondary" onClick={async () => { const p = await import('../../lib/pdf'); p.openFile(p.statementPDF(db, house, today)); }}>Estado de cuenta PDF</button>}
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Saldo pendiente" value={money(debt)} tone={debt > 0 ? (late > 0 ? 'red' : 'amber') : 'green'} hint={debt === 0 ? 'Estás al día. ¡Gracias!' : late > 0 ? `${money(late)} en mora` : 'Sin mora'} />
        <Stat label="Saldo a favor" value={money(credit)} tone="green" />
        <Stat label="Forma de pago" value="Efectivo" hint="En la administración de la residencial" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card">
          <h2 className="mb-3 font-bold">Cuotas</h2>
          <table className="table">
            <thead><tr><th>Concepto</th><th>Vence</th><th className="text-right">Pendiente</th><th>Estado</th></tr></thead>
            <tbody>
              {charges.map((c) => (
                <tr key={c.id}>
                  <td>{c.kind === 'monthly' ? capitalize(periodLabel(c.period)) : c.description}</td>
                  <td>{fmtDate(c.dueDate)}</td>
                  <td className="text-right">{money(pendingOf(c))}</td>
                  <td><StatusBadge status={chargeStatus(c, today)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card">
          <h2 className="mb-3 font-bold">Mis recibos</h2>
          {payments.length === 0 ? (
            <Empty>Aún no hay pagos registrados.</Empty>
          ) : (
            <ul className="divide-y divide-slate-100">
              {payments.map((p) => (
                <li key={p.id} className="py-3">
                  <div className="mb-2 flex justify-between text-sm">
                    <span><b>Recibo {String(p.receiptNo).padStart(6, '0')}</b> · {fmtDate(p.date)}</span>
                    <span className="font-semibold">{money(p.amount)}</span>
                  </div>
                  <ReceiptActions db={db} payment={p} allowSend={false} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}
