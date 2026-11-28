import { DEFAULT_LISTS, DEFAULT_TEMPLATES, type ListKey } from "@/lib/projects/config";
import { appStorage, type KeyValueStorage } from "@/lib/storage";
import { DEFAULT_REMINDER_TIME } from "@/lib/attendance/config";
import { normaliseRoles } from "@/lib/auth/roles";
import type { AppSettings } from "./types";

export const SETTINGS_KEY = "pppl.settings.v1";

export const defaultSettings = (): AppSettings => ({
  templates: JSON.parse(JSON.stringify(DEFAULT_TEMPLATES)),
  lists: JSON.parse(JSON.stringify(DEFAULT_LISTS)),
  // Demo supervisors (Rahul at the factory, Vaishali at the office); admins change them in Settings.
  attendance: { reminderTime: DEFAULT_REMINDER_TIME, supervisors: { factory: ["u_rahul"], office: ["u_staff"] } },
  payroll: { startMonth: "" },
  roles: normaliseRoles(),
  updatedAt: new Date(0).toISOString(),
});

/** Raw access to the settings in browser storage; shared by the settings and project repositories. */
export class SettingsStore {
  constructor(private readonly storage: () => KeyValueStorage = appStorage) {}

  read(): AppSettings {
    const d = defaultSettings();
    const raw = this.storage().getItem(SETTINGS_KEY);
    if (!raw) return d;
    try {
      const s = JSON.parse(raw) as Partial<AppSettings>;
      // Lists added in later versions get their defaults.
      return {
        templates: { ...d.templates, ...s.templates },
        lists: { ...d.lists, ...s.lists } as Record<ListKey, AppSettings["lists"][ListKey]>,
        attendance: { ...d.attendance, ...s.attendance, supervisors: { ...d.attendance.supervisors, ...s.attendance?.supervisors } },
        payroll: { ...d.payroll, ...s.payroll },
        // Settings saved before custom roles get the starting roles (Admin, Staff, Accountant).
        roles: normaliseRoles(s.roles),
        updatedAt: s.updatedAt ?? d.updatedAt,
      };
    } catch {
      return d;
    }
  }

  write(s: AppSettings) {
    this.storage().setItem(SETTINGS_KEY, JSON.stringify(s));
  }

  reset() {
    this.storage().removeItem(SETTINGS_KEY);
  }

  /** Label for a stored list value; unknown values (e.g. removed from defaults) show as stored. */
  label(key: ListKey, value: string) {
    return this.read().lists[key].find((i) => i.value === value)?.label ?? value;
  }
}
