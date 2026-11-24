import { authService } from "@/lib/auth";
import { quotationRepo } from "@/lib/data";
import { SessionStorageRepository } from "@/lib/data/session-repo";
import { cloudEnabled, withCloudSync } from "@/lib/supabase";
import type { CrmRepository } from "./repository";
import { SessionStorageCrmRepository } from "./session-repo";

/*
 * The one place that decides where clients and enquiries are stored: lib/storage (Supabase when configured,
 * otherwise this browser).
 */
function create(): CrmRepository {
  if (!(quotationRepo instanceof SessionStorageRepository))
    throw new Error("The browser CRM store needs the browser quotation store; switch both to the API together.");
  return new SessionStorageCrmRepository({
    quotes: quotationRepo,
    getActor: async () => (await authService.getSession())?.user.id ?? "unknown",
    isAdmin: async () => (await authService.getSession())?.user.role === "admin",
    seed: !cloudEnabled,
    latencyMs: cloudEnabled ? 0 : undefined,
  });
}

export const crmRepo: CrmRepository = withCloudSync(create());

export * from "./types";
export type { CrmRepository, LinkResult } from "./repository";
