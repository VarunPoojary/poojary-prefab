import { describe, expect, it } from "vitest";
import { seedQuoteId } from "@/lib/crm/seed-links";
import { SessionStorageCrmRepository } from "@/lib/crm/session-repo";
import { SessionStorageRepository } from "@/lib/data/session-repo";
import { PeopleStore } from "@/lib/employees/store";
import { readExifTakenAt } from "@/lib/files/exif";
import { NotificationStore } from "@/lib/notifications/store";
import { LocalSettingsRepository } from "@/lib/settings/local-repo";
import { SettingsStore } from "@/lib/settings/store";
import { memoryStorage } from "@/lib/storage";
import { DEFAULT_TEMPLATES } from "./config";
import { LocalProjectRepository, PROJECTS_KEY, type Actor } from "./local-repo";
import { checkUpdate, currentStage, forecastCompletion, milestonesFromTerms, projectPct, stagePct, taskBehind, taskPct, todayIso } from "./rules";
import type { Stage, Task } from "./types";

const task = (o: Partial<Task> = {}): Task => ({
  id: "t",
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
const stage = (key: Stage["key"], weight: number, tasks: Task[], notApplicable = false): Stage => ({
  key,
  weight,
  notApplicable,
  plannedStart: "",
  plannedEnd: "",
  baselineStart: "",
  baselineEnd: "",
  tasks,
});

describe("progress formulas", () => {
  it("rolls tasks up into stage % and stages into project % with weights", () => {
    expect(taskPct(task({ completed: 20, total: 40 }))).toBe(50);
    expect(taskPct(task({ total: null }))).toBeNull();
    expect(taskPct(task({ measure: "percent", total: 100, completed: 30 }))).toBe(30);
    const s = stage("factory", 40, [task({ completed: 50 }), task({ completed: 100, weight: 3 }), task({ total: null, completed: 0 })]);
    expect(stagePct(s)).toBe((50 * 1 + 100 * 3) / 4);
    expect(stagePct(stage("design", 10, []))).toBe(0);
    const stages = [stage("design", 10, [task({ completed: 100 })]), stage("factory", 40, [task({ completed: 50 })]), stage("erection", 50, [task()])];
    expect(projectPct(stages)).toBeCloseTo((100 * 10 + 50 * 40) / 100);
    expect(currentStage(stages)).toBe("factory");
  });

  it("leaves Not applicable stages out and rescales the others", () => {
    const stages = [stage("design", 10, [task({ completed: 100 })]), stage("factory", 40, [task({ completed: 50 })]), stage("erection", 50, [task()], true)];
    expect(projectPct(stages)).toBeCloseTo((100 * 10 + 50 * 40) / 50);
  });

  it("flags tasks behind schedule (past end, or >10 points below the straight line)", () => {
    const t = task({ plannedStart: "2026-11-01", plannedEnd: "2026-11-21", completed: 40 });
    expect(taskBehind(t, "2026-11-11")).toBe(false); // expected 50, actual 40
    expect(taskBehind({ ...t, completed: 30 }, "2026-11-11")).toBe(true); // expected 50, actual 30
    expect(taskBehind({ ...t, completed: 90 }, "2026-11-22")).toBe(true);
    expect(taskBehind({ ...t, completed: 100 }, "2026-11-30")).toBe(false);
  });

  it("forecasts completion from the actual rate", () => {
    expect(forecastCompletion("2026-11-01", 5, "2026-11-11")).toBeNull();
    expect(forecastCompletion("2026-11-01", 50, "2026-11-11")).toBe("2026-11-21");
  });

  it("copies payment milestones from the quotation terms", () => {
    const params = { advancePct: 30, inspectionPct: 60, balancePct: 10 } as Parameters<typeof milestonesFromTerms>[0];
    const ms = milestonesFromTerms(params, true, 1_000_001);
    expect(ms.map((m) => m.name)).toEqual(["Advance", "Against material inspection / dispatch", "Balance against running bills / erection"]);
    expect(ms.reduce((a, m) => a + m.amount, 0)).toBe(1_000_001);
    expect(milestonesFromTerms(params, false, 100)).toEqual([]);
  });

  it("validates progress updates", () => {
    const t = task({ total: 40, completed: 30, unit: "Nos", plannedEnd: "2026-11-20" });
    const today = "2026-11-24";
    const base = { workDate: today, value: 5, remarks: "", delayReason: "", photos: [] };
    expect(checkUpdate(t, { ...base, workDate: "2026-11-25" }, { today, isAdmin: true }).issues.join()).toMatch(/future/);
    expect(checkUpdate(t, { ...base, value: 11 }, { today, isAdmin: true }).issues.join()).toMatch(/above the total/);
    expect(checkUpdate(t, { ...base, workDate: "2026-11-19" }, { today, isAdmin: false }).issues).toEqual([]);
    expect(checkUpdate(t, base, { today, isAdmin: false }).issues.join()).toMatch(/delay reason/);
    expect(checkUpdate(t, { ...base, delayReason: "weather" }, { today, isAdmin: false }).runningTotal).toBe(35);
    const neg = { ...base, workDate: "2026-11-19", value: -2 };
    expect(checkUpdate(t, neg, { today, isAdmin: false }).issues.join()).toMatch(/Only admins/);
    expect(checkUpdate(t, neg, { today, isAdmin: true }).issues.join()).toMatch(/note/);
    expect(checkUpdate(t, { ...neg, remarks: "Counted twice" }, { today, isAdmin: true }).issues).toEqual([]);
  });

  it("reads when a JPEG photo was taken", () => {
    // SOI + APP1 Exif, little-endian TIFF with IFD0 → ExifIFD → DateTimeOriginal.
    const date = "2026:11:20 09:15:00\0";
    const tiff: number[] = [0x49, 0x49, 0x2a, 0x00, 8, 0, 0, 0];
    tiff.push(1, 0, 0x69, 0x87, 4, 0, 1, 0, 0, 0, 26, 0, 0, 0, 0, 0, 0, 0); // IFD0: 1 entry → Exif IFD at 26
    tiff.push(1, 0, 0x03, 0x90, 2, 0, 20, 0, 0, 0, 44, 0, 0, 0, 0, 0, 0, 0); // Exif IFD: DateTimeOriginal at 44
    for (const c of date) tiff.push(c.charCodeAt(0));
    const app1 = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
    const bytes = [0xff, 0xd8, 0xff, 0xe1, ((app1.length + 2) >> 8) & 0xff, (app1.length + 2) & 0xff, ...app1, 0xff, 0xd9];
    expect(readExifTakenAt(new Uint8Array(bytes).buffer)).toBe("2026-11-20T09:15:00");
    expect(readExifTakenAt(new Uint8Array([0x89, 0x50]).buffer)).toBeNull();
  });
});

function setup() {
  const data = memoryStorage();
  const actor: { current: Actor | null } = { current: { id: "u_admin", role: "admin" } };
  const quotes = new SessionStorageRepository(() => data, 0, true, async () => actor.current?.id ?? null);
  const crm = new SessionStorageCrmRepository({
    storage: () => data,
    quotes,
    getActor: async () => actor.current!.id,
    isAdmin: async () => actor.current?.role === "admin",
    latencyMs: 0,
  });
  const people = new PeopleStore(() => data);
  const settings = new SettingsStore(() => data);
  const notifications = new NotificationStore(() => data);
  const repo = new LocalProjectRepository({
    storage: () => data,
    sources: { enquiries: () => crm.readAllEnquiries(), clients: () => crm.readAllClients(), quotations: () => quotes.readAllRecords() },
    people,
    settings,
    notifications,
    getActor: async () => actor.current,
    latencyMs: 0,
  });
  const settingsRepo = new LocalSettingsRepository(settings, async () => actor.current?.role ?? null);
  return { data, actor, crm, repo, notifications, settingsRepo };
}

const finaliseKalyani = (crm: SessionStorageCrmRepository) =>
  crm.changeStatus("e_kalyani", { to: "finalised", finalised: { quotationId: seedQuoteId("15", "01"), poNumber: "KSL/PO/1", poDate: todayIso() } });

describe("LocalProjectRepository", () => {
  it("creates exactly one project per Finalised enquiry, pre-filled, and notifies admins", async () => {
    const { crm, repo, notifications } = setup();
    const before = await repo.list({ statuses: [] });
    expect(before.filter((p) => p.enquiryId).map((p) => p.enquiryId).sort()).toEqual(["e_agartala", "e_poly"]);
    expect((await repo.reconcile()).created).toEqual([]);

    await finaliseKalyani(crm);
    const { created } = await repo.reconcile();
    expect(created).toHaveLength(1);
    expect((await repo.reconcile()).created).toEqual([]);

    const p = await repo.get(created[0]);
    expect(p).toMatchObject({ enquiryId: "e_kalyani", quotationId: seedQuoteId("15", "01"), quotationRevision: 1, poNumber: "KSL/PO/1", projectManagerId: "u_rahul", status: "active" });
    expect(p.code).toMatch(/^PRJ-\d{4}-\d{3}$/);
    expect(p.stages.map((s) => s.weight)).toEqual([10, 40, 10, 30, 5, 5]);
    expect(p.stages[1].tasks.map((t) => t.name)).toEqual(DEFAULT_TEMPLATES.factory.map((t) => t.name));
    expect(p.stages.flatMap((s) => s.tasks).filter((t) => t.measure === "quantity").every((t) => t.total === null)).toBe(true);
    expect(p.money!.valueWithGst).toBeGreaterThan(p.money!.valueBasic);
    expect(p.money!.milestones.length).toBeGreaterThan(0);
    expect(p.money!.milestones.reduce((a, m) => a + m.amount, 0)).toBe(p.money!.valueWithGst);
    expect((await notifications.list("u_admin")).some((n) => n.kind === "project_created" && n.href.includes(p.id))).toBe(true);
  });

  it("gives Staff only their team's projects, without money", async () => {
    const { repo, actor } = setup();
    const all = await repo.list({ statuses: [] });
    expect(all).toHaveLength(5);
    actor.current = { id: "u_priya", role: "staff" };
    const mine = await repo.list({ statuses: [] });
    expect(mine.map((p) => p.name)).toEqual(["Poly houses at RIL, Nagpur"]);
    expect(mine[0].value).toBeNull();
    const p = await repo.get(mine[0].id);
    expect(p.money).toBeNull();
    const ev = await repo.events(p.id, { limit: 500 });
    expect(ev.items.some((e) => e.type === "payment" || e.adminOnly)).toBe(false);
    const other = all.find((x) => x.name === "Godown at Sanaswadi")!;
    await expect(repo.get(other.id)).rejects.toHaveProperty("name", "ForbiddenError");
    // Sneha's time on the Sanaswadi team has ended; she still sees Talegaon.
    actor.current = { id: "u_sneha", role: "staff" };
    expect((await repo.list({ statuses: [] })).map((x) => x.name)).toEqual(["Factory shed – Talegaon"]);
  });

  it("keeps every progress update, never exceeds the total and logs to the timeline", async () => {
    const { repo, actor } = setup();
    const p = (await repo.list()).find((x) => x.name === "Factory shed – Talegaon")!;
    actor.current = { id: "u_sneha", role: "staff" };
    let proj = await repo.get(p.id);
    await repo.addTask(p.id, "design", { name: "Foundation drawings", measure: "quantity", unit: "drawings", total: 10, weight: null, plannedStart: "", plannedEnd: "", assignedTo: "u_sneha" });
    proj = await repo.get(p.id);
    const t = proj.stages[0].tasks.at(-1)!;
    await repo.addUpdate(p.id, t.id, { workDate: todayIso(), value: 6, remarks: "", delayReason: "", photos: [] });
    await expect(repo.addUpdate(p.id, t.id, { workDate: todayIso(), value: 5, remarks: "", delayReason: "", photos: [] })).rejects.toThrow(/above the total/);
    await repo.addUpdate(p.id, t.id, { id: "upd_fixed", workDate: todayIso(), value: 4, remarks: "", delayReason: "", photos: [] });
    // Same id again (e.g. an offline retry) is not applied twice.
    await repo.addUpdate(p.id, t.id, { id: "upd_fixed", workDate: todayIso(), value: 4, remarks: "", delayReason: "", photos: [] });
    const ups = await repo.listUpdates(p.id, t.id);
    expect(ups.map((u) => u.runningTotal)).toEqual([10, 6]);
    expect((await repo.get(p.id)).stages[0].tasks.at(-1)!.completed).toBe(10);
    const ev = await repo.events(p.id, { types: ["progress"] });
    expect(ev.items[0].text).toMatch(/Foundation drawings \+4 drawings \(10 of 10, 100%\)/);
    await expect(repo.deleteTask(p.id, t.id)).rejects.toHaveProperty("name", "ForbiddenError");
  });

  it("warns when the linked enquiry is reopened, and the admin can keep the project", async () => {
    const { repo, crm } = setup();
    const p = (await repo.list({ statuses: [] })).find((x) => x.enquiryId === "e_poly")!;
    await crm.reopen("e_poly", "PO cancelled by client, renegotiating");
    await repo.reconcile();
    expect((await repo.get(p.id)).enquiryWarning).toBe("open");
    await repo.resolveEnquiryWarning(p.id, true, "Work continues on the agreed part");
    expect((await repo.get(p.id)).enquiryWarning).toBe("kept");
    await repo.reconcile();
    expect((await repo.get(p.id)).enquiryWarning).toBe("kept");
  });

  it("records payments instantly, completes only after handover, and logs detail changes", async () => {
    const { repo } = setup();
    const p = (await repo.list()).find((x) => x.name === "Godown at Sanaswadi")!;
    const before = (await repo.get(p.id)).money!;
    const received = before.payments.reduce((a, x) => a + x.amount, 0);
    const after = await repo.addPayment(p.id, { date: todayIso(), amount: 500000, mode: "neft", reference: "UTR1", milestoneId: before.milestones[1].id });
    expect(after.money!.payments.reduce((a, x) => a + x.amount, 0)).toBe(received + 500000);
    await expect(repo.setStatus(p.id, "completed", "")).rejects.toThrow(/Handover/);
    await expect(repo.setStatus(p.id, "on_hold", "")).rejects.toThrow(/reason/);
    await repo.setPlannedCompletion(p.id, "2027-03-31", "Client drawing approval delay");
    const proj = await repo.get(p.id);
    expect(proj.plannedCompletionBaseline).not.toBe("2027-03-31");
    const ev = await repo.events(p.id, { types: ["detail", "payment"] });
    expect(ev.items.map((e) => e.text).join("\n")).toMatch(/Planned completion changed .* → 31 Mar 2027, reason: Client drawing approval delay/);
    expect(ev.items.some((e) => e.type === "payment" && /₹5,00,000 received/.test(e.text))).toBe(true);
  });

  it("notes: tags, @mentions notify, only the author edits, automatic entries are locked", async () => {
    const { repo, actor, notifications } = setup();
    const p = (await repo.list()).find((x) => x.enquiryId === "e_poly")!;
    actor.current = { id: "u_rahul", role: "staff" };
    const n = await repo.addNote(p.id, { text: "Crane arrives Monday", tag: "site_issue", mentions: ["u_priya"], files: [] });
    expect((await notifications.list("u_priya")).some((x) => x.kind === "mention" && x.key === `mention:${n.id}`)).toBe(true);
    await expect(repo.addNote(p.id, { text: "x", tag: "general", mentions: ["u_sneha"], files: [] })).rejects.toThrow(/team members/);
    actor.current = { id: "u_priya", role: "staff" };
    await expect(repo.editNote(p.id, n.id, "changed", "general")).rejects.toHaveProperty("name", "ForbiddenError");
    const auto = (await repo.events(p.id, { types: ["progress"] })).items[0];
    await expect(repo.deleteNote(p.id, auto.id)).rejects.toThrow(/Automatic/);
    actor.current = { id: "u_admin", role: "admin" };
    await repo.deleteNote(p.id, n.id);
    expect((await repo.events(p.id, { types: ["note"], tag: "site_issue" })).items.some((e) => e.id === n.id)).toBe(false);
  });

  it("uses changed task templates for new projects only", async () => {
    const { repo, crm, settingsRepo } = setup();
    const existing = (await repo.list({ statuses: [] }))[0];
    await settingsRepo.saveTemplates("design", [{ key: "", name: "Soil report reviewed", measure: "percent", unit: "%" }]);
    await finaliseKalyani(crm);
    const { created } = await repo.reconcile();
    expect((await repo.get(created[0])).stages[0].tasks.map((t) => t.name)).toEqual(["Soil report reviewed"]);
    expect((await repo.get(existing.id)).stages[0].tasks.map((t) => t.name)).not.toEqual(["Soil report reviewed"]);
  });

  it("keeps the budget per work stage and moves older cost-category budgets into their stage", async () => {
    const { repo, data } = setup();
    const p = (await repo.list()).find((x) => x.name === "Godown at Sanaswadi")!;
    const saved = await repo.saveBudget(p.id, { design: 100000, factory: 4000000, transport: 250000, site: 900000, labour: 200000 });
    expect(saved.money!.budget).toEqual({ design: 100000, factory: 4000000, transport: 250000, site: 900000, labour: 200000 });
    await expect(repo.saveBudget(p.id, { raw_steel: 5 } as never)).rejects.toThrow(/Unknown budget line/);

    const stored = JSON.parse(data.getItem(PROJECTS_KEY)!);
    stored.find((x: { id: string }) => x.id === p.id).money.budget = { raw_steel: 300, paint: 50, transport: 20, crane: 10, erection_labour: 5 };
    data.setItem(PROJECTS_KEY, JSON.stringify(stored));
    expect((await repo.get(p.id)).money!.budget).toEqual({ factory: 350, transport: 20, site: 10, labour: 5 });
  });

  it("rescales progress when a stage is marked Not applicable and checks stage weights", async () => {
    const { repo } = setup();
    const p = (await repo.list()).find((x) => x.enquiryId === "e_poly")!;
    const before = (await repo.get(p.id)).stages;
    const after = (await repo.setStageApplicable(p.id, "erection", true)).stages;
    expect(projectPct(after)).not.toBeCloseTo(projectPct(before));
    await expect(repo.setWeights(p.id, { design: 10, factory: 40, transport: 10, erection: 30, quality: 5, handover: 10 })).rejects.toThrow(/100%/);
  });
});
