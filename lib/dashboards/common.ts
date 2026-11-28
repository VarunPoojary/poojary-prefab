/* Calculations shared by the Factory and Site dashboards. Pure functions: easy to test, no storage. */
import { addDays, daysBetween, expectedPct, projectPct, stagePct, taskPct } from "@/lib/projects/rules";
import type { Delay, ProgressUpdate, Project, Stage, StageKey, Task } from "@/lib/projects/types";
import type { DelayBreakdown, LookaheadItem } from "./types";

export const round1 = (n: number) => Math.round(n * 10) / 10;

/** Planned % of a task today: straight line over its own dates, else its stage's. */
const taskPlanned = (t: Task, s: Stage, date: string) => expectedPct(t.plannedStart || s.plannedStart, t.plannedEnd || s.plannedEnd, date);

/** Planned % of a stage on a date (weighted like stagePct). Null when the stage has no dates. */
export function stagePlannedPct(s: Stage, date: string): number | null {
  const tasks = s.tasks.map((t) => ({ ...t, measure: "percent" as const, completed: taskPlanned(t, s, date) ?? -1 }));
  if (!tasks.some((t) => t.completed >= 0)) {
    const own = expectedPct(s.plannedStart, s.plannedEnd, date);
    return own;
  }
  return stagePct({ tasks: tasks.map((t) => ({ ...t, completed: Math.max(0, t.completed) })) });
}

/** Planned % of the whole project on a date (applicable stages, stage weights). */
export function projectPlannedPct(p: Pick<Project, "stages">, date: string): number | null {
  const hasPlan = p.stages.some((s) => !s.notApplicable && (s.plannedEnd || s.tasks.some((t) => t.plannedEnd)));
  if (!hasPlan) return null;
  const stages = p.stages.map((s) => ({
    ...s,
    tasks: s.tasks.length
      ? s.tasks.map((t) => ({ ...t, measure: "percent" as const, completed: taskPlanned(t, s, date) ?? 0 }))
      : [{ measure: "percent" as const, total: 100, completed: expectedPct(s.plannedStart, s.plannedEnd, date) ?? 0, weight: 1 } as Task],
  }));
  return projectPct(stages);
}

/** Project % on a past date, replaying progress updates (same method as the S-curve). */
export function projectPctAt(p: Pick<Project, "stages">, updates: ProgressUpdate[], date: string): number {
  const done = new Map<string, number>();
  const sorted = [...updates].sort((a, b) => a.workDate.localeCompare(b.workDate) || a.recordedAt.localeCompare(b.recordedAt));
  for (const u of sorted) {
    if (u.workDate > date) break;
    done.set(u.taskId, u.runningTotal);
  }
  return projectPct(p.stages.map((s) => ({ ...s, tasks: s.tasks.map((t) => ({ ...t, completed: done.get(t.id) ?? 0 })) })));
}

/** Most recent work date among updates (optionally of one stage). */
export function lastWorkDate(updates: ProgressUpdate[], stageKey?: StageKey): string | null {
  let last: string | null = null;
  for (const u of updates) if ((!stageKey || u.stageKey === stageKey) && (!last || u.workDate > last)) last = u.workDate;
  return last;
}

/** Open tasks of the given stages with a planned end in [today, today + days], soonest first. */
export function lookahead(projects: Project[], stageKeys: StageKey[], today: string, days: number, isBehind: (t: Task) => boolean): LookaheadItem[] {
  const until = addDays(today, days);
  const out: LookaheadItem[] = [];
  for (const p of projects) {
    if (p.status !== "active") continue;
    for (const s of p.stages) {
      if (s.notApplicable || !stageKeys.includes(s.key)) continue;
      for (const t of s.tasks) {
        const end = t.plannedEnd || s.plannedEnd;
        const pct = taskPct(t);
        if (!end || end < today || end > until || (pct ?? 0) >= 99.999) continue;
        out.push({ date: end, projectId: p.id, code: p.code, projectName: p.name, stageKey: s.key, taskId: t.id, taskName: t.name, pct, behind: isBehind(t), assignedTo: t.assignedTo });
      }
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.code.localeCompare(b.code));
}

/**
 * Delay reasons of the given stages recorded since `since`, with the days the delayed work ran past its planned
 * end: to the day it finished (last update of the task / stage at 100%) or to today while unfinished.
 */
export function delayBreakdown(projects: Project[], delays: Delay[], updates: ProgressUpdate[], stageKeys: StageKey[], since: string, today: string): DelayBreakdown[] {
  const byProject = new Map(projects.map((p) => [p.id, p]));
  const map = new Map<string, DelayBreakdown>();
  for (const d of delays) {
    if (!stageKeys.includes(d.stageKey) || d.recordedAt.slice(0, 10) < since) continue;
    const p = byProject.get(d.projectId);
    if (!p) continue;
    const stage = p.stages.find((s) => s.key === d.stageKey);
    const task = d.taskId ? stage?.tasks.find((t) => t.id === d.taskId) : undefined;
    const finished = task ? (taskPct(task) ?? 0) >= 99.999 : stage ? stagePct(stage) >= 99.999 : false;
    const mine = updates.filter((u) => u.projectId === d.projectId && (d.taskId ? u.taskId === d.taskId : u.stageKey === d.stageKey));
    const endDay = finished ? (lastWorkDate(mine) ?? today) : today;
    const lost = d.plannedEnd ? Math.max(0, daysBetween(d.plannedEnd, endDay)) : 0;
    const row = map.get(d.reason) ?? { reason: d.reason, count: 0, daysLost: 0, projects: [] };
    row.count += 1;
    row.daysLost += lost;
    if (!row.projects.includes(p.code)) row.projects.push(p.code);
    map.set(d.reason, row);
  }
  return [...map.values()].sort((a, b) => b.daysLost - a.daysLost || b.count - a.count);
}

/** Monday of the week containing an ISO date. */
export function weekStart(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const day = new Date(y, m - 1, d).getDay(); // 0 = Sunday
  return addDays(iso, -((day + 6) % 7));
}
