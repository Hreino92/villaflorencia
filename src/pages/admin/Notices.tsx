import { useState } from 'react';
import { update, useDB, useToday } from '../../lib/store';
import { houseLabel, notificationQueue, type QueueItem } from '../../lib/billing';
import { addDays, fmtDate, money } from '../../lib/dates';
import { fillTemplate, openWhatsApp, waLink } from '../../lib/whatsapp';
import type { DB } from '../../lib/types';
import { Empty, PageTitle } from '../../components/ui';

export function messageFor(db: DB, item: QueueItem): string {
  const template = item.type === 'advance' ? db.config.templates.advance : db.config.templates.overdue;
  return fillTemplate(template, {
    nombre: item.person.name,
    casa: houseLabel(item.house),
    monto: money(item.amount),
    meses: item.months.join(', '),
    vence: fmtDate(item.dueDate),
    residencial: db.config.name,
  });
}

export default function Notices() {
  const db = useDB();
  const today = useToday();
  const [filter, setFilter] = useState<'all' | 'advance' | 'overdue'>('all');
  const [showSent, setShowSent] = useState(false);
  const queue = notificationQueue(db, today);
  const items = queue.filter((i) => (filter === 'all' || i.type === filter) && (showSent || !i.sent));
  const pending = queue.filter((i) => !i.sent);
  // Sin teléfono, WhatsApp se abriría sin destinatario y el aviso quedaría marcado como enviado sin serlo.
  const sendable = pending.filter((i) => i.person.phone);

  function markSent(item: QueueItem) {
    update((d) => ({
      ...d,
      notifications: [...d.notifications, { key: item.key, houseId: item.house.id, type: item.type, recipient: item.relation, sentAt: new Date().toISOString(), by: 'Administración' }],
    }));
  }

  function send(item: QueueItem) {
    openWhatsApp(waLink(item.person.phone, messageFor(db, item)));
    if (!item.sent) markSent(item);
  }

  const advanceFrom = addDays(today, db.config.advanceDays);

  return (
    <>
      <PageTitle
        title="Avisos de cobro por WhatsApp"
        subtitle={`Hoy ${fmtDate(today)} · ${pending.length} por enviar`}
        actions={sendable.length > 0 && <button className="btn btn-whatsapp" onClick={() => send(sendable[0])}>Enviar el siguiente</button>}
      />
      <div className="mb-4 rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
        La lista se arma sola cada día: <b>aviso anticipado</b> a las casas con la cuota del mes pendiente cuyo vencimiento cae entre hoy y el {fmtDate(advanceFrom)} ({db.config.advanceDays} días antes), y <b>aviso de mora</b> a las casas con cuotas vencidas. Al presionar
        <b> Enviar</b> se abre WhatsApp con el mensaje listo; solo presiona enviar en WhatsApp.
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {(['all', 'advance', 'overdue'] as const).map((f) => (
          <button key={f} className={`btn btn-sm ${filter === f ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setFilter(f)}>
            {f === 'all' ? 'Todos' : f === 'advance' ? 'Anticipados' : 'Mora'}
          </button>
        ))}
        <label className="ml-2 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={showSent} onChange={(e) => setShowSent(e.target.checked)} /> Mostrar enviados
        </label>
      </div>

      {items.length === 0 ? (
        <Empty>No hay avisos pendientes para hoy.</Empty>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {items.map((item) => (
            <div key={item.key} className={`card ${item.sent ? 'opacity-60' : ''}`}>
              <div className="mb-2 flex items-start justify-between gap-2">
                <div>
                  <div className="font-semibold">{houseLabel(item.house)}</div>
                  <div className="text-sm text-slate-600">
                    {item.person.name} · {item.relation === 'owner' ? 'propietario' : 'inquilino'} · {item.person.phone}
                  </div>
                </div>
                <span className={`badge ${item.type === 'overdue' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'}`}>
                  {item.type === 'overdue' ? 'Mora' : 'Anticipado'}
                </span>
              </div>
              <p className="mb-3 rounded-md bg-slate-50 p-2 text-xs text-slate-600">{messageFor(db, item)}</p>
              <div className="flex items-center justify-between">
                <span className="text-lg font-bold">{money(item.amount)}</span>
                {item.person.phone ? (
                  <div className="flex gap-2">
                    {!item.sent && <button className="btn btn-secondary btn-sm" onClick={() => markSent(item)}>Marcar enviado</button>}
                    <button className="btn btn-whatsapp btn-sm" onClick={() => send(item)}>{item.sent ? 'Reenviar' : 'Enviar'}</button>
                  </div>
                ) : (
                  <span className="text-sm font-semibold text-amber-800">Falta teléfono: agrégalo en Casas</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
