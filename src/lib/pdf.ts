import { jsPDF } from 'jspdf';
import autoTable, { type CellHookData, type UserOptions } from 'jspdf-autotable';
import type { DB, House, Payment } from './types';
import { houseDebt, houseLabel } from './billing';
import { capitalize, fmtDate, fmtDateTime, localISODate, money, periodLabel } from './dates';
import { financialSummary, housesInRange, moraList, rangeLabel, statement } from './reports';

// ---------- Paleta (validada para daltonismo: ingresos vs gastos) ----------

type RGB = [number, number, number];
const BRAND: RGB = [6, 95, 70]; // verde de la residencial
const BRAND_DARK: RGB = [4, 70, 52];
const BRAND_SOFT: RGB = [236, 253, 245];
const INK: RGB = [15, 23, 42];
const MUTED: RGB = [100, 116, 139];
const LINE: RGB = [226, 232, 240];
const ZEBRA: RGB = [248, 250, 252];
const INCOME: RGB = [27, 175, 122];
const EXPENSE: RGB = [235, 104, 52];
const DANGER: RGB = [220, 38, 38];
const STATUS: Record<string, { fill: RGB; text: RGB; label: string }> = {
  pagado: { fill: [220, 252, 231], text: [21, 128, 61], label: 'Pagado' },
  pendiente: { fill: [254, 243, 199], text: [146, 64, 14], label: 'Pend.' },
  parcial: { fill: [224, 242, 254], text: [3, 105, 161], label: 'Parcial' },
  vencido: { fill: [254, 226, 226], text: [185, 28, 28], label: 'Mora' },
  'sin cargo': { fill: [255, 255, 255], text: [148, 163, 184], label: '-' },
};

const M = 14; // margen

// ---------- Piezas comunes ----------

function header(doc: jsPDF, db: DB, kind: string, title: string, subtitle?: string): number {
  const w = doc.internal.pageSize.getWidth();
  doc.setFillColor(...BRAND);
  doc.rect(0, 0, w, 30, 'F');
  // Franja decorativa
  doc.setFillColor(...BRAND_DARK);
  doc.triangle(w - 70, 0, w, 0, w, 30, 'F');
  doc.setFillColor(...INCOME);
  doc.rect(0, 30, w, 1.2, 'F');

  // Monograma
  doc.setFillColor(255, 255, 255);
  doc.circle(M + 7, 15, 7, 'F');
  doc.setTextColor(...BRAND);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  const initials = db.config.name.replace(/^Residencial\s+/i, '').split(/\s+/).map((s) => s[0]).join('').slice(0, 2).toUpperCase();
  doc.text(initials, M + 7, 16.6, { align: 'center' });

  // En media carta (recibos) no cabe el tipo de documento a la derecha: el título ya lo dice.
  const narrow = w < 160;
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(narrow ? 12 : 14);
  doc.text(db.config.name, M + 18, 13.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text('Vigilancia y mantenimiento', M + 18, 19.5);
  if (!narrow) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text(kind.toUpperCase(), w - M, 13.5, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.text(`Emitido: ${fmtDate(localISODate())}`, w - M, 19.5, { align: 'right' });
  }

  doc.setTextColor(...INK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(title, M, 43);
  let y = 43;
  if (subtitle) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(...MUTED);
    doc.text(subtitle, M, 49);
    y = 49;
  }
  return y + 6;
}

function footer(doc: jsPDF, text: string) {
  const pages = doc.getNumberOfPages();
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.3);
    doc.line(M, h - 12, w - M, h - 12);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text(text, M, h - 7);
    doc.text(`Página ${i} de ${pages}`, w - M, h - 7, { align: 'right' });
  }
}

interface Tile {
  label: string;
  value: string;
  hint?: string;
  color?: RGB;
}

/** Tarjetas de resumen (número grande + etiqueta). */
function tiles(doc: jsPDF, y: number, items: Tile[]): number {
  const w = doc.internal.pageSize.getWidth() - M * 2;
  const gap = 4;
  const tw = (w - gap * (items.length - 1)) / items.length;
  items.forEach((t, i) => {
    const x = M + i * (tw + gap);
    doc.setFillColor(...ZEBRA);
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.3);
    doc.roundedRect(x, y, tw, 22, 2.5, 2.5, 'FD');
    doc.setFillColor(...(t.color ?? BRAND));
    doc.roundedRect(x, y, 1.6, 22, 0.8, 0.8, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text(t.label.toUpperCase(), x + 5, y + 6.5);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(...INK);
    doc.text(t.value, x + 5, y + 14.5);
    if (t.hint) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(...MUTED);
      doc.text(t.hint, x + 5, y + 19.3);
    }
  });
  return y + 22 + 7;
}

function sectionTitle(doc: jsPDF, y: number, text: string): number {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...INK);
  doc.text(text, M, y);
  doc.setFillColor(...INCOME);
  doc.rect(M, y + 1.8, 12, 0.8, 'F');
  return y + 7;
}

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const mag = 10 ** Math.floor(Math.log10(v));
  for (const s of [1, 2, 2.5, 5, 10]) if (s * mag >= v) return s * mag;
  return 10 * mag;
}

/** Barras agrupadas (ingresos vs gastos por mes), un solo eje, valores visibles. */
function groupedBars(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  groups: { label: string; values: number[] }[],
  series: { name: string; color: RGB }[],
) {
  // Leyenda arriba a la derecha
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  let lx = x + w;
  for (const s of [...series].reverse()) {
    const tw = doc.getTextWidth(s.name);
    lx -= tw;
    doc.setTextColor(...INK);
    doc.text(s.name, lx, y + 3);
    lx -= 5;
    doc.setFillColor(...s.color);
    doc.roundedRect(lx, y + 0.6, 3.2, 3.2, 0.6, 0.6, 'F');
    lx -= 6;
  }
  const top = y + 10;
  const plotH = h - 18;
  const axisX = x + 16;
  const plotW = w - 16;
  const max = niceMax(Math.max(...groups.flatMap((g) => g.values)));

  // Cuadrícula recesiva
  doc.setFontSize(7);
  for (let i = 0; i <= 4; i++) {
    const gy = top + plotH - (plotH * i) / 4;
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.2);
    doc.line(axisX, gy, axisX + plotW, gy);
    doc.setTextColor(...MUTED);
    doc.text(`$${Math.round((max * i) / 4)}`, axisX - 2, gy + 1, { align: 'right' });
  }

  const gw = plotW / groups.length;
  const barW = Math.min(14, (gw * 0.7) / series.length);
  groups.forEach((g, gi) => {
    const gx = axisX + gi * gw + (gw - barW * series.length - (series.length - 1) * 0.8) / 2;
    g.values.forEach((v, si) => {
      const bh = (plotH * v) / max;
      const bx = gx + si * (barW + 0.8);
      if (bh > 0) {
        doc.setFillColor(...series[si].color);
        // Extremo redondeado arriba, anclado a la base
        doc.roundedRect(bx, top + plotH - bh, barW, bh, Math.min(1, bh / 2), Math.min(1, bh / 2), 'F');
        if (bh > 1.2) doc.rect(bx, top + plotH - Math.min(1, bh / 2), barW, Math.min(1, bh / 2), 'F');
      }
      doc.setFontSize(6.5);
      doc.setTextColor(...INK);
      doc.text(v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${Math.round(v)}`, bx + barW / 2, top + plotH - bh - 1.2, { align: 'center' });
    });
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text(g.label, axisX + gi * gw + gw / 2, top + plotH + 5, { align: 'center' });
  });
  doc.setDrawColor(...MUTED);
  doc.setLineWidth(0.3);
  doc.line(axisX, top + plotH, axisX + plotW, top + plotH);
}

/** Barras horizontales (magnitud por categoría), con etiqueta y valor directos. */
function horizontalBars(doc: jsPDF, x: number, y: number, w: number, items: { label: string; value: number }[], color: RGB): number {
  const labelW = 52;
  const valueW = 30;
  const barMax = w - labelW - valueW;
  const max = Math.max(...items.map((i) => i.value), 1);
  const total = items.reduce((s, i) => s + i.value, 0) || 1;
  items.forEach((it, i) => {
    const ry = y + i * 8;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...INK);
    doc.text(it.label, x, ry + 4);
    doc.setFillColor(...ZEBRA);
    doc.roundedRect(x + labelW, ry, barMax, 5.5, 1, 1, 'F');
    const bw = Math.max(1.5, (barMax * it.value) / max);
    doc.setFillColor(...color);
    doc.roundedRect(x + labelW, ry, bw, 5.5, 1, 1, 'F');
    doc.setFont('helvetica', 'bold');
    doc.text(money(it.value), x + w - 12, ry + 4, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...MUTED);
    doc.text(`${Math.round((it.value / total) * 100)}%`, x + w, ry + 4, { align: 'right' });
  });
  return y + items.length * 8 + 4;
}

function table(doc: jsPDF, opts: UserOptions) {
  autoTable(doc, {
    theme: 'plain',
    margin: { left: M, right: M, bottom: 18 },
    styles: { fontSize: 8.5, cellPadding: { top: 2.2, bottom: 2.2, left: 2.5, right: 2.5 }, textColor: INK, lineColor: LINE },
    headStyles: { fillColor: BRAND, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
    alternateRowStyles: { fillColor: ZEBRA },
    footStyles: { fillColor: BRAND_SOFT, textColor: BRAND_DARK, fontStyle: 'bold' },
    bodyStyles: { lineWidth: { bottom: 0.2 } },
    showFoot: 'lastPage',
    ...opts,
    // La fila de totales usa la misma alineación que su columna (montos a la derecha).
    didParseCell: (d: CellHookData) => {
      if (d.section === 'foot') {
        const cs = (opts.columnStyles as Record<number, { halign?: 'left' | 'right' | 'center' }> | undefined)?.[d.column.index];
        if (cs?.halign) d.cell.styles.halign = cs.halign;
      }
      opts.didParseCell?.(d);
    },
  });
}

const finalY = (doc: jsPDF) => (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

function ensureSpace(doc: jsPDF, y: number, needed: number): number {
  if (y + needed <= doc.internal.pageSize.getHeight() - 18) return y;
  doc.addPage();
  return 20;
}

const pdfFile = (doc: jsPDF, name: string) => new File([doc.output('blob')], name, { type: 'application/pdf' });

// ---------- Recibo ----------

export function receiptPDF(db: DB, p: Payment): File {
  const house = db.houses.find((h) => h.id === p.houseId)!;
  const doc = new jsPDF({ format: [140, 216] }); // media carta
  const w = 140;
  let y = header(doc, db, 'Comprobante de pago', 'Recibo de pago');

  // Número y sello
  doc.setFillColor(...BRAND_SOFT);
  doc.roundedRect(w - M - 42, 35, 42, 11, 2, 2, 'F');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...MUTED);
  doc.text('No. DE RECIBO', w - M - 21, 39.3, { align: 'center' });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...BRAND);
  doc.text(String(p.receiptNo).padStart(6, '0'), w - M - 21, 44.3, { align: 'center' });

  // Monto destacado
  y += 2;
  doc.setFillColor(...BRAND);
  doc.roundedRect(M, y, w - M * 2, 22, 3, 3, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text('TOTAL RECIBIDO EN EFECTIVO', M + 6, y + 7);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text(money(p.amount), M + 6, y + 17);
  // Sello "PAGADO"
  doc.setDrawColor(255, 255, 255);
  doc.setLineWidth(0.6);
  doc.roundedRect(w - M - 34, y + 6, 28, 10, 2, 2, 'S');
  doc.setFontSize(11);
  doc.text('PAGADO', w - M - 20, y + 13, { align: 'center' });
  y += 29;

  // Datos
  const info: [string, string][] = [
    ['Casa', houseLabel(house)],
    ['Recibido de', p.payerName],
    ['Fecha y hora', fmtDateTime(p.date)],
    ['Recibido por', p.receivedBy],
  ];
  info.forEach(([k, v], i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = M + col * ((w - M * 2) / 2);
    const ry = y + row * 11;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text(k.toUpperCase(), x, ry);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...INK);
    doc.text(doc.splitTextToSize(v, (w - M * 2) / 2 - 3)[0], x, ry + 4.5);
  });
  y += 24;

  table(doc, {
    startY: y,
    head: [['Concepto', 'Monto']],
    body: [
      ...p.allocations.map((a) => [a.description, money(a.amount)]),
      ...(p.credit > 0 ? [['Saldo a favor para próximos meses', money(p.credit)]] : []),
    ],
    foot: [['Total', money(p.amount)]],
    columnStyles: { 1: { halign: 'right', cellWidth: 28 } },
  });
  y = finalY(doc) + 6;

  const pending = houseDebt(db, house.id);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...(pending > 0 ? DANGER : BRAND));
  doc.text(pending > 0 ? `Saldo pendiente de la casa al ${fmtDate(localISODate())}: ${money(pending)}` : `La casa está al día al ${fmtDate(localISODate())}. ¡Gracias!`, M, y);
  if (p.note) {
    doc.setTextColor(...MUTED);
    doc.text(`Nota: ${p.note}`, M, y + 5);
  }

  const sy = Math.max(y + 24, 175);
  doc.setDrawColor(...MUTED);
  doc.setLineWidth(0.3);
  doc.line(w - M - 50, sy, w - M, sy);
  doc.setFontSize(7.5);
  doc.setTextColor(...MUTED);
  doc.text('Firma y sello de administración', w - M - 25, sy + 4, { align: 'center' });
  footer(doc, `Verificación: ${p.id}`);
  return pdfFile(doc, `Recibo-${p.receiptNo}-${house.poligono}${house.lote}.pdf`);
}

// ---------- Estado de cuenta ----------

export function statementPDF(db: DB, house: House, today: string): File {
  const doc = new jsPDF();
  const rows = statement(db, house.id);
  let y = header(
    doc,
    db,
    'Estado de cuenta',
    houseLabel(house),
    `Propietario: ${house.owner.name}${house.tenant ? `   ·   Inquilino: ${house.tenant.name}` : ''}`,
  );
  const charged = rows.reduce((s, r) => s + r.charge, 0);
  const paid = rows.reduce((s, r) => s + r.payment, 0);
  const debt = houseDebt(db, house.id);
  y = tiles(doc, y, [
    { label: 'Total cargado', value: money(charged) },
    { label: 'Total abonado', value: money(paid), color: INCOME },
    { label: 'Saldo pendiente', value: money(debt), color: debt > 0 ? DANGER : INCOME, hint: debt > 0 ? 'Por favor ponerse al día' : 'Al día' },
  ]);
  table(doc, {
    startY: y,
    head: [['Fecha', 'Concepto', 'Cargo', 'Abono', 'Saldo']],
    body: rows.map((r) => [fmtDate(r.date), r.concept, r.charge ? money(r.charge) : '', r.payment ? money(r.payment) : '', money(r.balance)]),
    columnStyles: { 0: { cellWidth: 22 }, 2: { halign: 'right' }, 3: { halign: 'right', textColor: [21, 128, 61] }, 4: { halign: 'right', fontStyle: 'bold' } },
  });
  footer(doc, `${db.config.name} · Estado de cuenta al ${fmtDate(today)}`);
  return pdfFile(doc, `Estado-de-cuenta-${house.poligono}${house.lote}.pdf`);
}

// ---------- Informe financiero (ingresos vs gastos) ----------

export function financialPDF(db: DB, from: string, to: string): File {
  const s = financialSummary(db, from, to);
  const doc = new jsPDF();
  const w = doc.internal.pageSize.getWidth();
  let y = header(doc, db, 'Informe financiero', `Informe de ingresos y gastos`, rangeLabel(from, to));
  y = tiles(doc, y, [
    { label: 'Ingresos (cobros)', value: money(s.income), hint: `${s.payments.length} recibos`, color: INCOME },
    { label: 'Gastos', value: money(s.expenses), hint: `${s.expenseList.length} registros`, color: EXPENSE },
    { label: s.balance >= 0 ? 'Superávit' : 'Déficit', value: money(Math.abs(s.balance)), hint: 'Ingresos menos gastos', color: s.balance >= 0 ? BRAND : DANGER },
  ]);

  y = sectionTitle(doc, y, 'Ingresos y gastos por mes');
  groupedBars(
    doc,
    M,
    y,
    w - M * 2,
    62,
    s.months.map((m) => ({ label: capitalize(periodLabel(m.period).slice(0, 3)) + ' ' + m.period.slice(2, 4), values: [m.income, m.expenses] })),
    [
      { name: 'Ingresos', color: INCOME },
      { name: 'Gastos', color: EXPENSE },
    ],
  );
  y += 68;

  if (s.byCategory.length) {
    y = ensureSpace(doc, y, 14 + s.byCategory.length * 8);
    y = sectionTitle(doc, y, 'Gastos por categoría');
    y = horizontalBars(doc, M, y, w - M * 2, s.byCategory.map((c) => ({ label: c.category, value: c.amount })), EXPENSE);
  }

  // La tabla completa (encabezado + meses + total) va junta en una página.
  y = ensureSpace(doc, y, 16 + (s.months.length + 2) * 8);
  y = sectionTitle(doc, y + 2, 'Resumen mensual');
  table(doc, {
    startY: y,
    head: [['Mes', 'Ingresos', 'Gastos', 'Resultado']],
    body: s.months.map((m) => [capitalize(periodLabel(m.period)), money(m.income), money(m.expenses), money(m.income - m.expenses)]),
    foot: [['Total', money(s.income), money(s.expenses), money(s.balance)]],
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right', fontStyle: 'bold' } },
    didParseCell: (d: CellHookData) => {
      if (d.section === 'body' && d.column.index === 3) {
        const m = s.months[d.row.index];
        d.cell.styles.textColor = m.income - m.expenses < 0 ? DANGER : [21, 128, 61];
      }
    },
  });

  if (s.expenseList.length) {
    doc.addPage();
    y = sectionTitle(doc, 20, 'Detalle de gastos');
    table(doc, {
      startY: y,
      head: [['Fecha', 'Concepto', 'Categoría', 'Proveedor', 'Forma', 'Comprobante', 'Monto']],
      body: s.expenseList.map((e) => [fmtDate(e.date), e.concept + (e.details ? `\n${e.details}` : ''), e.category, e.provider, e.paymentMethod, e.document, money(e.amount)]),
      foot: [['', '', '', '', '', 'Total', money(s.expenses)]],
      styles: { fontSize: 7.5, cellPadding: 1.8, textColor: INK, lineColor: LINE },
      columnStyles: { 0: { cellWidth: 18 }, 6: { halign: 'right', cellWidth: 20 } },
    });
  }

  doc.addPage();
  y = sectionTitle(doc, 20, 'Detalle de ingresos (recibos emitidos)');
  table(doc, {
    startY: y,
    head: [['Recibo', 'Fecha', 'Casa', 'Pagado por', 'Monto']],
    body: s.payments.map((p) => {
      const h = db.houses.find((x) => x.id === p.houseId);
      return [String(p.receiptNo).padStart(6, '0'), fmtDate(p.date), h ? houseLabel(h) : p.houseId, p.payerName, money(p.amount)];
    }),
    foot: [['', '', '', 'Total', money(s.income)]],
    styles: { fontSize: 7.5, cellPadding: 1.8, textColor: INK, lineColor: LINE },
    columnStyles: { 4: { halign: 'right' } },
  });

  footer(doc, `${db.config.name} · Informe financiero · ${rangeLabel(from, to)}`);
  return pdfFile(doc, `Informe-financiero-${from}${from === to ? '' : `_a_${to}`}.pdf`);
}

// ---------- Todas las casas por rango ----------

export function housesPDF(db: DB, from: string, to: string, today: string): File {
  const rows = housesInRange(db, from, to, today);
  const periods = rows[0]?.cells.map((c) => c.period) ?? [];
  const doc = new jsPDF({ orientation: periods.length > 4 ? 'landscape' : 'portrait' });
  let y = header(doc, db, 'Reporte de casas', 'Estado de pagos de todas las casas', rangeLabel(from, to));
  const billed = rows.reduce((s, r) => s + r.billed, 0);
  const paid = rows.reduce((s, r) => s + r.paid, 0);
  const upToDate = rows.filter((r) => r.pending <= 0).length;
  y = tiles(doc, y, [
    { label: 'Casas', value: String(rows.length), hint: `${upToDate} al día en el período` },
    { label: 'Facturado', value: money(billed) },
    { label: 'Cobrado', value: money(paid), hint: `${billed ? Math.round((paid / billed) * 100) : 0}% de lo facturado`, color: INCOME },
    { label: 'Pendiente', value: money(billed - paid), color: DANGER },
  ]);

  // Leyenda de estados (texto + color, nunca solo color)
  doc.setFontSize(7.5);
  let lx = M;
  for (const k of ['pagado', 'parcial', 'pendiente', 'vencido'] as const) {
    const st = STATUS[k];
    doc.setFillColor(...st.fill);
    doc.roundedRect(lx, y - 3.2, 14, 4.6, 1, 1, 'F');
    doc.setTextColor(...st.text);
    doc.setFont('helvetica', 'bold');
    doc.text(st.label, lx + 7, y, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...MUTED);
    const desc = { pagado: 'cuota pagada', parcial: 'abono parcial', pendiente: 'aún no vence', vencido: 'vencida sin pagar' }[k];
    doc.text(desc, lx + 16, y);
    lx += 17 + doc.getTextWidth(desc) + 6;
  }
  y += 5;

  table(doc, {
    startY: y,
    head: [['Casa', 'Responsable', ...periods.map((p) => capitalize(periodLabel(p).slice(0, 3)) + ' ' + p.slice(2, 4)), 'Facturado', 'Pagado', 'Pendiente', 'Deuda total']],
    body: rows.map((r) => [
      houseLabel(r.house).replace('Polígono ', 'Pol. '),
      r.house.tenant && r.house.notifyTo === 'tenant' ? r.house.tenant.name : r.house.owner.name,
      ...r.cells.map((c) => STATUS[c.status].label),
      money(r.billed),
      money(r.paid),
      money(r.pending),
      money(r.totalDebt),
    ]),
    foot: [['Total', '', ...periods.map(() => ''), money(billed), money(paid), money(billed - paid), money(rows.reduce((s, r) => s + r.totalDebt, 0))]],
    styles: { fontSize: periods.length > 8 ? 6.5 : 7.5, cellPadding: 1.6, textColor: INK, lineColor: LINE, halign: 'left' },
    headStyles: { fillColor: BRAND, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7, halign: 'center' },
    didParseCell: (d: CellHookData) => {
      const ci = d.column.index;
      if (d.section === 'body' && ci >= 2 && ci < 2 + periods.length) {
        const st = STATUS[rows[d.row.index].cells[ci - 2].status];
        d.cell.styles.fillColor = st.fill;
        d.cell.styles.textColor = st.text;
        d.cell.styles.fontStyle = 'bold';
        d.cell.styles.halign = 'center';
      }
      if (ci >= 2 + periods.length) d.cell.styles.halign = 'right';
      if (d.section === 'body' && ci === 2 + periods.length + 2 && rows[d.row.index].pending > 0) d.cell.styles.textColor = DANGER;
    },
  });
  footer(doc, `${db.config.name} · Reporte de casas · ${rangeLabel(from, to)} · Deuda total incluye saldos anteriores`);
  return pdfFile(doc, `Reporte-casas-${from}${from === to ? '' : `_a_${to}`}.pdf`);
}

// ---------- Mora ----------

export function moraPDF(db: DB, today: string): File {
  const rows = moraList(db, today);
  const total = rows.reduce((s, r) => s + r.amount, 0);
  const doc = new jsPDF();
  let y = header(doc, db, 'Reporte de mora', 'Casas en mora', `Al ${fmtDate(today)}`);
  y = tiles(doc, y, [
    { label: 'Casas en mora', value: String(rows.length), hint: `de ${db.houses.length} casas`, color: DANGER },
    { label: 'Total vencido', value: money(total), color: DANGER },
    { label: 'Promedio por casa', value: money(rows.length ? total / rows.length : 0) },
  ]);
  table(doc, {
    startY: y,
    head: [['Casa', 'Responsable', 'Teléfono', 'Meses vencidos', 'Vencido']],
    body: rows.map((r) => {
      const who = r.house.tenant && r.house.notifyTo === 'tenant' ? r.house.tenant : r.house.owner;
      return [houseLabel(r.house), who.name, who.phone, r.months.join(', '), money(r.amount)];
    }),
    foot: [['Total', '', '', '', money(total)]],
    columnStyles: { 4: { halign: 'right', fontStyle: 'bold', textColor: DANGER } },
  });
  footer(doc, `${db.config.name} · Reporte de mora`);
  return pdfFile(doc, `Mora-${today}.pdf`);
}

// ---------- Descargas ----------

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
