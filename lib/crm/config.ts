import type { BuildingType, ContactRole, DeclineReason, EnquiryStatus, LeadSource, Scope } from "./types";

/*
 * Dropdown lists for the CRM. The requirements left the final lead-source and decline-reason
 * lists open, so they live here to be changed in one place.
 */

export const LEAD_SOURCES: { value: LeadSource; label: string }[] = [
  { value: "referral", label: "Referral" },
  { value: "website", label: "Website" },
  { value: "google", label: "Google search" },
  { value: "social", label: "Social media" },
  { value: "existing", label: "Existing client" },
  { value: "consultant", label: "Consultant / architect" },
  { value: "trade_show", label: "Trade show" },
  { value: "cold_call", label: "Cold call" },
  { value: "other", label: "Other" },
];

export const DECLINE_REASONS: { value: DeclineReason; label: string }[] = [
  { value: "price", label: "Price too high" },
  { value: "competitor", label: "Lost to competitor" },
  { value: "cancelled", label: "Project cancelled / on hold" },
  { value: "budget", label: "Budget not approved" },
  { value: "timeline", label: "Delivery timeline not suitable" },
  { value: "no_response", label: "No response from client" },
  { value: "other", label: "Other" },
];

export const CONTACT_ROLES: { value: ContactRole; label: string }[] = [
  { value: "owner", label: "Owner" },
  { value: "purchase", label: "Purchase" },
  { value: "consultant", label: "Consultant / Architect" },
  { value: "other", label: "Other" },
];

export const BUILDING_TYPES: { value: BuildingType; label: string }[] = [
  { value: "warehouse", label: "Warehouse" },
  { value: "factory", label: "Factory" },
  { value: "shed", label: "Shed" },
  { value: "cold_storage", label: "Cold storage" },
  { value: "poly_house", label: "Poly house" },
  { value: "other", label: "Other" },
];

export const SCOPES: { value: Scope; label: string }[] = [
  { value: "supply", label: "Supply only" },
  { value: "supply_erection", label: "Supply + erection" },
  { value: "other", label: "Other" },
];

export const INDIAN_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa", "Gujarat", "Haryana",
  "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur",
  "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana",
  "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal", "Andaman and Nicobar Islands", "Chandigarh",
  "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Jammu and Kashmir", "Ladakh", "Lakshadweep", "Puducherry",
];

export interface StatusMeta {
  value: EnquiryStatus;
  label: string;
  /** Tailwind classes for the badge. */
  badge: string;
  closed: boolean;
  description: string;
}

export const STATUSES: StatusMeta[] = [
  { value: "enquiry", label: "Enquiry", badge: "bg-slate-100 text-slate-700", closed: false, description: "Requirement received, no quotation yet" },
  { value: "quotation_created", label: "Quotation created", badge: "bg-sky-50 text-sky-800 ring-1 ring-inset ring-sky-200", closed: false, description: "First quotation (R0) ready" },
  { value: "quotation_sent", label: "Quotation sent", badge: "bg-sky-100 text-sky-900", closed: false, description: "Quotation sent to the client" },
  { value: "revision_requested", label: "Revision requested", badge: "bg-amber-100 text-amber-900", closed: false, description: "Client asked for changes" },
  { value: "revision_created", label: "Revision created", badge: "bg-sky-50 text-sky-800 ring-1 ring-inset ring-sky-200", closed: false, description: "Revised quotation ready, not yet sent" },
  { value: "revision_sent", label: "Revision sent", badge: "bg-sky-100 text-sky-900", closed: false, description: "Revised quotation sent to the client" },
  { value: "on_hold", label: "Follow-up / On hold", badge: "bg-amber-50 text-amber-900 ring-1 ring-inset ring-amber-200", closed: false, description: "Client has gone quiet or paused" },
  { value: "finalised", label: "Finalised", badge: "bg-emerald-100 text-emerald-800", closed: true, description: "Client accepted; order won" },
  { value: "declined", label: "Declined", badge: "bg-red-100 text-red-800", closed: true, description: "Client did not go ahead" },
];

export const statusMeta = (s: EnquiryStatus) => STATUSES.find((x) => x.value === s)!;
export const isClosed = (s: EnquiryStatus) => statusMeta(s).closed;
export const OPEN_STATUSES = STATUSES.filter((s) => !s.closed).map((s) => s.value);

export const labelOf = <T extends string>(list: { value: T; label: string }[], v: T | "" | undefined) =>
  list.find((x) => x.value === v)?.label ?? "";

/** Days without any update before an open enquiry needs follow-up. */
export const FOLLOW_UP_DAYS = 7;

/** Max size per enquiry attachment while files live in browser storage. */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const ATTACHMENT_ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp,.xls,.xlsx,.csv,.doc,.docx,.dwg,.dxf";
