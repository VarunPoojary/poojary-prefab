import { authService } from "@/lib/auth";
import { quotationRepo } from "@/lib/data";
import { SessionStorageRepository } from "@/lib/data/session-repo";
import type { CrmRepository } from "./repository";
import { SessionStorageCrmRepository } from "./session-repo";

/*
 * The one place that decides where clients and enquiries are stored.
 * To switch to the cloud database:
 *   import { ApiCrmRepository } from "./api-repo";
 *   export const crmRepo: CrmRepository = new ApiCrmRepository("/api");
 */
function create(): CrmRepository {
  if (!(quotationRepo instanceof SessionStorageRepository))
    throw new Error("The browser CRM store needs the browser quotation store; switch both to the API together.");
  return new SessionStorageCrmRepository({
    quotes: quotationRepo,
    getActor: async () => (await authService.getSession())?.user.id ?? "unknown",
    isAdmin: async () => (await authService.getSession())?.user.role === "admin",
  });
}

export const crmRepo: CrmRepository = create();

export * from "./types";
export type { CrmRepository, LinkResult } from "./repository";
