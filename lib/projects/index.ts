import { authService } from "@/lib/auth";
import { crmRepo } from "@/lib/crm";
import { SessionStorageCrmRepository } from "@/lib/crm/session-repo";
import { quotationRepo } from "@/lib/data";
import { SessionStorageRepository } from "@/lib/data/session-repo";
import { PeopleStore } from "@/lib/employees/store";
import { notificationStore } from "@/lib/notifications";
import { SettingsStore } from "@/lib/settings/store";
import { LocalProjectRepository } from "./local-repo";
import type { ProjectRepository } from "./repository";

/*
 * The one place that decides where projects are stored.
 * To switch to the cloud database (together with the CRM, quotations and employees):
 *   import { ApiProjectRepository } from "./api-repo";
 *   export const projectRepo: ProjectRepository = new ApiProjectRepository("/api");
 */
function create(): ProjectRepository {
  if (!(crmRepo instanceof SessionStorageCrmRepository) || !(quotationRepo instanceof SessionStorageRepository))
    throw new Error("The browser project store needs the browser CRM and quotation stores; switch all of them to the API together.");
  const crm = crmRepo;
  const quotes = quotationRepo;
  return new LocalProjectRepository({
    sources: { enquiries: () => crm.readAllEnquiries(), clients: () => crm.readAllClients(), quotations: () => quotes.readAllRecords() },
    people: new PeopleStore(),
    settings: new SettingsStore(),
    notifications: notificationStore,
    getActor: async () => {
      const s = await authService.getSession();
      return s ? { id: s.user.id, role: s.user.role } : null;
    },
  });
}

export const projectRepo: ProjectRepository = create();

export * from "./types";
export type { ProjectRepository, AvailableEnquiry } from "./repository";
