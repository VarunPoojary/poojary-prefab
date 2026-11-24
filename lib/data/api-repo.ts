import type { Quotation } from "@/lib/types";
import type { QuotationRepository } from "./repository";
import { NotFoundError, type ListParams, type ListResult, type QuotationRecord, type QuotationStatus, type UpdatePatch } from "./types";

/**
 * Cloud database implementation – NOT USED YET.
 *
 * When the backend is ready, implement these endpoints (or Next.js route handlers backed by the DB)
 * and switch `quotationRepo` in lib/data/index.ts to `new ApiRepository("/api")`.
 *
 *   GET    /quotations?search=&status=&mode=&sort=&dir=&page=&pageSize=  -> ListResult
 *   GET    /quotations/:id                                                -> QuotationRecord (404 if missing)
 *   POST   /quotations            { data, status }                        -> QuotationRecord
 *   PATCH  /quotations/:id        { data?, status? }                      -> QuotationRecord
 *   DELETE /quotations/:id                                                -> 204
 *   POST   /quotations/:id/duplicate                                      -> QuotationRecord
 *   POST   /quotations/:id/revision                                       -> QuotationRecord
 *   GET    /quotations/next-offer-no                                      -> { offerNo: string }
 */
export class ApiRepository implements QuotationRepository {
  readonly label = "Cloud database";

  constructor(
    private readonly baseUrl: string,
    private readonly getToken?: () => Promise<string | null>,
  ) {}

  private async request<T>(path: string, init: RequestInit = {}, id?: string): Promise<T> {
    const token = await this.getToken?.();
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
    });
    if (res.status === 404 && id) throw new NotFoundError(id);
    if (!res.ok) throw new Error(`Request failed (${res.status}): ${await res.text()}`);
    return (res.status === 204 ? undefined : await res.json()) as T;
  }

  list(params: ListParams = {}): Promise<ListResult> {
    const qs = new URLSearchParams(
      Object.entries(params)
        .filter(([, v]) => v !== undefined && v !== "")
        .map(([k, v]) => [k, String(v)]),
    );
    return this.request(`/quotations?${qs}`);
  }

  get(id: string): Promise<QuotationRecord> {
    return this.request(`/quotations/${encodeURIComponent(id)}`, {}, id);
  }

  create(data: Quotation, status: QuotationStatus = "draft"): Promise<QuotationRecord> {
    return this.request(`/quotations`, { method: "POST", body: JSON.stringify({ data, status }) });
  }

  update(id: string, patch: UpdatePatch): Promise<QuotationRecord> {
    return this.request(`/quotations/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(patch) }, id);
  }

  remove(id: string): Promise<void> {
    return this.request(`/quotations/${encodeURIComponent(id)}`, { method: "DELETE" }, id);
  }

  duplicate(id: string): Promise<QuotationRecord> {
    return this.request(`/quotations/${encodeURIComponent(id)}/duplicate`, { method: "POST" }, id);
  }

  newRevision(id: string): Promise<QuotationRecord> {
    return this.request(`/quotations/${encodeURIComponent(id)}/revision`, { method: "POST" }, id);
  }

  async suggestNextOfferNo(): Promise<string> {
    const r = await this.request<{ offerNo: string }>(`/quotations/next-offer-no`);
    return r.offerNo;
  }
}
