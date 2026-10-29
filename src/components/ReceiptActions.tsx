import { useState } from 'react';
import type { DB, Payment } from '../lib/types';
import { houseLabel, recipients } from '../lib/billing';
import { money } from '../lib/dates';
import { fillTemplate, openWhatsApp, shareFile, waLink } from '../lib/whatsapp';

// La librería de PDF es pesada: se carga solo al usarla.
const pdf = () => import('../lib/pdf');

/** Ver, descargar y enviar por WhatsApp un recibo. */
export default function ReceiptActions({ db, payment, allowSend = true }: { db: DB; payment: Payment; allowSend?: boolean }) {
  const [msg, setMsg] = useState('');
  const house = db.houses.find((h) => h.id === payment.houseId)!;
  const targets = recipients(house, house.notifyTo);

  async function send(phone: string, name: string) {
    const text = fillTemplate(db.config.templates.receipt, {
      nombre: name,
      monto: money(payment.amount),
      casa: houseLabel(house),
      recibo: String(payment.receiptNo).padStart(6, '0'),
      residencial: db.config.name,
    });
    const { receiptPDF, downloadFile } = await pdf();
    const file = receiptPDF(db, payment);
    if (await shareFile(file, text)) return;
    // En PC no se pueden adjuntar archivos a wa.me: se descarga el PDF para arrastrarlo al chat.
    downloadFile(file);
    openWhatsApp(waLink(phone, text));
    setMsg('Se descargó el PDF: arrástralo al chat de WhatsApp que se abrió.');
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button className="btn btn-secondary btn-sm" onClick={async () => { const p = await pdf(); p.openFile(p.receiptPDF(db, payment)); }}>Ver recibo</button>
        <button className="btn btn-secondary btn-sm" onClick={async () => { const p = await pdf(); p.downloadFile(p.receiptPDF(db, payment)); }}>Descargar</button>
        {allowSend &&
          targets.map((t) =>
            t.person.phone ? (
              <button key={t.relation} className="btn btn-whatsapp btn-sm" onClick={() => send(t.person.phone, t.person.name)}>
                WhatsApp a {t.relation === 'owner' ? 'propietario' : 'inquilino'}
              </button>
            ) : (
              <span key={t.relation} className="self-center text-xs font-semibold text-amber-800">
                Sin teléfono del {t.relation === 'owner' ? 'propietario' : 'inquilino'}
              </span>
            ),
          )}
      </div>
      {msg && <p className="text-xs text-slate-500">{msg}</p>}
    </div>
  );
}
