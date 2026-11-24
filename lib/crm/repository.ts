import type {
  Attachment,
  Client,
  ClientInput,
  ClientListParams,
  ClientSummary,
  DuplicateMatch,
  Enquiry,
  EnquiryInput,
  EnquiryListParams,
  EnquiryStatus,
  EnquirySummary,
  Notification,
  Paged,
  StatusChange,
} from "./types";

export interface LinkResult {
  enquiry: Enquiry;
  revision: number;
  /** Status the enquiry moved to automatically, if any. */
  statusChanged: EnquiryStatus | null;
}

/**
 * Single entry point for clients and enquiries. Screens use only this interface (through
 * lib/crm/hooks.ts), so the browser-storage version can be replaced by the cloud API in lib/crm/index.ts.
 */
export interface CrmRepository {
  readonly label: string;

  /* clients */
  listClients(params?: ClientListParams): Promise<Paged<ClientSummary>>;
  /** Full client records (with contacts) for pickers; searches name, contact, phone, email, city. */
  searchClients(query: string, limit?: number): Promise<Client[]>;
  getClient(id: string): Promise<Client>;
  createClient(input: ClientInput): Promise<Client>;
  updateClient(id: string, input: ClientInput): Promise<Client>;
  setClientActive(id: string, active: boolean): Promise<Client>;
  /** Only allowed for clients without enquiries; otherwise mark them inactive. */
  deleteClient(id: string): Promise<void>;
  checkDuplicates(input: { name?: string; phones?: string[]; emails?: string[] }, excludeId?: string): Promise<DuplicateMatch[]>;

  /* enquiries */
  listEnquiries(params?: EnquiryListParams): Promise<Paged<EnquirySummary>>;
  /** Count per status for the same filters, ignoring the status filter. */
  statusCounts(params?: EnquiryListParams): Promise<Record<EnquiryStatus, number>>;
  getEnquiry(id: string): Promise<Enquiry>;
  createEnquiry(input: EnquiryInput): Promise<Enquiry>;
  /** Rejected for closed enquiries (Finalised / Declined) except for the notes field. */
  updateEnquiry(id: string, input: EnquiryInput): Promise<Enquiry>;
  addNote(id: string, text: string): Promise<Enquiry>;
  addAttachment(id: string, file: Pick<Attachment, "name" | "type" | "size" | "url" | "fileId">): Promise<Enquiry>;
  removeAttachment(id: string, attachmentId: string): Promise<Enquiry>;
  changeStatus(id: string, change: StatusChange): Promise<Enquiry>;
  /** Changes the assignee (also for closed enquiries) and logs it; used when an employee leaves. */
  reassign(id: string, assignedTo: string, comment: string): Promise<Enquiry>;
  /**
   * Declined → the status it had before; Finalised → the status before finalising (admins only; the linked
   * project then shows a warning). Needs a comment.
   */
  reopen(id: string, comment: string): Promise<Enquiry>;

  /* quotations */
  linkQuotation(quotationId: string, enquiryId: string): Promise<LinkResult>;
  unlinkQuotation(quotationId: string): Promise<void>;
  /** Applies the automatic status change when a linked quotation becomes Final. */
  onQuotationSaved(quotationId: string, previousStatus: "draft" | "final" | null): Promise<LinkResult | null>;

  /** Overdue enquiries for the user (assignee, or creator when unassigned). */
  notifications(userId: string): Promise<Notification[]>;

  resetDemoData?(): Promise<void>;
}
