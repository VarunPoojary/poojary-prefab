/* Site dashboard: progress of every site, what is late and why, crews, and the daily attendance + progress check. */
import type { DashboardAttendance } from "@/lib/attendance/types";
import {
  addDays,
  attendanceOf,
  currentStage,
  daysBetween,
  daysLate,
  forecastCompletion,
  isSiteManager,
  onTeam,
  projectBehind,
  projectPct,
  stageBehind,
  stagePct,
  taskBehind,
  taskPct,
} from "@/lib/projects/rules";
import type { Delay, ProgressUpdate, Project, StageKey } from "@/lib/projects/types";
import { delayBreakdown, lastWorkDate, lookahead, projectPctAt, projectPlannedPct, round1, stagePlannedPct } from "./common";
import type { DailyCheckDay, DayState, ProblemTask, SiteBoard, SiteProjectRow } from "./types";

/** Stages that happen at the site (the lookahead and delay breakdown use these). */
export const SITE_STAGES: StageKey[] = ["transport", "erection", "quality", "handover"];
const DONE = 99.999;
const RATE_DAYS = 7;

export interface SiteInput {
  projects: Project[];
  updates: ProgressUpdate[];
  delays: Delay[];
  clientNames: Record<string, string>;
  attendance: DashboardAttendance;
  today: string;
  /** "HH:MM" now, to know whether today's reminder time has passed. */
  clock: string;
  /** Signed-in employee id. */
  me: string;
}

const counted = (s: string) => s === "present" || s === "half";

/** Attendance + progress state of one project on one day. */
export function dailyCheck(p: Project, date: string, input: SiteInput): DailyCheckDay {
  const att = attendanceOf(p);
  const from = [att.enabledFrom, p.startDate].filter(Boolean).sort().pop() ?? "";
  const day = input.attendance.siteDays.find((d) => d.projectId === p.id && d.date === date);
  const attendance = !!day && !day.holiday;
  const progress = input.updates.some((u) => u.projectId === p.id && u.workDate === date);
  const base = { date, attendance, progress, loggedBy: day?.loggedBy ?? "", loggedAt: day?.loggedAt ?? "" };
  let state: DayState;
  if (!att.enabled || !from || date < from) state = "off";
  else if (day?.holiday || input.attendance.holidays.includes(date)) state = "holiday";
  else if (attendance && progress) state = "done";
  else if (date === input.today && input.clock < (att.reminderTime || input.attendance.reminderTime)) state = "pending";
  else state = attendance || progress ? "partial" : "missing";
  return { ...base, state };
}

function row(p: Project, input: SiteInput): SiteProjectRow {
  const { today } = input;
  const updates = input.updates.filter((u) => u.projectId === p.id);
  const pct = projectPct(p.stages);
  const planned = projectPlannedPct(p, today);
  const forecast = forecastCompletion(p.startDate, pct, today);
  const late = forecast && p.plannedCompletion && forecast > p.plannedCompletion ? daysBetween(p.plannedCompletion, forecast) : 0;

  // Rates: % per day needed to finish on time vs % per day achieved in the last 7 days (replayed from updates).
  const daysLeft = p.plannedCompletion ? daysBetween(today, p.plannedCompletion) : null;
  const requiredPctPerDay = pct < DONE && daysLeft !== null ? (100 - pct) / Math.max(1, daysLeft) : null;
  const gained = Math.max(0, projectPctAt(p, updates, today) - projectPctAt(p, updates, addDays(today, -RATE_DAYS)));
  const achievedPctPerDay = gained / RATE_DAYS;

  // People on this site: today, and per logged day over the previous 7 days.
  const onSite = input.attendance.records.filter((r) => r.location === "site" && r.projectId === p.id && counted(r.status));
  const today_ = onSite.filter((r) => r.date === today);
  const prevDays = new Map<string, number>();
  let manDays7 = 0;
  for (const r of onSite) {
    if (r.date >= addDays(today, -RATE_DAYS) && r.date < today) prevDays.set(r.date, (prevDays.get(r.date) ?? 0) + 1);
    if (r.date > addDays(today, -RATE_DAYS) && r.date <= today) manDays7 += r.status === "half" ? 0.5 : 1;
  }
  const avgWorkers7 = prevDays.size ? [...prevDays.values()].reduce((a, n) => a + n, 0) / prevDays.size : 0;
  const workersToday = { employees: today_.filter((r) => r.personKind === "employee").length, casual: today_.filter((r) => r.personKind === "casual").length };
  const behind = projectBehind(p, today);

  const problemTasks: ProblemTask[] = [];
  for (const s of p.stages) {
    if (s.notApplicable) continue;
    for (const t of s.tasks) {
      const tp = taskPct(t);
      if ((tp ?? 0) >= DONE) continue;
      const end = t.plannedEnd || s.plannedEnd;
      const isBehind = taskBehind({ ...t, plannedStart: t.plannedStart || s.plannedStart, plannedEnd: end }, today);
      if (!isBehind && !t.blocked) continue;
      problemTasks.push({ stageKey: s.key, taskId: t.id, name: t.name, pct: tp, plannedEnd: end, daysLate: daysLate(end, tp ?? 0, today), blockedReason: t.blocked?.reason ?? null, assignedTo: t.assignedTo });
    }
  }
  problemTasks.sort((a, b) => Number(!!b.blockedReason) - Number(!!a.blockedReason) || b.daysLate - a.daysLate);

  const openDelays = new Map<string, { reason: string; count: number; latest: string }>();
  for (const d of input.delays) {
    if (d.projectId !== p.id) continue;
    const stage = p.stages.find((s) => s.key === d.stageKey);
    if (!stage || stagePct(stage) >= DONE) continue; // only delays on unfinished stages are still "open"
    const o = openDelays.get(d.reason) ?? { reason: d.reason, count: 0, latest: "" };
    o.count += 1;
    if (d.recordedAt > o.latest) o.latest = d.recordedAt;
    openDelays.set(d.reason, o);
  }

  const siteManagerIds = [...new Set([p.projectManagerId, ...p.team.filter((m) => m.role === "site").map((m) => m.employeeId)])].filter(
    (id) => id && isSiteManager(p, id, today),
  );
  const days = Array.from({ length: 7 }, (_, i) => dailyCheck(p, addDays(today, i - 6), input));
  const total = workersToday.employees + workersToday.casual;

  return {
    projectId: p.id,
    code: p.code,
    name: p.name,
    clientName: input.clientNames[p.clientId] ?? "",
    siteLocation: p.siteLocation,
    status: p.status === "on_hold" ? "on_hold" : "active",
    projectManagerId: p.projectManagerId,
    siteManagerIds,
    mine: !!input.me && (p.projectManagerId === input.me || onTeam(p, input.me, today)),
    pct: round1(pct),
    plannedPct: planned === null ? null : round1(planned),
    behind,
    currentStage: currentStage(p.stages),
    plannedCompletion: p.plannedCompletion,
    forecast,
    daysLate: late,
    requiredPctPerDay: requiredPctPerDay === null ? null : round1(requiredPctPerDay * 10) / 10,
    achievedPctPerDay: round1(achievedPctPerDay * 10) / 10,
    stages: p.stages.map((s) => {
      const e = s.notApplicable ? null : stagePlannedPct(s, today);
      return { key: s.key, pct: round1(stagePct(s)), expectedPct: e === null ? null : round1(e), behind: stageBehind(s, today), notApplicable: s.notApplicable, plannedEnd: s.plannedEnd };
    }),
    problemTasks,
    openDelays: [...openDelays.values()].sort((a, b) => b.latest.localeCompare(a.latest)),
    workersToday,
    avgWorkers7: round1(avgWorkers7),
    manDays7,
    productivity: manDays7 > 0 ? round1((gained / manDays7) * 100) / 100 : null,
    // Only once today's attendance is in: before that, 0 people today means nothing.
    lowCrew: behind && avgWorkers7 > 0 && days[days.length - 1].attendance && total < avgWorkers7,
    lastUpdate: lastWorkDate(updates),
    attendanceOn: attendanceOf(p).enabled,
    days,
  };
}

/** Behind first, then the most days late, then the furthest behind plan. On-hold projects last. */
export function compareSiteRows(a: SiteProjectRow, b: SiteProjectRow): number {
  if (a.status !== b.status) return a.status === "on_hold" ? 1 : -1;
  if (a.behind !== b.behind) return a.behind ? -1 : 1;
  const gap = (r: SiteProjectRow) => (r.plannedPct ?? r.pct) - r.pct;
  return b.daysLate - a.daysLate || gap(b) - gap(a) || a.code.localeCompare(b.code);
}

export function buildSiteBoard(input: SiteInput): SiteBoard {
  const { today } = input;
  const rows = input.projects.filter((p) => p.status === "active" || p.status === "on_hold").map((p) => row(p, input)).sort(compareSiteRows);
  const active = rows.filter((r) => r.status === "active");
  const activeProjects = input.projects.filter((p) => p.status === "active");

  const unexplained: SiteBoard["unexplained"] = [];
  for (const p of activeProjects)
    for (const s of p.stages) {
      if (s.notApplicable || !s.plannedEnd || s.plannedEnd >= today || stagePct(s) >= DONE) continue;
      const explained = input.delays.some((d) => d.projectId === p.id && d.stageKey === s.key && (d.plannedEnd === s.plannedEnd || d.recordedAt.slice(0, 10) >= s.plannedEnd));
      if (!explained) unexplained.push({ projectId: p.id, code: p.code, stageKey: s.key, plannedEnd: s.plannedEnd, daysLate: daysBetween(s.plannedEnd, today) });
    }

  return {
    today,
    rows,
    summary: {
      active: active.length,
      behind: active.filter((r) => r.behind).length,
      notUpdatedToday: active.filter((r) => {
        const d = r.days[r.days.length - 1];
        return d.state === "missing" || d.state === "partial";
      }).length,
      workersToday: active.reduce((a, r) => a + r.workersToday.employees + r.workersToday.casual, 0),
    },
    lookahead: lookahead(activeProjects, SITE_STAGES, today, 14, (t) => taskBehind(t, today)),
    delays: delayBreakdown(input.projects, input.delays, input.updates, SITE_STAGES, addDays(today, -90), today),
    unexplained: unexplained.sort((a, b) => b.daysLate - a.daysLate),
  };
}
