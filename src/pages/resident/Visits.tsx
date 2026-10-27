import { useState } from 'react';
import { update, useDB, useSession, useToday } from '../../lib/store';
import { canCreateVisits, houseLabel, newVisitCode } from '../../lib/billing';
import { fmtDate, fmtDateTime } from '../../lib/dates';
import { fillTemplate, openWhatsApp, waShareLink } from '../../lib/whatsapp';
import type { Visit } from '../../lib/types';
import { Empty, Field, Modal, PageTitle } from '../../components/ui';

export default function Visits() {
  const db = useDB();
  const today = useToday();
  const session = useSession()!;
  const house = db.houses.find((h) => h.id === session.houseId);
  const [form, setForm] = useState({ visitorName: '', dui: '', date: today, reason: '' });
  const [created, setCreated] = useState<Visit | null>(null);

  if (!house) return <Empty>No se encontró la casa asociada a tu cuenta.</Empty>;
  const allowed = canCreateVisits(house, session.relation ?? 'owner');
  const visits = db.visits.filter((v) => v.houseId === house.id).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  const upcoming = visits.filter((v) => v.date >= today);
  const past = visits.filter((v) => v.date < today);

  function share(v: Visit) {
    const text = fillTemplate(db.config.templates.visit, {
      visitante: v.visitorName,
      codigo: v.code,
      fecha: fmtDate(v.date),
      casa: houseLabel(house!),
      residencial: db.config.name,
    });
    openWhatsApp(waShareLink(text));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const visit: Visit = {
      code: newVisitCode(db),
      houseId: house!.id,
      visitorName: form.visitorName.trim(),
      dui: form.dui.trim(),
      date: form.date,
      reason: form.reason.trim(),
      createdBy: session.name,
      createdAt: new Date().toISOString(),
      enteredAt: null,
      guardName: null,
    };
    update((d) => ({ ...d, visits: [...d.visits, visit] }));
    setCreated(visit);
    setForm({ visitorName: '', dui: '', date: today, reason: '' });
  }

  function cancel(code: string) {
    if (confirm('¿Anular este código de visita?')) update((d) => ({ ...d, visits: d.visits.filter((v) => v.code !== code) }));
  }

  return (
    <>
      <PageTitle title="Mis visitas" subtitle={`Códigos de acceso para ${houseLabel(house)}`} />
      <div className="grid gap-6 lg:grid-cols-[2fr_3fr]">
        <div className="card">
          <h2 className="mb-3 font-bold">Nuevo visitante</h2>
          {allowed ? (
            <form onSubmit={submit} className="space-y-3">
              <Field label="Nombre completo del visitante"><input className="input" value={form.visitorName} onChange={(e) => setForm({ ...form, visitorName: e.target.value })} required /></Field>
              <Field label="DUI"><input className="input" value={form.dui} onChange={(e) => setForm({ ...form, dui: e.target.value })} placeholder="00000000-0" pattern="\d{8}-\d" title="Formato 00000000-0" required /></Field>
              <Field label="Fecha de la visita"><input className="input" type="date" min={today} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required /></Field>
              <Field label="Motivo (opcional)"><input className="input" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="Visita familiar, entrega, técnico…" /></Field>
              <button className="btn btn-primary w-full">Generar código</button>
              <p className="text-xs text-slate-500">El código es válido solo el día indicado y para una entrada.</p>
            </form>
          ) : (
            <p className="text-sm text-slate-600">La administración configuró esta casa para que los códigos de visita los genere {session.relation === 'owner' ? 'el inquilino' : 'el propietario'}.</p>
          )}
        </div>

        <div className="space-y-6">
          <div className="card">
            <h2 className="mb-3 font-bold">Próximas visitas</h2>
            {upcoming.length === 0 ? (
              <Empty>No hay visitas programadas.</Empty>
            ) : (
              <ul className="divide-y divide-slate-100">
                {upcoming.map((v) => (
                  <li key={v.code} className="flex flex-wrap items-center justify-between gap-2 py-3">
                    <div>
                      <div className="font-semibold">{v.visitorName}</div>
                      <div className="text-sm text-slate-500">{fmtDate(v.date)} · DUI {v.dui}{v.reason && ` · ${v.reason}`}</div>
                      {v.enteredAt && <div className="text-sm text-emerald-700">Ingresó {fmtDateTime(v.enteredAt)}</div>}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-md bg-slate-900 px-3 py-1 font-mono text-lg tracking-widest text-white">{v.code}</span>
                      {!v.enteredAt && (
                        <>
                          <button className="btn btn-whatsapp btn-sm" onClick={() => share(v)}>Compartir</button>
                          <button className="btn btn-secondary btn-sm" onClick={() => cancel(v.code)}>Anular</button>
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {past.length > 0 && (
            <div className="card">
              <h2 className="mb-3 font-bold">Historial</h2>
              <ul className="divide-y divide-slate-100 text-sm">
                {past.slice(0, 20).map((v) => (
                  <li key={v.code} className="flex justify-between py-2">
                    <span>{v.visitorName} · {fmtDate(v.date)}</span>
                    <span className={v.enteredAt ? 'text-emerald-700' : 'text-slate-400'}>{v.enteredAt ? `Ingresó ${v.enteredAt.slice(11, 16)}` : 'No ingresó'}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {created && (
        <Modal title="Código generado" onClose={() => setCreated(null)}>
          <div className="text-center">
            <p className="text-sm text-slate-500">Código para {created.visitorName}, válido el {fmtDate(created.date)}</p>
            <div className="my-4 font-mono text-5xl font-bold tracking-[0.3em] text-emerald-800">{created.code}</div>
            <p className="mb-4 text-sm text-slate-600">Compártelo con tu visitante. Debe presentarlo junto con su DUI en la caseta.</p>
            <button className="btn btn-whatsapp w-full" onClick={() => share(created)}>Compartir por WhatsApp</button>
          </div>
        </Modal>
      )}
    </>
  );
}
