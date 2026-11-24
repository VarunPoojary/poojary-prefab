import { formatINR, smallNumberWords } from "./money";
import type { Quotation } from "./types";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "2024-06-18" -> "June 18, 2024" */
export function formatLongDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}`;
}

export function addDays(iso: string, days: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return "";
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + days));
  return d.toISOString().slice(0, 10);
}

export function todayIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const show = (n: number | null | undefined) => (n === null || n === undefined ? "__" : String(n));

/** Values available as {{token}} inside any editable template text. */
export function templateVars(q: Quotation): Record<string, string> {
  const p = q.terms.params;
  return {
    clientCompany: q.client.company,
    siteLocation: q.meta.siteLocation,
    projectName: q.meta.projectName,
    gstRate: show(q.pricing.gstRate),
    hsnCode: q.pricing.hsnCode,
    coatingMicrons: show(q.scope.coatingMicrons),
    siteVisits: show(q.scope.siteVisits),
    siteVisitsWords: q.scope.siteVisits === null ? "__" : smallNumberWords(q.scope.siteVisits),
    volatilityPct: show(q.scope.volatilityPct),
    warrantyPeriod: p.warrantyPeriod || "__",
    safetyChargePhrase:
      p.safetyOfficerCharge !== null && p.safetyOfficerCharge > 0
        ? `, i.e. Rs. ${formatINR(p.safetyOfficerCharge)} per month per officer`
        : "",
    insuranceSentence:
      p.insuranceVariant === "included"
        ? "All Contractors Comprehensive Insurance is considered."
        : "The client is responsible for any additional insurance requirements, such as Comprehensive Insurance, and must bear the cost of the premium.",
    advancePct: show(p.advancePct),
    inspectionPct: show(p.inspectionPct),
    balancePct: show(p.balancePct),
    paymentReleaseDays: show(p.paymentReleaseDays),
    designDays: show(p.designDays),
    designQuotePhrase: p.separateDesignQuote ? " (Separate quote sent for the design.)" : "",
    supplyVerb: p.supplyMode === "start" ? "start" : "be completed",
    supplyDays: show(p.supplyDays),
    advancePhrase: p.supplyAfterAdvance ? " and receipt of advance" : "",
    completionDays: show(p.completionDays),
    rainPhrase: p.includeRain ? ", rain, etc." : "",
    covidSentence: p.includeCovid
      ? " The COVID-19 situation may impact the progress of the work, such as the lockdown."
      : "",
    arbitrationPlace: p.arbitrationPlace || "__",
    validityDays: show(p.validityDays),
    validUntil:
      p.validityDays !== null && q.meta.date ? formatLongDate(addDays(q.meta.date, p.validityDays)) : "__",
  };
}

/** Replaces {{token}} with values; unknown tokens are left untouched so typos stay visible. */
export function fillTemplate(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key: string) => (key in vars ? vars[key] : match));
}

export type TextLine =
  | { type: "para"; text: string }
  | { type: "bullet"; text: string }
  | { type: "numbered"; marker: string; text: string }
  | { type: "gap" };

/** Parses the light markup used in editable texts: "- " bullets, "1. " numbered points, blank-line gaps. */
export function parseText(text: string): TextLine[] {
  const out: TextLine[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      if (out.length && out[out.length - 1].type !== "gap") out.push({ type: "gap" });
      continue;
    }
    const bullet = /^\s*[-•]\s+(.*)$/.exec(line);
    if (bullet) {
      out.push({ type: "bullet", text: bullet[1] });
      continue;
    }
    const numbered = /^\s*(\d+[.)])\s+(.*)$/.exec(line);
    if (numbered) {
      out.push({ type: "numbered", marker: numbered[1], text: numbered[2] });
      continue;
    }
    out.push({ type: "para", text: line.trim() });
  }
  while (out.length && out[out.length - 1].type === "gap") out.pop();
  return out;
}

export function slug(s: string): string {
  return s
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

export function defaultFileName(q: Quotation): string {
  const parts = [
    "Quotation",
    q.meta.offerNo && `${slug(q.meta.offerNo)}`,
    q.meta.revision && `Rev${slug(q.meta.revision)}`,
    q.client.company && slug(q.client.company),
    q.meta.siteLocation && slug(q.meta.siteLocation),
  ].filter(Boolean);
  return `${parts.join("_")}.pdf`;
}
