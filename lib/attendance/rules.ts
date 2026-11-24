import { addDays, daysBetween } from "@/lib/projects/rules";
import { EDIT_WINDOW_DAYS, SECOND_REMINDER_TIME, dayValue, statusMeta } from "./config";
import type { AttendanceRecord, AttendanceStatus, Counts, MonthSummary, WorkLocation } from "./types";

export { addDays, daysBetween };

export const todayIso = (now = Date.now()) => {
  const d = new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
/** "HH:MM" of a timestamp in local time. */
export const clockOf = (now: number) => {
  const d = new Date(now);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

export const personKey = (kind: string, id: string) => `${kind}:${id}`;
export const emptyCounts = (): Counts => ({ present: 0, half: 0, absent: 0, holiday: 0 });

export function countStatuses(statuses: AttendanceStatus[]): Counts {
  const c = emptyCounts();
  for (const s of statuses) c[s]++;
  return c;
}

/** Present = 1, half day = 0.5. */
export const manDays = (statuses: AttendanceStatus[]) => statuses.reduce((a, s) => a + dayValue(s), 0);

/** Dates from..to inclusive. */
export function dateRange(from: string, to: string): string[] {
  const out: string[] = [];
  if (!from || !to || to < from) return out;
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

export const monthBounds = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const weekday = (iso: string) => WEEKDAYS[new Date(`${iso}T00:00:00Z`).getUTCDay()];
/** "Tue, 24 Nov" */
export const dayLabel = (iso: string) => {
  const [, m, d] = iso.split("-").map(Number);
  return `${weekday(iso)}, ${d} ${MONTHS[m - 1]}`;
};

/** "9 employees (8 present, 1 half day)" or "6 casual workers present" (timeline wording). */
export function describeCounts(n: number, noun: string, c: Counts) {
  const order = ["present", "half", "absent", "holiday"] as const;
  const used = order.filter((s) => c[s]);
  const name = `${n} ${noun}${n === 1 ? "" : "s"}`;
  if (used.length === 1) return `${name} ${statusMeta(used[0]).label.toLowerCase()}`;
  return `${name} (${used.map((s) => `${c[s]} ${statusMeta(s).label.toLowerCase()}`).join(", ")})`;
}

/* ---------- permissions ---------- */

/** Within today and the previous 7 days (the window for site managers and supervisors). */
export const withinWindow = (date: string, today: string) => date <= today && daysBetween(date, today) <= EDIT_WINDOW_DAYS;

export function checkDate(date: string, today: string, isAdmin: boolean): string[] {
  if (!date) return ["Choose the date."];
  if (date > today) return ["Attendance can't be logged for a future date."];
  if (!isAdmin && !withinWindow(date, today)) return [`Only admins can log or change attendance older than ${EDIT_WINDOW_DAYS} days.`];
  return [];
}

/** Employees can be marked from their joining date until their leaving date. */
export function employedOn(e: { dateOfJoining: string; status: string; leaving: { date: string } | null }, date: string) {
  if (e.dateOfJoining && date < e.dateOfJoining) return false;
  if (e.leaving?.date && date > e.leaving.date) return false;
  if (e.status !== "active" && !e.leaving) return false;
  return true;
}

export function checkPatch(p: { status: AttendanceStatus; location: WorkLocation | null; projectId: string | null }): string[] {
  if ((p.status === "present" || p.status === "half") && !p.location) return ["Choose the location (site, factory or office)."];
  if (p.location === "site" && !p.projectId) return ["Choose the project for site attendance."];
  return [];
}

/* ---------- summaries ---------- */

export function monthSummary(statuses: (AttendanceStatus | null)[]): MonthSummary {
  const logged = statuses.filter((s): s is AttendanceStatus => s !== null);
  return { ...countStatuses(logged), notLogged: statuses.length - logged.length, daysWorked: manDays(logged) };
}

export function recordSummary(records: AttendanceRecord[]) {
  return { counts: countStatuses(records.map((r) => r.status)), manDays: manDays(records.map((r) => r.status)) };
}

/* ---------- reminders ---------- */

export interface ReminderDue {
  projectId: string;
  date: string;
  /** 1 = at the reminder time that day; 2 = next morning (Admins too). */
  level: 1 | 2;
}

/**
 * Which site-attendance reminders are due now: today's after its reminder time, and yesterday's second
 * reminder after 10:00 – if the day isn't logged or a holiday.
 */
export function remindersDue(
  projects: { id: string; from: string; reminderTime: string }[],
  isDone: (projectId: string, date: string) => boolean,
  now: number,
): ReminderDue[] {
  const today = todayIso(now);
  const yesterday = addDays(today, -1);
  const clock = clockOf(now);
  const out: ReminderDue[] = [];
  for (const p of projects) {
    if (p.from && today >= p.from && clock >= p.reminderTime && !isDone(p.id, today)) out.push({ projectId: p.id, date: today, level: 1 });
    if (p.from && yesterday >= p.from && !isDone(p.id, yesterday)) {
      out.push({ projectId: p.id, date: yesterday, level: 1 });
      if (clock >= SECOND_REMINDER_TIME) out.push({ projectId: p.id, date: yesterday, level: 2 });
    }
  }
  return out;
}

/* ---------- photo location ---------- */

/** Great-circle distance in metres. */
export function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6_371_000;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

/* ---------- productivity ---------- */

/** Quantity done per man-day, using the project's man-days on the days the task had updates. */
export function productivity(updates: { workDate: string; quantity: number }[], manDaysByDate: Record<string, number>) {
  const days = [...new Set(updates.filter((u) => u.quantity > 0).map((u) => u.workDate))].filter((d) => manDaysByDate[d] > 0);
  if (!days.length) return null;
  const qty = updates.filter((u) => days.includes(u.workDate)).reduce((a, u) => a + u.quantity, 0);
  const md = days.reduce((a, d) => a + manDaysByDate[d], 0);
  return { perManDay: qty / md, days: days.length, manDays: md, quantity: qty };
}
