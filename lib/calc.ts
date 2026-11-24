import type { AreaRow, BoqItem, Quotation, ShedRow } from "./types";

const round2 = (n: number) => Math.round(n * 100) / 100;
// GST is rounded to whole rupees, as on the issued quotations.
const gstOn = (basic: number, rate: number | null) => Math.round((basic * num(rate)) / 100);
const num = (n: number | null | undefined) => (typeof n === "number" && !Number.isNaN(n) ? n : 0);

export interface BoqRowCalc {
  supplyAmount: number | null;
  installAmount: number | null;
}

export function boqRow(item: BoqItem): BoqRowCalc {
  const qty = item.qty;
  return {
    supplyAmount: qty !== null && item.supplyRate !== null ? round2(qty * item.supplyRate) : null,
    installAmount: qty !== null && item.installRate !== null ? round2(qty * item.installRate) : null,
  };
}

export interface BoqTotals {
  rows: BoqRowCalc[];
  supplyBasic: number;
  installBasic: number;
  supplyGst: number;
  installGst: number;
  supplyTotal: number;
  installTotal: number;
  grandTotal: number;
}

export function boqTotals(items: BoqItem[], gstRate: number | null): BoqTotals {
  const rows = items.map(boqRow);
  const supplyBasic = round2(rows.reduce((s, r) => s + num(r.supplyAmount), 0));
  const installBasic = round2(rows.reduce((s, r) => s + num(r.installAmount), 0));
  const supplyGst = gstOn(supplyBasic, gstRate);
  const installGst = gstOn(installBasic, gstRate);
  const supplyTotal = round2(supplyBasic + supplyGst);
  const installTotal = round2(installBasic + installGst);
  return {
    rows,
    supplyBasic,
    installBasic,
    supplyGst,
    installGst,
    supplyTotal,
    installTotal,
    grandTotal: round2(supplyTotal + installTotal),
  };
}

export interface AreaRowCalc {
  totalArea: number | null;
  amount: number | null;
  ratePerArea: number | null;
}

export function areaRow(row: AreaRow): AreaRowCalc {
  const totalArea = row.areaPerUnit !== null && row.units !== null ? round2(row.areaPerUnit * row.units) : null;
  if (row.notQuoted) return { totalArea, amount: null, ratePerArea: null };
  const amount = row.ratePerUnit !== null && row.units !== null ? round2(row.ratePerUnit * row.units) : null;
  const ratePerArea = amount !== null && totalArea ? Math.round(amount / totalArea) : null;
  return { totalArea, amount, ratePerArea };
}

export interface AreaTotals {
  rows: AreaRowCalc[];
  basic: number;
  gst: number;
  grandTotal: number;
}

export function areaTotals(rows: AreaRow[], gstRate: number | null): AreaTotals {
  const calc = rows.map(areaRow);
  const basic = round2(calc.reduce((s, r) => s + num(r.amount), 0));
  const gst = gstOn(basic, gstRate);
  return { rows: calc, basic, gst, grandTotal: round2(basic + gst) };
}

export function grandTotal(q: Quotation): number {
  return q.pricing.mode === "boq"
    ? boqTotals(q.pricing.boq.items, q.pricing.gstRate).grandTotal
    : areaTotals(q.pricing.area.rows, q.pricing.gstRate).grandTotal;
}

/** Total before GST. */
export function basicTotal(q: Quotation): number {
  if (q.pricing.mode === "boq") {
    const t = boqTotals(q.pricing.boq.items, q.pricing.gstRate);
    return round2(t.supplyBasic + t.installBasic);
  }
  return areaTotals(q.pricing.area.rows, q.pricing.gstRate).basic;
}

export function shedArea(row: ShedRow): number | null {
  if (row.areaOverride !== null) return row.areaOverride;
  if (row.qty === null || row.length === null || row.width === null) return null;
  return round2(row.qty * row.length * row.width);
}

export function shedSize(row: ShedRow): string {
  if (row.length === null || row.width === null) return "";
  return `${row.length}x${row.width}M`;
}
