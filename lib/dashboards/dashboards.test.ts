import { describe, expect, it } from "vitest";
import { LocalAttendanceRepository } from "@/lib/attendance/local-repo";
import type { DashboardAttendance } from "@/lib/attendance/types";
import { setRoleSource, DEFAULT_ROLES } from "@/lib/auth/roles";
import { SessionStorageCrmRepository } from "@/lib/crm/session-repo";
import { SessionStorageRepository } from "@/lib/data/session-repo";
import { PeopleStore } from "@/lib/employees/store";
import { NotificationStore } from "@/lib/notifications/store";
import { LocalProjectRepository, type Actor } from "@/lib/projects/local-repo";
import { addDays, todayIso } from "@/lib/projects/rules";
import type { Delay, ProgressUpdate, Project, Stage, StageKey, Task } from "@/lib/projects/types";
import { SettingsStore } from "@/lib/settings/store";
import { memoryStorage } from "@/lib/storage";
import { projectPlannedPct, weekStart } from "./common";
import { buildFactoryBoard, compareFactoryRows } from "./factory";
import { buildSiteBoard, dailyCheck } from "./site";

const TODAY = "2026-11-25"; // a Wednesday

const task = (o: Partial<Task> = {}): Task => ({
  id: Math.random().toString(36).slice(2),
  name: "T",
  templateKey: null,
  measure: "quantity",
  unit: "MT",
  total: 100,
  completed: 0,
  weight: 1,
  plannedStart: "",
  plannedEnd: "",
  assignedTo: "",
  blocked: null,
  createdAt: "",
  createdBy: "",
  ...o,
});
const stage = (key: StageKey, o: Partial<Stage> = {}): Stage => ({ key, weight: 10, notApplicable: false, plannedStart: "", plannedEnd: "", baselineStart: "", baselineEnd: "", tasks: [], ...o });
const project = (id: string, stages: Stage[], o: Partial<Project> = {}): Project =>
  ({
    id,
    code: id.toUpperCase(),
    name: `Project ${id}`,
    status: "active",
    clientId: "c1",
    projectManagerId: "u_pm",
    team: [],
    startDate: addDays(TODAY, -60),
    plannedCompletion: addDays(TODAY, 60),
    siteLocation: "Pune",
    money: null,
    stages,
    attendance: { enabled: true, enabledFrom: addDays(TODAY, -30), reminderTime: "18:00" },
    ...o,
  }) as Project;
const update = (projectId: string, stageKey: StageKey, taskId: string, workDate: string, quantity: number, runningTotal = quantity): ProgressUpdate => ({
  id: Math.random().toString(36).slice(2),
  projectId,
  stageKey,
  taskId,
  workDate,
  recordedAt: `${workDate}T12:00:00.000Z`,
  quantity,
  runningTotal,
  remarks: "",
  delayReason: "",
  photos: [],
  by: "u_pm",
});

/** Factory stage from start to end with one MT task per process. */
const factory = (o: { start: string; end: string; done: number; total?: number; blocked?: boolean }) =>
  stage("factory", {
    weight: 40,
    plannedStart: o.start,
    plannedEnd: o.end,
    tasks: [task({ id: `cut-${o.start}`, templateKey: "cutting", total: o.total ?? 100, completed: o.done, plannedStart: o.start, plannedEnd: o.end, blocked: o.blocked ? { reason: "Machine down", at: "", by: "" } : null })],
  });

describe("factory board", () => {
  it("ranks pinned first, then blocked / behind, then least spare time", () => {
    const behind = project("behind", [factory({ start: addDays(TODAY, -40), end: addDays(TODAY, -2), done: 40 })]);
    const onTrack = project("ok", [factory({ start: addDays(TODAY, -10), end: addDays(TODAY, 30), done: 30 })]);
    // on plan (30% at 30% of its time) but too slow: 70 MT left, 7.5 MT/week, 14 days to dispatch
    const tight = project("tight", [factory({ start: addDays(TODAY, -6), end: addDays(TODAY, 14), done: 30 })]);
    const pinned = project("pin", [factory({ start: addDays(TODAY, -10), end: addDays(TODAY, 90), done: 5 })], { factoryPin: { reason: "Client escalation", at: "2026-11-20T10:00:00Z", by: "u_admin" } });
    const blocked = project("blocked", [factory({ start: addDays(TODAY, -10), end: addDays(TODAY, 40), done: 20, blocked: true })]);
    const updates = [update("tight", "factory", `cut-${addDays(TODAY, -6)}`, addDays(TODAY, -3), 30)];
    const board = buildFactoryBoard({ projects: [onTrack, tight, behind, pinned, blocked], updates, delays: [], clientNames: {}, factoryWorkersToday: 7, today: TODAY });
    expect(board.rows.map((r) => r.projectId)).toEqual(["pin", "blocked", "behind", "tight", "ok"]);
    const t = board.rows.find((r) => r.projectId === "tight")!;
    expect(t.health).toBe("at_risk");
    expect(t.remainingMt).toBe(70);
    expect(t.actualMtPerWeek).toBe(7.5);
    expect(t.requiredMtPerWeek).toBe(35);
    expect(t.slackDays).toBeLessThan(0);
    expect(board.summary).toMatchObject({ projects: 5, behind: 2, workersToday: 7 });
  });

  it("uses the transport start as the dispatch date and leaves finished factory work out", () => {
    const p = project("p", [factory({ start: addDays(TODAY, -5), end: addDays(TODAY, 20), done: 10 }), stage("transport", { plannedStart: addDays(TODAY, 15) })]);
    const done = project("done", [factory({ start: addDays(TODAY, -50), end: addDays(TODAY, -5), done: 100 })]);
    const board = buildFactoryBoard({ projects: [p, done], updates: [], delays: [], clientNames: {}, factoryWorkersToday: 0, today: TODAY });
    expect(board.rows).toHaveLength(1);
    expect(board.rows[0]).toMatchObject({ dispatchBy: addDays(TODAY, 15), daysToDispatch: 15 });
  });

  it("totals pending work per process and MT per week, and lists delay reasons with days lost", () => {
    const p = project("p", [
      stage("factory", {
        plannedStart: addDays(TODAY, -20),
        plannedEnd: addDays(TODAY, -5),
        tasks: [
          task({ id: "c", templateKey: "cutting", total: 50, completed: 20, plannedEnd: addDays(TODAY, -5) }),
          task({ id: "w", templateKey: "welding", total: 50, completed: 0 }),
          task({ id: "s", templateKey: "sheeting_produced", unit: "sq ft", total: 1000, completed: 400 }),
        ],
      }),
    ]);
    const updates = [update("p", "factory", "c", TODAY, 5), update("p", "factory", "c", addDays(TODAY, -7), 15)];
    const delays: Delay[] = [{ id: "d", projectId: "p", stageKey: "factory", taskId: "c", reason: "raw_material", note: "", plannedEnd: addDays(TODAY, -5), recordedAt: `${addDays(TODAY, -4)}T10:00:00Z`, by: "u" }];
    const board = buildFactoryBoard({ projects: [p], updates, delays, clientNames: {}, factoryWorkersToday: 0, today: TODAY });
    expect(board.processes.map((x) => [x.key, x.unit, x.pending])).toEqual([
      ["cutting", "MT", 30],
      ["welding", "MT", 50],
      ["sheeting", "sq ft", 600],
    ]);
    // two MT processes (cutting, welding): each MT posted counts as half a tonne of finished steel
    expect(board.weekly.at(-1)).toEqual({ weekStart: weekStart(TODAY), mt: 2.5 });
    expect(board.weekly.at(-2)!.mt).toBe(7.5);
    expect(board.rows[0]).toMatchObject({ totalMt: 50, doneMt: 10, remainingMt: 40 });
    expect(board.delays).toEqual([{ reason: "raw_material", count: 1, daysLost: 5, projects: ["P"] }]);
    expect(board.rows[0].latestDelay?.reason).toBe("raw_material");
  });

  it("orders on-hold projects after active ones", () => {
    const a = project("a", [factory({ start: addDays(TODAY, -40), end: addDays(TODAY, -2), done: 10 })], { status: "on_hold" });
    const b = project("b", [factory({ start: addDays(TODAY, -5), end: addDays(TODAY, 60), done: 10 })]);
    const board = buildFactoryBoard({ projects: [a, b], updates: [], delays: [], clientNames: {}, factoryWorkersToday: 0, today: TODAY });
    expect(board.rows.map((r) => r.projectId)).toEqual(["b", "a"]);
    expect([...board.rows].sort(compareFactoryRows).map((r) => r.projectId)).toEqual(["b", "a"]);
  });
});

describe("site board", () => {
  const att = (o: Partial<DashboardAttendance> = {}): DashboardAttendance => ({ records: [], siteDays: [], holidays: [], reminderTime: "18:00", ...o });
  const erection = (o: Partial<Stage> = {}) =>
    stage("erection", { weight: 30, plannedStart: addDays(TODAY, -20), plannedEnd: addDays(TODAY, 20), tasks: [task({ id: "col", name: "Columns", unit: "Nos", total: 40, completed: 10, plannedStart: addDays(TODAY, -20), plannedEnd: addDays(TODAY, 20) })], ...o });
  const input = (projects: Project[], o: Partial<Parameters<typeof buildSiteBoard>[0]> = {}) => ({
    projects,
    updates: [],
    delays: [],
    clientNames: {},
    attendance: att(),
    today: TODAY,
    clock: "19:00",
    me: "",
    ...o,
  });

  it("marks each day done / partial / missing / pending / holiday / off", () => {
    const p = project("p", [erection()]);
    const a = att({
      siteDays: [
        { projectId: "p", date: addDays(TODAY, -1), holiday: false, loggedBy: "u", loggedAt: "" },
        { projectId: "p", date: addDays(TODAY, -2), holiday: false, loggedBy: "u", loggedAt: "" },
        { projectId: "p", date: addDays(TODAY, -4), holiday: true, loggedBy: "u", loggedAt: "" },
      ],
      holidays: [addDays(TODAY, -5)],
    });
    const updates = [update("p", "erection", "col", addDays(TODAY, -1), 2)];
    const at = (date: string, clock = "19:00") => dailyCheck(p, date, input([p], { attendance: a, updates, clock })).state;
    expect(at(addDays(TODAY, -1))).toBe("done");
    expect(at(addDays(TODAY, -2))).toBe("partial");
    expect(at(addDays(TODAY, -3))).toBe("missing");
    expect(at(addDays(TODAY, -4))).toBe("holiday");
    expect(at(addDays(TODAY, -5))).toBe("holiday");
    expect(at(TODAY, "09:00")).toBe("pending");
    expect(at(TODAY)).toBe("missing");
    expect(at(addDays(TODAY, -40))).toBe("off");
    const board = buildSiteBoard(input([p], { attendance: a, updates }));
    expect(board.rows[0].days.map((d) => d.state)).toHaveLength(7);
    expect(board.summary.notUpdatedToday).toBe(1);
  });

  it("puts behind sites first, flags low crews and never carries money", () => {
    const late = project("late", [erection({ plannedEnd: addDays(TODAY, -3), tasks: [task({ id: "x", total: 10, completed: 2, plannedEnd: addDays(TODAY, -3) })] })]);
    const fine = project("fine", [erection()]);
    const records = [
      ...[1, 2, 3].flatMap((d) => Array.from({ length: 10 }, (_, i) => ({ personKind: "casual" as const, personId: `w${i}`, date: addDays(TODAY, -d), status: "present" as const, location: "site" as const, projectId: "late" }))),
      ...Array.from({ length: 4 }, (_, i) => ({ personKind: "casual" as const, personId: `w${i}`, date: TODAY, status: "present" as const, location: "site" as const, projectId: "late" })),
    ];
    const siteDays = [{ projectId: "late", date: TODAY, holiday: false, loggedBy: "u", loggedAt: "" }];
    const board = buildSiteBoard(input([fine, late], { attendance: att({ records, siteDays }) }));
    expect(buildSiteBoard(input([late], { attendance: att({ records }) })).rows[0].lowCrew).toBe(false); // today not logged yet
    expect(board.rows.map((r) => r.projectId)).toEqual(["late", "fine"]);
    const r = board.rows[0];
    expect(r.behind).toBe(true);
    expect(r.workersToday).toEqual({ employees: 0, casual: 4 });
    expect(r.avgWorkers7).toBe(10);
    expect(r.lowCrew).toBe(true);
    expect(r.problemTasks[0]).toMatchObject({ taskId: "x", daysLate: 3 });
    expect(board.unexplained).toEqual([{ projectId: "late", code: "LATE", stageKey: "erection", plannedEnd: addDays(TODAY, -3), daysLate: 3 }]);
    expect(JSON.stringify(board)).not.toMatch(/money|valueWithGst|received/);
  });

  it("works out the planned % for today from the stage dates", () => {
    const p = project("p", [stage("erection", { plannedStart: addDays(TODAY, -10), plannedEnd: addDays(TODAY, 10) })]);
    expect(projectPlannedPct(p, TODAY)).toBe(50);
  });
});

/* ---------- repository access and reminders ---------- */

function setup(hour = 19) {
  const data = memoryStorage();
  const base = new Date();
  base.setHours(hour, 0, 0, 0);
  const clock = { now: base.getTime() };
  const actor: { current: Actor | null } = { current: { id: "u_admin", role: "admin" } };
  const quotes = new SessionStorageRepository(() => data, 0, true);
  const crm = new SessionStorageCrmRepository({ storage: () => data, quotes, getActor: async () => actor.current!.id, latencyMs: 0 });
  const people = new PeopleStore(() => data);
  const settings = new SettingsStore(() => data);
  const notifications = new NotificationStore(() => data, () => clock.now);
  const projects = new LocalProjectRepository({
    storage: () => data,
    sources: { enquiries: () => crm.readAllEnquiries(), clients: () => crm.readAllClients(), quotations: () => quotes.readAllRecords() },
    people,
    settings,
    notifications,
    getActor: async () => actor.current,
    latencyMs: 0,
    now: () => clock.now,
  });
  const attendance = new LocalAttendanceRepository({ storage: () => data, people, settings, projects, notifications, getActor: async () => actor.current, latencyMs: 0, now: () => clock.now });
  return { actor, projects, attendance, today: todayIso(clock.now) };
}

describe("dashboard data access", () => {
  it("needs the dashboard page in the role, and never returns money", async () => {
    const { actor, projects, attendance, today } = setup();
    const data = await projects.dashboardData("factory-dashboard");
    expect(data.projects.length).toBeGreaterThan(0);
    expect(data.projects.every((p) => p.money === null && (p.status === "active" || p.status === "on_hold"))).toBe(true);
    expect(Object.keys(data.clientNames).length).toBeGreaterThan(0);

    actor.current = { id: "u_priya", role: "staff" };
    await expect(projects.dashboardData("site-dashboard")).rejects.toThrow(/dashboard/);
    await expect(attendance.dashboardAttendance(today, today)).rejects.toThrow(/dashboard/);

    setRoleSource(() => [...DEFAULT_ROLES, { id: "factory_head", name: "Factory head", pages: ["factory-dashboard"] }]);
    try {
      actor.current = { id: "e_ganesh", role: "factory_head" };
      expect((await projects.dashboardData("factory-dashboard")).projects.length).toBeGreaterThan(0);
      await expect(projects.dashboardData("site-dashboard")).rejects.toThrow(/dashboard/);
      const att = await attendance.dashboardAttendance(addDays(today, -7), today);
      expect(att.records.every((r) => !("remarks" in r))).toBe(true);

      // Pinning: allowed with the Factory dashboard, logged on the timeline.
      const p = data.projects[0];
      await expect(projects.setFactoryPin(p.id, "  ")).rejects.toThrow(/reason/);
      const pinned = await projects.setFactoryPin(p.id, "Client escalation");
      expect(pinned.factoryPin).toMatchObject({ reason: "Client escalation", by: "e_ganesh" });
      expect(pinned.money).toBeNull();
      actor.current = { id: "u_admin", role: "admin" };
      const ev = await projects.events(p.id, {});
      expect(ev.items.some((e) => e.text.includes("Pinned to the top of the factory queue"))).toBe(true);
      expect((await projects.setFactoryPin(p.id, null)).factoryPin).toBeNull();
      actor.current = { id: "u_priya", role: "staff" };
      await expect(projects.setFactoryPin(p.id, "x")).rejects.toThrow(/Factory dashboard/);
    } finally {
      setRoleSource(() => undefined);
    }
  });

  it("reminds site managers when no progress was posted on a site day", async () => {
    const { attendance } = setup(19);
    const added = await attendance.reconcileReminders();
    const due = added.filter((n) => n.kind === "progress_due");
    // Demo data: no project has an update dated today, so active sites with attendance get a level 1 reminder.
    expect(due.some((n) => n.key.endsWith(":1") && n.href.endsWith("/progress"))).toBe(true);
    expect((await attendance.reconcileReminders()).filter((n) => n.kind === "progress_due")).toEqual([]); // no duplicates
  });
});
