import { authService } from "@/lib/auth";
import { LocalSettingsRepository } from "./local-repo";
import { SettingsStore } from "./store";
import type { SettingsRepository } from "./types";

/*
 * The one place that decides where settings are stored.
 * Cloud version: GET /settings, PUT /settings/templates/:stage, PUT /settings/lists/:key, PUT /settings/attendance,
 * PUT /settings/payroll (admin only).
 */
export const settingsRepo: SettingsRepository = new LocalSettingsRepository(
  new SettingsStore(),
  async () => (await authService.getSession())?.user.role ?? null,
);

export type { AppSettings, AttendanceSettings, PayrollSettings, SettingsRepository } from "./types";
