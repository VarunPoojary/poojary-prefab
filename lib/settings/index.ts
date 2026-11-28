import { authService } from "@/lib/auth";
import { PeopleStore } from "@/lib/employees/store";
import { cloudEnabled, withCloudSync } from "@/lib/supabase";
import { LocalSettingsRepository } from "./local-repo";
import { SettingsStore } from "./store";
import type { SettingsRepository } from "./types";

/*
 * The one place that decides where settings are stored: lib/storage (Supabase when configured, otherwise this
 * browser). In Supabase only admins may change them (row level security).
 */
export const settingsRepo: SettingsRepository = withCloudSync(
  new LocalSettingsRepository(
    new SettingsStore(),
    async () => (await authService.getSession())?.user.role ?? null,
    () => {
      const used = new Map<string, number>();
      for (const l of new PeopleStore(undefined, !cloudEnabled).logins()) used.set(l.role, (used.get(l.role) ?? 0) + 1);
      return used;
    },
  ),
);

export type { AppSettings, AttendanceSettings, PayrollSettings, SettingsRepository } from "./types";
