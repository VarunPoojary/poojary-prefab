import { grandTotal } from "@/lib/calc";
import { createQuotation } from "@/lib/defaults";
import type { Quotation } from "@/lib/types";
import type { ListParams, QuotationRecord, QuotationSummary } from "./types";

export function toSummary(r: QuotationRecord): QuotationSummary {
  const q = r.data;
  return {
    id: r.id,
    status: r.status,
    offerNo: q.meta.offerNo,
    revision: q.meta.revision,
    date: q.meta.date,
    client: q.client.company,
    attention: q.client.attentionName,
    subject: q.meta.subject,
    siteLocation: q.meta.siteLocation,
    pricingMode: q.pricing.mode,
    grandTotal: grandTotal(q),
    clientId: q.client.clientId || null,
    enquiryId: r.enquiryId ?? null,
    enquiryNumber: r.enquiryNumber ?? null,
    enquiryRevision: r.enquiryRevision ?? null,
    sentAt: r.sentAt ?? null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

/** Deep-merges stored data onto a fresh default so records saved by older versions still load. */
export function normalize(data: Partial<Quotation> | undefined): Quotation {
  const base = createQuotation(data?.pricing?.mode ?? "boq");
  return mergeDefaults(base, data ?? {}) as Quotation;
}

function mergeDefaults(base: unknown, value: unknown): unknown {
  if (value === undefined) return base;
  if (Array.isArray(base) || Array.isArray(value)) return value;
  if (base && typeof base === "object" && value && typeof value === "object") {
    const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = mergeDefaults((base as Record<string, unknown>)[k], v);
    }
    return out;
  }
  return value;
}

/** Search/filter/sort/paging over summaries; mirrors what the server query will do. */
export function querySummaries(all: QuotationSummary[], params: ListParams = {}) {
  const {
    search = "",
    status = "all",
    mode = "all",
    linked = "all",
    enquiryId,
    clientId,
    sort = "updated",
    dir = "desc",
    page = 1,
    pageSize = 20,
  } = params;
  const terms = search.toLowerCase().split(/\s+/).filter(Boolean);
  let items = all.filter((s) => {
    if (status !== "all" && s.status !== status) return false;
    if (mode !== "all" && s.pricingMode !== mode) return false;
    if (linked === "linked" && !s.enquiryId) return false;
    if (linked === "unlinked" && s.enquiryId) return false;
    if (enquiryId && s.enquiryId !== enquiryId) return false;
    if (clientId && s.clientId !== clientId) return false;
    if (!terms.length) return true;
    const hay = [s.offerNo, s.client, s.attention, s.subject, s.siteLocation, `rev ${s.revision}`, s.enquiryNumber ?? ""]
      .join(" ")
      .toLowerCase();
    return terms.every((t) => hay.includes(t));
  });
  const offerNum = (o: string) => {
    const n = parseInt(o, 10);
    return Number.isNaN(n) ? -Infinity : n;
  };
  const cmp: Record<string, (a: QuotationSummary, b: QuotationSummary) => number> = {
    updated: (a, b) => a.updatedAt.localeCompare(b.updatedAt),
    date: (a, b) => a.date.localeCompare(b.date) || a.updatedAt.localeCompare(b.updatedAt),
    offerNo: (a, b) => offerNum(a.offerNo) - offerNum(b.offerNo) || a.revision.localeCompare(b.revision),
    amount: (a, b) => a.grandTotal - b.grandTotal,
  };
  const sign = dir === "asc" ? 1 : -1;
  items = [...items].sort((a, b) => sign * cmp[sort](a, b));
  const total = items.length;
  const start = (Math.max(1, page) - 1) * pageSize;
  return { items: items.slice(start, start + pageSize), total, page: Math.max(1, page), pageSize };
}

export function nextRevision(rev: string): string {
  const m = /^(\d+)$/.exec(rev.trim());
  if (!m) return rev ? `${rev}-1` : "01";
  return String(Number(m[1]) + 1).padStart(Math.max(2, m[1].length), "0");
}

export function nextOfferNo(offerNos: string[]): string {
  const nums = offerNos.map((o) => parseInt(o, 10)).filter((n) => !Number.isNaN(n));
  return String(nums.length ? Math.max(...nums) + 1 : 1);
}
