/* Factory dashboard: all pending factory work across projects, ranked by what needs attention first. */
import { addDays, daysBetween, daysLate, stageBehind, stagePct, taskBehind, taskPct, taskStatus } from "@/lib/projects/rules";
import type { Delay, ProgressUpdate, Project, Stage, Task } from "@/lib/projects/types";
import { currentDocSlots, delayBreakdown, lastWorkDate, lookahead, round1, stagePlannedPct, weekStart } from "./common";
import type { FactoryBoard, FactoryHealth, FactoryProjectRow, FactoryTaskRow, ProcessKey, ProcessLoad, WeeklyOutput } from "./types";

export const PROCESS_LABELS: Record<ProcessKey, string> = {
  raw_material: "Raw material",
  cutting: "Cutting",
  welding: "Welding",
  blasting_painting: "Blasting & painting",
  purlins: "Purlins / girts",
  sheeting: "Sheeting",
  other: "Other",
};

/** Factory template task → process. Custom tasks are "Other". */
const PROCESS_OF: Record<string, ProcessKey> = {
  raw_material: "raw_material",
  cutting: "cutting",
  welding: "welding",
  blasting_painting: "blasting_painting",
  purlins: "purlins",
  sheeting_produced: "sheeting",
};
export const processOf = (t: Pick<Task, "templateKey">): ProcessKey => (t.templateKey && PROCESS_OF[t.templateKey]) || "other";

/** "At risk" when the spare time at the current rate is a week or less. */
export const AT_RISK_SLACK_DAYS = 7;
const RATE_WEEKS = 4;
const isMt = (t: Task) => t.measure === "quantity" && t.unit.trim().toLowerCase() === "mt";
const DONE = 99.999;

const HEALTH_ORDER: Record<FactoryHealth, number> = { blocked: 0, behind: 1, at_risk: 2, on_track: 3, not_started: 4 };

export interface FactoryInput {
  projects: Project[];
  updates: ProgressUpdate[];
  delays: Delay[];
  clientNames: Record<string, string>;
  /** People marked present (or half day) at the factory today. */
  factoryWorkersToday: number;
  today: string;
}

function dispatchDate(p: Project, factory: Stage): string {
  const transport = p.stages.find((s) => s.key === "transport");
  if (transport && !transport.notApplicable && transport.plannedStart) return transport.plannedStart;
  return factory.plannedEnd || p.plannedCompletion || "";
}

function row(p: Project, factory: Stage, input: FactoryInput): FactoryProjectRow {
  const { today } = input;
  const updates = input.updates.filter((u) => u.projectId === p.id && u.stageKey === "factory");
  const pct = stagePct(factory);
  const tasks: FactoryTaskRow[] = factory.tasks.map((t) => {
    const tp = taskPct(t);
    const end = t.plannedEnd || factory.plannedEnd;
    return {
      id: t.id,
      name: t.name,
      process: processOf(t),
      unit: t.unit,
      total: t.total,
      completed: t.completed,
      pct: tp,
      plannedEnd: end,
      assignedTo: t.assignedTo,
      status: taskStatus(t),
      behind: taskBehind({ ...t, plannedStart: t.plannedStart || factory.plannedStart, plannedEnd: end }, today),
      daysLate: daysLate(end, tp ?? 0, today),
      blockedReason: t.blocked?.reason ?? null,
    };
  });

  // The same steel passes through every MT process (raw material, cutting, welding, painting…), so tonnes are
  // averaged over those processes: "steel finished" rather than the sum of every process step.
  const mtTasks = factory.tasks.filter((t) => isMt(t) && t.total !== null);
  const n = Math.max(1, mtTasks.length);
  const totalMt = mtTasks.reduce((a, t) => a + (t.total ?? 0), 0) / n;
  const doneMt = mtTasks.reduce((a, t) => a + Math.min(t.completed, t.total ?? t.completed), 0) / n;
  const remainingMt = Math.max(0, totalMt - doneMt);
  const mtIds = new Set(mtTasks.map((t) => t.id));
  const since = addDays(today, -(RATE_WEEKS * 7 - 1));
  const recentMt = updates.filter((u) => mtIds.has(u.taskId) && u.workDate >= since && u.workDate <= today).reduce((a, u) => a + u.quantity, 0) / n;
  const actualMtPerWeek = Math.max(0, recentMt / RATE_WEEKS);

  const dispatchBy = dispatchDate(p, factory);
  const daysToDispatch = dispatchBy ? daysBetween(today, dispatchBy) : null;
  // MT/week needed to finish by the dispatch date (at least one week, also when the date has passed).
  const requiredMtPerWeek = remainingMt > 0 && daysToDispatch !== null ? remainingMt / Math.max(1, daysToDispatch / 7) : null;
  // Spare days at the current rate: days to dispatch minus days the remaining MT takes. Unknown without a rate.
  const slackDays = remainingMt > 0 && daysToDispatch !== null && actualMtPerWeek > 0 ? Math.floor(daysToDispatch - (remainingMt / actualMtPerWeek) * 7) : null;

  const behind = stageBehind(factory, today);
  const blocked = factory.tasks.some((t) => t.blocked && (taskPct(t) ?? 0) < DONE);
  const notStarted = pct <= 0 && !!factory.plannedStart && factory.plannedStart > today;
  const atRisk =
    (slackDays !== null && slackDays <= AT_RISK_SLACK_DAYS) ||
    // needs a quarter more than it is producing
    (requiredMtPerWeek !== null && actualMtPerWeek > 0 && requiredMtPerWeek > actualMtPerWeek * 1.25) ||
    // nothing produced in 4 weeks with dispatch within 3 weeks
    (remainingMt > 0 && actualMtPerWeek === 0 && !notStarted && daysToDispatch !== null && daysToDispatch <= 21);
  const health: FactoryHealth = blocked ? "blocked" : behind ? "behind" : atRisk ? "at_risk" : notStarted ? "not_started" : "on_track";

  const delays = input.delays.filter((d) => d.projectId === p.id && d.stageKey === "factory").sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
  return {
    projectId: p.id,
    code: p.code,
    name: p.name,
    clientName: input.clientNames[p.clientId] ?? "",
    projectManagerId: p.projectManagerId,
    status: p.status === "on_hold" ? "on_hold" : "active",
    pin: p.factoryPin ?? null,
    health,
    pct: round1(pct),
    expectedPct: (() => {
      const e = stagePlannedPct(factory, today);
      return e === null ? null : round1(e);
    })(),
    plannedStart: factory.plannedStart,
    plannedEnd: factory.plannedEnd,
    dispatchBy,
    daysToDispatch,
    daysLate: daysLate(factory.plannedEnd, pct, today),
    slackDays,
    totalMt: round1(totalMt),
    doneMt: round1(doneMt),
    remainingMt: round1(remainingMt),
    requiredMtPerWeek: requiredMtPerWeek === null ? null : round1(requiredMtPerWeek),
    actualMtPerWeek: round1(actualMtPerWeek),
    lastUpdate: lastWorkDate(updates),
    latestDelay: delays[0] ? { reason: delays[0].reason, recordedAt: delays[0].recordedAt } : null,
    tasks,
    docSlots: currentDocSlots(p),
  };
}

/** Pinned first (oldest pin first), then blocked / behind / at risk, then least spare time, then earliest dispatch. */
export function compareFactoryRows(a: FactoryProjectRow, b: FactoryProjectRow): number {
  if (!!a.pin !== !!b.pin) return a.pin ? -1 : 1;
  if (a.pin && b.pin) return a.pin.at.localeCompare(b.pin.at);
  if ((a.status === "on_hold") !== (b.status === "on_hold")) return a.status === "on_hold" ? 1 : -1;
  const h = HEALTH_ORDER[a.health] - HEALTH_ORDER[b.health];
  if (h) return h;
  const slack = (r: FactoryProjectRow) => r.slackDays ?? r.daysToDispatch ?? Number.MAX_SAFE_INTEGER;
  return slack(a) - slack(b) || (a.dispatchBy || "9999").localeCompare(b.dispatchBy || "9999") || a.code.localeCompare(b.code);
}

export function buildFactoryBoard(input: FactoryInput): FactoryBoard {
  const { today } = input;
  const inFactory = input.projects.filter((p) => {
    const f = p.stages.find((s) => s.key === "factory");
    return (p.status === "active" || p.status === "on_hold") && f && !f.notApplicable && stagePct(f) < DONE;
  });
  const rows = inFactory.map((p) => row(p, p.stages.find((s) => s.key === "factory")!, input)).sort(compareFactoryRows);
  const active = rows.filter((r) => r.status === "active");

  // Pending work per process (and unit) across active projects.
  const loads = new Map<string, ProcessLoad>();
  for (const r of active)
    for (const t of r.tasks) {
      if (t.total === null || (t.pct ?? 0) >= DONE) continue;
      const k = `${t.process}|${t.unit}`;
      const l = loads.get(k) ?? { key: t.process, unit: t.unit, pending: 0, projects: 0, behind: 0 };
      l.pending = round1(l.pending + Math.max(0, t.total - t.completed));
      l.projects += 1;
      if (t.behind) l.behind += 1;
      loads.set(k, l);
    }
  const processOrder = Object.keys(PROCESS_LABELS) as ProcessKey[];
  const processes = [...loads.values()].sort((a, b) => processOrder.indexOf(a.key) - processOrder.indexOf(b.key) || a.unit.localeCompare(b.unit));

  // Steel finished per week, last 6 weeks, every project in the data (finished ones included). Each update counts
  // as its share of the project's MT processes, matching "steel finished" above.
  const shareOf = new Map<string, number>();
  for (const p of input.projects)
    for (const s of p.stages) {
      if (s.key !== "factory") continue;
      const mt = s.tasks.filter((t) => isMt(t) && t.total !== null);
      for (const t of mt) shareOf.set(t.id, 1 / mt.length);
    }
  const thisWeek = weekStart(today);
  const weekly: WeeklyOutput[] = Array.from({ length: 6 }, (_, i) => ({ weekStart: addDays(thisWeek, -7 * (5 - i)), mt: 0 }));
  for (const u of input.updates) {
    const share = shareOf.get(u.taskId);
    if (u.stageKey !== "factory" || !share || u.workDate > today) continue;
    const w = weekly.find((x) => x.weekStart === weekStart(u.workDate));
    if (w) w.mt += u.quantity * share;
  }
  for (const w of weekly) w.mt = round1(w.mt);

  return {
    today,
    rows,
    summary: {
      projects: active.length,
      behind: active.filter((r) => r.health === "behind" || r.health === "blocked").length,
      pendingMt: round1(active.reduce((a, r) => a + r.remainingMt, 0)),
      workersToday: input.factoryWorkersToday,
    },
    processes,
    weekly,
    requiredMtPerWeek: round1(active.reduce((a, r) => a + (r.requiredMtPerWeek ?? 0), 0)),
    lookahead: lookahead(inFactory, ["factory"], today, 14, (t) => taskBehind(t, today)),
    delays: delayBreakdown(input.projects, input.delays, input.updates, ["factory"], addDays(today, -90), today),
  };
}
