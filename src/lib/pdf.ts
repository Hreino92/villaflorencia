import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { DB, House, Payment } from './types';
import { houseLabel } from './billing';
import { capitalize, fmtDate, fmtDateTime, money, periodLabel } from './dates';
import { incomeSummary, moraList, statement } from './reports';

const GREEN: [number, number, number] = [4, 120, 87];

function header(doc: jsPDF, db: DB, title: string, subtitle?: string) {
  const w = doc.internal.pageSize.getWidth();
  doc.setFillColor(...GREEN);
  doc.rect(0, 0, w, 26, 'F');
  doc.setTextColor(255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(db.config.name, 14, 12);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text('Cuota de vigilancia y mantenimiento', 14, 19);
  doc.setTextColor(30);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(title, 14, 38);
  if (subtitle) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(subtitle, 14, 44);
  }
}

function footer(doc: jsPDF, text: string) {
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text(`${text}  ·  Página ${i} de ${pages}`, 14, doc.internal.pageSize.getHeight() - 8);
  }
}

const tableStyle = {
  headStyles: { fillColor: GREEN },
  styles: { fontSize: 9 },
  margin: { left: 14, right: 14 },
};

export function receiptPDF(db: DB, p: Payment): File {
  const house = db.houses.find((h) => h.id === p.houseId)!;
  const doc = new jsPDF({ format: [140, 216] }); // media carta, vertical
  header(doc, db, `RECIBO DE PAGO No. ${String(p.receiptNo).padStart(6, '0')}`, `Fecha: ${fmtDateTime(p.date)}`);
  doc.setFontSize(10);
  const rows: [string, string][] = [
    ['Casa', houseLabel(house)],
    ['Recibido de', p.payerName],
    ['Forma de pago', 'Efectivo'],
    ['Recibido por', p.receivedBy],
  ];
  let y = 54;
  for (const [k, v] of rows) {
    doc.setFont('helvetica', 'bold');
    doc.text(`${k}:`, 14, y);
    doc.setFont('helvetica', 'normal');
    doc.text(v, 48, y);
    y += 6;
  }
  autoTable(doc, {
    ...tableStyle,
    startY: y + 2,
    head: [['Concepto', 'Monto']],
    body: [
      ...p.allocations.map((a) => [a.description, money(a.amount)]),
      ...(p.credit > 0 ? [['Saldo a favor', money(p.credit)]] : []),
    ],
    foot: [['TOTAL RECIBIDO', money(p.amount)]],
    footStyles: { fillColor: [236, 253, 245], textColor: 20, fontStyle: 'bold' },
    columnStyles: { 1: { halign: 'right' } },
  });
  const endY = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  if (p.note) {
    doc.setFontSize(9);
    doc.text(`Nota: ${p.note}`, 14, endY + 8);
  }
  doc.setDrawColor(150);
  doc.line(70, endY + 30, 126, endY + 30);
  doc.setFontSize(9);
  doc.text('Firma y sello de administración', 75, endY + 35);
  footer(doc, `Comprobante generado por el sistema · Verificación: ${p.id}`);
  const blob = doc.output('blob');
  return new File([blob], `Recibo-${p.receiptNo}-${house.poligono}${house.lote}.pdf`, { type: 'application/pdf' });
}

export function statementPDF(db: DB, house: House, today: string): File {
  const doc = new jsPDF();
  header(doc, db, `Estado de cuenta: ${houseLabel(house)}`, `Propietario: ${house.owner.name}${house.tenant ? `   ·   Inquilino: ${house.tenant.name}` : ''}`);
  const rows = statement(db, house.id);
  autoTable(doc, {
    ...tableStyle,
    startY: 50,
    head: [['Fecha', 'Concepto', 'Cargo', 'Abono', 'Saldo']],
    body: rows.map((r) => [fmtDate(r.date), r.concept, r.charge ? money(r.charge) : '', r.payment ? money(r.payment) : '', money(r.balance)]),
    columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } },
  });
  footer(doc, `Generado el ${fmtDate(today)}`);
  return new File([doc.output('blob')], `Estado-de-cuenta-${house.poligono}${house.lote}.pdf`, { type: 'application/pdf' });
}

export function incomePDF(db: DB, period: string): File {
  const s = incomeSummary(db, period);
  const doc = new jsPDF();
  header(doc, db, `Reporte de ingresos: ${capitalize(periodLabel(period))}`, `Total cobrado: ${money(s.total)}   ·   Facturado del mes: ${money(s.billed)}   ·   Cobrado de la cuota del mes: ${(s.rate * 100).toFixed(0)}%`);
  autoTable(doc, {
    ...tableStyle,
    startY: 50,
    head: [['Recibo', 'Fecha', 'Casa', 'Pagado por', 'Monto']],
    body: s.payments.map((p) => {
      const h = db.houses.find((x) => x.id === p.houseId);
      return [String(p.receiptNo).padStart(6, '0'), fmtDate(p.date), h ? houseLabel(h) : p.houseId, p.payerName, money(p.amount)];
    }),
    foot: [['', '', '', 'TOTAL', money(s.total)]],
    footStyles: { fillColor: [236, 253, 245], textColor: 20, fontStyle: 'bold' },
    columnStyles: { 4: { halign: 'right' } },
  });
  footer(doc, `${db.config.name} · Reporte de ingresos`);
  return new File([doc.output('blob')], `Ingresos-${period}.pdf`, { type: 'application/pdf' });
}

export function moraPDF(db: DB, today: string): File {
  const rows = moraList(db, today);
  const total = rows.reduce((s, r) => s + r.amount, 0);
  const doc = new jsPDF();
  header(doc, db, `Casas en mora al ${fmtDate(today)}`, `${rows.length} casas · Total vencido: ${money(total)}`);
  autoTable(doc, {
    ...tableStyle,
    startY: 50,
    head: [['Casa', 'Responsable', 'Meses vencidos', 'Vencido']],
    body: rows.map((r) => [houseLabel(r.house), r.house.tenant && r.house.notifyTo === 'tenant' ? r.house.tenant.name : r.house.owner.name, r.months.join(', '), money(r.amount)]),
    columnStyles: { 3: { halign: 'right' } },
  });
  footer(doc, `${db.config.name} · Reporte de mora`);
  return new File([doc.output('blob')], `Mora-${today}.pdf`, { type: 'application/pdf' });
}

export function downloadFile(file: File) {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function openFile(file: File) {
  const url = URL.createObjectURL(file);
  window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/** CSV con BOM para que Excel respete los acentos. */
export function csvFile(name: string, rows: (string | number)[][]): File {
  const esc = (v: string | number) => {
    const s = String(v);
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const text = '﻿' + rows.map((r) => r.map(esc).join(',')).join('\r\n');
  return new File([text], name, { type: 'text/csv' });
}
