"use client";

import { useState } from "react";
import {
  Button,
  Card,
  NumberField,
  RowActions,
  Select,
  TextArea,
  TextField,
  Toggle,
  move,
} from "@/components/ui/fields";
import { uid } from "@/lib/defaults";
import { useQuotation } from "@/lib/store";
import { fillTemplate, formatLongDate, addDays, templateVars } from "@/lib/template";
import { CLAUSE_DEFAULTS, TERMS_CLOSING } from "@/lib/templates";
import type { TermsParams } from "@/lib/types";

export function TermsStep() {
  const { q, update } = useQuotation();
  const p = q.terms.params;
  const setP = <K extends keyof TermsParams>(k: K, v: TermsParams[K]) => update((d) => void (d.terms.params[k] = v));
  const paySum = (p.advancePct ?? 0) + (p.inspectionPct ?? 0) + (p.balancePct ?? 0);
  return (
    <div className="space-y-5">
      <Card title="Payment terms" description="Clause: Payment Terms. The three parts must total 100%.">
        <div className="grid items-end gap-4 sm:grid-cols-4">
          <NumberField label="Advance" suffix="%" required value={p.advancePct} onChange={(v) => setP("advancePct", v)} />
          <NumberField
            label="Against inspection"
            suffix="%"
            required
            value={p.inspectionPct}
            onChange={(v) => setP("inspectionPct", v)}
          />
          <NumberField label="Balance (labour)" suffix="%" required value={p.balancePct} onChange={(v) => setP("balancePct", v)} />
          <NumberField
            label="Release within"
            suffix="days"
            required
            value={p.paymentReleaseDays}
            onChange={(v) => setP("paymentReleaseDays", v)}
          />
        </div>
        <p className={`mt-2 text-xs font-medium ${paySum === 100 ? "text-emerald-700" : "text-red-700"}`}>
          Total: {paySum}% {paySum === 100 ? "✓" : "– must be 100%"}
        </p>
      </Card>

      <Card title="Timelines" description="Clause: Supply and Completion of Work.">
        <div className="grid items-end gap-4 sm:grid-cols-3">
          <NumberField
            label="Design submission within"
            suffix="days"
            required
            value={p.designDays}
            onChange={(v) => setP("designDays", v)}
          />
          <Select
            label="Supply wording"
            value={p.supplyMode}
            options={[
              { value: "start", label: "Supply will START within…" },
              { value: "complete", label: "Supply will be COMPLETED within…" },
            ]}
            onChange={(v) => setP("supplyMode", v)}
          />
          <NumberField label="Supply days" suffix="days" required value={p.supplyDays} onChange={(v) => setP("supplyDays", v)} />
          <NumberField
            label="Work completion within"
            suffix="days"
            required
            value={p.completionDays}
            onChange={(v) => setP("completionDays", v)}
          />
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Toggle
            checked={p.separateDesignQuote}
            onChange={(v) => setP("separateDesignQuote", v)}
            label="“Separate quote sent for the design”"
          />
          <Toggle
            checked={p.supplyAfterAdvance}
            onChange={(v) => setP("supplyAfterAdvance", v)}
            label="Supply counted from order + advance"
          />
          <Toggle checked={p.includeRain} onChange={(v) => setP("includeRain", v)} label="Mention rain as a delay factor" />
        </div>
      </Card>

      <Card title="Safety, insurance & other terms">
        <div className="grid gap-4 sm:grid-cols-2">
          <NumberField
            label="Safety officer charge (per month)"
            suffix="₹"
            value={p.safetyOfficerCharge}
            hint="Leave empty to omit the amount from the Safety clause."
            onChange={(v) => setP("safetyOfficerCharge", v)}
          />
          <Select
            label="Insurance wording"
            value={p.insuranceVariant}
            options={[
              { value: "included", label: "All Contractors Comprehensive Insurance considered" },
              { value: "client", label: "Client responsible for additional insurance" },
            ]}
            onChange={(v) => setP("insuranceVariant", v)}
          />
          <TextField label="Warranty period" value={p.warrantyPeriod} onChange={(v) => setP("warrantyPeriod", v)} />
          <TextField label="Place of arbitration" value={p.arbitrationPlace} onChange={(v) => setP("arbitrationPlace", v)} />
          <NumberField
            label="Quotation validity"
            suffix="days"
            required
            value={p.validityDays}
            hint={
              p.validityDays !== null && q.meta.date
                ? `Valid until ${formatLongDate(addDays(q.meta.date, p.validityDays))}`
                : undefined
            }
            onChange={(v) => setP("validityDays", v)}
          />
          <Toggle
            className="self-center"
            checked={p.includeCovid}
            onChange={(v) => setP("includeCovid", v)}
            label="Keep COVID-19 sentence in Force Majeure"
          />
        </div>
      </Card>

      <ClauseList />

      <Card title="Closing">
        <TextArea
          label="Closing text"
          rows={2}
          value={q.terms.closingText}
          onChange={(v) => update((d) => void (d.terms.closingText = v))}
          onReset={q.terms.closingText !== TERMS_CLOSING ? () => update((d) => void (d.terms.closingText = TERMS_CLOSING)) : undefined}
        />
        <Toggle
          className="mt-4"
          checked={q.terms.showStamp}
          onChange={(v) => update((d) => void (d.terms.showStamp = v))}
          label="Show company stamp next to the signature"
        />
      </Card>
    </div>
  );
}

function ClauseList() {
  const { q, update } = useQuotation();
  const [open, setOpen] = useState<string | null>(null);
  const vars = templateVars(q);
  const clauses = q.terms.clauses;
  let n = 0;
  return (
    <Card
      title="Clauses"
      description="Values from the cards above are filled into the clause text automatically. Click a clause to edit its wording."
      actions={
        <Button
          variant="primary"
          onClick={() => {
            const id = uid("cl");
            update((d) => void d.terms.clauses.push({ id, key: id, title: "", text: "", enabled: true, custom: true }));
            setOpen(id);
          }}
        >
          + Add clause
        </Button>
      }
    >
      <ol className="space-y-2">
        {clauses.map((c, i) => {
          const def = CLAUSE_DEFAULTS.find((x) => x.key === c.key);
          const num = c.enabled ? ++n : null;
          const isOpen = open === c.id;
          const preview = fillTemplate(c.text, vars).replace(/\n- /g, " • ");
          return (
            <li key={c.id} className={`rounded-lg border ${isOpen ? "border-red-200 bg-red-50/30" : "border-slate-200"} p-3`}>
              <div className="flex items-start gap-3">
                <Toggle checked={c.enabled} onChange={(v) => update((d) => void (d.terms.clauses[i].enabled = v))} label="" />
                <button type="button" className="flex-1 text-left" onClick={() => setOpen(isOpen ? null : c.id)}>
                  <div className="text-sm">
                    <span className="mr-1 font-semibold text-slate-500">{num ? `${num}.` : "—"}</span>
                    <span className={`font-semibold ${c.enabled ? "text-slate-900" : "text-slate-400 line-through"}`}>
                      {c.title || (c.custom ? "Custom clause" : preview.slice(0, 60) + "…")}
                    </span>
                    {def && (c.text !== def.text || c.title !== def.title) ? (
                      <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-800">
                        edited
                      </span>
                    ) : null}
                  </div>
                  {!isOpen ? <p className="mt-1 line-clamp-2 text-xs text-slate-500">{preview}</p> : null}
                </button>
                <RowActions
                  index={i}
                  count={clauses.length}
                  onMove={(a, b) => update((d) => move(d.terms.clauses, a, b))}
                  onRemove={() => {
                    if (!c.custom && !confirm("Remove this standard clause? You can switch it off instead.")) return;
                    update((d) => void d.terms.clauses.splice(i, 1));
                  }}
                />
              </div>
              {isOpen ? (
                <div className="mt-3 space-y-3 pl-12">
                  <TextField
                    label="Title (bold, optional)"
                    value={c.title}
                    onChange={(v) => update((d) => void (d.terms.clauses[i].title = v))}
                  />
                  <TextArea
                    label="Text"
                    rows={Math.min(16, Math.max(4, Math.ceil(c.text.length / 110)))}
                    value={c.text}
                    hint='{{placeholders}} are replaced with the values above. Lines starting with "- " become bullets.'
                    onChange={(v) => update((d) => void (d.terms.clauses[i].text = v))}
                    onReset={
                      def && (c.text !== def.text || c.title !== def.title)
                        ? () =>
                            update((d) => {
                              d.terms.clauses[i].text = def.text;
                              d.terms.clauses[i].title = def.title;
                            })
                        : undefined
                    }
                  />
                  <div className="rounded-md bg-slate-50 p-3 text-xs leading-relaxed text-slate-700 ring-1 ring-slate-200">
                    <div className="mb-1 font-semibold uppercase text-slate-500">As printed</div>
                    <p className="whitespace-pre-line">{fillTemplate(c.text, vars)}</p>
                  </div>
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
