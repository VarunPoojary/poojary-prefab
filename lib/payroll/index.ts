import { attendanceRepo } from "@/lib/attendance";
import { LocalAttendanceRepository } from "@/lib/attendance/local-repo";
import { authService } from "@/lib/auth";
import { PeopleStore } from "@/lib/employees/store";
import { notificationStore } from "@/lib/notifications";
import { SettingsStore } from "@/lib/settings/store";
import { LocalPayrollRepository } from "./local-repo";
import type { PayrollRepository } from "./repository";

/*
 * The one place that decides where payroll is stored.
 * To switch to the cloud database (together with employees and attendance):
 *   import { ApiPayrollRepository } from "./api-repo";
 *   export const payrollRepo: PayrollRepository = new ApiPayrollRepository("/api");
 */
function create(): PayrollRepository {
  if (!(attendanceRepo instanceof LocalAttendanceRepository)) throw new Error("The browser payroll store needs the browser attendance store; switch both to the API together.");
  return new LocalPayrollRepository({
    people: new PeopleStore(),
    settings: new SettingsStore(),
    attendance: attendanceRepo,
    notifications: notificationStore,
    getActor: async () => {
      const s = await authService.getSession();
      return s ? { id: s.user.id, role: s.user.role } : null;
    },
  });
}

export const payrollRepo: PayrollRepository = create();

export * from "./types";
export type { PayrollAccess, PayrollRepository } from "./repository";
