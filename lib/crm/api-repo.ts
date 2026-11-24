import type { CrmRepository, LinkResult } from "./repository";
import {
  CrmNotFoundError,
  ValidationError,
  type Attachment,
  type Client,
  type ClientInput,
  type ClientListParams,
  type ClientSummary,
  type DuplicateMatch,
  type Enquiry,
  type EnquiryInput,
  type EnquiryListParams,
  type EnquiryStatus,
  type EnquirySummary,
  type Notification,
  type Paged,
  type StatusChange,
} from "./types";

/**
 * Cloud CRM implementation – NOT USED YET.
 *
 * Expected endpoints (JSON; 404 → not found, 422 { issues: string[] } → validation error):
 *   GET    /clients?search=&active=&page=&pageSize=        -> Paged<ClientSummary>
 *   GET    /clients/search?q=&limit=                       -> Client[]
 *   GET    /clients/:id                                    -> Client
 *   POST   /clients                 ClientInput            -> Client
 *   PUT    /clients/:id             ClientInput            -> Client
 *   PATCH  /clients/:id/active      { active }             -> Client
 *   DELETE /clients/:id                                    -> 204 (422 when it has enquiries)
 *   POST   /clients/duplicates      { name, phones, emails, excludeId } -> DuplicateMatch[]
 *   GET    /enquiries?search=&statuses=a,b&clientId=&from=&to=&leadSource=&assignedTo=&needsFollowUp=&sort=&dir=&page=
 *   GET    /enquiries/status-counts?(same filters)         -> Record<EnquiryStatus, number>
 *   GET    /enquiries/:id                                  -> Enquiry
 *   POST   /enquiries               EnquiryInput           -> Enquiry (server assigns ENQ number)
 *   PUT    /enquiries/:id           EnquiryInput           -> Enquiry
 *   POST   /enquiries/:id/notes     { text }               -> Enquiry
 *   POST   /enquiries/:id/attachments  multipart file      -> Enquiry
 *   DELETE /enquiries/:id/attachments/:attachmentId        -> Enquiry
 *   POST   /enquiries/:id/status    StatusChange           -> Enquiry
 *   POST   /enquiries/:id/reopen    { comment }            -> Enquiry
 *   POST   /enquiries/:id/assign    { assignedTo, comment } -> Enquiry
 *   POST   /quotations/:id/link     { enquiryId }          -> LinkResult
 *   DELETE /quotations/:id/link                            -> 204
 *   GET    /notifications                                  -> Notification[] (for the signed-in user)
 *
 * The server applies the automatic status change when a linked quotation is saved as Final,
 * so onQuotationSaved only re-reads the enquiry here.
 */
export class ApiCrmRepository implements CrmRepository {
  readonly label = "Cloud database";

  constructor(
    private readonly baseUrl: string,
    private readonly getToken?: () => Promise<string | null>,
  ) {}

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = await this.getToken?.();
    const isForm = init.body instanceof FormData;
    const res = await fetch(`${this.baseUrl}${path}`, {
      credentials: "include",
      ...init,
      headers: {
        ...(isForm ? {} : { "Content-Type": "application/json" }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
    });
    if (res.status === 404) throw new CrmNotFoundError("Record", path);
    if (res.status === 422) throw new ValidationError(((await res.json()) as { issues: string[] }).issues);
    if (!res.ok) throw new Error(`Request failed (${res.status})`);
    return (res.status === 204 ? undefined : await res.json()) as T;
  }

  private qs(params: object) {
    return new URLSearchParams(
      Object.entries(params)
        .filter(([, v]) => v !== undefined && v !== "" && !(Array.isArray(v) && !v.length))
        .map(([k, v]) => [k, Array.isArray(v) ? v.join(",") : String(v)]),
    ).toString();
  }

  private body = (v: unknown) => JSON.stringify(v);

  listClients(p: ClientListParams = {}): Promise<Paged<ClientSummary>> {
    return this.request(`/clients?${this.qs(p)}`);
  }
  searchClients(q: string, limit = 8): Promise<Client[]> {
    return this.request(`/clients/search?${this.qs({ q, limit })}`);
  }
  getClient(id: string): Promise<Client> {
    return this.request(`/clients/${id}`);
  }
  createClient(input: ClientInput): Promise<Client> {
    return this.request(`/clients`, { method: "POST", body: this.body(input) });
  }
  updateClient(id: string, input: ClientInput): Promise<Client> {
    return this.request(`/clients/${id}`, { method: "PUT", body: this.body(input) });
  }
  setClientActive(id: string, active: boolean): Promise<Client> {
    return this.request(`/clients/${id}/active`, { method: "PATCH", body: this.body({ active }) });
  }
  deleteClient(id: string): Promise<void> {
    return this.request(`/clients/${id}`, { method: "DELETE" });
  }
  checkDuplicates(input: { name?: string; phones?: string[]; emails?: string[] }, excludeId?: string): Promise<DuplicateMatch[]> {
    return this.request(`/clients/duplicates`, { method: "POST", body: this.body({ ...input, excludeId }) });
  }

  listEnquiries(p: EnquiryListParams = {}): Promise<Paged<EnquirySummary>> {
    return this.request(`/enquiries?${this.qs(p)}`);
  }
  statusCounts(p: EnquiryListParams = {}): Promise<Record<EnquiryStatus, number>> {
    return this.request(`/enquiries/status-counts?${this.qs(p)}`);
  }
  getEnquiry(id: string): Promise<Enquiry> {
    return this.request(`/enquiries/${id}`);
  }
  createEnquiry(input: EnquiryInput): Promise<Enquiry> {
    return this.request(`/enquiries`, { method: "POST", body: this.body(input) });
  }
  updateEnquiry(id: string, input: EnquiryInput): Promise<Enquiry> {
    return this.request(`/enquiries/${id}`, { method: "PUT", body: this.body(input) });
  }
  addNote(id: string, text: string): Promise<Enquiry> {
    return this.request(`/enquiries/${id}/notes`, { method: "POST", body: this.body({ text }) });
  }
  async addAttachment(id: string, file: Pick<Attachment, "name" | "type" | "size" | "url" | "fileId">): Promise<Enquiry> {
    // Files are uploaded to /files first; the enquiry only stores the reference.
    return this.request(`/enquiries/${id}/attachments`, { method: "POST", body: this.body({ fileId: file.fileId, name: file.name, type: file.type, size: file.size }) });
  }
  removeAttachment(id: string, attachmentId: string): Promise<Enquiry> {
    return this.request(`/enquiries/${id}/attachments/${attachmentId}`, { method: "DELETE" });
  }
  changeStatus(id: string, change: StatusChange): Promise<Enquiry> {
    return this.request(`/enquiries/${id}/status`, { method: "POST", body: this.body(change) });
  }
  reassign(id: string, assignedTo: string, comment: string): Promise<Enquiry> {
    return this.request(`/enquiries/${id}/assign`, { method: "POST", body: this.body({ assignedTo, comment }) });
  }
  reopen(id: string, comment: string): Promise<Enquiry> {
    return this.request(`/enquiries/${id}/reopen`, { method: "POST", body: this.body({ comment }) });
  }

  linkQuotation(quotationId: string, enquiryId: string): Promise<LinkResult> {
    return this.request(`/quotations/${quotationId}/link`, { method: "POST", body: this.body({ enquiryId }) });
  }
  unlinkQuotation(quotationId: string): Promise<void> {
    return this.request(`/quotations/${quotationId}/link`, { method: "DELETE" });
  }
  async onQuotationSaved(): Promise<LinkResult | null> {
    return null;
  }

  notifications(): Promise<Notification[]> {
    return this.request(`/notifications`);
  }
}
