import { authService } from "@/lib/auth";
import { crmRepo } from "@/lib/crm";
import { SessionStorageCrmRepository } from "@/lib/crm/session-repo";
import { quotationRepo } from "@/lib/data";
import { SessionStorageRepository } from "@/lib/data/session-repo";
import { PeopleStore } from "@/lib/employees/store";
import { notificationStore } from "@/lib/notifications";
import { SettingsStore } from "@/lib/settings/store";
import { LocalProjectRepository } from "./local-repo";
import { cloudEnabled, withCloudSync } from "@/lib/supabase";
import type { ProjectRepository } from "./repository";

/*
 * The one place that decides where projects are stored: lib/storage (Supabase when configured, otherwise
 * this browser).
 */
function create(): ProjectRepository {
  if (!(crmRepo instanceof SessionStorageCrmRepository) || !(quotationRepo instanceof SessionStorageRepository))
    throw new Error("The browser project store needs the browser CRM and quotation stores; switch all of them to the API together.");
  const crm = crmRepo;
  const quotes = quotationRepo;
  return new LocalProjectRepository({
    sources: { enquiries: () => crm.readAllEnquiries(), clients: () => crm.readAllClients(), quotations: () => quotes.readAllRecords() },
    people: new PeopleStore(undefined, !cloudEnabled),
    settings: new SettingsStore(),
    notifications: notificationStore,
    getActor: async () => {
      const s = await authService.getSession();
      return s ? { id: s.user.id, role: s.user.role } : null;
    },
    seed: !cloudEnabled,
    latencyMs: cloudEnabled ? 0 : undefined,
  });
}

export const projectRepo: ProjectRepository = withCloudSync(create());

export * from "./types";
export type { ProjectRepository, AvailableEnquiry } from "./repository";
