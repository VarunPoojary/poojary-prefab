import type { Employee } from "@/lib/employees/types";
import type { EventInput } from "@/lib/projects/local-repo";
import type { Project } from "@/lib/projects/types";
import { addDays, countStatuses, dayLabel, describeCounts, employedOn, todayIso, weekday } from "./rules";
import type { AttendanceRecord, AttendanceStatus, CasualWorker, SiteDay, WorkLocation } from "./types";

/*
 * Demo attendance for the temporary browser store: about 6 weeks for the Nagpur and Sanaswadi sites, the
 * factory and the office, with Sundays, one company holiday and a couple of days left unlogged on purpose
 * (yesterday at the Nagpur site, so its reminders show). Dates are relative to today.
 */

const DAY = 86_400_000;
/** Deterministic 0..1 from a string, so the demo looks the same every time. */
const rand = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10_000) / 10_000;
};

const CASUAL: [string, string, string, string, number | null][] = [
  ["cw_1", "Shankar Gawande", "rigger", "Raju Mukadam", 900],
  ["cw_2", "Vilas Meshram", "fitter", "Raju Mukadam", 850],
  ["cw_3", "Bandu Raut", "helper", "Raju Mukadam", 650],
  ["cw_4", "Santosh Ukey", "helper", "Raju Mukadam", 650],
  ["cw_5", "Ramesh Bhoyar", "welder", "Raju Mukadam", 950],
  ["cw_6", "Gopal Dhurve", "helper", "Raju Mukadam", 650],
  ["cw_7", "Anil Kumbhare", "fitter", "", 800],
  ["cw_8", "Sunil Wanjari", "rigger", "", null],
  ["cw_9", "Mahesh Gaikwad", "helper", "Shinde Labour Contractors", 600],
  ["cw_10", "Dattatray Kale", "helper", "Shinde Labour Contractors", 600],
  ["cw_11", "Nitin Shelar", "driver", "Shinde Labour Contractors", 700],
  ["cw_12", "Ravi Jagtap", "painter", "", null],
];

export function seedAttendance(now: number, projects: Project[], employees: Employee[]) {
  const today = todayIso(now);
  const d = (n: number) => addDays(today, -n);
  // Never later than now (today's demo records would otherwise be "logged" in the future).
  const at = (date: string, hhmm: string) => new Date(Math.min(new Date(`${date}T${hhmm}:00`).getTime(), now)).toISOString();
  const records: AttendanceRecord[] = [];
  const siteDays: SiteDay[] = [];
  const events: { projectId: string; by: string; at?: string; event: EventInput }[] = [];
  const holidays: { date: string; by: string; at: string }[] = [];
  const casual: CasualWorker[] = CASUAL.map(([id, name, trade, contractor, dailyRate], i) => ({
    id,
    name,
    mobile: i % 3 === 0 ? `98${String(23000000 + i * 1371).slice(0, 8)}` : "",
    trade,
    contractor,
    dailyRate,
    active: true,
    createdAt: new Date(now - 45 * DAY).toISOString(),
    createdBy: "u_rahul",
  }));
  const emp = new Map(employees.map((e) => [e.id, e]));
  const marked = new Set<string>();
  const add = (kind: "employee" | "casual", personId: string, date: string, status: AttendanceStatus, location: WorkLocation | null, projectId: string | null, by: string, source: AttendanceRecord["source"], remarks = "") => {
    const key = `${kind}:${personId}:${date}`;
    if (marked.has(key)) return false;
    if (kind === "employee") {
      const e = emp.get(personId);
      if (!e || !employedOn(e, date)) return false;
    }
    marked.add(key);
    records.push({ id: `att_${kind}_${personId}_${date}`, personKind: kind, personId, date, status, location, projectId, remarks, source, loggedBy: by, loggedAt: at(date, "18:40"), history: [] });
    return true;
  };
  const pick = (seed: string): AttendanceStatus => {
    const r = rand(seed);
    return r < 0.06 ? "half" : r < 0.1 ? "absent" : "present";
  };

  // One company holiday (festival) about two weeks ago, moved off a Sunday.
  let festival = d(16);
  if (weekday(festival) === "Sun") festival = addDays(festival, 1);
  holidays.push({ date: festival, by: "u_admin", at: at(addDays(festival, -2), "11:00") });

  const poly = projects.find((p) => p.enquiryId === "e_poly");
  const sanaswadi = projects.find((p) => p.name === "Godown at Sanaswadi");

  /* Sites first, so the people on site that day aren't also marked at the office / factory. */
  const site = (p: Project | undefined, from: number, to: number, skip: number[], crew: (date: string) => { employees: string[]; casual: string[] }, by: string) => {
    if (!p) return;
    for (let n = from; n >= to; n--) {
      const date = d(n);
      if (skip.includes(n) || date === festival) continue;
      if (weekday(date) === "Sun") {
        siteDays.push({ id: `sday_${p.id}_${date}`, projectId: p.id, date, holiday: true, photos: [], photoLocation: null, photoDistanceM: null, loggedBy: by, loggedAt: at(date, "09:00") });
        events.push({ projectId: p.id, by, at: at(date, "09:00"), event: { type: "attendance", text: `${dayLabel(date)} marked as a site holiday — by ${emp.get(by)?.fullName ?? by}` } });
        continue;
      }
      const c = crew(date);
      const es: AttendanceStatus[] = [];
      const cs: AttendanceStatus[] = [];
      for (const id of c.employees) {
        const s = id === by ? "present" : pick(`${id}${date}`);
        if (add("employee", id, date, s, "site", p.id, by, "project", s === "half" ? "Left at 2 PM" : "")) es.push(s);
      }
      for (const id of c.casual) {
        const s = pick(`${id}${date}`);
        if (add("casual", id, date, s, "site", p.id, by, "project")) cs.push(s);
      }
      siteDays.push({ id: `sday_${p.id}_${date}`, projectId: p.id, date, holiday: false, photos: [], photoLocation: null, photoDistanceM: null, loggedBy: by, loggedAt: at(date, "18:40") });
      const parts = [es.length ? describeCounts(es.length, "employee", countStatuses(es)) : "", cs.length ? describeCounts(cs.length, "casual worker", countStatuses(cs)) : ""].filter(Boolean);
      events.push({ projectId: p.id, by, at: at(date, "18:40"), event: { type: "attendance", text: `Attendance logged for ${dayLabel(date)}: ${parts.join(", ")} — by ${emp.get(by)?.fullName ?? by}` } });
    }
  };
  // Nagpur: Rahul (site) and Sunil every day, Ganesh and Priya some days; Raju Mukadam's crew. Not logged 10 days ago and yesterday.
  site(
    poly,
    42,
    2,
    [10],
    (date) => ({
      employees: ["u_rahul", "e_sunil", ...(rand(`g${date}`) < 0.25 ? ["e_ganesh"] : []), ...(rand(`p${date}`) < 0.12 ? ["u_priya"] : [])],
      casual: ["cw_1", "cw_2", "cw_3", "cw_4", "cw_5", "cw_6", "cw_7", "cw_8"].filter((id) => rand(`${id}x${date}`) < 0.85),
    }),
    "u_rahul",
  );
  // Sanaswadi: unloading crew from Shinde Labour Contractors for the last two weeks, logged by Rahul (project manager).
  site(sanaswadi, 14, 1, [], (date) => ({ employees: [], casual: ["cw_9", "cw_10", "cw_11", "cw_12"].filter((id) => rand(`${id}s${date}`) < 0.8) }), "u_rahul");

  /* Factory (Ganesh, marked by the factory supervisor) and office (marked by the office supervisor), from the 1st of last month (payroll). */
  const office = ["u_admin", "u_staff", "u_priya", "u_sneha", "e_kavita", "e_meera"];
  const [ty, tm] = today.split("-").map(Number);
  const lastMonthStart = new Date(Date.UTC(ty, tm - 2, 1)).toISOString().slice(0, 10);
  const thisMonthStart = today.slice(0, 8) + "01";
  const from = Math.max(42, Math.round((new Date(today).getTime() - new Date(lastMonthStart).getTime()) / DAY));
  for (let n = from; n >= 0; n--) {
    const date = d(n);
    const sunday = weekday(date) === "Sun";
    for (const id of office) {
      if (n === 0 && !["u_admin", "u_staff"].includes(id)) continue; // today: the rest not marked yet
      if (date === festival || sunday) add("employee", id, date, "holiday", null, null, "u_staff", "supervisor");
      else {
        const leave = rand(`leave${id}${date}`) < 0.03;
        const s = leave ? "holiday" : pick(`${id}o${date}`);
        add("employee", id, date, s, s === "holiday" ? null : "office", null, "u_staff", "supervisor", leave ? "Approved leave" : "");
      }
    }
    if (n === 0) continue; // factory not marked yet today
    if (date === festival || sunday) add("employee", "e_ganesh", date, "holiday", null, null, "u_rahul", "supervisor");
    else add("employee", "e_ganesh", date, pick(`ganesh${date}`), "factory", null, "u_rahul", "supervisor");
    // Rahul and Sunil: Sundays off; before this month (before the Nagpur site) at the factory.
    for (const id of ["u_rahul", "e_sunil"]) {
      if (date === festival || sunday) add("employee", id, date, "holiday", null, null, "u_rahul", "supervisor");
      else if (date < thisMonthStart) add("employee", id, date, pick(`${id}f${date}`), "factory", null, "u_rahul", "supervisor");
    }
  }
  // Holiday records for everyone else on the festival day.
  for (const e of employees) add("employee", e.id, festival, "holiday", null, null, "u_admin", "admin");

  return { records, siteDays, casual, holidays, events };
}
