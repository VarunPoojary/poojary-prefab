import type { TermsParams } from "@/lib/types";
import { BEHIND_TOLERANCE_PTS, BUDGET_GROUPS, FORECAST_MIN_PROGRESS, LEGACY_BUDGET_GROUP, STAGES, type BudgetGroup } from "./config";
import type { Milestone, NewTask, ProjectAttendanceSettings, NewUpdate, Project, ProgressUpdate, ProjectMoney, Stage, StageKey, Task } from "./types";

/* ---------- dates ---------- */

export const todayIso = (now = Date.now()) => {
  const d = new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const dayNo = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86_400_000;
};
export const daysBetween = (a: string, b: string) => dayNo(b) - dayNo(a);
export const addDays = (iso: string, n: number) => {
  const t = new Date((dayNo(iso) + n) * 86_400_000);
  return t.toISOString().slice(0, 10);
};
const round1 = (n: number) => Math.round(n * 10) / 10;

/* ---------- progress formulas (Section 4) ---------- */

/** Task % = completed / total × 100. Null while a quantity task has no total yet (left out of the stage %). */
export function taskPct(t: Pick<Task, "measure" | "total" | "completed">): number | null {
  if (t.measure === "percent") return Math.max(0, Math.min(100, t.completed));
  if (!t.total || t.total <= 0) return null;
  return Math.max(0, Math.min(100, (t.completed / t.total) * 100));
}

/** Stage % = Σ(task % × task weight) / Σ task weight. A stage with no measurable tasks is 0%. */
export function stagePct(s: Pick<Stage, "tasks">): number {
  let sum = 0;
  let w = 0;
  for (const t of s.tasks) {
    const p = taskPct(t);
    if (p === null) continue;
    const weight = t.weight > 0 ? t.weight : 1;
    sum += p * weight;
    w += weight;
  }
  return w ? sum / w : 0;
}

/** Project % = Σ(stage % × stage weight) / Σ weights of applicable stages. */
export function projectPct(stages: Pick<Stage, "tasks" | "weight" | "notApplicable">[]): number {
  let sum = 0;
  let w = 0;
  for (const s of stages) {
    if (s.notApplicable) continue;
    sum += stagePct(s) * s.weight;
    w += s.weight;
  }
  return w ? sum / w : 0;
}

/** Weights rescaled over applicable stages (shown on stage cards). */
export function effectiveWeights(stages: Pick<Stage, "key" | "weight" | "notApplicable">[]): Record<StageKey, number> {
  const total = stages.filter((s) => !s.notApplicable).reduce((a, s) => a + s.weight, 0);
  return Object.fromEntries(stages.map((s) => [s.key, s.notApplicable || !total ? 0 : (s.weight / total) * 100])) as Record<StageKey, number>;
}

const DONE = 99.999;

/** First applicable stage that is not yet at 100%; null when everything is done. */
export function currentStage(stages: Stage[]): StageKey | null {
  return stages.find((s) => !s.notApplicable && stagePct(s) < DONE)?.key ?? null;
}

export type TaskStatus = "not_started" | "in_progress" | "completed" | "blocked";

export function taskStatus(t: Task): TaskStatus {
  if (t.blocked) return "blocked";
  const p = taskPct(t) ?? 0;
  if (p >= DONE) return "completed";
  return t.completed > 0 ? "in_progress" : "not_started";
}

/* ---------- behind schedule ---------- */

/** Straight-line planned % between planned start and end on a given day. */
export function expectedPct(start: string, end: string, today: string): number | null {
  if (!start || !end) return null;
  const span = daysBetween(start, end);
  if (span <= 0) return today >= end ? 100 : 0;
  return Math.max(0, Math.min(100, (daysBetween(start, today) / span) * 100));
}

/** Behind when past planned end and below 100%, or expected % is more than 10 points above actual %. */
export function taskBehind(t: Task, today: string): boolean {
  const actual = taskPct(t) ?? 0;
  if (actual >= DONE || !t.plannedEnd) return false;
  if (today > t.plannedEnd) return true;
  const exp = expectedPct(t.plannedStart, t.plannedEnd, today);
  return exp !== null && exp - actual > BEHIND_TOLERANCE_PTS;
}

export function stageBehind(s: Stage, today: string): boolean {
  if (s.notApplicable) return false;
  if (s.tasks.some((t) => taskBehind(t, today))) return true;
  return !!s.plannedEnd && today > s.plannedEnd && stagePct(s) < DONE;
}

export function projectBehind(p: Pick<Project, "stages" | "status">, today: string): boolean {
  if (p.status === "completed" || p.status === "cancelled") return false;
  return p.stages.some((s) => stageBehind(s, today));
}

/** Days past the planned end for an unfinished task or stage (0 when on time). */
export const daysLate = (plannedEnd: string, pct: number, today: string) =>
  plannedEnd && pct < DONE && today > plannedEnd ? daysBetween(plannedEnd, today) : 0;

/** Stage actual start = first update; actual end = the day it reached 100%. */
export function stageActualDates(stage: Stage, updates: ProgressUpdate[]): { start: string; end: string } {
  const mine = updates.filter((u) => u.stageKey === stage.key).sort((a, b) => a.workDate.localeCompare(b.workDate));
  if (!mine.length) return { start: "", end: "" };
  return { start: mine[0].workDate, end: stagePct(stage) >= DONE ? mine[mine.length - 1].workDate : "" };
}

/* ---------- site attendance ---------- */

/** Attendance settings with defaults for older records: on from the start date. */
export function attendanceOf(p: Pick<Project, "attendance" | "startDate">): ProjectAttendanceSettings {
  return p.attendance ?? { enabled: true, enabledFrom: p.startDate, reminderTime: "" };
}

/* ---------- access ---------- */

/** Is the employee on the project team today (from ≤ today ≤ to)? The project manager always is. */
export function onTeam(p: Pick<Project, "projectManagerId" | "team">, employeeId: string, today: string) {
  if (p.projectManagerId === employeeId) return true;
  return p.team.some((m) => m.employeeId === employeeId && (!m.from || m.from <= today) && (!m.to || m.to >= today));
}

/** Site manager on the date: the project manager, or a team member with the "site" role (site engineer / erection supervisor). */
export function isSiteManager(p: Pick<Project, "projectManagerId" | "team">, employeeId: string, date: string) {
  if (p.projectManagerId === employeeId) return true;
  return p.team.some((m) => m.employeeId === employeeId && m.role === "site" && (!m.from || m.from <= date) && (!m.to || m.to >= date));
}

/* ---------- documents ---------- */

/**
 * The revision that follows `current`: R2 → R3, Rev 4 → Rev 5, R09 → R10, A → B. Nothing yet → R0.
 * Anything it can't step (e.g. "final") → "" so the user types it.
 */
export function nextRevision(current?: string | null): string {
  const r = (current ?? "").trim();
  if (!r) return "R0";
  const num = /^(.*?)(\d+)$/.exec(r);
  if (num) return `${num[1]}${String(Number(num[2]) + 1).padStart(num[2].length, "0")}`;
  if (/^[A-Ya-y]$/.test(r)) return String.fromCharCode(r.charCodeAt(0) + 1);
  return "";
}

/* ---------- forecast ---------- */

/** Expected completion from the actual rate: start + elapsed ÷ progress. Null below 10% or without a start. */
export function forecastCompletion(startDate: string, pct: number, today: string): string | null {
  if (!startDate || pct < FORECAST_MIN_PROGRESS) return null;
  if (pct >= DONE) return today;
  const elapsed = Math.max(1, daysBetween(startDate, today));
  return addDays(startDate, Math.ceil(elapsed / (pct / 100)));
}

/* ---------- schedule helper ---------- */

/** Suggests stage planned dates from the start and planned completion using typical shares (stages overlap). */
export function suggestStageDates(start: string, end: string): Record<StageKey, { start: string; end: string }> {
  const span = Math.max(1, daysBetween(start, end));
  return Object.fromEntries(
    STAGES.map((s) => [s.key, { start: addDays(start, Math.round(span * s.span[0])), end: addDays(start, Math.round(span * s.span[1])) }]),
  ) as Record<StageKey, { start: string; end: string }>;
}

/* ---------- money ---------- */

/** Budget in the work-stage groups; amounts saved under older cost categories are added to their stage group. */
export function normaliseBudget(budget: Record<string, number>): Partial<Record<BudgetGroup, number>> {
  const out: Partial<Record<BudgetGroup, number>> = {};
  for (const [k, v] of Object.entries(budget)) {
    const g = BUDGET_GROUPS.some((x) => x.value === k) ? (k as BudgetGroup) : LEGACY_BUDGET_GROUP[k] ?? "site";
    if (v > 0) out[g] = (out[g] ?? 0) + v;
  }
  return out;
}

export interface MoneyTotals {
  revisedBasic: number;
  revisedWithGst: number;
  variationsTotal: number;
  received: number;
  outstanding: number;
  pctCollected: number;
  budgetTotal: number;
  plannedMargin: number;
  plannedMarginPct: number;
  milestoneReceived: Record<string, number>;
  overdue: Milestone[];
}

export function moneyTotals(m: ProjectMoney, today: string): MoneyTotals {
  const variationsTotal = m.variations.reduce((a, v) => a + v.amount, 0);
  const revisedBasic = m.valueBasic + variationsTotal;
  const revisedWithGst = Math.round(revisedBasic * (1 + (m.gstRate || 0) / 100));
  const received = m.payments.reduce((a, p) => a + p.amount, 0);
  const milestoneReceived: Record<string, number> = {};
  for (const p of m.payments) if (p.milestoneId) milestoneReceived[p.milestoneId] = (milestoneReceived[p.milestoneId] ?? 0) + p.amount;
  const overdue = m.milestones.filter((ms) => ms.expectedDate && ms.expectedDate < today && (milestoneReceived[ms.id] ?? 0) < ms.amount);
  const budgetTotal = Object.values(m.budget).reduce((a, v) => a + (v || 0), 0);
  const plannedMargin = revisedBasic - budgetTotal;
  return {
    revisedBasic,
    revisedWithGst,
    variationsTotal,
    received,
    outstanding: revisedWithGst - received,
    pctCollected: revisedWithGst > 0 ? (received / revisedWithGst) * 100 : 0,
    budgetTotal,
    plannedMargin,
    plannedMarginPct: revisedBasic > 0 ? (plannedMargin / revisedBasic) * 100 : 0,
    milestoneReceived,
    overdue,
  };
}

/** "₹48.0 L" / "₹1.25 Cr" / "₹85,000" for compact columns. */
export function compactRupees(n: number): string {
  const a = Math.abs(n);
  const sign = n < 0 ? "−" : "";
  if (a >= 1e7) return `${sign}₹${(a / 1e7).toFixed(2)} Cr`;
  if (a >= 1e5) return `${sign}₹${(a / 1e5).toFixed(1)} L`;
  return `${sign}₹${a.toLocaleString("en-IN")}`;
}

/** Payment milestones from the accepted quotation's payment terms (clause "payment"). */
export function milestonesFromTerms(params: TermsParams | null | undefined, paymentClauseOn: boolean, valueWithGst: number): Omit<Milestone, "id">[] {
  if (!params || !paymentClauseOn) return [];
  const rows: [string, number | null][] = [
    ["Advance", params.advancePct],
    ["Against material inspection / dispatch", params.inspectionPct],
    ["Balance against running bills / erection", params.balancePct],
  ];
  const valid = rows.filter(([, pct]) => typeof pct === "number" && pct > 0) as [string, number][];
  let left = valueWithGst;
  return valid.map(([name, pct], i) => {
    const amount = i === valid.length - 1 && valid.reduce((a, [, p]) => a + p, 0) === 100 ? left : Math.round((valueWithGst * pct) / 100);
    left -= amount;
    return { name, pct, amount, expectedDate: "" };
  });
}

/* ---------- codes ---------- */

export const formatProjectCode = (year: number, n: number) => `PRJ-${year}-${String(n).padStart(3, "0")}`;

/* ---------- validation ---------- */

export function validateWeights(weights: number[]): string[] {
  if (weights.some((w) => !(w >= 0))) return ["Weights can't be negative."];
  const total = Math.round(weights.reduce((a, w) => a + w, 0) * 100) / 100;
  return total === 100 ? [] : [`The stage weights add up to ${total}%; they must add up to 100%.`];
}

export function validateTask(t: NewTask): string[] {
  const issues: string[] = [];
  if (!t.name.trim()) issues.push("Enter the task name.");
  if (!t.measure) issues.push("Choose Quantity or Percent.");
  if (t.measure === "quantity") {
    if (!t.unit.trim()) issues.push("Choose the unit.");
    if (t.total !== null && !(t.total > 0)) issues.push("The total must be more than 0.");
  }
  if (t.weight !== null && !(t.weight > 0)) issues.push("The task weight must be more than 0.");
  if (t.plannedStart && t.plannedEnd && t.plannedEnd < t.plannedStart) issues.push("The planned end can't be before the planned start.");
  return issues;
}

export interface UpdateCheck {
  /** Change in completed for this update. */
  delta: number;
  runningTotal: number;
  issues: string[];
  /** The task is past its planned end, so a delay reason is required. */
  needsDelayReason: boolean;
}

/** Checks a progress update: no future dates, never above total, negative only for admins (with a note). */
export function checkUpdate(task: Task, input: NewUpdate, opts: { today: string; isAdmin: boolean }): UpdateCheck {
  const issues: string[] = [];
  if (!input.workDate) issues.push("Enter the date the work was done.");
  else if (input.workDate > opts.today) issues.push("The date can't be in the future.");
  if (task.measure === "quantity" && !task.total) issues.push("Set the task's total before posting progress.");
  let delta = 0;
  if (input.value === null || Number.isNaN(input.value)) issues.push(task.measure === "percent" ? "Enter the % reached." : "Enter the quantity done.");
  else delta = task.measure === "percent" ? input.value - task.completed : input.value;
  const max = task.measure === "percent" ? 100 : task.total ?? 0;
  const runningTotal = round1(task.completed + delta);
  if (input.value !== null) {
    if (task.measure === "percent" && (input.value < 0 || input.value > 100)) issues.push("Enter a % between 0 and 100.");
    else if (runningTotal > max + 1e-9) issues.push(`Completed can't go above the total (${max}${task.measure === "percent" ? "%" : ` ${task.unit}`}).`);
    else if (delta < 0) {
      if (!opts.isAdmin) issues.push("Only admins can reduce progress (corrections).");
      else if (!input.remarks.trim()) issues.push("Add a note explaining the correction.");
      if (runningTotal < 0) issues.push("Completed can't go below 0.");
    } else if (delta === 0) issues.push("This update doesn't change the progress.");
  }
  const needsDelayReason = !!task.plannedEnd && (input.workDate || opts.today) > task.plannedEnd;
  if (needsDelayReason && !input.delayReason) issues.push("The task is past its planned end date; choose a delay reason.");
  return { delta, runningTotal, issues, needsDelayReason };
}

/* ---------- planned vs actual (S-curve) ---------- */

export interface CurvePoint {
  date: string;
  planned: number | null;
  actual: number | null;
}

/** Weekly points of planned % (straight line per task) and actual % (replayed from the update history). */
export function sCurve(p: Pick<Project, "stages" | "startDate" | "plannedCompletion">, updates: ProgressUpdate[], today: string): CurvePoint[] {
  const start = p.startDate || updates.map((u) => u.workDate).sort()[0];
  if (!start) return [];
  const lastUpdate = updates.reduce((m, u) => (u.workDate > m ? u.workDate : m), start);
  const end = [p.plannedCompletion, today, lastUpdate].filter(Boolean).sort().pop()!;
  const span = daysBetween(start, end);
  const step = Math.max(1, Math.ceil(span / 40));
  const dates: string[] = [];
  for (let d = 0; d < span; d += step) dates.push(addDays(start, d));
  dates.push(end);

  const sorted = [...updates].sort((a, b) => a.workDate.localeCompare(b.workDate) || a.recordedAt.localeCompare(b.recordedAt));
  return dates.map((date) => {
    const plannedStages = p.stages.map((s) => ({
      ...s,
      tasks: s.tasks.map((t) => {
        const exp = expectedPct(t.plannedStart || s.plannedStart, t.plannedEnd || s.plannedEnd, date);
        return { ...t, measure: "percent" as const, completed: exp ?? 0 };
      }),
    }));
    const hasPlan = p.stages.some((s) => s.tasks.some((t) => (t.plannedEnd || s.plannedEnd) && (t.plannedStart || s.plannedStart)));
    const done = new Map<string, number>();
    for (const u of sorted) {
      if (u.workDate > date) break;
      done.set(u.taskId, u.runningTotal);
    }
    const actualStages = p.stages.map((s) => ({ ...s, tasks: s.tasks.map((t) => ({ ...t, completed: done.get(t.id) ?? 0 })) }));
    return {
      date,
      planned: hasPlan ? round1(projectPct(plannedStages)) : null,
      actual: date <= today ? round1(projectPct(actualStages)) : null,
    };
  });
}
