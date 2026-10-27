import { useState } from 'react';
import { useDB, useToday } from '../../lib/store';
import { houseDebt, houseLabel } from '../../lib/billing';
import { capitalize, fmtDate, fmtDateTime, money, periodLabel, periodOf } from '../../lib/dates';
import { incomeSummary, moraList, statement } from '../../lib/reports';
import { csvFile, downloadFile, incomePDF, moraPDF, openFile, statementPDF } from '../../lib/pdf';
import { Field, PageTitle, Stat } from '../../components/ui';

export default function Reports() {
  const db = useDB();
  const today = useToday();
  const current = periodOf(today);
  const closed = [...db.reports].sort((a, b) => b.period.localeCompare(a.period));
  const [period, setPeriod] = useState(closed[0]?.period ?? current);
  const [houseId, setHouseId] = useState(db.houses[0]?.id ?? '');
  const income = incomeSummary(db, period);
  const mora = moraList(db, today);
  const house = db.houses.find((h) => h.id === houseId);
  const report = db.reports.find((r) => r.period === period);

  function incomeCSV() {
    downloadFile(
      csvFile(`Ingresos-${period}.csv`, [
        ['Recibo', 'Fecha', 'Casa', 'Pagado por', 'Conceptos', 'Monto'],
        ...income.payments.map((p) => {
          const h = db.houses.find((x) => x.id === p.houseId);
          return [p.receiptNo, fmtDate(p.date), h ? houseLabel(h) : p.houseId, p.payerName, p.allocations.map((a) => a.description).join(' / '), p.amount.toFixed(2)];
        }),
        ['', '', '', '', 'TOTAL', income.total.toFixed(2)],
      ]),
    );
  }

  function moraCSV() {
    downloadFile(
      csvFile(`Mora-${today}.csv`, [
        ['Casa', 'Propietario', 'Teléfono', 'Inquilino', 'Meses vencidos', 'Vencido', 'Saldo total'],
        ...mora.map((r) => [houseLabel(r.house), r.house.owner.name, r.house.owner.phone, r.house.tenant?.name ?? '', r.months.join(' / '), r.amount.toFixed(2), r.totalDebt.toFixed(2)]),
      ]),
    );
  }

  function statementCSV() {
    if (!house) return;
    downloadFile(
      csvFile(`Estado-de-cuenta-${house.poligono}${house.lote}.csv`, [
        ['Fecha', 'Concepto', 'Cargo', 'Abono', 'Saldo'],
        ...statement(db, house.id).map((r) => [fmtDate(r.date), r.concept, r.charge.toFixed(2), r.payment.toFixed(2), r.balance.toFixed(2)]),
      ]),
    );
  }

  return (
    <>
      <PageTitle title="Reportes" subtitle="Se generan automáticamente el día 1 de cada mes con el cierre del mes anterior" />

      <div className="card mb-6">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-bold">Ingresos del mes</h2>
            <p className="text-xs text-slate-500">
              {report ? `Reporte de cierre generado automáticamente el ${fmtDateTime(report.generatedAt)}` : 'Mes en curso (todavía no se cierra)'}
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <Field label="Mes">
              <select className="input" value={period} onChange={(e) => setPeriod(e.target.value)}>
                <option value={current}>{capitalize(periodLabel(current))} (en curso)</option>
                {closed.map((r) => (
                  <option key={r.period} value={r.period}>{capitalize(periodLabel(r.period))}</option>
                ))}
              </select>
            </Field>
            <button className="btn btn-secondary" onClick={() => openFile(incomePDF(db, period))}>PDF</button>
            <button className="btn btn-secondary" onClick={incomeCSV}>Excel</button>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Stat label="Total cobrado en el mes" value={money(income.total)} hint={`${income.payments.length} recibos`} tone="green" />
          <Stat label="Facturado (cuotas del mes)" value={money(income.billed)} />
          <Stat label="Cuota del mes cobrada" value={`${(income.rate * 100).toFixed(0)}%`} hint={money(income.collectedForPeriod)} />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-bold">Casas en mora</h2>
              <p className="text-xs text-slate-500">Al {fmtDate(today)} · {mora.length} casas · {money(mora.reduce((s, r) => s + r.amount, 0))}</p>
            </div>
            <div className="flex gap-2">
              <button className="btn btn-secondary btn-sm" onClick={() => openFile(moraPDF(db, today))}>PDF</button>
              <button className="btn btn-secondary btn-sm" onClick={moraCSV}>Excel</button>
            </div>
          </div>
          <table className="table">
            <thead><tr><th>Casa</th><th>Meses</th><th className="text-right">Vencido</th></tr></thead>
            <tbody>
              {mora.map((r) => (
                <tr key={r.house.id}>
                  <td className="whitespace-nowrap">{houseLabel(r.house)}</td>
                  <td className="text-xs text-slate-500">{r.months.join(', ')}</td>
                  <td className="text-right font-semibold text-red-600">{money(r.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card">
          <h2 className="mb-3 font-bold">Estado de cuenta por casa</h2>
          <Field label="Casa">
            <select className="input" value={houseId} onChange={(e) => setHouseId(e.target.value)}>
              {db.houses.map((h) => (
                <option key={h.id} value={h.id}>{houseLabel(h)} · {h.owner.name}</option>
              ))}
            </select>
          </Field>
          {house && (
            <>
              <p className="my-3 text-sm">Saldo pendiente: <b>{money(houseDebt(db, house.id))}</b></p>
              <div className="flex gap-2">
                <button className="btn btn-secondary" onClick={() => openFile(statementPDF(db, house, today))}>PDF</button>
                <button className="btn btn-secondary" onClick={statementCSV}>Excel</button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
