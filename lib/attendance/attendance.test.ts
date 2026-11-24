import { describe, expect, it } from "vitest";
import { SessionStorageCrmRepository } from "@/lib/crm/session-repo";
import { SessionStorageRepository } from "@/lib/data/session-repo";
import { PeopleStore } from "@/lib/employees/store";
import { NotificationStore } from "@/lib/notifications/store";
import { LocalProjectRepository } from "@/lib/projects/local-repo";
import { LocalSettingsRepository } from "@/lib/settings/local-repo";
import { SettingsStore } from "@/lib/settings/store";
import { memoryStorage } from "@/lib/storage";
import type { PhotoRef } from "@/lib/files/types";
import { LocalAttendanceRepository, type Actor } from "./local-repo";
import { addDays, distanceM, monthSummary, productivity, remindersDue, todayIso, withinWindow } from "./rules";
import { AttendanceConflictError } from "./types";

const photo: PhotoRef = { fileId: "f1", name: "crew.jpg", type: "image/jpeg", size: 10, takenAt: null, uploadedAt: "" };

function setup(hour = 12) {
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
  const repo = new LocalAttendanceRepository({ storage: () => data, people, settings, projects, notifications, getActor: async () => actor.current, latencyMs: 0, now: () => clock.now });
  const settingsRepo = new LocalSettingsRepository(settings, async () => actor.current?.role ?? null);
  const today = todayIso(clock.now);
  const projectId = async (name: string) => (await projects.list({ statuses: [] })).find((p) => p.name.includes(name))!.id;
  return { data, clock, actor, projects, repo, notifications, settingsRepo, today, projectId };
}

describe("attendance rules", () => {
  it("summarises days worked and Not logged days", () => {
    expect(monthSummary(["present", "half", "absent", "holiday", null, "present"])).toEqual({ present: 2, half: 1, absent: 1, holiday: 1, notLogged: 1, daysWorked: 2.5 });
  });

  it("limits the edit window to 7 days and never the future", () => {
    expect(withinWindow("2026-11-17", "2026-11-24")).toBe(true);
    expect(withinWindow("2026-11-16", "2026-11-24")).toBe(false);
    expect(withinWindow("2026-11-25", "2026-11-24")).toBe(false);
  });

  it("works out due reminders: at the reminder time, and next morning for admins", () => {
    const at = (hhmm: string) => new Date(`2026-11-24T${hhmm}:00`).getTime();
    const projects = [{ id: "p", from: "2026-11-01", reminderTime: "18:00" }];
    const none = () => false;
    expect(remindersDue(projects, none, at("09:00")).map((d) => `${d.date}/${d.level}`)).toEqual(["2026-11-23/1"]);
    expect(remindersDue(projects, none, at("10:30")).map((d) => `${d.date}/${d.level}`)).toEqual(["2026-11-23/1", "2026-11-23/2"]);
    expect(remindersDue(projects, none, at("18:05")).map((d) => `${d.date}/${d.level}`)).toEqual(["2026-11-24/1", "2026-11-23/1", "2026-11-23/2"]);
    expect(remindersDue(projects, () => true, at("18:05"))).toEqual([]);
  });

  it("measures distance and productivity", () => {
    expect(distanceM({ lat: 18.52, lng: 73.85 }, { lat: 18.53, lng: 73.85 })).toBeGreaterThan(1000);
    const p = productivity(
      [
        { workDate: "2026-11-20", quantity: 6 },
        { workDate: "2026-11-21", quantity: 4 },
        { workDate: "2026-11-22", quantity: 5 },
      ],
      { "2026-11-20": 10, "2026-11-21": 10 },
    );
    expect(p).toMatchObject({ perManDay: 0.5, days: 2 });
  });
});

describe("LocalAttendanceRepository", () => {
  it("shows logged, holiday and Not logged days on the project tab", async () => {
    const { repo, projectId, today } = setup();
    const id = await projectId("Poly houses");
    const rows = await repo.projectDays(id, addDays(today, -14), today);
    const kind = (n: number) => rows.find((r) => r.date === addDays(today, -n))?.kind;
    expect(kind(0)).toBeUndefined(); // before the 18:00 reminder, today isn't "Not logged" yet
    expect(kind(1)).toBe("missing");
    expect(kind(10)).toBe("missing");
    expect(rows.filter((r) => r.kind === "holiday").length).toBeGreaterThan(0);
    const logged = rows.find((r) => r.kind === "logged")!;
    expect(logged.employees.present + logged.employees.half + logged.employees.absent).toBeGreaterThan(0);
    expect(logged.manDays).toBeGreaterThan(0);
    expect(rows[0].date >= rows[rows.length - 1].date).toBe(true);
    const evening = setup(19);
    const later = await evening.repo.projectDays(await evening.projectId("Poly houses"), today, today);
    expect(later[0]?.kind).toBe("missing");
  });

  it("saves a site day with a photo, one record per person per day, and logs the timeline", async () => {
    const { repo, projects, projectId, today, actor, clock } = setup();
    const id = await projectId("Poly houses");
    actor.current = { id: "u_rahul", role: "staff" };
    const entries = [
      { personKind: "employee" as const, personId: "e_sunil", status: "present" as const, remarks: "" },
      { personKind: "casual" as const, personId: "cw_1", status: "half" as const, remarks: "left at 2 PM" },
    ];
    await expect(repo.saveSiteDay(id, { date: today, entries, photos: [], photoLocation: null, resolutions: {} })).rejects.toThrow(/group photo/);
    await expect(repo.saveSiteDay(id, { date: addDays(today, 1), entries, photos: [photo], photoLocation: null, resolutions: {} })).rejects.toThrow(/future/);
    await expect(repo.saveSiteDay(id, { date: addDays(today, -8), entries, photos: [photo], photoLocation: null, resolutions: {} })).rejects.toThrow(/older than 7 days/);
    await repo.saveSiteDay(id, { date: today, entries, photos: [photo], photoLocation: null, resolutions: {} });
    const day = await repo.projectDay(id, today);
    expect(day.employees.map((p) => p.name)).toEqual(["Sunil More"]);
    expect(day.casual[0].record.status).toBe("half");
    const ev = await projects.events(id, { types: ["attendance"] });
    expect(ev.items[0].text).toBe(`Attendance logged for ${ev.items[0].text.split("for ")[1].split(":")[0]}: 1 employee present, 1 casual worker half day — by Rahul Jadhav`);
    // Editing: change status, remove the casual worker.
    clock.now += 60_000;
    await repo.saveSiteDay(id, { date: today, entries: [{ ...entries[0], status: "half" }], photos: [], photoLocation: null, resolutions: {} });
    const ev2 = await projects.events(id, { types: ["attendance"] });
    expect(ev2.items[0].text).toMatch(/edited: Sunil More changed Present → Half day; Shankar Gawande removed/);
    expect((await repo.projectDay(id, today)).casual).toEqual([]);
  });

  it("asks which record to keep when a person is already marked elsewhere that day", async () => {
    const { repo, projectId, today } = setup();
    const id = await projectId("Godown at Sanaswadi");
    // Ganesh was marked at the factory yesterday.
    const yesterday = addDays(today, -1);
    const entry = { personKind: "employee" as const, personId: "e_ganesh", status: "present" as const, remarks: "" };
    const err = await repo.saveSiteDay(id, { date: yesterday, entries: [entry], photos: [photo], photoLocation: null, resolutions: {} }).catch((e) => e);
    expect(err).toBeInstanceOf(AttendanceConflictError);
    expect((err as AttendanceConflictError).conflicts[0].where).toBe("Factory");
    await repo.saveSiteDay(id, { date: yesterday, entries: [entry], photos: [photo], photoLocation: null, resolutions: { "employee:e_ganesh": "replace" } });
    const month = await repo.employeeMonth("e_ganesh", yesterday.slice(0, 7));
    const rec = month.rows.find((r) => r.date === yesterday)!.record!;
    expect(rec).toMatchObject({ location: "site", projectId: id });
    expect(rec.history.at(-1)!.from).toMatchObject({ location: "factory" });
  });

  it("lets supervisors mark only at their location, within 7 days, and not holidays for everyone", async () => {
    const { repo, actor, today } = setup();
    actor.current = { id: "u_staff", role: "staff" }; // office supervisor
    await repo.setRecord("u_sneha", today, { status: "present", location: "office", projectId: null });
    await expect(repo.setRecord("u_sneha", today, { status: "present", location: "factory", projectId: null })).rejects.toThrow(/only at the Office/);
    await expect(repo.setRecord("e_ganesh", addDays(today, -1), { status: "present", location: "office", projectId: null })).rejects.toThrow(/already marked at Factory/);
    await expect(repo.setRecord("u_sneha", addDays(today, -9), { status: "present", location: "office", projectId: null })).rejects.toThrow(/older than 7 days/);
    await expect(repo.markDayHoliday(today)).rejects.toHaveProperty("name", "ForbiddenError");
    actor.current = { id: "u_priya", role: "staff" };
    await expect(repo.daySheet(today)).rejects.toHaveProperty("name", "ForbiddenError");
  });

  it("day sheet: summary chips, location required, bulk and holiday for everyone", async () => {
    const { repo, today } = setup();
    const before = await repo.daySheet(today);
    expect(before.summary.notLogged).toBeGreaterThan(0);
    await expect(repo.setRecord("u_sneha", today, { status: "present", location: null, projectId: null })).rejects.toThrow(/location/);
    const { updated } = await repo.bulkSet(["u_priya", "u_sneha"], today, { status: "present", location: "office", projectId: null });
    expect(updated).toBe(2);
    const n = await repo.markDayHoliday(today);
    const after = await repo.daySheet(today);
    expect(after.summary.notLogged).toBe(0);
    expect(after.summary.holiday).toBe(n);
    expect(after.companyHoliday).toBe(true);
    expect((await repo.daySheet(today, { status: "present", location: "office" })).rows.map((r) => r.name)).toEqual(
      expect.arrayContaining(["Priya Deshmukh", "Sneha Kale"]),
    );
  });

  it("does not let inactive employees be marked after leaving", async () => {
    const { repo, today } = setup();
    await expect(repo.setRecord("e_amit", today, { status: "present", location: "office", projectId: null })).rejects.toThrow(/not employed/);
    expect((await repo.daySheet(today)).rows.some((r) => r.employeeId === "e_amit")).toBe(false);
  });

  it("sends reminders to site managers, and to admins the next morning; holidays get none", async () => {
    const { repo, notifications, clock, today, projectId } = setup(11);
    const poly = await projectId("Poly houses");
    const added = await repo.reconcileReminders();
    const forPoly = added.filter((n) => n.href.includes(poly));
    expect(forPoly.map((n) => `${n.userId}:${n.key.split(":").pop()}`).sort()).toEqual(["u_admin:2", "u_priya:1", "u_priya:2", "u_rahul:1", "u_rahul:2"]);
    expect(await repo.reconcileReminders()).toEqual([]);
    // Today: nothing before 6 PM; a site holiday stops it.
    clock.now += 8 * 3600_000;
    await repo.markSiteHoliday(poly, today);
    const later = await repo.reconcileReminders();
    expect(later.some((n) => n.href.includes(poly) && n.key.includes(today))).toBe(false);
    expect((await notifications.list("u_rahul")).every((n) => n.kind !== "attendance_due" || n.href.includes("?log="))).toBe(true);
  });

  it("keeps casual workers out of the employee list, hides rates from staff, merges duplicates", async () => {
    const { repo, actor, settingsRepo } = setup();
    actor.current = { id: "u_rahul", role: "staff" };
    const added = await repo.addCasual({ name: "Ganpat Rao", mobile: "", trade: "helper", contractor: "Raju Mukadam", dailyRate: 999 });
    expect(added.dailyRate).toBeNull();
    expect((await repo.listCasual({ search: "Shankar" }))[0].dailyRate).toBeNull();
    await expect(repo.addCasual({ name: "Ganpat Rao", mobile: "", trade: "helper", contractor: "" })).rejects.toThrow(/already in the register/);
    actor.current = { id: "u_admin", role: "admin" };
    expect((await repo.listCasual({ search: "Shankar" }))[0].dailyRate).toBe(900);
    const r = await repo.mergeCasual("cw_8", "cw_1");
    expect(r.moved + r.dropped).toBeGreaterThan(0);
    expect((await repo.listCasual({ search: "Sunil Wanjari" })).length).toBe(0);
    await settingsRepo.saveAttendance({ reminderTime: "17:30", supervisors: { factory: ["u_rahul"], office: [] } });
    actor.current = { id: "u_staff", role: "staff" };
    await expect(repo.access()).resolves.toEqual({ isAdmin: false, supervises: [] });
  });

  it("costs casual labour per project", async () => {
    const { repo, projectId } = setup();
    const cost = await repo.labourCost(await projectId("Poly houses"));
    expect(cost.casualManDays).toBeGreaterThan(50);
    expect(cost.casualCost).toBeGreaterThan(cost.casualManDays * 600);
    expect(cost.unratedManDays).toBeGreaterThan(0);
  });
});
