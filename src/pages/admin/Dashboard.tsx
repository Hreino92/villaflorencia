import { Link } from 'react-router-dom';
import { useDB, useToday } from '../../lib/store';
import { chargeStatus, houseLabel, notificationQueue, overdueChargesOf, type ChargeStatus } from '../../lib/billing';
import { incomeSummary, moraList } from '../../lib/reports';
import { fmtDate, money, periodLabel, periodOf } from '../../lib/dates';
import { PageTitle, STATUS_STYLE, Stat } from '../../components/ui';

/**
 * La colonia de un vistazo: cada casa es una baldosa, agrupada por polígono y pintada
 * según su situación del mes (en mora si debe algún mes anterior).
 */
function HouseMap() {
  const db = useDB();
  const today = useToday();
  const period = periodOf(today);
  const status = (houseId: string): ChargeStatus => {
    if (overdueChargesOf(db, houseId, today).length) return 'vencido';
    const c = db.charges.find((x) => x.houseId === houseId && x.kind === 'monthly' && x.period === period);
    return c ? chargeStatus(c, today) : 'pendiente';
  };
  const byPoligono = new Map<string, typeof db.houses>();
  for (const h of db.houses) byPoligono.set(h.poligono, [...(byPoligono.get(h.poligono) ?? []), h]);
  const counts = { pagado: 0, parcial: 0, pendiente: 0, vencido: 0 } as Record<ChargeStatus, number>;
  for (const h of db.houses) counts[status(h.id)]++;

  if (!db.houses.length) {
    return (
      <div className="card">
        <p className="text-slate-600">Todavía no hay casas registradas. <Link to="/admin/casas" className="font-semibold text-emerald-700 underline">Agrega la primera casa</Link> para ver aquí el estado de pago de la colonia.</p>
      </div>
    );
  }

  return (
    <section className="card" aria-labelledby="map-title">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="map-title" className="text-[19px] font-extrabold tracking-tight">
          {counts.pagado} de {db.houses.length} casas ya pagaron {periodLabel(period)}
        </h2>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-slate-600">
          {(['pagado', 'parcial', 'pendiente', 'vencido'] as const).map((k) => (
            <li key={k} className="flex items-center gap-1.5">
              <span className={`h-3 w-3 rounded-[3px] ${STATUS_STYLE[k].tile}`} />
              {STATUS_STYLE[k].label} ({counts[k]})
            </li>
          ))}
        </ul>
      </div>
      <div className="space-y-3">
        {[...byPoligono].map(([pol, houses]) => (
          <div key={pol} className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:gap-3">
            <div className="shrink-0 text-[13px] font-semibold text-slate-500 sm:w-24 sm:pt-1.5">Polígono {pol}</div>
            <ul className="flex flex-wrap gap-1.5">
              {houses.map((h) => {
                const st = status(h.id);
                return (
                  <li key={h.id} title={`${houseLabel(h)}: ${STATUS_STYLE[st].label}`} className={`flex h-9 w-9 items-center justify-center rounded-md text-[13px] font-bold ${STATUS_STYLE[st].tile}`}>
                    <span className="sr-only">{houseLabel(h)}, {STATUS_STYLE[st].label}: </span>
                    {h.lote}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function Dashboard() {
  const db = useDB();
  const today = useToday();
  const period = periodOf(today);
  const income = incomeSummary(db, period);
  const mora = moraList(db, today);
  const queue = notificationQueue(db, today);
  const pendingNotices = queue.filter((q) => !q.sent).length;
  const moraTotal = mora.reduce((s, r) => s + r.amount, 0);
  const visitsToday = db.visits.filter((v) => v.date === today);
  const recent = [...db.payments].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);

  return (
    <>
      <PageTitle title="Inicio" subtitle={`Hoy es ${fmtDate(today)}`} actions={<Link to="/admin/pagos" className="btn btn-primary">Registrar pago</Link>} />

      <HouseMap />

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Cobrado este mes" value={money(income.total)} hint={`${income.payments.length} recibos emitidos`} tone="green" />
        <Stat label="Cuota del mes cobrada" value={`${(income.rate * 100).toFixed(0)}%`} hint={`${money(income.collectedForPeriod)} de ${money(income.billed)}`} />
        <Stat label="Casas en mora" value={String(mora.length)} hint={`${money(moraTotal)} vencido`} tone="red" />
        <Stat label="Avisos por enviar" value={String(pendingNotices)} hint="WhatsApp de hoy" tone="amber" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="card">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-bold">Casas en mora</h2>
            <Link to="/admin/reportes" className="text-sm font-semibold text-emerald-700">Ver reporte</Link>
          </div>
          <table className="table">
            <thead><tr><th>Casa</th><th>Meses</th><th className="text-right">Vencido</th></tr></thead>
            <tbody>
              {mora.slice(0, 8).map((r) => (
                <tr key={r.house.id}>
                  <td className="whitespace-nowrap">{houseLabel(r.house)}</td>
                  <td className="text-slate-500">{r.months.length} {r.months.length === 1 ? 'cargo vencido' : 'cargos vencidos'}</td>
                  <td className="text-right font-semibold text-red-600">{money(r.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {mora.length === 0 && <p className="text-sm text-slate-500">Todas las casas están al día.</p>}
        </div>

        <div className="card">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-bold">Últimos pagos</h2>
            <Link to="/admin/pagos" className="text-sm font-semibold text-emerald-700">Ver todos</Link>
          </div>
          <table className="table">
            <thead><tr><th>Recibo</th><th>Casa</th><th>Fecha</th><th className="text-right">Monto</th></tr></thead>
            <tbody>
              {recent.map((p) => {
                const h = db.houses.find((x) => x.id === p.houseId);
                return (
                  <tr key={p.id}>
                    <td>#{p.receiptNo}</td>
                    <td className="whitespace-nowrap">{h ? houseLabel(h) : p.houseId}</td>
                    <td>{fmtDate(p.date)}</td>
                    <td className="text-right font-semibold">{money(p.amount)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="card lg:col-span-2">
          <h2 className="mb-3 font-bold">Visitas de hoy ({visitsToday.length})</h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {visitsToday.map((v) => {
              const h = db.houses.find((x) => x.id === v.houseId);
              return (
                <div key={v.code} className="rounded-lg border border-slate-200 p-3 text-sm">
                  <div className="font-semibold">{v.visitorName}</div>
                  <div className="text-slate-500">{h ? houseLabel(h) : v.houseId} · código {v.code}</div>
                  <div className={v.enteredAt ? 'text-emerald-700' : 'text-amber-600'}>{v.enteredAt ? `Ingresó ${v.enteredAt.slice(11, 16)}` : 'Aún no ingresa'}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
