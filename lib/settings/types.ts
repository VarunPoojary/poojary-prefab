import type { ListKey } from "@/lib/projects/config";
import type { ListItem, StageKey, TemplateTask } from "@/lib/projects/types";

/** Admin-maintained lists and task templates. Changes apply to new data only. */
export interface AttendanceSettings {
  /** Default time ("HH:MM") of the daily site attendance reminder; projects can override it. */
  reminderTime: string;
  /** Employees who mark attendance at the factory / office. */
  supervisors: { factory: string[]; office: string[] };
}

export interface PayrollSettings {
  /** First payroll month (yyyy-mm). Empty = the month of the earliest attendance record. */
  startMonth: string;
}

export interface AppSettings {
  templates: Record<StageKey, TemplateTask[]>;
  lists: Record<ListKey, ListItem[]>;
  attendance: AttendanceSettings;
  payroll: PayrollSettings;
  updatedAt: string;
}

export interface SettingsRepository {
  readonly label: string;
  get(): Promise<AppSettings>;
  /** Admin only. */
  saveTemplates(stage: StageKey, tasks: TemplateTask[]): Promise<AppSettings>;
  /** Admin only. Items are archived rather than deleted so old records keep their values. */
  saveList(key: ListKey, items: ListItem[]): Promise<AppSettings>;
  /** Admin only. */
  saveAttendance(s: AttendanceSettings): Promise<AppSettings>;
  /** Admin only. */
  savePayroll(s: PayrollSettings): Promise<AppSettings>;
  resetDemoData?(): Promise<void>;
}
