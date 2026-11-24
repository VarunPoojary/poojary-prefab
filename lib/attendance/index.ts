import { authService } from "@/lib/auth";
import { PeopleStore } from "@/lib/employees/store";
import { notificationStore } from "@/lib/notifications";
import { projectRepo } from "@/lib/projects";
import { LocalProjectRepository } from "@/lib/projects/local-repo";
import { SettingsStore } from "@/lib/settings/store";
import { LocalAttendanceRepository } from "./local-repo";
import { cloudEnabled, withCloudSync } from "@/lib/supabase";
import type { AttendanceRepository } from "./repository";

/*
 * The one place that decides where attendance is stored: lib/storage (Supabase when configured, otherwise
 * this browser).
 */
function create(): AttendanceRepository {
  if (!(projectRepo instanceof LocalProjectRepository)) throw new Error("The browser attendance store needs the browser project store; switch both to the API together.");
  return new LocalAttendanceRepository({
    people: new PeopleStore(undefined, !cloudEnabled),
    settings: new SettingsStore(),
    projects: projectRepo,
    notifications: notificationStore,
    getActor: async () => {
      const s = await authService.getSession();
      return s ? { id: s.user.id, role: s.user.role } : null;
    },
    seed: !cloudEnabled,
    latencyMs: cloudEnabled ? 0 : undefined,
  });
}

export const attendanceRepo: AttendanceRepository = withCloudSync(create());

export * from "./types";
export type { AttendanceRepository, ProjectAttendanceAccess } from "./repository";
