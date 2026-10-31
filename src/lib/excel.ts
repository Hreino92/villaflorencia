// Reportes en Excel (.xlsx) con formato: títulos, colores, moneda, filtros y varias hojas.
// ExcelJS es pesado, así que se carga solo al descargar.
import type { Workbook, Worksheet } from 'exceljs';
import type { DB, House } from './types';
import { houseLabel } from './billing';
import { capitalize, fmtDate, localISODate, periodLabel } from './dates';
import { financialSummary, housesInRange, moraList, rangeLabel, statement } from './reports';

const BRAND = 'FF065F46';
const BRAND_SOFT = 'FFECFDF5';
const MUTED = 'FF64748B';
const ZEBRA = 'FFF8FAFC';
const MONEY = '"$"#,##0.00';
const STATUS: Record<string, { fill: string; font: string; label: string }> = {
  pagado: { fill: 'FFDCFCE7', font: 'FF15803D', label: 'Pagado' },
  pendiente: { fill: 'FFFEF3C7', font: 'FF92400E', label: 'Pendiente' },
  parcial: { fill: 'FFE0F2FE', font: 'FF0369A1', label: 'Parcial' },
  vencido: { fill: 'FFFEE2E2', font: 'FFB91C1C', label: 'Mora' },
  adelantado: { fill: 'FFEDE9FE', font: 'FF5B21B6', label: 'Adelantado' },
  'sin cargo': { fill: 'FFFFFFFF', font: 'FF94A3B8', label: '-' },
};

async function newWorkbook(db: DB): Promise<Workbook> {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.creator = db.config.name;
  wb.created = new Date();
  return wb;
}

/** Hoja con título, subtítulo y una tabla con encabezado de color. Devuelve la fila donde empiezan los datos. */
function sheetWithTable(
  wb: Workbook,
  db: DB,
  name: string,
  title: string,
  subtitle: string,
  columns: { header: string; width: number; money?: boolean }[],
  rows: (string | number)[][],
  totals?: (string | number | null)[],
): Worksheet {
  const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 4 }] });
  ws.columns = columns.map((c) => ({ width: c.width }));
  const last = String.fromCharCode(64 + columns.length);

  ws.mergeCells(`A1:${last}1`);
  ws.getCell('A1').value = `${db.config.name} · ${title}`;
  ws.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
  ws.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND } };
  ws.getRow(1).height = 26;
  ws.getCell('A1').alignment = { vertical: 'middle', indent: 1 };
  ws.mergeCells(`A2:${last}2`);
  ws.getCell('A2').value = `${subtitle} · Generado el ${fmtDate(localISODate())}`;
  ws.getCell('A2').font = { italic: true, color: { argb: MUTED } };

  const head = ws.getRow(4);
  columns.forEach((c, i) => {
    const cell = head.getCell(i + 1);
    cell.value = c.header;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND } };
    cell.alignment = { vertical: 'middle', horizontal: c.money ? 'right' : 'left' };
  });
  head.height = 20;

  rows.forEach((r, ri) => {
    const row = ws.getRow(5 + ri);
    r.forEach((v, ci) => {
      const cell = row.getCell(ci + 1);
      cell.value = v;
      if (columns[ci]?.money) cell.numFmt = MONEY;
      if (ri % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ZEBRA } };
    });
  });

  if (totals) {
    const row = ws.getRow(5 + rows.length);
    totals.forEach((v, ci) => {
      const cell = row.getCell(ci + 1);
      cell.value = v;
      cell.font = { bold: true, color: { argb: BRAND } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND_SOFT } };
      cell.border = { top: { style: 'thin', color: { argb: BRAND } } };
      if (columns[ci]?.money) cell.numFmt = MONEY;
    });
  }
  if (rows.length) ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4 + rows.length, column: columns.length } };
  return ws;
}

async function toFile(wb: Workbook, name: string): Promise<File> {
  const buf = await wb.xlsx.writeBuffer();
  return new File([buf], name, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

/** Suma de una columna como fórmula de Excel (sigue funcionando si se editan valores). */
const sum = (col: string, n: number, result: number) => ({ formula: `SUM(${col}5:${col}${4 + n})`, result }) as unknown as number;

export async function financialXLSX(db: DB, from: string, to: string): Promise<File> {
  const s = financialSummary(db, from, to);
  const wb = await newWorkbook(db);
  const range = rangeLabel(from, to);

  const res = sheetWithTable(
    wb,
    db,
    'Resumen',
    'Informe financiero',
    range,
    [
      { header: 'Mes', width: 20 },
      { header: 'Ingresos', width: 16, money: true },
      { header: 'Gastos', width: 16, money: true },
      { header: 'Resultado', width: 16, money: true },
    ],
    s.months.map((m, i) => [capitalize(periodLabel(m.period)), m.income, m.expenses, { formula: `B${5 + i}-C${5 + i}`, result: m.income - m.expenses } as unknown as number]),
    ['Total', sum('B', s.months.length, s.income), sum('C', s.months.length, s.expenses), sum('D', s.months.length, s.balance)],
  );
  res.getColumn(4).eachCell((cell, row) => {
    if (row > 4 && row <= 4 + s.months.length) {
      const m = s.months[row - 5];
      cell.font = { bold: true, color: { argb: m.income - m.expenses < 0 ? 'FFDC2626' : 'FF15803D' } };
    }
  });

  sheetWithTable(
    wb,
    db,
    'Gastos por categoría',
    'Gastos por categoría',
    range,
    [
      { header: 'Categoría', width: 30 },
      { header: 'Monto', width: 16, money: true },
      { header: '% del total', width: 12 },
    ],
    s.byCategory.map((c) => [c.category, c.amount, s.expenses ? `${Math.round((c.amount / s.expenses) * 100)}%` : '0%']),
    ['Total', sum('B', s.byCategory.length, s.expenses), '100%'],
  );

  sheetWithTable(
    wb,
    db,
    'Gastos',
    'Detalle de gastos',
    range,
    [
      { header: 'Fecha', width: 12 },
      { header: 'Concepto', width: 36 },
      { header: 'Categoría', width: 26 },
      { header: 'Proveedor / beneficiario', width: 28 },
      { header: 'Forma de pago', width: 15 },
      { header: 'Comprobante', width: 15 },
      { header: 'Detalles', width: 34 },
      { header: 'Monto', width: 14, money: true },
    ],
    s.expenseList.map((e) => [fmtDate(e.date), e.concept, e.category, e.provider, e.paymentMethod, e.document, e.details, e.amount]),
    ['Total', '', '', '', '', '', '', sum('H', s.expenseList.length, s.expenses)],
  );

  sheetWithTable(
    wb,
    db,
    'Ingresos',
    'Detalle de ingresos (recibos)',
    range,
    [
      { header: 'Recibo', width: 10 },
      { header: 'Fecha', width: 12 },
      { header: 'Casa', width: 24 },
      { header: 'Pagado por', width: 30 },
      { header: 'Conceptos', width: 50 },
      { header: 'Monto', width: 14, money: true },
    ],
    s.payments.map((p) => {
      const h = db.houses.find((x) => x.id === p.houseId);
      return [String(p.receiptNo).padStart(6, '0'), fmtDate(p.date), h ? houseLabel(h) : p.houseId, p.payerName, p.allocations.map((a) => a.description).join(' / '), p.amount];
    }),
    ['Total', '', '', '', '', sum('F', s.payments.length, s.income)],
  );

  return toFile(wb, `Informe-financiero-${from}${from === to ? '' : `_a_${to}`}.xlsx`);
}

export async function housesXLSX(db: DB, from: string, to: string, today: string): Promise<File> {
  const rows = housesInRange(db, from, to, today);
  const periods = rows[0]?.cells.map((c) => c.period) ?? [];
  const wb = await newWorkbook(db);
  const col = (n: number) => String.fromCharCode(64 + n);
  const first = 5 + periods.length; // primera columna de totales

  const ws = sheetWithTable(
    wb,
    db,
    'Casas',
    'Meses pagados por casa',
    rangeLabel(from, to),
    [
      { header: 'Casa', width: 22 },
      { header: 'Propietario', width: 28 },
      { header: 'Inquilino', width: 26 },
      { header: 'Teléfono avisos', width: 15 },
      ...periods.map((p) => ({ header: capitalize(periodLabel(p)), width: 15 })),
      { header: 'Facturado', width: 14, money: true },
      { header: 'Pagado', width: 14, money: true },
      { header: 'Pendiente', width: 14, money: true },
      { header: 'Deuda total', width: 14, money: true },
      { header: 'Meses adelantados', width: 12 },
    ],
    rows.map((r) => {
      const who = r.house.tenant && r.house.notifyTo === 'tenant' ? r.house.tenant : r.house.owner;
      return [
        houseLabel(r.house),
        r.house.owner.name,
        r.house.tenant?.name ?? '',
        who.phone,
        ...r.cells.map((c) => STATUS[c.status].label),
        r.billed,
        r.paid,
        r.pending,
        r.totalDebt,
        r.monthsAhead || '',
      ];
    }),
    [
      'Total',
      '',
      '',
      '',
      ...periods.map(() => ''),
      sum(col(first), rows.length, rows.reduce((s, r) => s + r.billed, 0)),
      sum(col(first + 1), rows.length, rows.reduce((s, r) => s + r.paid, 0)),
      sum(col(first + 2), rows.length, rows.reduce((s, r) => s + r.pending, 0)),
      sum(col(first + 3), rows.length, rows.reduce((s, r) => s + r.totalDebt, 0)),
      '',
    ],
  );
  rows.forEach((r, ri) => {
    r.cells.forEach((c, ci) => {
      const cell = ws.getRow(5 + ri).getCell(5 + ci);
      const st = STATUS[c.status];
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: st.fill } };
      cell.font = { bold: true, color: { argb: st.font } };
      cell.alignment = { horizontal: 'center' };
    });
    if (r.pending > 0) ws.getRow(5 + ri).getCell(first + 2).font = { bold: true, color: { argb: 'FFDC2626' } };
  });
  ws.views = [{ state: 'frozen', xSplit: 1, ySplit: 4 }];
  return toFile(wb, `Reporte-casas-${from}${from === to ? '' : `_a_${to}`}.xlsx`);
}

export async function moraXLSX(db: DB, today: string): Promise<File> {
  const rows = moraList(db, today);
  const wb = await newWorkbook(db);
  sheetWithTable(
    wb,
    db,
    'Mora',
    'Casas en mora',
    `Al ${fmtDate(today)}`,
    [
      { header: 'Casa', width: 22 },
      { header: 'Propietario', width: 28 },
      { header: 'Teléfono', width: 13 },
      { header: 'Inquilino', width: 26 },
      { header: 'Meses vencidos', width: 50 },
      { header: 'Vencido', width: 14, money: true },
      { header: 'Saldo total', width: 14, money: true },
    ],
    rows.map((r) => [houseLabel(r.house), r.house.owner.name, r.house.owner.phone, r.house.tenant?.name ?? '', r.months.join(' / '), r.amount, r.totalDebt]),
    ['Total', '', '', '', '', sum('F', rows.length, rows.reduce((s, r) => s + r.amount, 0)), sum('G', rows.length, rows.reduce((s, r) => s + r.totalDebt, 0))],
  );
  return toFile(wb, `Mora-${today}.xlsx`);
}

export async function statementXLSX(db: DB, house: House): Promise<File> {
  const rows = statement(db, house.id);
  const wb = await newWorkbook(db);
  sheetWithTable(
    wb,
    db,
    'Estado de cuenta',
    `Estado de cuenta: ${houseLabel(house)}`,
    `Propietario: ${house.owner.name}${house.tenant ? ` · Inquilino: ${house.tenant.name}` : ''}`,
    [
      { header: 'Fecha', width: 12 },
      { header: 'Concepto', width: 44 },
      { header: 'Cargo', width: 14, money: true },
      { header: 'Abono', width: 14, money: true },
      { header: 'Saldo', width: 14, money: true },
    ],
    rows.map((r) => [fmtDate(r.date), r.concept, r.charge || '', r.payment || '', r.balance]),
  );
  return toFile(wb, `Estado-de-cuenta-${house.poligono}${house.lote}.xlsx`);
}
