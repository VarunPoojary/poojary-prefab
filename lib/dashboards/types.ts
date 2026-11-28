import type { TaskStatus } from "@/lib/projects/rules";
import type { StatusReason, StageKey } from "@/lib/projects/types";

/* ---------- shared ---------- */

export interface LookaheadItem {
  date: string;
  projectId: string;
  code: string;
  projectName: string;
  stageKey: StageKey;
  taskId: string;
  taskName: string;
  pct: number | null;
  behind: boolean;
  assignedTo: string;
}

export interface DelayBreakdown {
  /** delayReasons list value; labels come from Settings → Lists. */
  reason: string;
  count: number;
  /** Days the delayed work ran past its planned end (to completion, or to today while unfinished). */
  daysLost: number;
  projects: string[];
}

/* ---------- factory ---------- */

export type FactoryHealth = "blocked" | "behind" | "at_risk" | "on_track" | "not_started";

export type ProcessKey = "raw_material" | "cutting" | "welding" | "blasting_painting" | "purlins" | "sheeting" | "other";

export interface FactoryTaskRow {
  id: string;
  name: string;
  process: ProcessKey;
  unit: string;
  total: number | null;
  completed: number;
  pct: number | null;
  plannedEnd: string;
  assignedTo: string;
  status: TaskStatus;
  behind: boolean;
  daysLate: number;
  blockedReason: string | null;
}

export interface FactoryProjectRow {
  projectId: string;
  code: string;
  name: string;
  clientName: string;
  projectManagerId: string;
  status: "active" | "on_hold";
  pin: StatusReason | null;
  health: FactoryHealth;
  /** Factory stage % and the planned % for today. */
  pct: number;
  expectedPct: number | null;
  plannedStart: string;
  plannedEnd: string;
  /** Material must leave the factory by: transport planned start, else factory planned end, else project end. */
  dispatchBy: string;
  /** Negative when the dispatch date has passed. */
  daysToDispatch: number | null;
  /** Days the factory stage is past its planned end (0 when on time). */
  daysLate: number;
  /** Days to spare at the current rate (negative = will miss the dispatch date). Null when there's no rate yet. */
  slackDays: number | null;
  totalMt: number;
  doneMt: number;
  remainingMt: number;
  /** MT per week needed to finish by the dispatch date. */
  requiredMtPerWeek: number | null;
  /** Average MT per week over the last 4 weeks. */
  actualMtPerWeek: number;
  lastUpdate: string | null;
  latestDelay: { reason: string; recordedAt: string } | null;
  tasks: FactoryTaskRow[];
}

export interface ProcessLoad {
  key: ProcessKey;
  unit: string;
  pending: number;
  projects: number;
  behind: number;
}

export interface WeeklyOutput {
  /** Monday of the week. */
  weekStart: string;
  mt: number;
}

export interface FactoryBoard {
  today: string;
  rows: FactoryProjectRow[];
  summary: { projects: number; behind: number; pendingMt: number; workersToday: number };
  processes: ProcessLoad[];
  weekly: WeeklyOutput[];
  /** Σ MT per week needed to meet every dispatch date. */
  requiredMtPerWeek: number;
  lookahead: LookaheadItem[];
  delays: DelayBreakdown[];
}

/* ---------- site ---------- */

/**
 * done: attendance logged and progress posted · partial: one of the two · missing: neither ·
 * pending: today, before the reminder time · holiday: site or company holiday · off: attendance not on yet.
 */
export type DayState = "done" | "partial" | "missing" | "pending" | "holiday" | "off";

export interface DailyCheckDay {
  date: string;
  attendance: boolean;
  progress: boolean;
  state: DayState;
  loggedBy: string;
  loggedAt: string;
}

export interface SiteStageCell {
  key: StageKey;
  pct: number;
  expectedPct: number | null;
  behind: boolean;
  notApplicable: boolean;
  plannedEnd: string;
}

export interface ProblemTask {
  stageKey: StageKey;
  taskId: string;
  name: string;
  pct: number | null;
  plannedEnd: string;
  daysLate: number;
  blockedReason: string | null;
  assignedTo: string;
}

export interface SiteProjectRow {
  projectId: string;
  code: string;
  name: string;
  clientName: string;
  siteLocation: string;
  status: "active" | "on_hold";
  projectManagerId: string;
  siteManagerIds: string[];
  /** The signed-in user is the PM, a site manager or on the team. */
  mine: boolean;
  pct: number;
  plannedPct: number | null;
  behind: boolean;
  currentStage: StageKey | null;
  plannedCompletion: string;
  forecast: string | null;
  /** Forecast minus planned completion, in days (0 when on time or unknown). */
  daysLate: number;
  /** % per day needed from today to finish on the planned date, and % per day over the last 7 days. */
  requiredPctPerDay: number | null;
  achievedPctPerDay: number;
  stages: SiteStageCell[];
  problemTasks: ProblemTask[];
  openDelays: { reason: string; count: number; latest: string }[];
  workersToday: { employees: number; casual: number };
  /** Average people on site per logged day over the previous 7 days. */
  avgWorkers7: number;
  manDays7: number;
  /** Progress points per man-day over the last 7 days. */
  productivity: number | null;
  /** Behind and fewer people today than the 7-day average. */
  lowCrew: boolean;
  lastUpdate: string | null;
  attendanceOn: boolean;
  /** Oldest first; the last entry is today. */
  days: DailyCheckDay[];
}

export interface SiteBoard {
  today: string;
  rows: SiteProjectRow[];
  summary: { active: number; behind: number; notUpdatedToday: number; workersToday: number };
  lookahead: LookaheadItem[];
  delays: DelayBreakdown[];
  /** Stages past their planned end with no delay reason recorded. */
  unexplained: { projectId: string; code: string; stageKey: StageKey; plannedEnd: string; daysLate: number }[];
}
