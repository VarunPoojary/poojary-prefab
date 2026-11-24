import type { AppNotification } from "@/lib/notifications/types";
import type {
  AttendanceRecord,
  CasualDayRow,
  CasualWorker,
  Conflict,
  LabourCost,
  MonthRow,
  MonthSummary,
  MyAttendanceAccess,
  NewCasualWorker,
  PersonKind,
  ProjectDayDetail,
  ProjectDayRow,
  RecordPatch,
  RegisterRow,
  SheetFilters,
  SheetRow,
  SheetSummary,
  SiteDay,
  SiteDayInput,
  SiteEntry,
  WorkLocation,
} from "./types";

export interface ProjectAttendanceAccess {
  canView: boolean;
  /** Admin, project manager or site engineer / erection supervisor on the team. */
  canLog: boolean;
  isAdmin: boolean;
}

/**
 * Single entry point for attendance. One record per person per day, shown in the project tab, the employee tab
 * and the Attendance page. Swap the browser version for the cloud API in lib/attendance/index.ts.
 */
export interface AttendanceRepository {
  readonly label: string;
  access(): Promise<MyAttendanceAccess>;

  /* project tab */
  projectAccess(projectId: string): Promise<ProjectAttendanceAccess>;
  projectDays(projectId: string, from: string, to: string): Promise<ProjectDayRow[]>;
  projectDay(projectId: string, date: string): Promise<ProjectDayDetail>;
  /** People logged at this site on the latest earlier logged day (for "Copy previous day"). */
  previousDay(projectId: string, date: string): Promise<{ date: string; entries: SiteEntry[] } | null>;
  /** People in the list who already have a record for the day somewhere else. */
  conflicts(date: string, people: { personKind: PersonKind; personId: string }[], target: { location: WorkLocation; projectId: string | null }): Promise<Conflict[]>;
  /** Throws AttendanceConflictError while conflicts are unresolved. */
  saveSiteDay(projectId: string, input: SiteDayInput): Promise<SiteDay>;
  markSiteHoliday(projectId: string, date: string): Promise<SiteDay>;

  /* employee tab (admin) */
  employeeMonth(employeeId: string, month: string): Promise<{ rows: MonthRow[]; summary: MonthSummary }>;

  /* attendance page (admin + supervisors) */
  daySheet(date: string, filters?: SheetFilters): Promise<{ rows: SheetRow[]; summary: SheetSummary; companyHoliday: boolean }>;
  setRecord(employeeId: string, date: string, patch: RecordPatch): Promise<AttendanceRecord>;
  bulkSet(employeeIds: string[], date: string, patch: RecordPatch): Promise<{ updated: number; skipped: string[] }>;
  /** Admin: Holiday for every employee without a record that day; no site reminders for it. */
  markDayHoliday(date: string): Promise<number>;
  casualDay(date: string): Promise<CasualDayRow[]>;
  sitesNotLogged(date: string): Promise<{ projectId: string; code: string; name: string }[]>;
  register(month: string): Promise<RegisterRow[]>;

  /* casual workers register */
  listCasual(params?: { search?: string; includeInactive?: boolean }): Promise<CasualWorker[]>;
  addCasual(input: NewCasualWorker): Promise<CasualWorker>;
  updateCasual(id: string, input: NewCasualWorker & { active: boolean }): Promise<CasualWorker>;
  mergeCasual(fromId: string, intoId: string): Promise<{ moved: number; dropped: number }>;

  /* project metrics */
  labourCost(projectId: string): Promise<LabourCost>;
  manDaysByDate(projectId: string): Promise<Record<string, { employees: number; casual: number }>>;

  /** Creates due site-attendance reminders (a scheduled job on the server); returns the new notifications. */
  reconcileReminders(): Promise<AppNotification[]>;
  resetDemoData?(): Promise<void>;
}
