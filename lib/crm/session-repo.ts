import type { SessionStorageRepository } from "@/lib/data/session-repo";
import { appStorage, type KeyValueStorage } from "@/lib/storage";
import { StorageFullError } from "@/lib/data/types";
import { grandTotal } from "@/lib/calc";
import { STATUSES, isClosed } from "./config";
import type { CrmRepository, LinkResult } from "./repository";
import {
  autoStatusOnFinal,
  daysSince,
  findDuplicates,
  followUpOwner,
  followUpState,
  nextEnquiryNumber,
  normalizeEmail,
  normalizePhone,
  padRevision,
  validateClient,
  validateEnquiry,
  validateStatusChange,
} from "./rules";
import { seedClients, seedEnquiries } from "./seed";
import {
  CrmNotFoundError,
  ValidationError,
  type Attachment,
  type Client,
  type ClientInput,
  type ClientListParams,
  type ClientSummary,
  type Enquiry,
  type EnquiryEvent,
  type EnquiryInput,
  type EnquiryListParams,
  type EnquiryStatus,
  type EnquirySummary,
  type Paged,
  type StatusChange,
} from "./types";

export const CLIENTS_KEY = "pppl.clients.v1";
export const ENQUIRIES_KEY = "pppl.enquiries.v1";

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

function newId(prefix: string) {
  const r = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2);
  return `${prefix}_${r}`;
}

function page<T>(items: T[], p = 1, size = 20): Paged<T> {
  const pageNo = Math.max(1, p);
  return { items: items.slice((pageNo - 1) * size, pageNo * size), total: items.length, page: pageNo, pageSize: size };
}

export interface SessionCrmOptions {
  storage?: () => KeyValueStorage;
  /** Quotation storage in the same browser session; used for linking and quote values. */
  quotes: SessionStorageRepository;
  /** Id of the signed-in user, written to created-by fields and the history log. */
  getActor: () => Promise<string>;
  /** Whether the signed-in user is an admin (only admins may reopen a Finalised enquiry). */
  isAdmin?: () => Promise<boolean>;
  latencyMs?: number;
  seed?: boolean;
  now?: () => number;
}

/**
 * TEMPORARY clients & enquiries store in the browser's localStorage. Replace with ApiCrmRepository
 * (lib/crm/api-repo.ts) when the cloud database is ready.
 */
export class SessionStorageCrmRepository implements CrmRepository {
  readonly label = "This browser (temporary)";
  private readonly storage: () => KeyValueStorage;
  private readonly quotes: SessionStorageRepository;
  private readonly getActor: () => Promise<string>;
  private readonly isAdmin: () => Promise<boolean>;
  private readonly latencyMs: number;
  private readonly seed: boolean;
  private readonly now: () => number;

  constructor(o: SessionCrmOptions) {
    this.storage = o.storage ?? appStorage;
    this.quotes = o.quotes;
    this.getActor = o.getActor;
    this.isAdmin = o.isAdmin ?? (async () => true);
    this.latencyMs = o.latencyMs ?? 150;
    this.seed = o.seed ?? true;
    this.now = o.now ?? (() => Date.now());
  }

  /* ---------- storage ---------- */

  private async delay() {
    if (this.latencyMs > 0) await new Promise((r) => setTimeout(r, this.latencyMs));
  }

  private readKey<T>(key: string, seed: () => T[]): T[] {
    const raw = this.storage().getItem(key);
    if (raw === null) {
      const initial = this.seed ? seed() : [];
      this.writeKey(key, initial);
      return initial;
    }
    try {
      const v = JSON.parse(raw);
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  }

  private writeKey(key: string, value: unknown) {
    try {
      this.storage().setItem(key, JSON.stringify(value));
    } catch (e) {
      if (e instanceof Error && /quota/i.test(e.name + e.message)) throw new StorageFullError();
      throw e;
    }
  }

  /* ---- Used by the browser project store (same storage); not part of the public interface. ---- */

  readAllClients(): Client[] {
    return clone(this.clients());
  }
  readAllEnquiries(): Enquiry[] {
    return clone(this.enquiries());
  }

  private clients(): Client[] {
    return this.readKey(CLIENTS_KEY, () => seedClients(this.now()));
  }

  private enquiries(): Enquiry[] {
    // Make sure clients exist first so seeded enquiries always point at seeded clients.
    this.clients();
    return this.readKey(ENQUIRIES_KEY, () => seedEnquiries(this.now()));
  }

  private saveClients(list: Client[]) {
    this.writeKey(CLIENTS_KEY, list);
  }

  private saveEnquiries(list: Enquiry[]) {
    this.writeKey(ENQUIRIES_KEY, list);
  }

  private iso() {
    return new Date(this.now()).toISOString();
  }

  private findClient(list: Client[], id: string) {
    const c = list.find((x) => x.id === id);
    if (!c) throw new CrmNotFoundError("Client", id);
    return c;
  }

  private findEnquiry(list: Enquiry[], id: string) {
    const e = list.find((x) => x.id === id);
    if (!e) throw new CrmNotFoundError("Enquiry", id);
    return e;
  }

  private putEnquiry(list: Enquiry[], e: Enquiry) {
    this.saveEnquiries(list.map((x) => (x.id === e.id ? e : x)));
    return clone(e);
  }

  private event(userId: string, o: Omit<EnquiryEvent, "id" | "at" | "userId">): EnquiryEvent {
    return { id: newId("ev"), at: this.iso(), userId, ...o };
  }

  /** Linked quotation records of an enquiry, highest revision last. */
  private linkedQuotes(enquiryId: string) {
    return this.quotes
      .readAllRecords()
      .filter((r) => r.enquiryId === enquiryId)
      .sort((a, b) => (a.enquiryRevision ?? 0) - (b.enquiryRevision ?? 0));
  }

  private cleanClientInput(input: ClientInput): ClientInput {
    const contacts = input.contacts.map((c) => ({
      ...c,
      name: c.name.trim(),
      phone: normalizePhone(c.phone) || c.phone.trim(),
      email: normalizeEmail(c.email),
    }));
    return {
      ...input,
      name: input.name.trim().replace(/\s+/g, " "),
      contacts,
      gstin: input.gstin.trim().toUpperCase(),
      referredBy: input.leadSource === "referral" ? input.referredBy.trim() : "",
      leadSourceOther: input.leadSource === "other" ? input.leadSourceOther.trim() : "",
    };
  }

  /* ---------- clients ---------- */

  private clientSummary(c: Client, enquiries: Enquiry[]): ClientSummary {
    const mine = enquiries.filter((e) => e.clientId === c.id);
    const last = [c.updatedAt, ...mine.map((e) => e.updatedAt)].sort().pop()!;
    return {
      id: c.id,
      name: c.name,
      primaryContact: c.contacts.find((p) => p.primary) ?? c.contacts[0] ?? null,
      city: c.city,
      state: c.state,
      leadSource: c.leadSource,
      active: c.active,
      enquiryCount: mine.length,
      lastActivity: last,
    };
  }

  private matchesClient(c: Client, q: string) {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return true;
    const digits = q.replace(/\D/g, "");
    if (digits.length >= 4 && c.contacts.some((p) => p.phone.replace(/\D/g, "").includes(digits))) return true;
    const hay = [c.name, c.city, ...c.contacts.flatMap((p) => [p.name, p.email, p.phone])].join(" ").toLowerCase();
    return terms.every((t) => hay.includes(t));
  }

  async listClients(params: ClientListParams = {}): Promise<Paged<ClientSummary>> {
    await this.delay();
    const { search = "", active = "active", page: p = 1, pageSize = 20 } = params;
    const enquiries = this.enquiries();
    const items = this.clients()
      .filter((c) => (active === "all" ? true : active === "active" ? c.active : !c.active))
      .filter((c) => this.matchesClient(c, search))
      .map((c) => this.clientSummary(c, enquiries))
      .sort((a, b) => a.name.localeCompare(b.name));
    return page(items, p, pageSize);
  }

  async searchClients(query: string, limit = 8): Promise<Client[]> {
    await this.delay();
    return clone(
      this.clients()
        .filter((c) => c.active && this.matchesClient(c, query))
        .sort((a, b) => a.name.localeCompare(b.name))
        .slice(0, limit),
    );
  }

  async getClient(id: string): Promise<Client> {
    await this.delay();
    return clone(this.findClient(this.clients(), id));
  }

  async createClient(input: ClientInput): Promise<Client> {
    await this.delay();
    const clean = this.cleanClientInput(input);
    const issues = validateClient(clean);
    if (issues.length) throw new ValidationError(issues);
    const t = this.iso();
    const client: Client = {
      ...clean,
      contacts: clean.contacts.map((c) => ({ ...c, id: c.id || newId("ct") })),
      id: newId("c"),
      createdAt: t,
      createdBy: await this.getActor(),
      updatedAt: t,
    };
    this.saveClients([...this.clients(), client]);
    return clone(client);
  }

  async updateClient(id: string, input: ClientInput): Promise<Client> {
    await this.delay();
    const list = this.clients();
    const current = this.findClient(list, id);
    const clean = this.cleanClientInput(input);
    const issues = validateClient(clean);
    if (issues.length) throw new ValidationError(issues);
    // A contact used by an enquiry can't be removed.
    const used = new Set(this.enquiries().filter((e) => e.clientId === id).map((e) => e.contactId));
    const kept = new Set(clean.contacts.map((c) => c.id));
    const removedInUse = current.contacts.filter((c) => used.has(c.id) && !kept.has(c.id));
    if (removedInUse.length)
      throw new ValidationError([`${removedInUse.map((c) => c.name).join(", ")} is the contact on an enquiry and can't be removed.`]);
    const updated: Client = {
      ...current,
      ...clean,
      contacts: clean.contacts.map((c) => ({ ...c, id: c.id || newId("ct") })),
      updatedAt: this.iso(),
    };
    this.saveClients(list.map((c) => (c.id === id ? updated : c)));
    return clone(updated);
  }

  async setClientActive(id: string, active: boolean): Promise<Client> {
    await this.delay();
    const list = this.clients();
    const updated = { ...this.findClient(list, id), active, updatedAt: this.iso() };
    this.saveClients(list.map((c) => (c.id === id ? updated : c)));
    return clone(updated);
  }

  async deleteClient(id: string): Promise<void> {
    await this.delay();
    const list = this.clients();
    this.findClient(list, id);
    if (this.enquiries().some((e) => e.clientId === id))
      throw new ValidationError(["This client has enquiries, so it can't be deleted. Mark it inactive instead."]);
    this.saveClients(list.filter((c) => c.id !== id));
  }

  async checkDuplicates(input: { name?: string; phones?: string[]; emails?: string[] }, excludeId?: string) {
    await this.delay();
    return findDuplicates(input, this.clients(), excludeId);
  }

  /* ---------- enquiries ---------- */

  private summaries(): EnquirySummary[] {
    const clients = new Map(this.clients().map((c) => [c.id, c]));
    const quotes = this.quotes.readAllRecords();
    const now = this.now();
    return this.enquiries().map((e) => {
      const c = clients.get(e.clientId);
      const linked = quotes
        .filter((q) => q.enquiryId === e.id)
        .sort((a, b) => (a.enquiryRevision ?? 0) - (b.enquiryRevision ?? 0));
      const latest = linked[linked.length - 1];
      const fu = followUpState(e, now);
      return {
        id: e.id,
        number: e.number,
        enquiryDate: e.enquiryDate,
        clientId: e.clientId,
        clientName: c?.name ?? "(deleted client)",
        contactName: c?.contacts.find((p) => p.id === e.contactId)?.name ?? "",
        projectName: e.projectName,
        siteLocation: e.siteLocation,
        status: e.status,
        latestValue: latest ? grandTotal(latest.data) : null,
        quotationCount: linked.length,
        assignedTo: e.assignedTo,
        leadSource: e.leadSource || c?.leadSource || "other",
        updatedAt: e.updatedAt,
        daysSinceUpdate: daysSince(e.updatedAt, now),
        needsFollowUp: fu.due,
        followUpReason: fu.reason,
      };
    });
  }

  private filterSummaries(all: EnquirySummary[], params: EnquiryListParams, ignoreStatus = false) {
    const { search = "", statuses, clientId, from, to, leadSource, assignedTo, needsFollowUp } = params;
    const terms = search.toLowerCase().split(/\s+/).filter(Boolean);
    return all.filter((s) => {
      if (!ignoreStatus && statuses?.length && !statuses.includes(s.status)) return false;
      if (clientId && s.clientId !== clientId) return false;
      if (from && s.enquiryDate < from) return false;
      if (to && s.enquiryDate > to) return false;
      if (leadSource && s.leadSource !== leadSource) return false;
      if (assignedTo === "unassigned" ? !!s.assignedTo : assignedTo && s.assignedTo !== assignedTo) return false;
      if (needsFollowUp && !s.needsFollowUp) return false;
      if (!terms.length) return true;
      const hay = [s.number, s.clientName, s.projectName].join(" ").toLowerCase();
      return terms.every((t) => hay.includes(t));
    });
  }

  async listEnquiries(params: EnquiryListParams = {}): Promise<Paged<EnquirySummary>> {
    await this.delay();
    const { sort = "updated", dir = "desc", page: p = 1, pageSize = 20 } = params;
    const cmp: Record<string, (a: EnquirySummary, b: EnquirySummary) => number> = {
      updated: (a, b) => a.updatedAt.localeCompare(b.updatedAt),
      date: (a, b) => a.enquiryDate.localeCompare(b.enquiryDate) || a.number.localeCompare(b.number),
      number: (a, b) => a.number.localeCompare(b.number),
      value: (a, b) => (a.latestValue ?? -1) - (b.latestValue ?? -1),
    };
    const sign = dir === "asc" ? 1 : -1;
    const items = this.filterSummaries(this.summaries(), params).sort((a, b) => sign * cmp[sort](a, b));
    return page(items, p, pageSize);
  }

  async statusCounts(params: EnquiryListParams = {}) {
    await this.delay();
    const counts = Object.fromEntries(STATUSES.map((s) => [s.value, 0])) as Record<EnquiryStatus, number>;
    for (const s of this.filterSummaries(this.summaries(), params, true)) counts[s.status] += 1;
    return counts;
  }

  async getEnquiry(id: string): Promise<Enquiry> {
    await this.delay();
    return clone(this.findEnquiry(this.enquiries(), id));
  }

  private checkEnquiryInput(input: EnquiryInput) {
    const issues = validateEnquiry(input);
    const client = this.clients().find((c) => c.id === input.clientId);
    if (input.clientId && !client) issues.push("The selected client no longer exists.");
    if (client && input.contactId && !client.contacts.some((c) => c.id === input.contactId))
      issues.push("The contact person must belong to the selected client.");
    if (issues.length) throw new ValidationError(issues);
  }

  async createEnquiry(input: EnquiryInput): Promise<Enquiry> {
    await this.delay();
    this.checkEnquiryInput(input);
    const list = this.enquiries();
    const actor = await this.getActor();
    const t = this.iso();
    const year = Number((input.enquiryDate || t).slice(0, 4));
    const e: Enquiry = {
      ...clone(input),
      projectName: input.projectName.trim(),
      siteLocation: input.siteLocation.trim(),
      id: newId("e"),
      number: nextEnquiryNumber(
        list.map((x) => x.number),
        year,
      ),
      attachments: [],
      status: "enquiry",
      statusBeforeDecline: null,
      followUpDate: "",
      finalised: null,
      declined: null,
      nextRevision: 0,
      history: [this.event(actor, { type: "created", to: "enquiry" })],
      createdAt: t,
      createdBy: actor,
      updatedAt: t,
    };
    this.saveEnquiries([...list, e]);
    return clone(e);
  }

  async updateEnquiry(id: string, input: EnquiryInput): Promise<Enquiry> {
    await this.delay();
    const list = this.enquiries();
    const current = this.findEnquiry(list, id);
    const actor = await this.getActor();
    if (isClosed(current.status)) {
      // Closed enquiries: only the notes field may change.
      if (input.notes === current.notes) return clone(current);
      return this.putEnquiry(list, {
        ...current,
        notes: input.notes,
        updatedAt: this.iso(),
        history: [...current.history, this.event(actor, { type: "edited", comment: "Notes updated" })],
      });
    }
    this.checkEnquiryInput({ ...input, clientId: current.clientId });
    return this.putEnquiry(list, {
      ...current,
      ...clone(input),
      clientId: current.clientId,
      updatedAt: this.iso(),
      history: [...current.history, this.event(actor, { type: "edited", comment: "Details updated" })],
    });
  }

  async addNote(id: string, text: string): Promise<Enquiry> {
    await this.delay();
    if (!text.trim()) throw new ValidationError(["The note is empty."]);
    const list = this.enquiries();
    const e = this.findEnquiry(list, id);
    return this.putEnquiry(list, {
      ...e,
      updatedAt: this.iso(),
      history: [...e.history, this.event(await this.getActor(), { type: "note", comment: text.trim() })],
    });
  }

  async addAttachment(id: string, file: Pick<Attachment, "name" | "type" | "size" | "url" | "fileId">): Promise<Enquiry> {
    await this.delay();
    const list = this.enquiries();
    const e = this.findEnquiry(list, id);
    if (isClosed(e.status)) throw new ValidationError(["Closed enquiries can't be changed."]);
    const actor = await this.getActor();
    const att: Attachment = { ...file, id: newId("att"), uploadedAt: this.iso(), uploadedBy: actor };
    return this.putEnquiry(list, {
      ...e,
      attachments: [...e.attachments, att],
      updatedAt: this.iso(),
      history: [...e.history, this.event(actor, { type: "attachment_added", comment: file.name })],
    });
  }

  async removeAttachment(id: string, attachmentId: string): Promise<Enquiry> {
    await this.delay();
    const list = this.enquiries();
    const e = this.findEnquiry(list, id);
    if (isClosed(e.status)) throw new ValidationError(["Closed enquiries can't be changed."]);
    const att = e.attachments.find((a) => a.id === attachmentId);
    if (!att) return clone(e);
    return this.putEnquiry(list, {
      ...e,
      attachments: e.attachments.filter((a) => a.id !== attachmentId),
      updatedAt: this.iso(),
      history: [...e.history, this.event(await this.getActor(), { type: "attachment_removed", comment: att.name })],
    });
  }

  /** Applies a status change (already validated) and records it in the history. */
  private applyStatus(e: Enquiry, change: StatusChange, actor: string, automatic = false): Enquiry {
    const next: Enquiry = {
      ...e,
      status: change.to,
      followUpDate: change.to === "on_hold" ? change.followUpDate ?? "" : "",
      updatedAt: this.iso(),
      history: [
        ...e.history,
        this.event(automatic ? "system" : actor, {
          type: "status",
          from: e.status,
          to: change.to,
          comment: change.comment?.trim() || undefined,
          automatic: automatic || undefined,
        }),
      ],
    };
    if (change.to === "finalised") next.finalised = clone(change.finalised!);
    if (change.to === "declined") {
      next.declined = clone(change.declined!);
      next.statusBeforeDecline = e.status;
    }
    if (change.to === "quotation_sent" || change.to === "revision_sent") {
      const linked = this.linkedQuotes(e.id);
      const target = [...linked].reverse().find((q) => q.status === "final") ?? linked[linked.length - 1];
      if (target) this.quotes.patchRecord(target.id, { sentAt: this.iso() });
    }
    return next;
  }

  async changeStatus(id: string, change: StatusChange): Promise<Enquiry> {
    await this.delay();
    const list = this.enquiries();
    const e = this.findEnquiry(list, id);
    const issues = validateStatusChange(
      e,
      change,
      this.linkedQuotes(id).map((q) => q.id),
    );
    if (issues.length) throw new ValidationError(issues);
    return this.putEnquiry(list, this.applyStatus(e, change, await this.getActor()));
  }

  async reassign(id: string, assignedTo: string, comment: string): Promise<Enquiry> {
    await this.delay();
    const list = this.enquiries();
    const e = this.findEnquiry(list, id);
    if (e.assignedTo === assignedTo) return clone(e);
    return this.putEnquiry(list, {
      ...e,
      assignedTo,
      updatedAt: this.iso(),
      history: [...e.history, this.event(await this.getActor(), { type: "edited", comment })],
    });
  }

  async reopen(id: string, comment: string): Promise<Enquiry> {
    await this.delay();
    const list = this.enquiries();
    const e = this.findEnquiry(list, id);
    if (e.status !== "declined" && e.status !== "finalised") throw new ValidationError(["Only declined or finalised enquiries can be reopened."]);
    if (e.status === "finalised" && !(await this.isAdmin())) throw new ValidationError(["Only admins can reopen a finalised enquiry."]);
    if (!comment.trim()) throw new ValidationError(["Add a comment explaining why the enquiry is reopened."]);
    const actor = await this.getActor();
    if (e.status === "finalised") {
      // Back to the status it had before it was finalised; its project shows a warning.
      const last = [...e.history].reverse().find((h) => h.type === "status" && h.to === "finalised");
      const to: EnquiryStatus = last?.from && last.from !== "finalised" ? last.from : "quotation_sent";
      return this.putEnquiry(list, {
        ...e,
        status: to,
        finalised: null,
        updatedAt: this.iso(),
        history: [...e.history, this.event(actor, { type: "reopened", from: "finalised", to, comment: comment.trim() })],
      });
    }
    const to = e.statusBeforeDecline ?? "enquiry";
    return this.putEnquiry(list, {
      ...e,
      status: to,
      statusBeforeDecline: null,
      declined: null,
      updatedAt: this.iso(),
      history: [...e.history, this.event(actor, { type: "reopened", from: "declined", to, comment: comment.trim() })],
    });
  }

  /* ---------- quotations ---------- */

  private maybeAutoStatus(e: Enquiry, revision: number): { e: Enquiry; changed: EnquiryStatus | null } {
    const linked = this.linkedQuotes(e.id);
    const latest = linked.reduce((m, q) => Math.max(m, q.enquiryRevision ?? 0), 0);
    const to = autoStatusOnFinal(e, revision, latest);
    if (!to) return { e, changed: null };
    return { e: this.applyStatus(e, { to }, "system", true), changed: to };
  }

  async linkQuotation(quotationId: string, enquiryId: string): Promise<LinkResult> {
    await this.delay();
    const actor = await this.getActor();
    const quote = this.quotes.readAllRecords().find((q) => q.id === quotationId);
    if (!quote) throw new CrmNotFoundError("Quotation", quotationId);
    let list = this.enquiries();
    const e = this.findEnquiry(list, enquiryId);
    if (quote.enquiryId === enquiryId) return { enquiry: clone(e), revision: quote.enquiryRevision ?? 0, statusChanged: null };
    if (isClosed(e.status)) throw new ValidationError(["Closed enquiries can't take new quotations."]);

    if (quote.enquiryId) {
      await this.unlinkQuotation(quotationId);
      list = this.enquiries();
    }
    const fresh = this.findEnquiry(list, enquiryId);
    const revision = fresh.nextRevision;
    this.quotes.patchRecord(
      quotationId,
      { enquiryId, enquiryNumber: fresh.number, enquiryRevision: revision, sentAt: null },
      padRevision(revision),
    );
    let updated: Enquiry = {
      ...fresh,
      nextRevision: revision + 1,
      updatedAt: this.iso(),
      history: [...fresh.history, this.event(actor, { type: "quotation_linked", quotationId, revision })],
    };
    let changed: EnquiryStatus | null = null;
    if (quote.status === "final") ({ e: updated, changed } = this.maybeAutoStatus(updated, revision));
    return { enquiry: this.putEnquiry(list, updated), revision, statusChanged: changed };
  }

  async unlinkQuotation(quotationId: string): Promise<void> {
    await this.delay();
    const quote = this.quotes.readAllRecords().find((q) => q.id === quotationId);
    if (!quote?.enquiryId) return;
    const list = this.enquiries();
    const e = list.find((x) => x.id === quote.enquiryId);
    if (e && isClosed(e.status)) throw new ValidationError(["Quotations of a closed enquiry can't be unlinked."]);
    this.quotes.patchRecord(quotationId, { enquiryId: null, enquiryNumber: null, enquiryRevision: null, sentAt: null });
    if (e)
      this.putEnquiry(list, {
        ...e,
        updatedAt: this.iso(),
        history: [
          ...e.history,
          this.event(await this.getActor(), { type: "quotation_unlinked", quotationId, revision: quote.enquiryRevision ?? undefined }),
        ],
      });
  }

  async onQuotationSaved(quotationId: string, previousStatus: "draft" | "final" | null): Promise<LinkResult | null> {
    const quote = this.quotes.readAllRecords().find((q) => q.id === quotationId);
    if (!quote?.enquiryId || quote.status !== "final" || previousStatus === "final") return null;
    const list = this.enquiries();
    const e = list.find((x) => x.id === quote.enquiryId);
    if (!e) return null;
    const { e: updated, changed } = this.maybeAutoStatus(e, quote.enquiryRevision ?? 0);
    if (!changed) return null;
    return { enquiry: this.putEnquiry(list, updated), revision: quote.enquiryRevision ?? 0, statusChanged: changed };
  }

  /* ---------- reminders ---------- */

  async notifications(userId: string) {
    await this.delay();
    const clients = new Map(this.clients().map((c) => [c.id, c.name]));
    const now = this.now();
    return this.enquiries()
      .filter((e) => followUpOwner(e) === userId)
      .map((e) => ({ e, fu: followUpState(e, now) }))
      .filter(({ fu }) => fu.due)
      .sort((a, b) => a.e.updatedAt.localeCompare(b.e.updatedAt))
      .map(({ e, fu }) => ({
        enquiryId: e.id,
        number: e.number,
        clientName: clients.get(e.clientId) ?? "",
        projectName: e.projectName,
        reason: fu.reason,
        since: e.updatedAt,
      }));
  }

  async resetDemoData(): Promise<void> {
    this.storage().removeItem(CLIENTS_KEY);
    this.storage().removeItem(ENQUIRIES_KEY);
    this.enquiries();
  }
}
