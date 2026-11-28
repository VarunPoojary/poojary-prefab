import { ADMIN_ROLE, roleHasPage } from "@/lib/auth/roles";
import type { Role } from "@/lib/auth/types";
import { CrmNotFoundError, ValidationError } from "@/lib/crm/types";
import { activeAdminIds } from "@/lib/employees/rules";
import type { PeopleStore } from "@/lib/employees/store";
import type { Employee } from "@/lib/employees/types";
import type { AppNotification, NewNotification } from "@/lib/notifications/types";
import type { NotificationStore } from "@/lib/notifications/store";
import type { EventInput, LocalProjectRepository } from "@/lib/projects/local-repo";
import { attendanceOf, isSiteManager, onTeam } from "@/lib/projects/rules";
import { ProjectForbiddenError, type Project } from "@/lib/projects/types";
import type { SettingsStore } from "@/lib/settings/store";
import { appStorage, type KeyValueStorage } from "@/lib/storage";
import { LOCATIONS, PHOTO_DISTANCE_WARN_M, statusMeta } from "./config";
import type { AttendanceRepository, ProjectAttendanceAccess } from "./repository";
import {
  addDays,
  checkDate,
  clockOf,
  checkPatch,
  countStatuses,
  dateRange,
  dayLabel,
  describeCounts,
  distanceM,
  employedOn,
  manDays,
  monthBounds,
  monthSummary,
  personKey,
  remindersDue,
  todayIso,
  withinWindow,
} from "./rules";
import { seedAttendance } from "./seed";
import {
  AttendanceConflictError,
  type AttendanceRecord,
  type DashboardAttendance,
  type AttendanceSource,
  type AttendanceStatus,
  type CasualDayRow,
  type CasualWorker,
  type Conflict,
  type DayPerson,
  type LabourCost,
  type MyAttendanceAccess,
  type NewCasualWorker,
  type PersonKind,
  type ProjectDayDetail,
  type ProjectDayRow,
  type RecordChange,
  type RecordPatch,
  type RegisterRow,
  type SheetFilters,
  type SheetRow,
  type SiteDay,
  type SiteDayInput,
  type SiteEntry,
  type WorkLocation,
} from "./types";

export const RECORDS_KEY = "pppl.attendance.v1";
export const SITE_DAYS_KEY = "pppl.site-days.v1";
export const CASUAL_KEY = "pppl.casual-workers.v1";
export const HOLIDAYS_KEY = "pppl.attendance-holidays.v1";

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const newId = (p: string) => `${p}_${typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2)}`;
const label = (s: AttendanceStatus) => statusMeta(s).label;

export interface Actor {
  id: string;
  role: Role;
}

export interface CompanyHoliday {
  date: string;
  by: string;
  at: string;
}

export interface LocalAttendanceOptions {
  storage?: () => KeyValueStorage;
  people: PeopleStore;
  settings: SettingsStore;
  projects: Pick<LocalProjectRepository, "readAllProjects" | "readAllUpdates" | "appendEvents">;
  notifications: NotificationStore;
  getActor: () => Promise<Actor | null>;
  latencyMs?: number;
  seed?: boolean;
  now?: () => number;
}

/**
 * TEMPORARY attendance store in the browser's localStorage. Replace with ApiAttendanceRepository
 * (lib/attendance/api-repo.ts) when the cloud database is ready. Permission checks here only protect the UI;
 * the real API must enforce them on the server.
 */
export class LocalAttendanceRepository implements AttendanceRepository {
  readonly label = "This browser (temporary)";
  private readonly storage: () => KeyValueStorage;
  private readonly latencyMs: number;
  private readonly now: () => number;

  constructor(private readonly o: LocalAttendanceOptions) {
    this.storage = o.storage ?? appStorage;
    this.latencyMs = o.latencyMs ?? 100;
    this.now = o.now ?? (() => Date.now());
  }

  /* ---------- storage ---------- */

  private async delay() {
    if (this.latencyMs > 0) await new Promise((r) => setTimeout(r, this.latencyMs));
  }
  private iso() {
    return new Date(this.now()).toISOString();
  }
  private today() {
    return todayIso(this.now());
  }
  private readArr<T>(key: string): T[] {
    try {
      const v = JSON.parse(this.storage().getItem(key) ?? "[]");
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  }
  private write(key: string, v: unknown) {
    this.storage().setItem(key, JSON.stringify(v));
  }
  private ensure() {
    if (this.storage().getItem(RECORDS_KEY) !== null) return;
    if (this.o.seed === false) {
      for (const k of [RECORDS_KEY, SITE_DAYS_KEY, CASUAL_KEY, HOLIDAYS_KEY]) this.write(k, []);
      return;
    }
    const s = seedAttendance(this.now(), this.o.projects.readAllProjects(), this.o.people.employees());
    this.write(RECORDS_KEY, s.records);
    this.write(SITE_DAYS_KEY, s.siteDays);
    this.write(CASUAL_KEY, s.casual);
    this.write(HOLIDAYS_KEY, s.holidays);
    this.o.projects.appendEvents(s.events);
  }
  private records(): AttendanceRecord[] {
    this.ensure();
    return this.readArr(RECORDS_KEY);
  }
  private siteDays(): SiteDay[] {
    this.ensure();
    return this.readArr(SITE_DAYS_KEY);
  }
  private casual(): CasualWorker[] {
    this.ensure();
    return this.readArr(CASUAL_KEY);
  }
  private holidays(): CompanyHoliday[] {
    this.ensure();
    return this.readArr(HOLIDAYS_KEY);
  }
  private isCompanyHoliday(date: string) {
    return this.holidays().some((h) => h.date === date);
  }

  /* ---------- people & access ---------- */

  private async actor(): Promise<Actor> {
    await this.delay();
    const a = await this.o.getActor();
    if (!a) throw new ProjectForbiddenError("Please sign in again.");
    return a;
  }
  private async admin(): Promise<Actor> {
    const a = await this.actor();
    if (a.role !== "admin") throw new ProjectForbiddenError("Only admins can do this.");
    return a;
  }
  private employees() {
    return this.o.people.employees();
  }
  private employee(id: string) {
    const e = this.employees().find((x) => x.id === id);
    if (!e) throw new CrmNotFoundError("Employee", id);
    return e;
  }
  private project(id: string) {
    const p = this.o.projects.readAllProjects().find((x) => x.id === id);
    if (!p) throw new CrmNotFoundError("Project", id);
    return p;
  }
  private supervises(a: Actor): WorkLocation[] {
    // A role with the Attendance page marks factory and office attendance like a supervisor of both.
    if (a.role !== ADMIN_ROLE && roleHasPage(a.role, "attendance")) return ["factory", "office"];
    const s = this.o.settings.read().attendance.supervisors;
    return (["factory", "office"] as const).filter((l) => s[l].includes(a.id));
  }
  private isSiteManager(p: Project, employeeId: string, date: string) {
    return isSiteManager(p, employeeId, date);
  }
  private projectAccessFor(p: Project, a: Actor): ProjectAttendanceAccess {
    const today = this.today();
    const isAdmin = a.role === "admin";
    const canView = isAdmin || onTeam(p, a.id, today);
    return { isAdmin, canView, canLog: isAdmin || (canView && this.isSiteManager(p, a.id, today)) };
  }
  private nameOf(kind: PersonKind, id: string) {
    if (kind === "employee") return this.employees().find((e) => e.id === id)?.fullName ?? id;
    return this.casual().find((c) => c.id === id)?.name ?? id;
  }
  private whereOf(r: AttendanceRecord) {
    if (r.location === "site") {
      const p = this.o.projects.readAllProjects().find((x) => x.id === r.projectId);
      return p ? `Site – ${p.code} ${p.name}` : "Site";
    }
    return r.location ? LOCATIONS.find((l) => l.value === r.location)!.label : "no location";
  }
  private stripRate(w: CasualWorker, a: Actor): CasualWorker {
    return a.role === "admin" ? clone(w) : { ...clone(w), dailyRate: null };
  }

  async access(): Promise<MyAttendanceAccess> {
    const a = await this.actor();
    return { isAdmin: a.role === "admin", supervises: this.supervises(a) };
  }

  /** Writes or updates one record (one per person per day), keeping the old values in its history. */
  private upsert(
    list: AttendanceRecord[],
    a: Actor,
    kind: PersonKind,
    personId: string,
    date: string,
    patch: RecordPatch,
    source: AttendanceSource,
    note?: string,
  ): { record: AttendanceRecord; before: AttendanceRecord | null } {
    const i = list.findIndex((r) => r.personKind === kind && r.personId === personId && r.date === date);
    const next = { status: patch.status, location: patch.location, projectId: patch.location === "site" ? patch.projectId : null, remarks: (patch.remarks ?? "").trim() };
    if (i < 0) {
      const record: AttendanceRecord = { id: newId("att"), personKind: kind, personId, date, ...next, source, loggedBy: a.id, loggedAt: this.iso(), history: [] };
      list.push(record);
      return { record, before: null };
    }
    const cur = list[i];
    const from: RecordChange["from"] = {};
    const to: RecordChange["to"] = {};
    for (const k of ["status", "location", "projectId", "remarks"] as const) {
      if (cur[k] !== next[k]) {
        (from as Record<string, unknown>)[k] = cur[k];
        (to as Record<string, unknown>)[k] = next[k];
      }
    }
    if (!Object.keys(to).length) return { record: cur, before: cur };
    const record: AttendanceRecord = { ...cur, ...next, source, loggedBy: a.id, loggedAt: this.iso(), history: [...cur.history, { at: this.iso(), by: a.id, from, to, note }] };
    list[i] = record;
    return { record, before: cur };
  }

  /* ---------- project tab ---------- */

  async projectAccess(projectId: string) {
    const a = await this.actor();
    return this.projectAccessFor(this.project(projectId), a);
  }

  private viewProject(projectId: string, a: Actor) {
    const p = this.project(projectId);
    if (!this.projectAccessFor(p, a).canView) throw new ProjectForbiddenError("You are not on this project's team.");
    return p;
  }

  async projectDays(projectId: string, from: string, to: string): Promise<ProjectDayRow[]> {
    const a = await this.actor();
    const p = this.viewProject(projectId, a);
    const today = this.today();
    const end = [to, today, p.status === "completed" && p.actualCompletion ? p.actualCompletion : today].sort()[0];
    const recs = this.records().filter((r) => r.location === "site" && r.projectId === projectId && r.date >= from && r.date <= end);
    const days = new Map(this.siteDays().filter((d) => d.projectId === projectId && d.date >= from && d.date <= end).map((d) => [d.date, d]));
    const dates = new Set<string>([...recs.map((r) => r.date), ...days.keys()]);
    const att = attendanceOf(p);
    if (att.enabled) {
      const start = [from, att.enabledFrom || p.startDate, p.startDate].filter(Boolean).sort().pop()!;
      // Today only counts as "Not logged" once its reminder time has passed.
      const reminderTime = att.reminderTime || this.o.settings.read().attendance.reminderTime;
      const last = end === today && clockOf(this.now()) < reminderTime ? addDays(today, -1) : end;
      for (const d of dateRange(start, last)) dates.add(d);
    }
    return [...dates]
      .sort((x, y) => y.localeCompare(x))
      .map((date) => {
        const day = days.get(date);
        const mine = recs.filter((r) => r.date === date);
        const emp = mine.filter((r) => r.personKind === "employee").map((r) => r.status);
        const cas = mine.filter((r) => r.personKind === "casual").map((r) => r.status);
        const kind: ProjectDayRow["kind"] = day && !day.holiday ? "logged" : day?.holiday || this.isCompanyHoliday(date) ? "holiday" : mine.length ? "logged" : "missing";
        return {
          date,
          kind,
          employees: countStatuses(emp),
          casual: countStatuses(cas),
          manDays: manDays([...emp, ...cas]),
          loggedBy: day?.loggedBy ?? mine[0]?.loggedBy ?? "",
          loggedAt: day?.loggedAt ?? mine[0]?.loggedAt ?? "",
          edited: !!day?.editedAt || mine.some((r) => r.history.length > 0),
        };
      });
  }

  private dayPeople(records: AttendanceRecord[]): { employees: DayPerson[]; casual: DayPerson[] } {
    const emps = new Map(this.employees().map((e) => [e.id, e]));
    const cas = new Map(this.casual().map((c) => [c.id, c]));
    const trades = this.o.settings.read().lists.trades;
    const tradeLabel = (v: string) => trades.find((t) => t.value === v)?.label ?? v;
    const toPerson = (r: AttendanceRecord): DayPerson =>
      r.personKind === "employee"
        ? { personKind: r.personKind, personId: r.personId, name: emps.get(r.personId)?.fullName ?? r.personId, role: emps.get(r.personId)?.designation ?? "", record: clone(r) }
        : { personKind: r.personKind, personId: r.personId, name: cas.get(r.personId)?.name ?? r.personId, role: tradeLabel(cas.get(r.personId)?.trade ?? ""), record: clone(r) };
    const sort = (x: DayPerson, y: DayPerson) => x.name.localeCompare(y.name);
    return {
      employees: records.filter((r) => r.personKind === "employee").map(toPerson).sort(sort),
      casual: records.filter((r) => r.personKind === "casual").map(toPerson).sort(sort),
    };
  }

  async projectDay(projectId: string, date: string): Promise<ProjectDayDetail> {
    const a = await this.actor();
    this.viewProject(projectId, a);
    const recs = this.records().filter((r) => r.location === "site" && r.projectId === projectId && r.date === date);
    return {
      date,
      siteDay: clone(this.siteDays().find((d) => d.projectId === projectId && d.date === date) ?? null),
      companyHoliday: this.isCompanyHoliday(date),
      ...this.dayPeople(recs),
    };
  }

  async previousDay(projectId: string, date: string) {
    const a = await this.actor();
    this.viewProject(projectId, a);
    const earlier = this.records().filter((r) => r.location === "site" && r.projectId === projectId && r.date < date);
    if (!earlier.length) return null;
    const last = earlier.reduce((m, r) => (r.date > m ? r.date : m), "");
    const casual = new Map(this.casual().map((c) => [c.id, c]));
    const entries = earlier
      .filter((r) => r.date === last)
      // Only people who can still be marked: employees still employed, casual workers still active.
      .filter((r) => (r.personKind === "employee" ? employedOn(this.employee(r.personId), date) : casual.get(r.personId)?.active))
      .map((r): SiteEntry => ({ personKind: r.personKind, personId: r.personId, status: "present", remarks: "" }));
    return { date: last, entries };
  }

  private findConflicts(date: string, people: { personKind: PersonKind; personId: string }[], target: { location: WorkLocation; projectId: string | null }): Conflict[] {
    const keys = new Set(people.map((x) => personKey(x.personKind, x.personId)));
    return this.records()
      .filter((r) => r.date === date && keys.has(personKey(r.personKind, r.personId)))
      .filter((r) => !(r.location === target.location && (target.location !== "site" || r.projectId === target.projectId)))
      // A holiday / absence without a location doesn't block marking the person somewhere.
      .filter((r) => r.location !== null)
      .map((r) => ({
        key: personKey(r.personKind, r.personId),
        personKind: r.personKind,
        personId: r.personId,
        name: this.nameOf(r.personKind, r.personId),
        existing: clone(r),
        where: this.whereOf(r),
        loggedByName: this.nameOf("employee", r.loggedBy),
      }));
  }

  async conflicts(date: string, people: { personKind: PersonKind; personId: string }[], target: { location: WorkLocation; projectId: string | null }) {
    await this.actor();
    return this.findConflicts(date, people, target);
  }

  private checkCanLog(p: Project, a: Actor, date: string) {
    const acc = this.projectAccessFor(p, a);
    if (!acc.canLog) throw new ProjectForbiddenError("Only the project manager, site engineers / erection supervisors and admins can log site attendance.");
    const issues = checkDate(date, this.today(), acc.isAdmin);
    if (issues.length) throw new ValidationError(issues);
    if (!acc.isAdmin && (!attendanceOf(p).enabled || p.status !== "active")) throw new ValidationError(["Site attendance is switched off for this project."]);
    if (date < p.startDate && !acc.isAdmin) throw new ValidationError(["The date is before the project start."]);
  }

  async saveSiteDay(projectId: string, input: SiteDayInput): Promise<SiteDay> {
    const a = await this.actor();
    const p = this.project(projectId);
    const { date } = input;
    this.checkCanLog(p, a, date);
    const days = this.siteDays();
    const existingDay = days.find((d) => d.projectId === projectId && d.date === date);
    if (!input.entries.length) throw new ValidationError(["Add at least one person, or mark the day as a site holiday."]);
    if (!input.photos.length && !(existingDay && existingDay.photos.length)) throw new ValidationError(["Take a group photo of the crew before saving."]);
    const seen = new Set<string>();
    const emps = new Map(this.employees().map((e) => [e.id, e]));
    const cas = new Map(this.casual().map((c) => [c.id, c]));
    for (const e of input.entries) {
      const k = personKey(e.personKind, e.personId);
      if (seen.has(k)) throw new ValidationError([`${this.nameOf(e.personKind, e.personId)} is in the list twice.`]);
      seen.add(k);
      if (e.personKind === "employee") {
        const emp = emps.get(e.personId);
        if (!emp) throw new CrmNotFoundError("Employee", e.personId);
        if (!employedOn(emp, date)) throw new ValidationError([`${emp.fullName} can't be marked on this day (not employed then).`]);
      } else if (!cas.has(e.personId)) throw new CrmNotFoundError("Casual worker", e.personId);
    }

    const target = { location: "site" as const, projectId };
    const conflicts = this.findConflicts(date, input.entries, target);
    const unresolved = conflicts.filter((c) => !input.resolutions[c.key]);
    if (unresolved.length) throw new AttendanceConflictError(unresolved);
    const keep = new Set(conflicts.filter((c) => input.resolutions[c.key] === "keep").map((c) => c.key));

    const list = this.records();
    const before = list.filter((r) => r.location === "site" && r.projectId === projectId && r.date === date).map(clone);
    const otherProjectEvents: { projectId: string; by: string; event: EventInput }[] = [];
    const changes: string[] = [];
    const entries = input.entries.filter((e) => !keep.has(personKey(e.personKind, e.personId)));
    for (const e of entries) {
      const conflict = conflicts.find((c) => c.key === personKey(e.personKind, e.personId));
      const { record, before: prev } = this.upsert(
        list,
        a,
        e.personKind,
        e.personId,
        date,
        { status: e.status, location: "site", projectId, remarks: e.remarks },
        "project",
        conflict ? `Replaced ${conflict.where} by site attendance for ${p.code}` : undefined,
      );
      const name = this.nameOf(e.personKind, e.personId);
      if (conflict?.existing.location === "site" && conflict.existing.projectId)
        otherProjectEvents.push({ projectId: conflict.existing.projectId, by: a.id, event: { type: "attendance", text: `Attendance for ${dayLabel(date)} edited: ${name} moved to ${p.code}` } });
      if (prev && (prev.location !== "site" || prev.projectId !== projectId)) changes.push(`${name} added (${label(record.status)})`);
      else if (prev && prev.status !== record.status) changes.push(`${name} changed ${label(prev.status)} → ${label(record.status)}`);
      else if (!prev && existingDay) changes.push(`${name} added (${label(record.status)})`);
    }
    // People taken off the list are removed from this site for the day.
    const kept = new Set(entries.map((e) => personKey(e.personKind, e.personId)));
    const removed = before.filter((r) => !kept.has(personKey(r.personKind, r.personId)) && !keep.has(personKey(r.personKind, r.personId)));
    for (const r of removed) changes.push(`${this.nameOf(r.personKind, r.personId)} removed`);
    const removedIds = new Set(removed.map((r) => r.id));
    this.write(RECORDS_KEY, list.filter((r) => !removedIds.has(r.id)));

    const distance = input.photoLocation && p.lat !== null && p.lng !== null ? distanceM(input.photoLocation, { lat: p.lat, lng: p.lng }) : null;
    const day: SiteDay = existingDay
      ? {
          ...existingDay,
          holiday: false,
          photos: [...existingDay.photos, ...input.photos],
          photoLocation: input.photos.length ? input.photoLocation : existingDay.photoLocation,
          photoDistanceM: input.photos.length ? distance : existingDay.photoDistanceM,
          editedBy: a.id,
          editedAt: this.iso(),
        }
      : { id: newId("sday"), projectId, date, holiday: false, photos: input.photos, photoLocation: input.photoLocation, photoDistanceM: distance, loggedBy: a.id, loggedAt: this.iso() };
    this.write(SITE_DAYS_KEY, existingDay ? days.map((d) => (d.id === day.id ? day : d)) : [...days, day]);

    const saved = this.records().filter((r) => r.location === "site" && r.projectId === projectId && r.date === date);
    const emp = saved.filter((r) => r.personKind === "employee");
    const casual = saved.filter((r) => r.personKind === "casual");
    const who = this.nameOf("employee", a.id);
    const far = distance !== null && distance > PHOTO_DISTANCE_WARN_M ? ` (photo taken ${(distance / 1000).toFixed(1)} km from the site pin)` : "";
    const text =
      existingDay && !existingDay.holiday
        ? `Attendance for ${dayLabel(date)} edited: ${changes.join("; ") || "remarks or photo updated"}`
        : `Attendance logged for ${dayLabel(date)}: ${[
            emp.length ? describeCounts(emp.length, "employee", countStatuses(emp.map((r) => r.status))) : "",
            casual.length ? describeCounts(casual.length, "casual worker", countStatuses(casual.map((r) => r.status))) : "",
          ]
            .filter(Boolean)
            .join(", ")} — by ${who}${far}`;
    this.o.projects.appendEvents([
      { projectId, by: a.id, event: { type: "attendance", text, files: input.photos, source: { kind: "section", id: "attendance" } } },
      ...otherProjectEvents,
    ]);
    return clone(day);
  }

  async markSiteHoliday(projectId: string, date: string): Promise<SiteDay> {
    const a = await this.actor();
    const p = this.project(projectId);
    this.checkCanLog(p, a, date);
    if (this.records().some((r) => r.location === "site" && r.projectId === projectId && r.date === date))
      throw new ValidationError(["Attendance is already logged for this day. Remove the people first to mark it a site holiday."]);
    const days = this.siteDays();
    const existing = days.find((d) => d.projectId === projectId && d.date === date);
    const day: SiteDay = existing
      ? { ...existing, holiday: true, editedBy: a.id, editedAt: this.iso() }
      : { id: newId("sday"), projectId, date, holiday: true, photos: [], photoLocation: null, photoDistanceM: null, loggedBy: a.id, loggedAt: this.iso() };
    this.write(SITE_DAYS_KEY, existing ? days.map((d) => (d.id === day.id ? day : d)) : [...days, day]);
    this.o.projects.appendEvents([{ projectId, by: a.id, event: { type: "attendance", text: `${dayLabel(date)} marked as a site holiday — by ${this.nameOf("employee", a.id)}` } }]);
    return clone(day);
  }

  /* ---------- employee tab ---------- */

  async employeeMonth(employeeId: string, month: string) {
    await this.admin();
    const e = this.employee(employeeId);
    const { from, to } = monthBounds(month);
    const start = [from, e.dateOfJoining].sort().pop()!;
    const end = [to, this.today(), e.leaving?.date ?? "9999-12-31"].sort()[0];
    const byDate = new Map(this.records().filter((r) => r.personKind === "employee" && r.personId === employeeId).map((r) => [r.date, r]));
    const rows = dateRange(start, end)
      .reverse()
      .map((date) => ({ date, record: clone(byDate.get(date) ?? null) }));
    return { rows, summary: monthSummary(rows.map((r) => r.record?.status ?? null)) };
  }

  /* ---------- attendance page ---------- */

  private async sheetActor(): Promise<{ a: Actor; supervises: WorkLocation[] }> {
    const a = await this.actor();
    const supervises = this.supervises(a);
    if (a.role !== "admin" && !supervises.length) throw new ProjectForbiddenError("Only admins, roles with the Attendance page and factory / office supervisors can open the Attendance page.");
    return { a, supervises };
  }

  private rowEditable(a: Actor, supervises: WorkLocation[], date: string, record: AttendanceRecord | null) {
    if (a.role === "admin") return true;
    if (!withinWindow(date, this.today())) return false;
    return !record || (record.location !== null && supervises.includes(record.location));
  }

  async daySheet(date: string, filters: SheetFilters = {}) {
    const { a, supervises } = await this.sheetActor();
    const byPerson = new Map(this.records().filter((r) => r.personKind === "employee" && r.date === date).map((r) => [r.personId, r]));
    const all: SheetRow[] = this.employees()
      .filter((e) => employedOn(e, date))
      .map((e) => {
        const record = byPerson.get(e.id) ?? null;
        return {
          employeeId: e.id,
          code: e.code,
          name: e.fullName,
          mobile: e.mobile,
          designation: e.designation,
          department: e.department,
          record: clone(record),
          editable: this.rowEditable(a, supervises, date, record),
        };
      })
      .sort((x, y) => x.name.localeCompare(y.name));
    const { search = "", status = "", location = "", projectId = "", department = "" } = filters;
    const terms = search.toLowerCase().split(/\s+/).filter(Boolean);
    const base = all
      .filter((r) => !department || r.department === department)
      .filter((r) => !location || r.record?.location === location)
      .filter((r) => !projectId || r.record?.projectId === projectId)
      .filter((r) => !terms.length || terms.every((t) => `${r.name} ${r.code} ${r.mobile}`.toLowerCase().includes(t)));
    const summary = { ...countStatuses(base.filter((r) => r.record).map((r) => r.record!.status)), notLogged: base.filter((r) => !r.record).length };
    const rows = base.filter((r) => !status || (status === "not_logged" ? !r.record : r.record?.status === status));
    return { rows, summary, companyHoliday: this.isCompanyHoliday(date) };
  }

  /** Adds a timeline entry on the project(s) when an admin / supervisor changes a site record. */
  private siteEditEvent(a: Actor, date: string, before: AttendanceRecord | null, after: AttendanceRecord) {
    const name = this.nameOf(after.personKind, after.personId);
    const out: { projectId: string; by: string; event: EventInput }[] = [];
    const who = this.nameOf("employee", a.id);
    if (before?.location === "site" && before.projectId && (after.location !== "site" || after.projectId !== before.projectId))
      out.push({ projectId: before.projectId, by: a.id, event: { type: "attendance", text: `Attendance for ${dayLabel(date)} edited by ${who}: ${name} moved to ${this.whereOf(after)}` } });
    if (after.location === "site" && after.projectId) {
      const text =
        before?.location === "site" && before.projectId === after.projectId
          ? before.status !== after.status
            ? `Attendance for ${dayLabel(date)} edited by ${who}: ${name} changed ${label(before.status)} → ${label(after.status)}`
            : ""
          : `Attendance for ${dayLabel(date)} edited by ${who}: ${name} added (${label(after.status)})`;
      if (text) out.push({ projectId: after.projectId, by: a.id, event: { type: "attendance", text } });
    }
    if (out.length) this.o.projects.appendEvents(out);
  }

  private applyEmployeePatch(list: AttendanceRecord[], a: Actor, supervises: WorkLocation[], e: Employee, date: string, patch: RecordPatch) {
    const isAdmin = a.role === "admin";
    const issues = [...checkDate(date, this.today(), isAdmin), ...checkPatch(patch)];
    if (issues.length) throw new ValidationError(issues);
    if (!employedOn(e, date)) throw new ValidationError([`${e.fullName} can't be marked on this day (not employed then).`]);
    const existing = list.find((r) => r.personKind === "employee" && r.personId === e.id && r.date === date) ?? null;
    if (!isAdmin) {
      if (!patch.location || !supervises.includes(patch.location))
        throw new ProjectForbiddenError(`You can mark people only at the ${supervises.map((l) => LOCATIONS.find((x) => x.value === l)!.label).join(" / ")}.`);
      if (existing && (existing.location === null || !supervises.includes(existing.location)))
        throw new ValidationError([`${e.fullName} is already marked at ${this.whereOf(existing)} by ${this.nameOf("employee", existing.loggedBy)}.`]);
    }
    if (patch.location === "site") {
      const p = this.project(patch.projectId!);
      if (p.status === "cancelled") throw new ValidationError(["That project is cancelled."]);
    }
    return this.upsert(list, a, "employee", e.id, date, patch, isAdmin ? "admin" : "supervisor");
  }

  async setRecord(employeeId: string, date: string, patch: RecordPatch) {
    const { a, supervises } = await this.sheetActor();
    const list = this.records();
    const { record, before } = this.applyEmployeePatch(list, a, supervises, this.employee(employeeId), date, patch);
    this.write(RECORDS_KEY, list);
    this.siteEditEvent(a, date, before, record);
    return clone(record);
  }

  async bulkSet(employeeIds: string[], date: string, patch: RecordPatch) {
    const { a, supervises } = await this.sheetActor();
    const issues = [...checkDate(date, this.today(), a.role === "admin"), ...checkPatch(patch)];
    if (issues.length) throw new ValidationError(issues);
    const list = this.records();
    const skipped: string[] = [];
    const pending: [AttendanceRecord | null, AttendanceRecord][] = [];
    for (const id of employeeIds) {
      const e = this.employee(id);
      try {
        const { record, before } = this.applyEmployeePatch(list, a, supervises, e, date, patch);
        pending.push([before ? clone(before) : null, record]);
      } catch (err) {
        skipped.push(`${e.fullName}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    this.write(RECORDS_KEY, list);
    for (const [before, after] of pending) this.siteEditEvent(a, date, before, after);
    return { updated: pending.length, skipped };
  }

  async markDayHoliday(date: string) {
    const a = await this.admin();
    const issues = checkDate(date, this.today(), true);
    if (issues.length) throw new ValidationError(issues);
    const list = this.records();
    const marked = new Set(list.filter((r) => r.personKind === "employee" && r.date === date).map((r) => r.personId));
    let n = 0;
    for (const e of this.employees()) {
      if (!employedOn(e, date) || marked.has(e.id)) continue;
      this.upsert(list, a, "employee", e.id, date, { status: "holiday", location: null, projectId: null, remarks: "" }, "admin");
      n++;
    }
    this.write(RECORDS_KEY, list);
    if (!this.isCompanyHoliday(date)) this.write(HOLIDAYS_KEY, [...this.holidays(), { date, by: a.id, at: this.iso() }]);
    return n;
  }

  async casualDay(date: string): Promise<CasualDayRow[]> {
    const { a } = await this.sheetActor();
    const workers = new Map(this.casual().map((c) => [c.id, c]));
    const projects = new Map(this.o.projects.readAllProjects().map((p) => [p.id, p]));
    return this.records()
      .filter((r) => r.personKind === "casual" && r.date === date && workers.has(r.personId))
      .map((r) => ({
        worker: this.stripRate(workers.get(r.personId)!, a),
        record: clone(r),
        projectCode: projects.get(r.projectId ?? "")?.code ?? "",
        projectName: projects.get(r.projectId ?? "")?.name ?? "",
      }))
      .sort((x, y) => x.projectCode.localeCompare(y.projectCode) || x.worker.name.localeCompare(y.worker.name));
  }

  private loggableProjects() {
    return this.o.projects.readAllProjects().filter((p) => p.status === "active" && attendanceOf(p).enabled);
  }
  private isDayDone(projectId: string, date: string) {
    return this.isCompanyHoliday(date) || this.siteDays().some((d) => d.projectId === projectId && d.date === date);
  }

  async dashboardAttendance(from: string, to: string): Promise<DashboardAttendance> {
    const a = await this.actor();
    if (!roleHasPage(a.role, "factory-dashboard") && !roleHasPage(a.role, "site-dashboard"))
      throw new ProjectForbiddenError("Your role doesn't include a dashboard.");
    const inRange = (d: string) => d >= from && d <= to;
    return {
      records: this.records()
        .filter((r) => inRange(r.date))
        .map((r) => ({ personKind: r.personKind, personId: r.personId, date: r.date, status: r.status, location: r.location, projectId: r.projectId })),
      siteDays: this.siteDays()
        .filter((d) => inRange(d.date))
        .map((d) => ({ projectId: d.projectId, date: d.date, holiday: d.holiday, loggedBy: d.loggedBy, loggedAt: d.loggedAt })),
      holidays: this.holidays().map((h) => h.date).filter(inRange),
      reminderTime: this.o.settings.read().attendance.reminderTime,
    };
  }

  async sitesNotLogged(date: string) {
    await this.sheetActor();
    return this.loggableProjects()
      .filter((p) => date >= [attendanceOf(p).enabledFrom, p.startDate].sort().pop()! && !this.isDayDone(p.id, date))
      .map((p) => ({ projectId: p.id, code: p.code, name: p.name }));
  }

  async register(month: string): Promise<RegisterRow[]> {
    await this.admin();
    const { from, to } = monthBounds(month);
    const end = [to, this.today()].sort()[0];
    const dates = dateRange(from, to);
    const recs = this.records().filter((r) => r.personKind === "employee" && r.date >= from && r.date <= to);
    return this.employees()
      .filter((e) => dates.some((d) => d <= end && employedOn(e, d)))
      .map((e) => {
        const mine = new Map(recs.filter((r) => r.personId === e.id).map((r) => [r.date, r.status]));
        const days: RegisterRow["days"] = {};
        const counted: (AttendanceStatus | null)[] = [];
        for (const d of dates) {
          if (d > end || !employedOn(e, d)) days[d] = null;
          else {
            days[d] = mine.get(d) ?? "none";
            counted.push(mine.get(d) ?? null);
          }
        }
        return { employeeId: e.id, code: e.code, name: e.fullName, department: e.department, days, summary: monthSummary(counted) };
      })
      .sort((x, y) => x.name.localeCompare(y.name));
  }

  /* ---------- casual workers ---------- */

  async listCasual(params: { search?: string; includeInactive?: boolean } = {}) {
    const a = await this.actor();
    const terms = (params.search ?? "").toLowerCase().split(/\s+/).filter(Boolean);
    return this.casual()
      .filter((c) => !c.mergedInto && (params.includeInactive || c.active))
      .filter((c) => !terms.length || terms.every((t) => `${c.name} ${c.mobile} ${c.contractor}`.toLowerCase().includes(t)))
      .sort((x, y) => x.name.localeCompare(y.name))
      .map((c) => this.stripRate(c, a));
  }

  private checkCasual(input: NewCasualWorker, excludeId?: string) {
    const issues: string[] = [];
    if (!input.name.trim()) issues.push("Enter the worker's name.");
    if (!input.trade) issues.push("Choose the trade.");
    const mobile = input.mobile.replace(/\D/g, "");
    if (mobile && mobile.length !== 10 && !(mobile.length === 12 && mobile.startsWith("91"))) issues.push("Enter a 10-digit mobile number, or leave it empty.");
    if (input.dailyRate !== undefined && input.dailyRate !== null && !(input.dailyRate >= 0)) issues.push("The daily rate can't be negative.");
    const same = this.casual().find(
      (c) => c.id !== excludeId && !c.mergedInto && c.name.trim().toLowerCase() === input.name.trim().toLowerCase() && (c.mobile || "") === (input.mobile.trim() || ""),
    );
    if (same) issues.push(`${same.name} is already in the register${same.mobile ? ` (${same.mobile})` : ""}. Pick them from the search instead.`);
    if (issues.length) throw new ValidationError(issues);
  }

  async addCasual(input: NewCasualWorker) {
    const a = await this.actor();
    const today = this.today();
    const canAdd = a.role === "admin" || this.o.projects.readAllProjects().some((p) => p.status === "active" && this.isSiteManager(p, a.id, today));
    if (!canAdd) throw new ProjectForbiddenError("Only site managers and admins can add casual workers.");
    this.checkCasual(input);
    const w: CasualWorker = {
      id: newId("cw"),
      name: input.name.trim().replace(/\s+/g, " "),
      mobile: input.mobile.trim(),
      trade: input.trade,
      contractor: input.contractor.trim(),
      dailyRate: a.role === "admin" ? input.dailyRate ?? null : null,
      active: true,
      createdAt: this.iso(),
      createdBy: a.id,
    };
    this.write(CASUAL_KEY, [...this.casual(), w]);
    return this.stripRate(w, a);
  }

  async updateCasual(id: string, input: NewCasualWorker & { active: boolean }) {
    const a = await this.admin();
    const list = this.casual();
    const cur = list.find((c) => c.id === id);
    if (!cur) throw new CrmNotFoundError("Casual worker", id);
    this.checkCasual(input, id);
    const next = { ...cur, name: input.name.trim(), mobile: input.mobile.trim(), trade: input.trade, contractor: input.contractor.trim(), dailyRate: input.dailyRate ?? null, active: input.active };
    this.write(CASUAL_KEY, list.map((c) => (c.id === id ? next : c)));
    return this.stripRate(next, a);
  }

  async mergeCasual(fromId: string, intoId: string) {
    await this.admin();
    if (fromId === intoId) throw new ValidationError(["Choose a different worker to merge into."]);
    const workers = this.casual();
    const from = workers.find((c) => c.id === fromId);
    const into = workers.find((c) => c.id === intoId && !c.mergedInto);
    if (!from || !into) throw new CrmNotFoundError("Casual worker", !from ? fromId : intoId);
    const list = this.records();
    const intoDates = new Set(list.filter((r) => r.personKind === "casual" && r.personId === intoId).map((r) => r.date));
    let moved = 0;
    let dropped = 0;
    const next = list.flatMap((r) => {
      if (r.personKind !== "casual" || r.personId !== fromId) return [r];
      if (intoDates.has(r.date)) {
        dropped++;
        return [];
      }
      moved++;
      return [{ ...r, personId: intoId }];
    });
    this.write(RECORDS_KEY, next);
    this.write(CASUAL_KEY, workers.map((c) => (c.id === fromId ? { ...c, active: false, mergedInto: intoId } : c)));
    return { moved, dropped };
  }

  /* ---------- project metrics ---------- */

  /** Raw records for other browser modules (expenses, payroll); no permission check – callers check access. */
  readAllRecords(): AttendanceRecord[] {
    return clone(this.records());
  }
  /** Raw casual workers register (with daily rates) for other browser modules. */
  readCasualWorkers(): CasualWorker[] {
    return clone(this.casual());
  }

  async labourCost(projectId: string): Promise<LabourCost> {
    await this.admin();
    const rates = new Map(this.casual().map((c) => [c.id, c.dailyRate]));
    const recs = this.records().filter((r) => r.location === "site" && r.projectId === projectId);
    let casualCost = 0;
    let unratedManDays = 0;
    let casualManDays = 0;
    let employeeManDays = 0;
    for (const r of recs) {
      const v = manDays([r.status]);
      if (r.personKind === "employee") employeeManDays += v;
      else {
        casualManDays += v;
        const rate = rates.get(r.personId);
        if (rate) casualCost += v * rate;
        else unratedManDays += v;
      }
    }
    return { casualManDays, employeeManDays, casualCost: Math.round(casualCost), unratedManDays };
  }

  async manDaysByDate(projectId: string) {
    const a = await this.actor();
    this.viewProject(projectId, a);
    const out: Record<string, { employees: number; casual: number }> = {};
    for (const r of this.records()) {
      if (r.location !== "site" || r.projectId !== projectId) continue;
      const o = (out[r.date] ??= { employees: 0, casual: 0 });
      if (r.personKind === "employee") o.employees += manDays([r.status]);
      else o.casual += manDays([r.status]);
    }
    return out;
  }

  /* ---------- reminders ---------- */

  async reconcileReminders(): Promise<AppNotification[]> {
    const defaultTime = this.o.settings.read().attendance.reminderTime;
    const projects = this.loggableProjects();
    const schedule = projects.map((p) => ({ id: p.id, from: [attendanceOf(p).enabledFrom, p.startDate].sort().pop()!, reminderTime: attendanceOf(p).reminderTime || defaultTime }));
    const due = remindersDue(schedule, (id, date) => this.isDayDone(id, date), this.now());
    // Same timing for progress: a site day needs at least one progress update (holidays excepted).
    const updates = this.o.projects.readAllUpdates();
    const progressDone = (id: string, date: string) =>
      this.isCompanyHoliday(date) ||
      this.siteDays().some((d) => d.projectId === id && d.date === date && d.holiday) ||
      updates.some((u) => u.projectId === id && u.workDate === date);
    const progressDue = remindersDue(schedule, progressDone, this.now());
    if (!due.length && !progressDue.length) return [];
    const admins = activeAdminIds(this.o.people.logins(), this.employees());
    const byId = new Map(projects.map((p) => [p.id, p]));
    const items: NewNotification[] = [];
    for (const d of due) {
      const p = byId.get(d.projectId)!;
      const managers = [...new Set([p.projectManagerId, ...p.team.filter((m) => m.role === "site").map((m) => m.employeeId)])].filter((id) => this.isSiteManager(p, id, d.date));
      const recipients = d.level === 2 ? [...new Set([...managers, ...admins])] : managers;
      for (const userId of recipients)
        items.push({
          userId,
          kind: "attendance_due",
          title: d.level === 1 ? `${p.code}: log attendance for ${dayLabel(d.date)}` : `${p.code}: attendance for ${dayLabel(d.date)} still not logged`,
          body: p.name,
          href: `/projects/${p.id}/attendance?log=${d.date}`,
          key: `attendance:${p.id}:${d.date}:${d.level}`,
        });
    }
    for (const d of progressDue) {
      const p = byId.get(d.projectId)!;
      const managers = [...new Set([p.projectManagerId, ...p.team.filter((m) => m.role === "site").map((m) => m.employeeId)])].filter((id) => this.isSiteManager(p, id, d.date));
      const recipients = d.level === 2 ? [...new Set([...managers, ...admins])] : managers;
      for (const userId of recipients)
        items.push({
          userId,
          kind: "progress_due",
          title: d.level === 1 ? `${p.code}: post progress for ${dayLabel(d.date)}` : `${p.code}: no progress posted for ${dayLabel(d.date)}`,
          body: p.name,
          href: `/projects/${p.id}/progress`,
          key: `progress:${p.id}:${d.date}:${d.level}`,
        });
    }
    return this.o.notifications.push(items);
  }

  async resetDemoData() {
    for (const k of [RECORDS_KEY, SITE_DAYS_KEY, CASUAL_KEY, HOLIDAYS_KEY]) this.storage().removeItem(k);
    this.ensure();
  }
}

