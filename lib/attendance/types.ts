import type { PhotoRef } from "@/lib/files/types";

export type AttendanceStatus = "present" | "half" | "absent" | "holiday";
export type WorkLocation = "site" | "factory" | "office";
export type PersonKind = "employee" | "casual";
export type AttendanceSource = "project" | "admin" | "supervisor";

export interface RecordChange {
  at: string;
  by: string;
  from: Partial<Pick<AttendanceRecord, "status" | "location" | "projectId" | "remarks">>;
  to: Partial<Pick<AttendanceRecord, "status" | "location" | "projectId" | "remarks">>;
  note?: string;
}

/** One record per person per day; "Not logged" is never stored. */
export interface AttendanceRecord {
  id: string;
  personKind: PersonKind;
  personId: string;
  /** yyyy-mm-dd */
  date: string;
  status: AttendanceStatus;
  /** Required for Present / Half day. */
  location: WorkLocation | null;
  /** Set when location is "site". */
  projectId: string | null;
  remarks: string;
  source: AttendanceSource;
  loggedBy: string;
  loggedAt: string;
  history: RecordChange[];
}

/** A project's attendance log for one day: the group photo, or a site holiday. */
export interface SiteDay {
  id: string;
  projectId: string;
  date: string;
  holiday: boolean;
  photos: PhotoRef[];
  /** Where the phone was when the photo was taken, if the user allowed location. */
  photoLocation: { lat: number; lng: number; accuracy: number } | null;
  /** Distance from the project's map pin, in metres. */
  photoDistanceM: number | null;
  loggedBy: string;
  loggedAt: string;
  editedBy?: string;
  editedAt?: string;
}

export interface CasualWorker {
  id: string;
  name: string;
  mobile: string;
  trade: string;
  contractor: string;
  /** ₹ per day; admins only (null for others). */
  dailyRate: number | null;
  active: boolean;
  mergedInto?: string;
  createdAt: string;
  createdBy: string;
}

export type NewCasualWorker = Pick<CasualWorker, "name" | "mobile" | "trade" | "contractor"> & { dailyRate?: number | null };

/* ---------- inputs ---------- */

export interface SiteEntry {
  personKind: PersonKind;
  personId: string;
  status: AttendanceStatus;
  remarks: string;
}

/** For each conflicting person (key = `${kind}:${id}`): keep the other record or replace it with this one. */
export type Resolutions = Record<string, "keep" | "replace">;

export interface SiteDayInput {
  date: string;
  entries: SiteEntry[];
  photos: PhotoRef[];
  photoLocation: SiteDay["photoLocation"];
  resolutions: Resolutions;
}

export interface RecordPatch {
  status: AttendanceStatus;
  location: WorkLocation | null;
  projectId: string | null;
  remarks?: string;
}

/* ---------- views ---------- */

export interface Conflict {
  key: string;
  personKind: PersonKind;
  personId: string;
  name: string;
  existing: AttendanceRecord;
  /** "Factory", "Office" or "Site – PRJ-2026-001 Poly houses…" */
  where: string;
  loggedByName: string;
}

export interface Counts {
  present: number;
  half: number;
  absent: number;
  holiday: number;
}

export interface ProjectDayRow {
  date: string;
  /** logged = a SiteDay exists; holiday = site / company holiday; missing = Not logged. */
  kind: "logged" | "holiday" | "missing";
  employees: Counts;
  casual: Counts;
  manDays: number;
  loggedBy: string;
  loggedAt: string;
  edited: boolean;
}

export interface DayPerson {
  personKind: PersonKind;
  personId: string;
  name: string;
  /** Designation (employees) or trade (casual workers). */
  role: string;
  record: AttendanceRecord;
}

export interface ProjectDayDetail {
  date: string;
  siteDay: SiteDay | null;
  employees: DayPerson[];
  casual: DayPerson[];
  companyHoliday: boolean;
}

export interface SheetRow {
  employeeId: string;
  code: string;
  name: string;
  mobile: string;
  designation: string;
  department: string;
  record: AttendanceRecord | null;
  /** The signed-in user may change this row. */
  editable: boolean;
}

export interface SheetSummary extends Counts {
  notLogged: number;
}

export interface CasualDayRow {
  worker: CasualWorker;
  record: AttendanceRecord;
  projectCode: string;
  projectName: string;
}

export interface MonthRow {
  date: string;
  record: AttendanceRecord | null;
}

export interface MonthSummary extends Counts {
  notLogged: number;
  daysWorked: number;
}

export interface RegisterRow {
  employeeId: string;
  code: string;
  name: string;
  department: string;
  /** date → status (absent from map = Not logged; null = not employed that day). */
  days: Record<string, AttendanceStatus | "none" | null>;
  summary: MonthSummary;
}

export interface LabourCost {
  casualManDays: number;
  employeeManDays: number;
  /** Casual man-days × daily rate for workers with a rate. */
  casualCost: number;
  /** Casual man-days of workers without a daily rate (not costed). */
  unratedManDays: number;
}

export interface SheetFilters {
  search?: string;
  status?: AttendanceStatus | "not_logged" | "";
  location?: WorkLocation | "";
  projectId?: string;
  department?: string;
}

export interface MyAttendanceAccess {
  isAdmin: boolean;
  /** Locations the user supervises (Factory / Office). */
  supervises: WorkLocation[];
}

export class AttendanceConflictError extends Error {
  constructor(public readonly conflicts: Conflict[]) {
    super(`${conflicts.length} ${conflicts.length === 1 ? "person is" : "people are"} already marked elsewhere on this day. Choose which record to keep.`);
    this.name = "AttendanceConflictError";
  }
}
