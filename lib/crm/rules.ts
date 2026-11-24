import { FOLLOW_UP_DAYS, isClosed, statusMeta } from "./config";
import type {
  Client,
  ClientInput,
  DuplicateMatch,
  Enquiry,
  EnquiryInput,
  EnquiryStatus,
  StatusChange,
} from "./types";

/* ---------- contact details ---------- */

/** Normalises an Indian mobile number to 10 digits; returns "" if it isn't one. */
export function normalizePhone(raw: string): string {
  let d = (raw || "").replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  else if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? d : "";
}

export const isValidPhone = (raw: string) => normalizePhone(raw) !== "";

export function formatPhone(raw: string): string {
  const d = normalizePhone(raw);
  return d ? `+91 ${d.slice(0, 5)} ${d.slice(5)}` : raw;
}

export const normalizeEmail = (e: string) => (e || "").trim().toLowerCase();
export const isValidEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test((e || "").trim());

export const isValidGstin = (g: string) => /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test((g || "").trim().toUpperCase());

/* ---------- client name matching ---------- */

const NAME_NOISE = /\b(m\/s|messrs|the|pvt|private|ltd|limited|llp|inc|co|company|corp|corporation|india|and)\b/g;

export function normalizeCompanyName(name: string): string {
  return (name || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9/ ]+/g, " ")
    .replace(NAME_NOISE, " ")
    .replace(/[^a-z0-9]+/g, "");
}

function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}

/** True for names that are probably the same company ("Thermax Ltd." vs "THERMAX LIMITED", "Thermx"). */
export function isNearMatch(a: string, b: string): boolean {
  const x = normalizeCompanyName(a);
  const y = normalizeCompanyName(b);
  if (!x || !y) return false;
  if (x === y) return true;
  if (Math.min(x.length, y.length) >= 5 && (x.includes(y) || y.includes(x))) return true;
  return Math.min(x.length, y.length) >= 6 && editDistance(x, y) <= 2;
}

/* ---------- client validation & duplicates ---------- */

export function validateClient(c: ClientInput): string[] {
  const issues: string[] = [];
  if (!c.name.trim()) issues.push("Client / company name is required.");
  if (c.contacts.length === 0) issues.push("Add at least one contact person.");
  const primaries = c.contacts.filter((p) => p.primary);
  if (c.contacts.length && primaries.length !== 1) issues.push("Mark exactly one contact as primary.");
  c.contacts.forEach((p, i) => {
    const n = `Contact ${i + 1}`;
    if (!p.name.trim()) issues.push(`${n}: name is required.`);
    if (p.primary && !p.phone.trim()) issues.push(`${n}: phone is required for the primary contact.`);
    if (p.phone.trim() && !isValidPhone(p.phone)) issues.push(`${n}: enter a valid 10-digit Indian mobile number.`);
    if (p.email.trim() && !isValidEmail(p.email)) issues.push(`${n}: enter a valid email address.`);
  });
  if (!c.leadSource) issues.push("Lead source is required.");
  if (c.leadSource === "referral" && !c.referredBy.trim()) issues.push("Referred by is required for referrals.");
  if (c.leadSource === "other" && !c.leadSourceOther.trim()) issues.push("Describe the other lead source.");
  if (c.gstin.trim() && !isValidGstin(c.gstin)) issues.push("GSTIN must be 15 characters, e.g. 27AAAAA0000A1Z5.");
  return issues;
}

/** Phone/email already used by another client, plus near-matching company names. */
export function findDuplicates(
  input: { name?: string; phones?: string[]; emails?: string[] },
  clients: Client[],
  excludeId?: string,
): DuplicateMatch[] {
  const out: DuplicateMatch[] = [];
  const phones = new Set((input.phones ?? []).map(normalizePhone).filter(Boolean));
  const emails = new Set((input.emails ?? []).map(normalizeEmail).filter(Boolean));
  for (const c of clients) {
    if (c.id === excludeId) continue;
    for (const p of c.contacts) {
      const ph = normalizePhone(p.phone);
      if (ph && phones.has(ph)) out.push({ clientId: c.id, clientName: c.name, field: "phone", value: formatPhone(ph) });
      const em = normalizeEmail(p.email);
      if (em && emails.has(em)) out.push({ clientId: c.id, clientName: c.name, field: "email", value: em });
    }
    if (input.name && isNearMatch(input.name, c.name))
      out.push({ clientId: c.id, clientName: c.name, field: "name", value: c.name });
  }
  return out;
}

/* ---------- enquiries ---------- */

export function nextEnquiryNumber(existing: string[], year: number): string {
  const prefix = `ENQ-${year}-`;
  const max = existing
    .filter((n) => n.startsWith(prefix))
    .map((n) => parseInt(n.slice(prefix.length), 10))
    .filter((n) => !Number.isNaN(n))
    .reduce((a, b) => Math.max(a, b), 0);
  return `${prefix}${String(max + 1).padStart(4, "0")}`;
}

export function validateEnquiry(e: EnquiryInput): string[] {
  const issues: string[] = [];
  if (!e.clientId) issues.push("Choose a client.");
  if (!e.contactId) issues.push("Choose the contact person.");
  if (!e.enquiryDate) issues.push("Enquiry date is required.");
  if (!e.projectName.trim()) issues.push("Project / site name is required.");
  if (!e.siteLocation.trim()) issues.push("Site location is required.");
  if (e.buildingType === "other" && !e.buildingTypeOther.trim()) issues.push("Describe the other building type.");
  if (e.scope === "other" && !e.scopeOther.trim()) issues.push("Describe the other scope.");
  if (e.leadSource === "other" && !e.leadSourceOther.trim()) issues.push("Describe the other lead source.");
  return issues;
}

/** Checks a manual status change against the rules; returns problems (empty = allowed). */
export function validateStatusChange(e: Enquiry, change: StatusChange, linkedQuotationIds: string[]): string[] {
  const issues: string[] = [];
  if (e.status === "finalised") return ["A finalised enquiry can't change status; an admin can reopen it."];
  if (e.status === "declined") return ["Reopen the declined enquiry before changing its status."];
  if (change.to === e.status) return [`The enquiry is already ${statusMeta(e.status).label}.`];
  if (change.to === "finalised") {
    const f = change.finalised;
    if (!f?.quotationId) issues.push("Choose the accepted quotation.");
    else if (!linkedQuotationIds.includes(f.quotationId)) issues.push("The accepted quotation must be linked to this enquiry.");
    if (!f?.poNumber?.trim()) issues.push("Enter the PO / LOI number.");
    if (!f?.poDate) issues.push("Enter the PO / LOI date.");
  }
  if (change.to === "declined") {
    const d = change.declined;
    if (!d?.reason) issues.push("Choose a decline reason.");
    if (d?.reason === "competitor" && !d.competitor.trim()) issues.push("Enter the competitor's name.");
    if (d?.reason === "other" && !d.other.trim()) issues.push("Describe the reason.");
  }
  return issues;
}

/**
 * Status an open enquiry moves to when one of its linked quotations becomes Final.
 * Only the latest revision drives the status, and the status never moves backwards.
 */
export function autoStatusOnFinal(e: Enquiry, revision: number, latestRevision: number): EnquiryStatus | null {
  if (isClosed(e.status) || revision !== latestRevision) return null;
  const target: EnquiryStatus = revision === 0 ? "quotation_created" : "revision_created";
  if (e.status === target) return null;
  if (revision === 0 && e.status !== "enquiry") return null;
  return target;
}

/* ---------- follow-up ---------- */

export const todayIso = (now: number) => {
  const d = new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export const daysSince = (iso: string, now: number) => Math.max(0, Math.floor((now - new Date(iso).getTime()) / 86_400_000));

export function followUpState(e: Enquiry, now: number): { due: boolean; reason: string } {
  if (isClosed(e.status)) return { due: false, reason: "" };
  if (e.status === "on_hold" && e.followUpDate) {
    const today = todayIso(now);
    if (e.followUpDate <= today)
      return { due: true, reason: e.followUpDate === today ? "Follow-up due today" : `Follow-up was due ${e.followUpDate}` };
    return { due: false, reason: "" };
  }
  const days = daysSince(e.updatedAt, now);
  return days >= FOLLOW_UP_DAYS ? { due: true, reason: `${days} days without an update` } : { due: false, reason: "" };
}

/** The user who should be reminded: the assignee, otherwise the creator. */
export const followUpOwner = (e: Enquiry) => e.assignedTo || e.createdBy;

export const padRevision = (r: number) => String(r).padStart(2, "0");
