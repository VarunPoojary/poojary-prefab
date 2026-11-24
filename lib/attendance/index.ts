import { authService } from "@/lib/auth";
import { PeopleStore } from "@/lib/employees/store";
import { notificationStore } from "@/lib/notifications";
import { projectRepo } from "@/lib/projects";
import { LocalProjectRepository } from "@/lib/projects/local-repo";
import { SettingsStore } from "@/lib/settings/store";
import { LocalAttendanceRepository } from "./local-repo";
import type { AttendanceRepository } from "./repository";

/*
 * The one place that decides where attendance is stored.
 * To switch to the cloud database (together with projects and employees):
 *   import { ApiAttendanceRepository } from "./api-repo";
 *   export const attendanceRepo: AttendanceRepository = new ApiAttendanceRepository("/api");
 */
function create(): AttendanceRepository {
  if (!(projectRepo instanceof LocalProjectRepository)) throw new Error("The browser attendance store needs the browser project store; switch both to the API together.");
  return new LocalAttendanceRepository({
    people: new PeopleStore(),
    settings: new SettingsStore(),
    projects: projectRepo,
    notifications: notificationStore,
    getActor: async () => {
      const s = await authService.getSession();
      return s ? { id: s.user.id, role: s.user.role } : null;
    },
  });
}

export const attendanceRepo: AttendanceRepository = create();

export * from "./types";
export type { AttendanceRepository, ProjectAttendanceAccess } from "./repository";
