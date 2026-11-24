import type { StepKey } from "./store";
import { templateVars } from "./template";
import type { Quotation } from "./types";

export interface Issue {
  step: StepKey;
  level: "error" | "warning";
  message: string;
}

const blank = (s: string) => !s || !s.trim();

export function validateQuotation(q: Quotation): Issue[] {
  const issues: Issue[] = [];
  const err = (step: StepKey, message: string) => issues.push({ step, level: "error", message });
  const warn = (step: StepKey, message: string) => issues.push({ step, level: "warning", message });

  if (blank(q.client.company)) err("client", "Client company name is required.");
  if (blank(q.client.city)) err("client", "Client city / address line is required.");
  if (blank(q.meta.offerNo)) err("client", "Offer No is required.");
  if (blank(q.meta.date)) err("client", "Date is required.");
  if (blank(q.meta.revision)) err("client", "Revision is required.");
  if (blank(q.meta.subject)) err("client", "Subject is required.");
  if (blank(q.meta.siteLocation)) warn("client", "Site location is empty.");

  if (q.pricing.gstRate === null) err("pricing", "GST rate is required.");
  if (q.pricing.mode === "boq") {
    const items = q.pricing.boq.items;
    if (items.length === 0) err("pricing", "Add at least one BOQ item.");
    items.forEach((it, i) => {
      const n = i + 1;
      if (blank(it.title) && blank(it.description)) err("pricing", `BOQ item ${n} has no title or description.`);
      if (it.qty === null) err("pricing", `BOQ item ${n} has no quantity.`);
      if (it.supplyRate === null && it.installRate === null) err("pricing", `BOQ item ${n} has no supply or installation rate.`);
      if (/__/.test(it.sizeLine)) warn("pricing", `BOQ item ${n}: size/area line still contains "__" placeholders.`);
    });
  } else {
    const rows = q.pricing.area.rows;
    if (rows.length === 0) err("pricing", "Add at least one structure row.");
    rows.forEach((r, i) => {
      const n = i + 1;
      if (blank(r.name)) err("pricing", `Structure row ${n} has no name.`);
      if (r.areaPerUnit === null || r.units === null) err("pricing", `Structure row ${n} needs area and number of units.`);
      if (!r.notQuoted && r.ratePerUnit === null) err("pricing", `Structure row ${n} has no rate (or mark it "Not quoted").`);
    });
  }

  const p = q.terms.params;
  const pay = [p.advancePct, p.inspectionPct, p.balancePct];
  const paySum = pay.reduce<number>((sum, v) => sum + (v ?? 0), 0);
  if (pay.some((v) => v === null)) err("terms", "All payment percentages are required.");
  else if (paySum !== 100) err("terms", `Payment percentages add up to ${paySum}%, they must total 100%.`);
  for (const [k, label] of [
    ["designDays", "Design submission days"],
    ["supplyDays", "Supply days"],
    ["completionDays", "Completion days"],
    ["validityDays", "Validity days"],
    ["paymentReleaseDays", "Payment release days"],
  ] as const) {
    if (p[k] === null) err("terms", `${label} is required.`);
  }
  const vars = templateVars(q);
  const unknownTokens = (text: string) =>
    [...text.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]).filter((k) => !(k in vars));
  q.terms.clauses.forEach((c, i) => {
    const bad = c.enabled ? unknownTokens(c.text) : [];
    if (bad.length) warn("terms", `Clause ${i + 1} has unknown placeholders: ${bad.join(", ")}.`);
  });
  for (const b of q.scope.blocks) {
    const bad = b.enabled ? unknownTokens(b.text) : [];
    if (bad.length) warn("scope", `"${b.label}" has unknown placeholders: ${bad.join(", ")}.`);
  }

  if (q.matrix.enabled && q.matrix.rows.some((r) => blank(r.description)))
    warn("matrix", "Some scope matrix rows have no description.");

  if (q.annexures.shedEnabled && q.annexures.shedRows.length === 0)
    warn("annexures", "Shed details table is enabled but empty.");
  if (q.annexures.photosEnabled && q.annexures.photos.length === 0)
    warn("annexures", "Photos section is enabled but has no photos.");

  return issues;
}
