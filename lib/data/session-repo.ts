import type { Quotation } from "@/lib/types";
import type { QuotationRepository } from "./repository";
import { seedRecords } from "./seed";
import { nextOfferNo, nextRevision, normalize, querySummaries, toSummary } from "./summary";
import {
  NotFoundError,
  SCHEMA_VERSION,
  StorageFullError,
  type ListParams,
  type ListResult,
  type QuotationLinkFields,
  type QuotationRecord,
  type QuotationStatus,
  type UpdatePatch,
} from "./types";

// v2: demo quotations got fixed ids so the CRM demo data can link to them.
export const STORAGE_KEY = "pppl.quotations.v2";

import { appStorage, type KeyValueStorage } from "@/lib/storage";

export type { KeyValueStorage };

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

export function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `q_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * TEMPORARY storage: keeps all quotations in the browser's localStorage.
 * Replace with ApiRepository (lib/data/api-repo.ts) when the cloud database is ready.
 */
export class SessionStorageRepository implements QuotationRepository {
  readonly label = "This browser (temporary)";

  constructor(
    private readonly storage: () => KeyValueStorage = appStorage,
    private readonly latencyMs = 150,
    private readonly seed = true,
    /** Id of the signed-in user, recorded as createdBy / updatedBy. */
    private readonly getActor: () => Promise<string | null> = async () => null,
  ) {}

  private async delay() {
    if (this.latencyMs > 0) await new Promise((r) => setTimeout(r, this.latencyMs));
  }

  private read(): QuotationRecord[] {
    const raw = this.storage().getItem(STORAGE_KEY);
    if (raw === null) {
      const initial = this.seed ? seedRecords(Date.now()) : [];
      this.write(initial);
      return initial;
    }
    try {
      const parsed = JSON.parse(raw) as QuotationRecord[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private write(records: QuotationRecord[]) {
    try {
      this.storage().setItem(STORAGE_KEY, JSON.stringify(records));
    } catch (e) {
      if (e instanceof Error && /quota/i.test(e.name + e.message)) throw new StorageFullError();
      throw e;
    }
  }

  private find(records: QuotationRecord[], id: string): QuotationRecord {
    const r = records.find((x) => x.id === id);
    if (!r) throw new NotFoundError(id);
    return r;
  }

  private now() {
    return new Date().toISOString();
  }

  /* ---- Used by the CRM session repository (same browser storage); not part of the public interface. ---- */

  /** All stored records, without the simulated delay. */
  readAllRecords(): QuotationRecord[] {
    return this.read();
  }

  /** Writes CRM link fields (and optionally the revision text) on a quotation without touching updatedAt. */
  patchRecord(id: string, fields: Partial<QuotationLinkFields>, revision?: string): QuotationRecord {
    const records = this.read();
    const current = this.find(records, id);
    const updated: QuotationRecord = { ...current, ...fields };
    if (revision !== undefined) updated.data = { ...current.data, meta: { ...current.data.meta, revision } };
    this.write(records.map((r) => (r.id === id ? updated : r)));
    return clone(updated);
  }

  async list(params: ListParams = {}): Promise<ListResult> {
    await this.delay();
    return querySummaries(this.read().map(toSummary), params);
  }

  async get(id: string): Promise<QuotationRecord> {
    await this.delay();
    const r = this.find(this.read(), id);
    return { ...clone(r), data: normalize(r.data) };
  }

  async create(data: Quotation, status: QuotationStatus = "draft"): Promise<QuotationRecord> {
    await this.delay();
    const records = this.read();
    const t = this.now();
    const actor = await this.getActor();
    const record: QuotationRecord = {
      id: newId(),
      status,
      schemaVersion: SCHEMA_VERSION,
      createdAt: t,
      updatedAt: t,
      createdBy: actor,
      updatedBy: actor,
      data: clone(data),
    };
    this.write([...records, record]);
    return clone(record);
  }

  async update(id: string, patch: UpdatePatch): Promise<QuotationRecord> {
    await this.delay();
    const records = this.read();
    const current = this.find(records, id);
    const updated: QuotationRecord = {
      ...current,
      ...(patch.data ? { data: clone(patch.data) } : {}),
      ...(patch.status ? { status: patch.status } : {}),
      updatedAt: this.now(),
      updatedBy: (await this.getActor()) ?? current.updatedBy ?? null,
    };
    this.write(records.map((r) => (r.id === id ? updated : r)));
    return clone(updated);
  }

  async remove(id: string): Promise<void> {
    await this.delay();
    const records = this.read();
    this.find(records, id);
    this.write(records.filter((r) => r.id !== id));
  }

  private copyAsNew(records: QuotationRecord[], source: QuotationRecord, actor: string | null, mutate: (d: Quotation) => void) {
    const data = normalize(clone(source.data));
    mutate(data);
    data.fileName = "";
    const t = this.now();
    const record: QuotationRecord = {
      id: newId(),
      status: "draft",
      schemaVersion: SCHEMA_VERSION,
      createdAt: t,
      updatedAt: t,
      createdBy: actor,
      updatedBy: actor,
      data,
    };
    this.write([...records, record]);
    return clone(record);
  }

  async duplicate(id: string): Promise<QuotationRecord> {
    await this.delay();
    const records = this.read();
    const src = this.find(records, id);
    const offerNo = nextOfferNo(records.map((r) => r.data.meta.offerNo));
    return this.copyAsNew(records, src, await this.getActor(), (d) => {
      d.meta.offerNo = offerNo;
      d.meta.revision = "00";
      d.meta.date = this.now().slice(0, 10);
    });
  }

  async newRevision(id: string): Promise<QuotationRecord> {
    await this.delay();
    const records = this.read();
    const src = this.find(records, id);
    const offer = src.data.meta.offerNo;
    // Use the highest existing revision of this offer so two revisions never collide.
    const revs = records.filter((r) => r.data.meta.offerNo === offer).map((r) => r.data.meta.revision);
    const highest = revs.reduce((a, b) => ((parseInt(b, 10) || 0) > (parseInt(a, 10) || 0) ? b : a), src.data.meta.revision);
    return this.copyAsNew(records, src, await this.getActor(), (d) => {
      d.meta.revision = nextRevision(highest);
      d.meta.date = this.now().slice(0, 10);
    });
  }

  async suggestNextOfferNo(): Promise<string> {
    return nextOfferNo(this.read().map((r) => r.data.meta.offerNo));
  }

  async resetDemoData(): Promise<void> {
    await this.delay();
    this.storage().removeItem(STORAGE_KEY);
    this.read();
  }
}
