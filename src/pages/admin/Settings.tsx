import { useState } from 'react';
import { addPaidHistory, importHouses, parseHouseImport, parsePaidHistory, update, useDB, type HouseImport } from '../../lib/store';
import type { Charge } from '../../lib/types';
import { money, periodLabel } from '../../lib/dates';
import { usingEmulators } from '../../lib/firebase';
import { DEFAULT_TEMPLATES } from '../../lib/seed';
import type { Config } from '../../lib/types';
import { Field, PageTitle } from '../../components/ui';

const TEMPLATE_INFO: { key: keyof Config['templates']; label: string; vars: string }[] = [
  { key: 'advance', label: 'Aviso anticipado de cobro', vars: '{nombre} {casa} {monto} {meses} {vence} {residencial}' },
  { key: 'overdue', label: 'Aviso de mora', vars: '{nombre} {casa} {monto} {meses} {vence} {residencial}' },
  { key: 'receipt', label: 'Envío de recibo', vars: '{nombre} {casa} {monto} {recibo} {residencial}' },
  { key: 'visit', label: 'Código de visita (lo comparte el residente)', vars: '{visitante} {codigo} {fecha} {casa} {residencial}' },
];

/** Carga las casas reales desde el archivo preparado, reemplazando los datos actuales. */
function ImportHouses() {
  const db = useDB();
  const [data, setData] = useState<HouseImport | null>(null);
  const [paid, setPaid] = useState<Charge[] | null>(null);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState('');

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setData(null);
    setPaid(null);
    setError('');
    setDone('');
    if (!file) return;
    setFileName(file.name);
    const text = await file.text();
    // El mismo selector acepta los dos archivos: casas (reemplaza todo) o meses pagados (solo agrega).
    if (text.includes('"villaflorencia-paid-history-v1"')) {
      const result = parsePaidHistory(text);
      if (typeof result === 'string') setError(result);
      else setPaid(result);
      return;
    }
    const result = parseHouseImport(text);
    if (typeof result === 'string') setError(result);
    else setData(result);
  }

  async function addPaid() {
    if (!paid) return;
    setBusy(true);
    setError('');
    try {
      const n = await addPaidHistory(paid);
      setDone(n ? `Listo: se agregaron ${n} meses pagados. Revisa el informe "Meses pagados por casa" en Reportes.` : 'No había meses nuevos que agregar: ya estaban registrados.');
      setPaid(null);
    } catch (err) {
      console.error(err);
      setError('No se pudieron agregar todos los meses. Vuelve a intentarlo con el mismo archivo: los que ya se guardaron no se duplican.');
    } finally {
      setBusy(false);
    }
  }

  async function run() {
    if (!data) return;
    if (!confirm(`Se borrarán las ${db.houses.length} casas actuales con sus pagos, visitas y gastos, y se crearán ${data.houses.length} casas. Esto no se puede deshacer. ¿Continuar?`)) return;
    setBusy(true);
    setError('');
    try {
      await importHouses(data);
      setDone(`Listo: se crearon ${data.houses.length} casas. Revisa la pantalla Casas para completar teléfonos y correos.`);
      setData(null);
    } catch (err) {
      console.error(err);
      setError('No se pudo completar la importación. Revisa tu conexión y vuelve a intentarlo con el mismo archivo.');
    } finally {
      setBusy(false);
    }
  }

  const debt = data ? data.charges.reduce((s, c) => s + c.amount, 0) : 0;
  const residents = db.users.filter((u) => u.role === 'residente').length;

  return (
    <div className="card mb-6 max-w-3xl">
      <h2 className="font-bold">Importar casas o meses pagados</h2>
      <p className="mb-3 text-sm text-slate-500">
        Con el archivo de casas (casas-villa-florencia.json) se reemplazan las casas actuales. Con el de meses pagados (meses-pagados-villa-florencia.json) solo se agregan los meses que ya estaban pagados antes del sistema.
      </p>
      <input type="file" accept=".json,application/json" onChange={pick} className="text-sm" aria-label="Archivo de importación" />
      {paid && (
        <div className="mt-4 rounded-[10px] bg-emerald-50 p-4 text-sm">
          <p className="mb-2 font-semibold">{fileName}</p>
          <p className="mb-3">
            Se agregarán hasta {paid.length} meses pagados en {new Set(paid.map((c) => c.houseId)).size} casas, marcados como "pagado antes del sistema". No se borra ni se cambia nada: los meses que una casa ya tenga registrados se saltan.
          </p>
          <button className="btn btn-primary" disabled={busy} onClick={addPaid}>{busy ? 'Agregando…' : 'Agregar meses pagados'}</button>
        </div>
      )}
      {data && (
        <div className="mt-4 rounded-[10px] bg-slate-50 p-4 text-sm">
          <p className="mb-2 font-semibold">{fileName}</p>
          <ul className="mb-3 list-disc space-y-0.5 pl-5">
            <li>Se crearán {data.houses.length} casas ({data.houses.filter((h) => h.tenant).length} con inquilino).</li>
            <li>{data.charges.length} cuotas pendientes de meses anteriores, por {money(debt)}, en {new Set(data.charges.map((c) => c.houseId)).size} casas.</li>
            <li>{Object.keys(data.credits).length} casas con saldo a favor.</li>
            <li>Las cuotas automáticas empiezan en {periodLabel(data.startPeriod)}.</li>
          </ul>
          <p className="mb-3 text-red-800">
            Se borrarán {db.houses.length} casas, {db.payments.length} pagos, {db.visits.length} visitas y {db.expenses.length} gastos actuales
            {residents > 0 && `, y ${residents} cuentas de residentes perderán el acceso`}. Tu cuenta y la de los vigilantes se conservan.
          </p>
          <button className="btn btn-danger" disabled={busy} onClick={run}>{busy ? 'Importando…' : 'Borrar datos actuales e importar'}</button>
        </div>
      )}
      {error && <p role="alert" className="mt-3 rounded-md bg-red-50 p-2 text-sm text-red-700">{error}</p>}
      {done && <p className="mt-3 rounded-md bg-emerald-50 p-2 text-sm text-emerald-800">{done}</p>}
    </div>
  );
}

export default function Settings() {
  const db = useDB();
  const [cfg, setCfg] = useState(db.config);
  const [saved, setSaved] = useState(false);
  const [simDate, setSimDate] = useState(db.config.simulatedToday ?? '');

  function save(e: React.FormEvent) {
    e.preventDefault();
    update((d) => ({ ...d, config: { ...d.config, name: cfg.name, fee: cfg.fee, dueDay: cfg.dueDay, advanceDays: cfg.advanceDays, templates: cfg.templates } }));
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  function applySimDate(value: string | null) {
    update((d) => ({ ...d, config: { ...d.config, simulatedToday: value || null } }));
    setSimDate(value ?? '');
  }

  return (
    <>
      <PageTitle title="Configuración" subtitle="Cambia montos, fechas y mensajes sin tocar el código" />
      <form onSubmit={save} className="card mb-6 space-y-4">
        <h2 className="font-bold">Cobro mensual</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Nombre de la residencial" className="sm:col-span-2"><input className="input" value={cfg.name} onChange={(e) => setCfg({ ...cfg, name: e.target.value })} required /></Field>
          <Field label="Cuota mensual (USD)"><input className="input" type="number" min={0} step="0.01" value={cfg.fee} onChange={(e) => setCfg({ ...cfg, fee: Number(e.target.value) })} required /></Field>
          <Field label="Día de vencimiento"><input className="input" type="number" min={1} max={31} value={cfg.dueDay} onChange={(e) => setCfg({ ...cfg, dueDay: Number(e.target.value) })} required /></Field>
          <Field label="Avisar con días de anticipación"><input className="input" type="number" min={0} max={20} value={cfg.advanceDays} onChange={(e) => setCfg({ ...cfg, advanceDays: Number(e.target.value) })} required /></Field>
        </div>
        <p className="text-xs text-slate-500">
          Los cambios de cuota y vencimiento aplican a los meses que se generen después; no modifican cargos ya emitidos. Si el mes tiene menos días, vence el último día del mes.
        </p>

        <h2 className="pt-2 font-bold">Mensajes de WhatsApp</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          {TEMPLATE_INFO.map((t) => (
            <Field key={t.key} label={t.label}>
              <textarea className="input" rows={4} value={cfg.templates[t.key]} onChange={(e) => setCfg({ ...cfg, templates: { ...cfg.templates, [t.key]: e.target.value } })} />
              <span className="mt-1 flex justify-between text-xs text-slate-400">
                <span>Variables: {t.vars}</span>
                <button type="button" className="text-emerald-700" onClick={() => setCfg({ ...cfg, templates: { ...cfg.templates, [t.key]: DEFAULT_TEMPLATES[t.key] } })}>Restaurar</button>
              </span>
            </Field>
          ))}
        </div>
        <div className="flex items-center justify-end gap-3">
          {saved && <span className="text-sm text-emerald-700">Guardado</span>}
          <button className="btn btn-primary">Guardar configuración</button>
        </div>
      </form>

      <ImportHouses />

      {/* Solo en el modo de pruebas local: en producción cambiaría la fecha para todos. */}
      {usingEmulators && (
        <div className="card max-w-xl border-amber-300">
          <h2 className="mb-1 font-bold">Herramientas de prueba</h2>
          <p className="mb-3 text-sm text-slate-500">Solo aparecen con los emuladores locales, para probar el comportamiento en otras fechas.</p>
          <div className="mb-4 flex flex-wrap items-end gap-2">
            <Field label="Simular la fecha de hoy">
              <input className="input" type="date" value={simDate} onChange={(e) => setSimDate(e.target.value)} />
            </Field>
            <button className="btn btn-secondary" onClick={() => applySimDate(simDate)} disabled={!simDate}>Aplicar</button>
            <button className="btn btn-secondary" onClick={() => applySimDate(null)}>Usar fecha real</button>
          </div>
          <p className="text-xs text-slate-500">Al avanzar a un mes nuevo se generan las cuotas y el reporte de cierre.</p>
        </div>
      )}
    </>
  );
}
