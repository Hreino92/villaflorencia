import { useState } from 'react';
import { update, useDB, useSession, useToday } from '../../lib/store';
import { houseLabel } from '../../lib/billing';
import { addMonths, capitalize, fmtDate, localISODate, money, periodLabel, periodOf, round2 } from '../../lib/dates';
import { financialSummary, housesInRange, moraList, periodsBetween, rangeLabel } from '../../lib/reports';
import { EXPENSE_CATEGORIES, PAYMENT_METHODS, type Expense } from '../../lib/types';
import { Empty, Field, Modal, PageTitle, Stat } from '../../components/ui';

const MAX_MONTHS = 12;

export default function Reports() {
  const db = useDB();
  const today = useToday();
  const current = periodOf(today);
  const [from, setFrom] = useState(current);
  const [to, setTo] = useState(current);
  const [houseId, setHouseId] = useState('');
  const [busy, setBusy] = useState('');
  const [editing, setEditing] = useState<Expense | null>(null);
  const [category, setCategory] = useState('');

  const valid = from <= to && periodsBetween(from, to).length <= MAX_MONTHS;
  const s = valid ? financialSummary(db, from, to) : null;
  const houses = valid ? housesInRange(db, from, to, today) : [];
  const mora = moraList(db, today);
  const house = db.houses.find((h) => h.id === (houseId || db.houses[0]?.id));
  const expenses = (s?.expenseList ?? []).filter((e) => !category || e.category === category).slice().reverse();

  function quick(months: number | 'year') {
    setTo(current);
    setFrom(months === 'year' ? `${current.slice(0, 4)}-01` : addMonths(current, -(months - 1)));
  }

  /** Genera un archivo (PDF o Excel) mostrando "Generando…" mientras tanto. */
  async function run(key: string, make: () => Promise<File>, open = false) {
    setBusy(key);
    try {
      const file = await make();
      const { openFile, downloadFile } = await lib();
      if (open) openFile(file);
      else downloadFile(file);
    } finally {
      setBusy('');
    }
  }
  // PDF y Excel son librerías pesadas: se cargan solo al generar un archivo.
  const lib = () => import('../../lib/pdf');
  const excel = () => import('../../lib/excel');

  function Buttons({ id, pdf, xlsx }: { id: string; pdf: () => Promise<File>; xlsx: () => Promise<File> }) {
    return (
      <div className="flex gap-2">
        <button className="btn btn-secondary btn-sm" disabled={!!busy || !valid} onClick={() => run(`${id}-pdf`, pdf, true)}>
          {busy === `${id}-pdf` ? 'Generando…' : 'PDF'}
        </button>
        <button className="btn btn-secondary btn-sm" disabled={!!busy || !valid} onClick={() => run(`${id}-xlsx`, xlsx)}>
          {busy === `${id}-xlsx` ? 'Generando…' : 'Excel'}
        </button>
      </div>
    );
  }

  return (
    <>
      <PageTitle title="Reportes y finanzas" subtitle="Ingresos, gastos y estado de pagos por rango de meses" />

      <div className="card mb-6 flex flex-wrap items-end gap-3">
        <Field label="Desde">
          <input className="input" type="month" value={from} max={current} onChange={(e) => e.target.value && setFrom(e.target.value)} />
        </Field>
        <Field label="Hasta">
          <input className="input" type="month" value={to} max={current} onChange={(e) => e.target.value && setTo(e.target.value)} />
        </Field>
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-secondary btn-sm" onClick={() => quick(1)}>Este mes</button>
          <button className="btn btn-secondary btn-sm" onClick={() => quick(3)}>Últimos 3 meses</button>
          <button className="btn btn-secondary btn-sm" onClick={() => quick(6)}>Últimos 6 meses</button>
          <button className="btn btn-secondary btn-sm" onClick={() => quick('year')}>Este año</button>
        </div>
        {!valid && <p className="w-full text-sm text-red-600">Elige un rango válido: "Desde" no puede ser posterior a "Hasta" y el máximo es de {MAX_MONTHS} meses.</p>}
      </div>

      {s && (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-3">
            <Stat label="Ingresos (cobros)" value={money(s.income)} hint={`${s.payments.length} recibos · ${rangeLabel(from, to)}`} tone="green" />
            <Stat label="Gastos" value={money(s.expenses)} hint={`${s.expenseList.length} registros`} tone="amber" />
            <Stat label={s.balance >= 0 ? 'Superávit' : 'Déficit'} value={money(Math.abs(s.balance))} hint="Ingresos menos gastos" tone={s.balance >= 0 ? 'green' : 'red'} />
          </div>

          <div className="card mb-6">
            <h2 className="mb-3 font-bold">Ingresos y gastos por mes</h2>
            <MonthChart months={s.months} />
          </div>
        </>
      )}

      <div className="mb-6 grid gap-4 md:grid-cols-2">
        <ReportCard title="Informe financiero" text={`Ingresos contra gastos de ${valid ? rangeLabel(from, to) : 'el rango'}, con gráficos, gastos por categoría y el detalle de recibos y gastos.`}>
          <Buttons id="fin" pdf={async () => (await lib()).financialPDF(db, from, to)} xlsx={async () => (await excel()).financialXLSX(db, from, to)} />
        </ReportCard>
        <ReportCard
          title="Todas las casas"
          text={valid ? `Cuota de cada casa mes por mes (${rangeLabel(from, to)}): pagada, parcial, pendiente o en mora. ${houses.filter((h) => h.pending > 0).length} de ${houses.length} casas con saldo en el período.` : 'Estado de pago de cada casa mes por mes.'}
        >
          <Buttons id="houses" pdf={async () => (await lib()).housesPDF(db, from, to, today)} xlsx={async () => (await excel()).housesXLSX(db, from, to, today)} />
        </ReportCard>
        <ReportCard title="Casas en mora" text={`Situación al ${fmtDate(today)}: ${mora.length} casas, ${money(mora.reduce((t, r) => t + r.amount, 0))} vencido. No depende del rango.`}>
          <Buttons id="mora" pdf={async () => (await lib()).moraPDF(db, today)} xlsx={async () => (await excel()).moraXLSX(db, today)} />
        </ReportCard>
        <ReportCard title="Estado de cuenta por casa" text="Historial completo de cargos y abonos de una casa.">
          <div className="flex flex-wrap items-center gap-2">
            <select className="input max-w-56" value={house?.id ?? ''} onChange={(e) => setHouseId(e.target.value)}>
              {db.houses.map((h) => (
                <option key={h.id} value={h.id}>{houseLabel(h)}</option>
              ))}
            </select>
            {house && <Buttons id="stmt" pdf={async () => (await lib()).statementPDF(db, house, today)} xlsx={async () => (await excel()).statementXLSX(db, house)} />}
          </div>
        </ReportCard>
      </div>

      <div className="card">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-bold">Gastos de {valid ? rangeLabel(from, to) : 'la residencial'}</h2>
            <p className="text-xs text-slate-500">Lo que se pagó con el fondo de la residencial. Aparece en el informe financiero.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <select className="input w-auto" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">Todas las categorías</option>
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <button className="btn btn-primary" onClick={() => setEditing(newExpense(today))}>Registrar gasto</button>
          </div>
        </div>
        {expenses.length === 0 ? (
          <Empty>No hay gastos registrados en este rango.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>Fecha</th><th>Concepto</th><th>Categoría</th><th>Proveedor</th><th>Pago</th><th className="text-right">Monto</th><th></th></tr></thead>
              <tbody>
                {expenses.map((e) => (
                  <tr key={e.id}>
                    <td className="whitespace-nowrap">{fmtDate(e.date)}</td>
                    <td>{e.concept}{e.details && <div className="text-xs text-slate-500">{e.details}</div>}</td>
                    <td className="text-xs">{e.category}</td>
                    <td>{e.provider}</td>
                    <td className="text-xs">{e.paymentMethod}{e.document && <div className="text-slate-500">{e.document}</div>}</td>
                    <td className="text-right font-semibold">{money(e.amount)}</td>
                    <td className="whitespace-nowrap text-right"><button className="btn btn-secondary btn-sm" onClick={() => setEditing(e)}>Editar</button></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr><td colSpan={5} className="pt-2 text-right font-semibold">Total</td><td className="pt-2 text-right font-bold">{money(expenses.reduce((t, e) => t + e.amount, 0))}</td><td /></tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {editing && <ExpenseForm expense={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function ReportCard({ title, text, children }: { title: string; text: string; children: React.ReactNode }) {
  return (
    <div className="card flex flex-col justify-between gap-3">
      <div>
        <h3 className="font-bold">{title}</h3>
        <p className="text-sm text-slate-500">{text}</p>
      </div>
      {children}
    </div>
  );
}

/** Barras agrupadas ingresos vs gastos; valores visibles y detalle al pasar el cursor. */
function MonthChart({ months }: { months: { period: string; income: number; expenses: number }[] }) {
  const max = Math.max(1, ...months.flatMap((m) => [m.income, m.expenses]));
  return (
    <div>
      <div className="mb-2 flex gap-4 text-xs text-slate-600">
        <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded-sm" style={{ background: '#1baf7a' }} />Ingresos</span>
        <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded-sm" style={{ background: '#eb6834' }} />Gastos</span>
      </div>
      <div className="flex h-48 items-end gap-3 overflow-x-auto border-b border-slate-300 pb-0">
        {months.map((m) => (
          <div key={m.period} className="flex min-w-14 flex-1 flex-col items-center" title={`${capitalize(periodLabel(m.period))}\nIngresos: ${money(m.income)}\nGastos: ${money(m.expenses)}\nResultado: ${money(round2(m.income - m.expenses))}`}>
            <div className="flex h-44 w-full items-end justify-center gap-0.5">
              {[
                { v: m.income, c: '#1baf7a' },
                { v: m.expenses, c: '#eb6834' },
              ].map((b, i) => (
                <div key={i} className="flex h-full w-1/2 max-w-8 flex-col items-center justify-end">
                  <span className="mb-0.5 text-[10px] text-slate-600">${Math.round(b.v)}</span>
                  <div className="w-full rounded-t" style={{ height: `${(b.v / max) * 85}%`, background: b.c, minHeight: b.v > 0 ? 2 : 0 }} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="flex gap-3 overflow-x-auto">
        {months.map((m) => (
          <div key={m.period} className="min-w-14 flex-1 pt-1 text-center text-xs text-slate-500">{capitalize(periodLabel(m.period).slice(0, 3))} {m.period.slice(2, 4)}</div>
        ))}
      </div>
    </div>
  );
}

function newExpense(today: string): Expense {
  return { id: '', date: today, concept: '', category: 'Vigilancia', amount: 0, provider: '', paymentMethod: 'Efectivo', document: '', details: '', registeredBy: '', createdAt: '' };
}

function ExpenseForm({ expense, onClose }: { expense: Expense; onClose: () => void }) {
  const session = useSession()!;
  const [e, setE] = useState<Expense>(expense);
  const isNew = !expense.id;
  const set = <K extends keyof Expense>(k: K, v: Expense[K]) => setE({ ...e, [k]: v });

  function save(ev: React.FormEvent) {
    ev.preventDefault();
    const saved: Expense = isNew
      ? { ...e, id: `exp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, registeredBy: session.name, createdAt: new Date().toISOString(), amount: round2(e.amount) }
      : { ...e, amount: round2(e.amount) };
    update((d) => ({ ...d, expenses: isNew ? [...d.expenses, saved] : d.expenses.map((x) => (x.id === saved.id ? saved : x)) }));
    onClose();
  }

  function remove() {
    if (confirm(`¿Eliminar el gasto "${expense.concept}" por ${money(expense.amount)}?`)) {
      update((d) => ({ ...d, expenses: d.expenses.filter((x) => x.id !== expense.id) }));
      onClose();
    }
  }

  return (
    <Modal title={isNew ? 'Registrar gasto' : 'Editar gasto'} onClose={onClose}>
      <form onSubmit={save} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Fecha del gasto"><input className="input" type="date" max={localISODate()} value={e.date} onChange={(x) => set('date', x.target.value)} required /></Field>
          <Field label="Monto (USD)"><input className="input text-lg font-semibold" type="number" min={0.01} step="0.01" value={e.amount || ''} onChange={(x) => set('amount', Number(x.target.value))} required /></Field>
        </div>
        <Field label="Concepto"><input className="input" value={e.concept} onChange={(x) => set('concept', x.target.value)} placeholder="Ej.: Salario vigilante turno noche" required /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Categoría">
            <select className="input" value={e.category} onChange={(x) => set('category', x.target.value as Expense['category'])}>
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field label="Proveedor o beneficiario"><input className="input" value={e.provider} onChange={(x) => set('provider', x.target.value)} placeholder="A quién se le pagó" /></Field>
          <Field label="Forma de pago">
            <select className="input" value={e.paymentMethod} onChange={(x) => set('paymentMethod', x.target.value as Expense['paymentMethod'])}>
              {PAYMENT_METHODS.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </Field>
          <Field label="No. de factura o comprobante"><input className="input" value={e.document} onChange={(x) => set('document', x.target.value)} placeholder="Opcional" /></Field>
        </div>
        <Field label="Detalles"><textarea className="input" rows={2} value={e.details} onChange={(x) => set('details', x.target.value)} placeholder="Opcional: qué se reparó, período que cubre, etc." /></Field>
        {!isNew && <p className="text-xs text-slate-400">Registrado por {expense.registeredBy}{expense.createdAt && ` el ${fmtDate(expense.createdAt)}`}</p>}
        <div className="flex justify-between gap-2">
          {!isNew ? <button type="button" className="btn btn-secondary text-red-600" onClick={remove}>Eliminar</button> : <span />}
          <div className="flex gap-2">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
            <button className="btn btn-primary">Guardar</button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
