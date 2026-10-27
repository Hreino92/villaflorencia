import { useState } from 'react';
import type { DB, Payment } from '../lib/types';
import { houseLabel, recipients } from '../lib/billing';
import { money } from '../lib/dates';
import { downloadFile, openFile, receiptPDF } from '../lib/pdf';
import { fillTemplate, openWhatsApp, shareFile, waLink } from '../lib/whatsapp';

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
        <button className="btn btn-secondary btn-sm" onClick={() => openFile(receiptPDF(db, payment))}>Ver recibo</button>
        <button className="btn btn-secondary btn-sm" onClick={() => downloadFile(receiptPDF(db, payment))}>Descargar</button>
        {allowSend &&
          targets.map((t) => (
            <button key={t.relation} className="btn btn-whatsapp btn-sm" onClick={() => send(t.person.phone, t.person.name)}>
              WhatsApp a {t.relation === 'owner' ? 'propietario' : 'inquilino'}
            </button>
          ))}
      </div>
      {msg && <p className="text-xs text-slate-500">{msg}</p>}
    </div>
  );
}
