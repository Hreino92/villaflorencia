import { useState } from 'react';
import { resetDemo, update, useDB } from '../../lib/store';
import { DEFAULT_TEMPLATES } from '../../lib/seed';
import type { Config } from '../../lib/types';
import { Field, PageTitle } from '../../components/ui';

const TEMPLATE_INFO: { key: keyof Config['templates']; label: string; vars: string }[] = [
  { key: 'advance', label: 'Aviso anticipado de cobro', vars: '{nombre} {casa} {monto} {meses} {vence} {residencial}' },
  { key: 'overdue', label: 'Aviso de mora', vars: '{nombre} {casa} {monto} {meses} {vence} {residencial}' },
  { key: 'receipt', label: 'Envío de recibo', vars: '{nombre} {casa} {monto} {recibo} {residencial}' },
  { key: 'visit', label: 'Código de visita (lo comparte el residente)', vars: '{visitante} {codigo} {fecha} {casa} {residencial}' },
];

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

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card border-amber-300">
          <h2 className="mb-1 font-bold">Herramientas de la demo</h2>
          <p className="mb-3 text-sm text-slate-500">Solo existen en el prototipo, para probar el comportamiento en otras fechas.</p>
          <div className="mb-4 flex flex-wrap items-end gap-2">
            <Field label="Simular la fecha de hoy">
              <input className="input" type="date" value={simDate} onChange={(e) => setSimDate(e.target.value)} />
            </Field>
            <button className="btn btn-secondary" onClick={() => applySimDate(simDate)} disabled={!simDate}>Aplicar</button>
            <button className="btn btn-secondary" onClick={() => applySimDate(null)}>Usar fecha real</button>
          </div>
          <p className="mb-4 text-xs text-slate-500">Al avanzar a un mes nuevo se generan las cuotas y el reporte de cierre como lo harían las tareas automáticas.</p>
          <button
            className="btn btn-danger"
            onClick={() => {
              if (confirm('¿Borrar todos los cambios y volver a los datos de ejemplo?')) resetDemo();
            }}
          >
            Reiniciar datos de ejemplo
          </button>
        </div>
      </div>
    </>
  );
}
