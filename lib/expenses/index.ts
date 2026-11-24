import { attendanceRepo } from "@/lib/attendance";
import { LocalAttendanceRepository } from "@/lib/attendance/local-repo";
import { authService } from "@/lib/auth";
import { PeopleStore } from "@/lib/employees/store";
import { notificationStore } from "@/lib/notifications";
import { projectRepo } from "@/lib/projects";
import { LocalProjectRepository } from "@/lib/projects/local-repo";
import { SettingsStore } from "@/lib/settings/store";
import { LocalExpenseRepository } from "./local-repo";
import { cloudEnabled, withCloudSync } from "@/lib/supabase";
import type { ExpenseRepository } from "./repository";

/*
 * The one place that decides where expenses are stored: lib/storage (Supabase when configured, otherwise
 * this browser).
 */
function create(): ExpenseRepository {
  if (!(projectRepo instanceof LocalProjectRepository) || !(attendanceRepo instanceof LocalAttendanceRepository))
    throw new Error("The browser expense store needs the browser project and attendance stores; switch them to the API together.");
  return new LocalExpenseRepository({
    people: new PeopleStore(undefined, !cloudEnabled),
    settings: new SettingsStore(),
    projects: projectRepo,
    attendance: attendanceRepo,
    notifications: notificationStore,
    getActor: async () => {
      const s = await authService.getSession();
      return s ? { id: s.user.id, role: s.user.role } : null;
    },
    seed: !cloudEnabled,
    latencyMs: cloudEnabled ? 0 : undefined,
  });
}

export const expenseRepo: ExpenseRepository = withCloudSync(create());

export * from "./types";
export type { ExpensePageAccess, ExpenseRepository, ProjectName } from "./repository";
