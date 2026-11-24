import type { AttendanceStatus, WorkLocation } from "./types";

export const STATUSES: { value: AttendanceStatus; label: string; short: string; days: number; badge: string; button: string }[] = [
  { value: "present", label: "Present", short: "P", days: 1, badge: "bg-emerald-100 text-emerald-800", button: "bg-emerald-600 text-white" },
  { value: "half", label: "Half day", short: "½", days: 0.5, badge: "bg-amber-100 text-amber-800", button: "bg-amber-500 text-white" },
  { value: "absent", label: "Absent", short: "A", days: 0, badge: "bg-red-100 text-red-800", button: "bg-red-600 text-white" },
  { value: "holiday", label: "Holiday", short: "H", days: 0, badge: "bg-sky-100 text-sky-800", button: "bg-sky-600 text-white" },
];
export const statusMeta = (s: AttendanceStatus) => STATUSES.find((x) => x.value === s)!;
export const NOT_LOGGED = { label: "Not logged", short: "–", badge: "bg-slate-100 text-slate-500" };

/** Day value for man-days and days worked: Present 1, Half day 0.5. */
export const dayValue = (s: AttendanceStatus) => statusMeta(s).days;

export const LOCATIONS: { value: WorkLocation; label: string }[] = [
  { value: "site", label: "Site" },
  { value: "factory", label: "Factory" },
  { value: "office", label: "Office" },
];
export const locationLabel = (l: WorkLocation | null) => (l ? LOCATIONS.find((x) => x.value === l)!.label : "");

/** Site managers and supervisors may log or edit today and this many days back; older only Admins. */
export const EDIT_WINDOW_DAYS = 7;
export const DEFAULT_REMINDER_TIME = "18:00";
/** The next-morning reminder (also sent to Admins). */
export const SECOND_REMINDER_TIME = "10:00";
/** Group photo further than this from the project's map pin shows a warning. */
export const PHOTO_DISTANCE_WARN_M = 1000;

export const DEFAULT_TRADES: [string, string][] = [
  ["helper", "Helper"],
  ["welder", "Welder"],
  ["fitter", "Fitter"],
  ["rigger", "Rigger"],
  ["fabricator", "Fabricator"],
  ["painter", "Painter"],
  ["driver", "Driver"],
  ["other", "Other"],
];
