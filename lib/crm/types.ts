export type ContactRole = "owner" | "purchase" | "consultant" | "other";

export type LeadSource =
  | "referral"
  | "website"
  | "google"
  | "social"
  | "existing"
  | "consultant"
  | "trade_show"
  | "cold_call"
  | "other";

export interface Contact {
  id: string;
  name: string;
  role: ContactRole;
  phone: string;
  email: string;
  primary: boolean;
}

export interface Client {
  id: string;
  name: string;
  contacts: Contact[];
  leadSource: LeadSource;
  leadSourceOther: string;
  referredBy: string;
  address: string;
  city: string;
  state: string;
  gstin: string;
  notes: string;
  active: boolean;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
}

export type ClientInput = Omit<Client, "id" | "createdAt" | "createdBy" | "updatedAt">;

export type EnquiryStatus =
  | "enquiry"
  | "quotation_created"
  | "quotation_sent"
  | "revision_requested"
  | "revision_created"
  | "revision_sent"
  | "on_hold"
  | "finalised"
  | "declined";

export type BuildingType = "warehouse" | "factory" | "shed" | "cold_storage" | "poly_house" | "other";
export type Scope = "supply" | "supply_erection" | "other";

export type DeclineReason =
  | "price"
  | "competitor"
  | "cancelled"
  | "budget"
  | "timeline"
  | "no_response"
  | "other";

export interface Attachment {
  id: string;
  name: string;
  type: string;
  size: number;
  /** Stored file (browser file store now, cloud storage later). */
  fileId?: string;
  /** Older records only: the file inline as a data: URL. */
  url: string;
  uploadedAt: string;
  uploadedBy: string;
}

export interface EnquirySize {
  length: number | null;
  width: number | null;
  height: number | null;
  areaSqft: number | null;
}

export type EnquiryEventType =
  | "created"
  | "status"
  | "note"
  | "quotation_linked"
  | "quotation_unlinked"
  | "edited"
  | "attachment_added"
  | "attachment_removed"
  | "reopened";

export interface EnquiryEvent {
  id: string;
  at: string;
  /** User id, or "system" for automatic changes. */
  userId: string;
  type: EnquiryEventType;
  from?: EnquiryStatus;
  to?: EnquiryStatus;
  comment?: string;
  quotationId?: string;
  revision?: number;
  automatic?: boolean;
}

export interface FinalisedInfo {
  quotationId: string;
  poNumber: string;
  poDate: string;
}

export interface DeclinedInfo {
  reason: DeclineReason;
  competitor: string;
  other: string;
  note: string;
}

export interface Enquiry {
  id: string;
  number: string;
  clientId: string;
  contactId: string;
  enquiryDate: string;
  projectName: string;
  siteLocation: string;
  buildingType: BuildingType | "";
  buildingTypeOther: string;
  scope: Scope | "";
  scopeOther: string;
  size: EnquirySize;
  description: string;
  /** Empty = same as the client's lead source. */
  leadSource: LeadSource | "";
  leadSourceOther: string;
  assignedTo: string;
  expectedDecisionDate: string;
  attachments: Attachment[];
  notes: string;
  status: EnquiryStatus;
  statusBeforeDecline: EnquiryStatus | null;
  followUpDate: string;
  finalised: FinalisedInfo | null;
  declined: DeclinedInfo | null;
  /** Next revision number to hand out (R0 = 0); never reused. */
  nextRevision: number;
  history: EnquiryEvent[];
  createdAt: string;
  createdBy: string;
  /** Last activity of any kind; drives the follow-up reminder. */
  updatedAt: string;
}

/** Fields the user edits on the enquiry form. */
export type EnquiryInput = Pick<
  Enquiry,
  | "clientId"
  | "contactId"
  | "enquiryDate"
  | "projectName"
  | "siteLocation"
  | "buildingType"
  | "buildingTypeOther"
  | "scope"
  | "scopeOther"
  | "size"
  | "description"
  | "leadSource"
  | "leadSourceOther"
  | "assignedTo"
  | "expectedDecisionDate"
  | "notes"
>;

export interface StatusChange {
  to: EnquiryStatus;
  comment?: string;
  followUpDate?: string;
  finalised?: FinalisedInfo;
  declined?: DeclinedInfo;
}

export interface ClientSummary {
  id: string;
  name: string;
  primaryContact: Contact | null;
  city: string;
  state: string;
  leadSource: LeadSource;
  active: boolean;
  enquiryCount: number;
  lastActivity: string;
}

export interface EnquirySummary {
  id: string;
  number: string;
  enquiryDate: string;
  clientId: string;
  clientName: string;
  contactName: string;
  projectName: string;
  siteLocation: string;
  status: EnquiryStatus;
  latestValue: number | null;
  quotationCount: number;
  assignedTo: string;
  leadSource: LeadSource;
  updatedAt: string;
  daysSinceUpdate: number;
  needsFollowUp: boolean;
  followUpReason: string;
}

export interface ClientListParams {
  search?: string;
  active?: "active" | "inactive" | "all";
  page?: number;
  pageSize?: number;
}

export interface EnquiryListParams {
  search?: string;
  statuses?: EnquiryStatus[];
  clientId?: string;
  from?: string;
  to?: string;
  leadSource?: LeadSource | "";
  assignedTo?: string;
  needsFollowUp?: boolean;
  sort?: "updated" | "date" | "number" | "value";
  dir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface DuplicateMatch {
  clientId: string;
  clientName: string;
  field: "phone" | "email" | "name";
  value: string;
}

export interface LinkedQuotation {
  id: string;
  revision: number;
  offerNo: string;
  quoteRevision: string;
  date: string;
  total: number;
  status: "draft" | "final";
  sentAt: string | null;
  updatedAt: string;
}

export interface Notification {
  enquiryId: string;
  number: string;
  clientName: string;
  projectName: string;
  reason: string;
  since: string;
}

export class ValidationError extends Error {
  constructor(public readonly issues: string[]) {
    super(issues.join(" "));
    this.name = "ValidationError";
  }
}

export class CrmNotFoundError extends Error {
  constructor(what: string, id: string) {
    super(`${what} ${id} was not found.`);
    this.name = "NotFoundError";
  }
}
