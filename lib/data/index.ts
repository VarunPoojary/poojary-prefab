import { authService } from "@/lib/auth";
import type { QuotationRepository } from "./repository";
import { SessionStorageRepository } from "./session-repo";

/*
 * The one place that decides where quotations are stored.
 * To switch to the cloud database:
 *   import { ApiRepository } from "./api-repo";
 *   export const quotationRepo: QuotationRepository = new ApiRepository("/api");
 */
export const quotationRepo: QuotationRepository = new SessionStorageRepository(
  undefined,
  150,
  true,
  async () => (await authService.getSession())?.user.id ?? null,
);

export * from "./types";
export type { QuotationRepository } from "./repository";
