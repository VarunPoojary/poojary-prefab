import type { PricingMode, Quotation } from "@/lib/types";

export type QuotationStatus = "draft" | "final";

export const SCHEMA_VERSION = 1;

/** A stored quotation. This is also the shape of the future DB row / API payload. */
export interface QuotationRecord {
  id: string;
  status: QuotationStatus;
  schemaVersion: number;
  createdAt: string;
  updatedAt: string;
  /** Employee who created / last edited the quotation (null for imported or demo records). */
  createdBy?: string | null;
  updatedBy?: string | null;
  data: Quotation;
  /** Link to the CRM enquiry this quotation answers (set by the CRM, not the wizard). */
  enquiryId?: string | null;
  enquiryNumber?: string | null;
  /** Revision within the enquiry: 0 = R0 (original), 1 = R1 … */
  enquiryRevision?: number | null;
  /** When the enquiry was marked Quotation/Revision Sent with this quotation as the latest. */
  sentAt?: string | null;
}

/** Fields the CRM sets on a quotation record. */
export type QuotationLinkFields = Pick<QuotationRecord, "enquiryId" | "enquiryNumber" | "enquiryRevision" | "sentAt">;

/** Lightweight projection shown in the list (later: a DB view / API list response). */
export interface QuotationSummary {
  id: string;
  status: QuotationStatus;
  offerNo: string;
  revision: string;
  date: string;
  client: string;
  attention: string;
  subject: string;
  siteLocation: string;
  pricingMode: PricingMode;
  grandTotal: number;
  clientId: string | null;
  enquiryId: string | null;
  enquiryNumber: string | null;
  enquiryRevision: number | null;
  sentAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type SortKey = "updated" | "date" | "offerNo" | "amount";

export interface ListParams {
  search?: string;
  status?: QuotationStatus | "all";
  mode?: PricingMode | "all";
  linked?: "all" | "linked" | "unlinked";
  enquiryId?: string;
  clientId?: string;
  sort?: SortKey;
  dir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
}

export interface ListResult {
  items: QuotationSummary[];
  total: number;
  page: number;
  pageSize: number;
}

export interface UpdatePatch {
  data?: Quotation;
  status?: QuotationStatus;
}

export class NotFoundError extends Error {
  constructor(id: string) {
    super(`Quotation ${id} was not found. It may have been deleted.`);
    this.name = "NotFoundError";
  }
}

export class StorageFullError extends Error {
  constructor() {
    super("Browser storage is full. Remove some uploaded photos or delete old quotations and try again.");
    this.name = "StorageFullError";
  }
}
