import { CrmNotFoundError, ValidationError } from "@/lib/crm/types";
import type { AppNotification } from "@/lib/notifications/types";
import { ProjectForbiddenError } from "@/lib/projects/types";
import type { AttendanceRepository, ProjectAttendanceAccess } from "./repository";
import {
  AttendanceConflictError,
  type DashboardAttendance,
  type AttendanceRecord,
  type CasualDayRow,
  type CasualWorker,
  type Conflict,
  type LabourCost,
  type MonthRow,
  type MonthSummary,
  type MyAttendanceAccess,
  type NewCasualWorker,
  type PersonKind,
  type ProjectDayDetail,
  type ProjectDayRow,
  type RecordPatch,
  type RegisterRow,
  type SheetFilters,
  type SheetRow,
  type SheetSummary,
  type SiteDay,
  type SiteDayInput,
  type SiteEntry,
  type WorkLocation,
} from "./types";

/**
 * Cloud attendance implementation – NOT USED YET.
 *
 * Expected endpoints (JSON; 403 no access, 404 not found, 409 { conflicts } unresolved conflicts, 422 { issues }):
 *   GET  /attendance/me/access
 *   GET  /projects/:id/attendance/access · GET /projects/:id/attendance?from=&to= · GET /projects/:id/attendance/:date
 *   GET  /projects/:id/attendance/:date/previous
 *   POST /attendance/conflicts { date, people, target }
 *   PUT  /projects/:id/attendance/:date { entries, photos, photoLocation, resolutions }
 *   POST /projects/:id/attendance/:date/holiday
 *   GET  /employees/:id/attendance?month=yyyy-mm
 *   GET  /attendance/day/:date?search=&status=&location=&projectId=&department=
 *   PUT  /attendance/employees/:employeeId/:date  RecordPatch · POST /attendance/bulk { employeeIds, date, patch }
 *   POST /attendance/holidays { date }            GET /attendance/day/:date/casual · GET /attendance/day/:date/sites-not-logged
 *   GET  /attendance/register?month=              (CSV export can be server-side too)
 *   GET  /casual-workers?search=&includeInactive= · POST /casual-workers · PUT /casual-workers/:id · POST /casual-workers/:id/merge { intoId }
 *   GET  /projects/:id/attendance/labour-cost · GET /projects/:id/attendance/man-days
 *
 * The server enforces one record per person per day (unique key), the 7-day window, site manager / supervisor
 * scope, and sends the reminders from a scheduled job (6 PM and 10 AM).
 */
export class ApiAttendanceRepository implements AttendanceRepository {
  readonly label = "Cloud database";
  constructor(private readonly baseUrl: string) {}

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, { credentials: "include", headers: { "Content-Type": "application/json" }, ...init });
    if (res.status === 403) throw new ProjectForbiddenError();
    if (res.status === 404) throw new CrmNotFoundError("Attendance", path);
    if (res.status === 409) throw new AttendanceConflictError(((await res.json()) as { conflicts: Conflict[] }).conflicts);
    if (res.status === 422) throw new ValidationError(((await res.json()) as { issues: string[] }).issues);
    if (!res.ok) throw new Error(`Request failed (${res.status})`);
    return (res.status === 204 ? undefined : await res.json()) as T;
  }
  private send<T>(method: string, path: string, body?: unknown) {
    return this.request<T>(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });
  }
  private qs = (p: object) =>
    new URLSearchParams(Object.entries(p).filter(([, v]) => v !== undefined && v !== "").map(([k, v]) => [k, String(v)])).toString();

  access() {
    return this.request<MyAttendanceAccess>(`/attendance/me/access`);
  }
  projectAccess(projectId: string) {
    return this.request<ProjectAttendanceAccess>(`/projects/${projectId}/attendance/access`);
  }
  projectDays(projectId: string, from: string, to: string) {
    return this.request<ProjectDayRow[]>(`/projects/${projectId}/attendance?${this.qs({ from, to })}`);
  }
  projectDay(projectId: string, date: string) {
    return this.request<ProjectDayDetail>(`/projects/${projectId}/attendance/${date}`);
  }
  previousDay(projectId: string, date: string) {
    return this.request<{ date: string; entries: SiteEntry[] } | null>(`/projects/${projectId}/attendance/${date}/previous`);
  }
  conflicts(date: string, people: { personKind: PersonKind; personId: string }[], target: { location: WorkLocation; projectId: string | null }) {
    return this.send<Conflict[]>("POST", `/attendance/conflicts`, { date, people, target });
  }
  saveSiteDay(projectId: string, input: SiteDayInput) {
    return this.send<SiteDay>("PUT", `/projects/${projectId}/attendance/${input.date}`, input);
  }
  markSiteHoliday(projectId: string, date: string) {
    return this.send<SiteDay>("POST", `/projects/${projectId}/attendance/${date}/holiday`);
  }
  employeeMonth(employeeId: string, month: string) {
    return this.request<{ rows: MonthRow[]; summary: MonthSummary }>(`/employees/${employeeId}/attendance?${this.qs({ month })}`);
  }
  daySheet(date: string, filters: SheetFilters = {}) {
    return this.request<{ rows: SheetRow[]; summary: SheetSummary; companyHoliday: boolean }>(`/attendance/day/${date}?${this.qs(filters)}`);
  }
  setRecord(employeeId: string, date: string, patch: RecordPatch) {
    return this.send<AttendanceRecord>("PUT", `/attendance/employees/${employeeId}/${date}`, patch);
  }
  bulkSet(employeeIds: string[], date: string, patch: RecordPatch) {
    return this.send<{ updated: number; skipped: string[] }>("POST", `/attendance/bulk`, { employeeIds, date, patch });
  }
  markDayHoliday(date: string) {
    return this.send<number>("POST", `/attendance/holidays`, { date });
  }
  casualDay(date: string) {
    return this.request<CasualDayRow[]>(`/attendance/day/${date}/casual`);
  }
  dashboardAttendance(from: string, to: string) {
    return this.request<DashboardAttendance>(`/attendance/dashboard?${this.qs({ from, to })}`);
  }
  sitesNotLogged(date: string) {
    return this.request<{ projectId: string; code: string; name: string }[]>(`/attendance/day/${date}/sites-not-logged`);
  }
  register(month: string) {
    return this.request<RegisterRow[]>(`/attendance/register?${this.qs({ month })}`);
  }
  listCasual(params: { search?: string; includeInactive?: boolean } = {}) {
    return this.request<CasualWorker[]>(`/casual-workers?${this.qs(params)}`);
  }
  addCasual(input: NewCasualWorker) {
    return this.send<CasualWorker>("POST", `/casual-workers`, input);
  }
  updateCasual(id: string, input: NewCasualWorker & { active: boolean }) {
    return this.send<CasualWorker>("PUT", `/casual-workers/${id}`, input);
  }
  mergeCasual(fromId: string, intoId: string) {
    return this.send<{ moved: number; dropped: number }>("POST", `/casual-workers/${fromId}/merge`, { intoId });
  }
  labourCost(projectId: string) {
    return this.request<LabourCost>(`/projects/${projectId}/attendance/labour-cost`);
  }
  manDaysByDate(projectId: string) {
    return this.request<Record<string, { employees: number; casual: number }>>(`/projects/${projectId}/attendance/man-days`);
  }
  async reconcileReminders(): Promise<AppNotification[]> {
    // Sent by a server job; nothing to do in the app.
    return [];
  }
}
