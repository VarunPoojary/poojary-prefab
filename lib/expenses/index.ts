import { attendanceRepo } from "@/lib/attendance";
import { LocalAttendanceRepository } from "@/lib/attendance/local-repo";
import { authService } from "@/lib/auth";
import { PeopleStore } from "@/lib/employees/store";
import { notificationStore } from "@/lib/notifications";
import { projectRepo } from "@/lib/projects";
import { LocalProjectRepository } from "@/lib/projects/local-repo";
import { SettingsStore } from "@/lib/settings/store";
import { LocalExpenseRepository } from "./local-repo";
import type { ExpenseRepository } from "./repository";

/*
 * The one place that decides where expenses are stored.
 * To switch to the cloud database (together with projects and attendance):
 *   import { ApiExpenseRepository } from "./api-repo";
 *   export const expenseRepo: ExpenseRepository = new ApiExpenseRepository("/api");
 */
function create(): ExpenseRepository {
  if (!(projectRepo instanceof LocalProjectRepository) || !(attendanceRepo instanceof LocalAttendanceRepository))
    throw new Error("The browser expense store needs the browser project and attendance stores; switch them to the API together.");
  return new LocalExpenseRepository({
    people: new PeopleStore(),
    settings: new SettingsStore(),
    projects: projectRepo,
    attendance: attendanceRepo,
    notifications: notificationStore,
    getActor: async () => {
      const s = await authService.getSession();
      return s ? { id: s.user.id, role: s.user.role } : null;
    },
  });
}

export const expenseRepo: ExpenseRepository = create();

export * from "./types";
export type { ExpensePageAccess, ExpenseRepository, ProjectName } from "./repository";
