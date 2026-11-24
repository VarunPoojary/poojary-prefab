"use client";

import { useState } from "react";
import {
  Button,
  Card,
  Checkbox,
  NumberField,
  RowActions,
  Select,
  TextArea,
  TextField,
  Toggle,
  move,
} from "@/components/ui/fields";
import { areaTotals, boqTotals } from "@/lib/calc";
import { emptyAreaRow, libraryBoqItem } from "@/lib/defaults";
import { amountInWords, formatRupee, formatINR } from "@/lib/money";
import { useQuotation } from "@/lib/store";
import {
  BOQ_HEADING,
  BOQ_LIBRARY,
  PRICING_INTRO,
  PRICING_NOTE_AREA,
  PRICING_NOTE_BOQ,
  UOM_OPTIONS,
} from "@/lib/templates";
import type { AreaRow, BoqItem, PricingMode, Quotation } from "@/lib/types";

const MODE_BLOCKS: Record<string, PricingMode> = {
  boqNote: "boq",
  workScope: "boq",
  ratesNote: "boq",
  billingNote: "boq",
  designScope: "area",
};

function switchMode(d: Quotation, mode: PricingMode) {
  if (d.pricing.mode === mode) return;
  const oldDefault = d.pricing.mode === "boq" ? PRICING_NOTE_BOQ : PRICING_NOTE_AREA;
  if (d.pricing.noteText === oldDefault) d.pricing.noteText = mode === "boq" ? PRICING_NOTE_BOQ : PRICING_NOTE_AREA;
  d.pricing.mode = mode;
  if (mode === "boq" && d.pricing.boq.items.length === 0) d.pricing.boq.items.push(libraryBoqItem("steel"));
  if (mode === "area" && d.pricing.area.rows.length === 0) d.pricing.area.rows.push(emptyAreaRow());
  for (const b of d.scope.blocks) {
    const m = MODE_BLOCKS[b.kind];
    if (m) b.enabled = m === mode;
  }
}

export function PricingStep() {
  const { q, update } = useQuotation();
  return (
    <div className="space-y-5">
      <Card title="Pricing format" description="Choose the table layout that suits this project.">
        <div className="grid gap-3 sm:grid-cols-2">
          {(
            [
              ["boq", "BOQ – Supply + Installation", "Item-wise quantity with separate supply and installation rates (steel, roofing, gutters…)."],
              ["area", "Area-based structures", "Multiple building types with area, number of units and rate per unit (site infrastructure)."],
            ] as const
          ).map(([value, title, desc]) => (
            <button
              key={value}
              type="button"
              onClick={() => update((d) => switchMode(d, value))}
              className={`rounded-lg border p-4 text-left transition ${
                q.pricing.mode === value ? "border-red-700 bg-red-50 ring-2 ring-red-100" : "border-slate-200 hover:border-slate-300"
              }`}
            >
              <div className="text-sm font-semibold text-slate-900">{title}</div>
              <div className="mt-1 text-xs text-slate-600">{desc}</div>
            </button>
          ))}
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Switching format keeps the rows you entered in the other format, and turns the matching scope blocks in
          Step 4 on or off.
        </p>
      </Card>

      <Card title="Tax & intro">
        <div className="grid gap-4 sm:grid-cols-3">
          <NumberField
            label="GST rate"
            suffix="%"
            required
            value={q.pricing.gstRate}
            onChange={(v) => update((d) => void (d.pricing.gstRate = v))}
          />
          <TextField
            label="HSN code"
            value={q.pricing.hsnCode}
            onChange={(v) => update((d) => void (d.pricing.hsnCode = v))}
          />
        </div>
        <TextArea
          className="mt-4"
          label="Text above the table"
          rows={2}
          value={q.pricing.introText}
          onChange={(v) => update((d) => void (d.pricing.introText = v))}
          onReset={q.pricing.introText !== PRICING_INTRO ? () => update((d) => void (d.pricing.introText = PRICING_INTRO)) : undefined}
        />
        <TextArea
          className="mt-4"
          label="Note below the table"
          rows={2}
          value={q.pricing.noteText}
          hint="Placeholders like {{gstRate}} and {{hsnCode}} are filled automatically. Leave empty to hide."
          onChange={(v) => update((d) => void (d.pricing.noteText = v))}
          onReset={
            q.pricing.mode === "boq" && q.pricing.noteText !== PRICING_NOTE_BOQ
              ? () => update((d) => void (d.pricing.noteText = PRICING_NOTE_BOQ))
              : undefined
          }
        />
      </Card>

      {q.pricing.mode === "boq" ? <BoqEditor /> : <AreaEditor />}
    </div>
  );
}

function BoqEditor() {
  const { q, update } = useQuotation();
  const [libKey, setLibKey] = useState(BOQ_LIBRARY[0].key);
  const boq = q.pricing.boq;
  const t = boqTotals(boq.items, q.pricing.gstRate);
  return (
    <>
      <Card title="Table headings" description="Printed at the top of the BOQ table.">
        <TextArea
          label="Scope heading"
          rows={2}
          value={boq.heading}
          onChange={(v) => update((d) => void (d.pricing.boq.heading = v))}
          onReset={boq.heading !== BOQ_HEADING ? () => update((d) => void (d.pricing.boq.heading = BOQ_HEADING)) : undefined}
        />
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <TextField
            label="Supply column label"
            value={boq.supplyLabel}
            onChange={(v) => update((d) => void (d.pricing.boq.supplyLabel = v))}
          />
          <TextField
            label="Installation column label"
            value={boq.installLabel}
            onChange={(v) => update((d) => void (d.pricing.boq.installLabel = v))}
          />
        </div>
      </Card>

      <Card
        title={`BOQ items (${boq.items.length})`}
        description="Sr. No. and amounts are calculated automatically. Leave a rate empty if it doesn't apply."
        actions={
          <div className="flex items-center gap-2">
            <select
              aria-label="Item from library"
              className="rounded-md border border-slate-300 px-2 py-2 text-sm"
              value={libKey}
              onChange={(e) => setLibKey(e.target.value)}
            >
              {BOQ_LIBRARY.map((l) => (
                <option key={l.key} value={l.key}>
                  {l.label}
                </option>
              ))}
            </select>
            <Button variant="primary" onClick={() => update((d) => void d.pricing.boq.items.push(libraryBoqItem(libKey)))}>
              + Add item
            </Button>
          </div>
        }
      >
        <datalist id="uom-options">
          {UOM_OPTIONS.map((u) => (
            <option key={u} value={u} />
          ))}
        </datalist>
        <div className="space-y-4">
          {boq.items.map((it, i) => {
            const c = t.rows[i];
            const set = (fn: (x: BoqItem) => void) => update((d) => fn(d.pricing.boq.items[i]));
            return (
              <div key={it.id} className="rounded-lg border border-slate-200 bg-slate-50/60 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <span className="rounded bg-slate-800 px-2 py-0.5 text-xs font-semibold text-white">Sr {i + 1}</span>
                  <RowActions
                    index={i}
                    count={boq.items.length}
                    onMove={(a, b) => update((x) => move(x.pricing.boq.items, a, b))}
                    onRemove={() => update((x) => void x.pricing.boq.items.splice(i, 1))}
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-4">
                  <TextField
                    className="sm:col-span-3"
                    label="Item title"
                    value={it.title}
                    placeholder="e.g. Roof cover:"
                    onChange={(v) => set((x) => void (x.title = v))}
                  />
                  <TextField label="UOM" list="uom-options" value={it.uom} onChange={(v) => set((x) => void (x.uom = v))} />
                  <TextArea
                    className="sm:col-span-4"
                    label="Description"
                    rows={4}
                    value={it.description}
                    onChange={(v) => set((x) => void (x.description = v))}
                  />
                  <TextField
                    className="sm:col-span-4"
                    label="Size / area line"
                    value={it.sizeLine}
                    placeholder="e.g. Shed Size: 30 x 12.5 x 11.25 meters / Plinth area: 1025 SQM"
                    hint={/__/.test(it.sizeLine) ? 'Replace the "__" placeholders or clear this line.' : "Appended after the description."}
                    onChange={(v) => set((x) => void (x.sizeLine = v))}
                  />
                  <NumberField label="Qty" required value={it.qty} onChange={(v) => set((x) => void (x.qty = v))} />
                  <NumberField
                    label="Supply rate"
                    suffix="₹"
                    value={it.supplyRate}
                    onChange={(v) => set((x) => void (x.supplyRate = v))}
                  />
                  <NumberField
                    label="Installation rate"
                    suffix="₹"
                    value={it.installRate}
                    onChange={(v) => set((x) => void (x.installRate = v))}
                  />
                  <div className="flex items-end">
                    <div className="w-full rounded-md bg-white px-3 py-1.5 text-xs text-slate-600 ring-1 ring-slate-200">
                      <div className="flex justify-between gap-2">
                        <span>Supply</span>
                        <span className="font-semibold tabular-nums text-slate-900">{formatINR(c.supplyAmount) || "–"}</span>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span>Install</span>
                        <span className="font-semibold tabular-nums text-slate-900">{formatINR(c.installAmount) || "–"}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          {boq.items.length === 0 ? <p className="text-sm text-slate-500">No items yet. Add one from the library.</p> : null}
        </div>
      </Card>

      <Card title="Totals">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase text-slate-500">
              <th className="py-1" />
              <th className="py-1 text-right">Supply</th>
              <th className="py-1 text-right">Installation</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            <tr>
              <td className="py-1">Total basic value</td>
              <td className="text-right">{formatINR(t.supplyBasic)}</td>
              <td className="text-right">{formatINR(t.installBasic)}</td>
            </tr>
            <tr>
              <td className="py-1">GST @{q.pricing.gstRate ?? 0}%</td>
              <td className="text-right">{formatINR(t.supplyGst)}</td>
              <td className="text-right">{formatINR(t.installGst)}</td>
            </tr>
            <tr className="font-semibold">
              <td className="py-1">Total value</td>
              <td className="text-right">{formatINR(t.supplyTotal)}</td>
              <td className="text-right">{formatINR(t.installTotal)}</td>
            </tr>
          </tbody>
        </table>
        <GrandTotal amount={t.grandTotal} label="Total cost for Supply and installation" />
      </Card>
    </>
  );
}

function AreaEditor() {
  const { q, update } = useQuotation();
  const area = q.pricing.area;
  const t = areaTotals(area.rows, q.pricing.gstRate);
  const unit = area.unit === "ft2" ? "ft²" : "m²";
  const site = q.meta.projectName || q.meta.siteLocation;
  return (
    <>
      <Card title="Table settings">
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField
            className="sm:col-span-2"
            label="Table title (optional override)"
            value={area.titleOverride}
            placeholder={`Client: ${q.client.company || "…"}${site ? `  Site: ${site}` : ""}`}
            onChange={(v) => update((d) => void (d.pricing.area.titleOverride = v))}
          />
          <Select
            label="Area unit"
            value={area.unit}
            options={[
              { value: "ft2", label: "Square feet (ft²)" },
              { value: "m2", label: "Square metres (m²)" },
            ]}
            onChange={(v) => update((d) => void (d.pricing.area.unit = v))}
          />
        </div>
        <div className="mt-4 space-y-3">
          <Toggle
            checked={area.showExcelNote}
            onChange={(v) => update((d) => void (d.pricing.area.showExcelNote = v))}
            label="Show “refer attached Excel sheet” note"
          />
          {area.showExcelNote ? (
            <TextField value={area.excelNote} onChange={(v) => update((d) => void (d.pricing.area.excelNote = v))} />
          ) : null}
        </div>
      </Card>

      <Card
        title={`Structures (${area.rows.length})`}
        description={`Total area = area × units, Amount = rate × units, Rate per ${area.unit === "ft2" ? "SQF" : "SQM"} = amount ÷ total area.`}
        actions={
          <Button variant="primary" onClick={() => update((d) => void d.pricing.area.rows.push(emptyAreaRow()))}>
            + Add structure
          </Button>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-slate-500">
                <th className="w-8 py-2">#</th>
                <th className="py-2">Structure name</th>
                <th className="w-28 py-2">Area/unit ({unit})</th>
                <th className="w-20 py-2">Units</th>
                <th className="w-36 py-2">Rate per unit (₹)</th>
                <th className="w-20 py-2 text-center">Not quoted</th>
                <th className="w-32 py-2 text-right">Amount</th>
                <th className="w-20 py-2 text-right">₹/{area.unit === "ft2" ? "SQF" : "SQM"}</th>
                <th className="w-24" />
              </tr>
            </thead>
            <tbody>
              {area.rows.map((r, i) => {
                const c = t.rows[i];
                const set = (fn: (x: AreaRow) => void) => update((d) => fn(d.pricing.area.rows[i]));
                return (
                  <tr key={r.id} className="border-t border-slate-100 align-top">
                    <td className="py-2 text-slate-500">{i + 1}</td>
                    <td className="py-2 pr-2">
                      <TextField value={r.name} placeholder="e.g. Main Office" onChange={(v) => set((x) => void (x.name = v))} />
                    </td>
                    <td className="py-2 pr-2">
                      <NumberField value={r.areaPerUnit} onChange={(v) => set((x) => void (x.areaPerUnit = v))} />
                    </td>
                    <td className="py-2 pr-2">
                      <NumberField value={r.units} onChange={(v) => set((x) => void (x.units = v))} />
                    </td>
                    <td className="py-2 pr-2">
                      {r.notQuoted ? (
                        <div className="px-3 py-2 text-xs italic text-slate-400">Not quoted</div>
                      ) : (
                        <NumberField value={r.ratePerUnit} onChange={(v) => set((x) => void (x.ratePerUnit = v))} />
                      )}
                    </td>
                    <td className="py-2 text-center">
                      <div className="pt-2">
                        <Checkbox
                          label=""
                          checked={r.notQuoted}
                          onChange={(v) => set((x) => void (x.notQuoted = v))}
                        />
                      </div>
                    </td>
                    <td className="py-2 pt-4 text-right tabular-nums">{r.notQuoted ? "–" : formatINR(c.amount)}</td>
                    <td className="py-2 pt-4 text-right tabular-nums">{r.notQuoted ? "–" : formatINR(c.ratePerArea)}</td>
                    <td className="py-2 pl-2">
                      <RowActions
                        index={i}
                        count={area.rows.length}
                        onMove={(a, b) => update((d) => move(d.pricing.area.rows, a, b))}
                        onRemove={() => update((d) => void d.pricing.area.rows.splice(i, 1))}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Totals">
        <table className="w-full text-sm tabular-nums">
          <tbody>
            <tr>
              <td className="py-1">Total</td>
              <td className="text-right">{formatINR(t.basic)}</td>
            </tr>
            <tr>
              <td className="py-1">
                Add GST @{q.pricing.gstRate ?? 0}% {q.pricing.hsnCode ? `HSN Code ${q.pricing.hsnCode}` : ""}
              </td>
              <td className="text-right">{formatINR(t.gst)}</td>
            </tr>
          </tbody>
        </table>
        <GrandTotal amount={t.grandTotal} label="Total Cost" />
      </Card>
    </>
  );
}

function GrandTotal({ amount, label }: { amount: number; label: string }) {
  return (
    <div className="mt-4 rounded-lg bg-slate-900 p-4 text-white">
      <div className="flex items-center justify-between">
        <span className="text-sm">{label}</span>
        <span className="text-xl font-bold tabular-nums">{formatRupee(amount)}</span>
      </div>
      <div className="mt-1 text-xs text-slate-300">{amountInWords(amount)}</div>
    </div>
  );
}
