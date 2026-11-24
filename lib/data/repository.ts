import type { Quotation } from "@/lib/types";
import type { ListParams, ListResult, QuotationRecord, QuotationStatus, UpdatePatch } from "./types";

/**
 * Single entry point for reading/writing quotations. UI code depends only on this interface,
 * so swapping the temporary browser storage for a cloud API is a change in lib/data/index.ts.
 */
export interface QuotationRepository {
  list(params?: ListParams): Promise<ListResult>;
  /** Throws NotFoundError when the id does not exist. */
  get(id: string): Promise<QuotationRecord>;
  create(data: Quotation, status?: QuotationStatus): Promise<QuotationRecord>;
  update(id: string, patch: UpdatePatch): Promise<QuotationRecord>;
  remove(id: string): Promise<void>;
  /** Copy as a new draft with the next offer number and revision "00". */
  duplicate(id: string): Promise<QuotationRecord>;
  /** Copy as a new draft with the same offer number and the revision incremented. */
  newRevision(id: string): Promise<QuotationRecord>;
  suggestNextOfferNo(): Promise<string>;
  /** Development helper; not every implementation supports it. */
  resetDemoData?(): Promise<void>;
  /** Shown in the UI so it is clear where data lives. */
  readonly label: string;
}
