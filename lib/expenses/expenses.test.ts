import { describe, expect, it } from "vitest";
import { LocalAttendanceRepository } from "@/lib/attendance/local-repo";
import { SessionStorageCrmRepository } from "@/lib/crm/session-repo";
import { SessionStorageRepository } from "@/lib/data/session-repo";
import { PeopleStore } from "@/lib/employees/store";
import { NotificationStore } from "@/lib/notifications/store";
import { LocalProjectRepository, type Actor } from "@/lib/projects/local-repo";
import { SettingsStore } from "@/lib/settings/store";
import { memoryStorage } from "@/lib/storage";
import { addDays, todayIso } from "@/lib/projects/rules";
import { LocalExpenseRepository } from "./local-repo";
import { alertsCrossed, findDuplicates, spendByGroup } from "./rules";
import type { Expense, ExpenseInput } from "./types";

function setup() {
  const data = memoryStorage();
  const base = new Date();
  base.setHours(12, 0, 0, 0);
  const clock = { now: base.getTime() };
  const actor: { current: Actor | null } = { current: { id: "u_admin", role: "admin" } };
  const quotes = new SessionStorageRepository(() => data, 0, true);
  const crm = new SessionStorageCrmRepository({ storage: () => data, quotes, getActor: async () => actor.current!.id, latencyMs: 0 });
  const people = new PeopleStore(() => data);
  const settings = new SettingsStore(() => data);
  const notifications = new NotificationStore(() => data, () => clock.now);
  const getActor = async () => actor.current;
  const projects = new LocalProjectRepository({
    storage: () => data,
    sources: { enquiries: () => crm.readAllEnquiries(), clients: () => crm.readAllClients(), quotations: () => quotes.readAllRecords() },
    people,
    settings,
    notifications,
    getActor,
    latencyMs: 0,
    now: () => clock.now,
  });
  const attendance = new LocalAttendanceRepository({ storage: () => data, people, settings, projects, notifications, getActor, latencyMs: 0, now: () => clock.now });
  const repo = new LocalExpenseRepository({ storage: () => data, people, settings, projects, attendance, notifications, getActor, latencyMs: 0, now: () => clock.now });
  const today = todayIso(clock.now);
  const poly = async () => (await projects.list({ statuses: [] })).find((p) => p.name.includes("Poly houses"))!;
  return { actor, projects, repo, notifications, today, poly };
}

const input = (today: string, over: Partial<ExpenseInput> = {}): ExpenseInput => ({
  date: today,
  category: "site",
  group: "",
  description: "Crane hire for rafter lifting, 8 hours",
  amountPaise: 4_200_000,
  gstPaise: 640_678,
  paidTo: "Sai Krupa Cranes",
  quantity: 8,
  unit: "hours",
  stage: "",
  bill: null,
  billNumber: "SKC/9001",
  ...over,
});

describe("expense rules", () => {
  it("raises budget alerts only when 80 % / 100 % is newly crossed", () => {
    expect(alertsCrossed(100_00, 70_00, 85_00)).toEqual([80]);
    expect(alertsCrossed(100_00, 85_00, 101_00)).toEqual([100]);
    expect(alertsCrossed(100_00, 50_00, 120_00)).toEqual([80, 100]);
    expect(alertsCrossed(100_00, 85_00, 90_00)).toEqual([]);
    expect(alertsCrossed(0, 0, 90_00)).toEqual([]);
  });

  it("adds up spend for every work stage, including Labour", () => {
    const e = (group: string, status: string, amountPaise: number) => ({ group, status, amountPaise }) as Expense;
    expect(spendByGroup([e("labour", "paid", 500), e("labour", "accepted", 250), e("site", "requested", 999)])).toEqual({ design: 0, factory: 0, transport: 0, site: 0, labour: 750 });
  });

  it("flags duplicate bills by bill number or paid to + amount within a day", () => {
    const e = { id: "x", code: "EXP-2026-0001", billNumber: "B-1", paidTo: "Sai Krupa", amountPaise: 100, date: "2026-11-20", status: "accepted" } as Expense;
    expect(findDuplicates({ billNumber: "b-1", paidTo: "", amountPaise: 5, date: "2026-11-01" }, [e])[0]?.why).toMatch(/bill number/);
    expect(findDuplicates({ billNumber: "", paidTo: "sai krupa", amountPaise: 100, date: "2026-11-21" }, [e])).toHaveLength(1);
    expect(findDuplicates({ billNumber: "", paidTo: "sai krupa", amountPaise: 100, date: "2026-11-23" }, [e])).toHaveLength(0);
    expect(findDuplicates({ billNumber: "B-1", paidTo: "", amountPaise: 5, date: "" }, [{ ...e, status: "rejected" }])).toHaveLength(0);
  });
});

describe("LocalExpenseRepository", () => {
  it("lets a site manager request (Requested) but not accept, edit or delete; admins are notified", async () => {
    const { actor, repo, notifications, today, poly } = setup();
    const p = await poly();
    actor.current = { id: "u_rahul", role: "staff" };
    const e = await repo.create(p.id, input(today));
    expect(e).toMatchObject({ status: "requested", category: "site", group: "site", requestedBy: "u_rahul" });
    await expect(repo.create(p.id, input(today, { category: "crane" }))).rejects.toThrow(/Choose a work stage|category/);
    expect(e.code).toMatch(/^EXP-\d{4}-\d{4}$/);
    await expect(repo.create(p.id, input(today), { status: "paid", payment: { mode: "cash", reference: "", date: today } })).rejects.toThrow(/Only admins/);
    await expect(repo.accept([e.id])).rejects.toThrow(/Only admins/);
    await expect(repo.edit(e.id, input(today), "")).rejects.toThrow(/Only admins/);
    await expect(repo.remove(e.id, "x")).rejects.toThrow(/Only admins/);
    expect((await notifications.list("u_admin")).some((n) => n.kind === "expense_requested")).toBe(true);
    actor.current = { id: "u_sneha", role: "staff" };
    await expect(repo.list({ projectId: p.id })).rejects.toThrow(/site managers/);
  });

  it("follows Requested → Accepted → Paid; only Accepted + Paid count as spend; logs the timeline", async () => {
    const { actor, repo, projects, today, poly } = setup();
    const p = await poly();
    const before = (await repo.budget(p.id)).totalSpentPaise;
    actor.current = { id: "u_rahul", role: "staff" };
    const e = await repo.create(p.id, input(today, { billNumber: "NEW-1" }));
    actor.current = { id: "u_admin", role: "admin" };
    expect((await repo.budget(p.id)).totalSpentPaise).toBe(before);
    await repo.accept([e.id]);
    expect((await repo.budget(p.id)).totalSpentPaise).toBe(before + 4_200_000);
    // The payment reference is optional.
    const noRef = await repo.create(p.id, input(today, { billNumber: "NOREF-1" }), { status: "accepted" });
    expect(await repo.pay([noRef.id], { mode: "neft", reference: "", date: today })).toBe(1);
    expect((await repo.get(noRef.id)).payment).toMatchObject({ mode: "neft", reference: "" });
    await expect(repo.pay([e.id], { mode: "neft", reference: "", date: addDays(today, 1) })).rejects.toThrow(/future/);
    actor.current = { id: "e_meera", role: "accountant" };
    expect(await repo.pay([e.id], { mode: "neft", reference: "4471", date: today })).toBe(1);
    await expect(repo.pay([e.id], { mode: "neft", reference: "4471", date: today })).rejects.toThrow(/only accepted/);
    actor.current = { id: "u_admin", role: "admin" };
    const events = (await projects.events(p.id, { types: ["expense"], limit: 50 })).items.map((x) => x.text);
    expect(events).toContain(`Expense ${e.code} accepted: ₹42,000`);
    expect(events).toContain(`Expense ${e.code} paid: ₹42,000 by NEFT / RTGS, ref. 4471`);
    expect(events.some((t) => t.startsWith("Expense requested: Crane hire") && t.includes("Rahul Jadhav"))).toBe(true);
    // Site managers see expense entries in the timeline; other team members don't.
    actor.current = { id: "u_rahul", role: "staff" };
    expect((await projects.events(p.id, { types: ["expense"] })).items.length).toBeGreaterThan(0);
  });

  it("needs reasons to reject, delete or change the amount of an accepted expense; keeps the history", async () => {
    const { repo, today, poly } = setup();
    const p = await poly();
    const e = await repo.create(p.id, input(today, { billNumber: "R-1" }), { status: "accepted" });
    await expect(repo.edit(e.id, input(today, { billNumber: "R-1", amountPaise: 3_800_000 }), "")).rejects.toThrow(/reason/);
    const ed = await repo.edit(e.id, input(today, { billNumber: "R-1", amountPaise: 3_800_000 }), "corrected bill");
    expect(ed.history.at(-1)).toMatchObject({ action: "edited", reason: "corrected bill", changes: { Amount: ["₹42,000", "₹38,000"] } });
    const moved = await repo.edit(e.id, input(today, { billNumber: "R-1", amountPaise: 3_800_000, category: "labour" }), "labour, not site");
    expect(moved).toMatchObject({ category: "labour", group: "labour" });
    await expect(repo.reject(e.id, "dup")).rejects.toThrow(/only requested/);
    await expect(repo.remove(e.id, "")).rejects.toThrow(/reason/);
    await repo.remove(e.id, "entered on wrong project");
    expect((await repo.list({ projectId: p.id })).items.some((x) => x.id === e.id)).toBe(false);
    expect((await repo.list({ projectId: p.id, showDeleted: true })).items.find((x) => x.id === e.id)?.status).toBe("deleted");
  });

  it("fills casual labour from attendance and refuses a second request for the same day", async () => {
    const { actor, repo, poly } = setup();
    const p = await poly();
    actor.current = { id: "u_rahul", role: "staff" };
    const days = await repo.uncoveredCasualDays(p.id);
    expect(days.length).toBeGreaterThan(0);
    const fill = await repo.casualFill(p.id, days[0].date);
    expect(fill.lines.length).toBe(days[0].workers);
    expect(fill.totalPaise).toBe(fill.lines.reduce((s, l) => s + l.amountPaise, 0));
    expect(fill.lines.filter((l) => l.status === "half").every((l) => l.amountPaise * 2 === l.ratePaise)).toBe(true);
    const req = { date: days[0].date, category: "labour", group: "" as const, description: "Casual labour", amountPaise: fill.totalPaise || 100, gstPaise: null, paidTo: "Raju Mukadam", quantity: null, unit: "", stage: "" as const, bill: null, billNumber: "", casual: { date: days[0].date, lines: fill.lines } };
    await repo.create(p.id, req);
    expect((await repo.uncoveredCasualDays(p.id)).some((d) => d.date === days[0].date)).toBe(false);
    await expect(repo.create(p.id, req)).rejects.toThrow(/already requested/);
  });

  it("alerts admins once when a work stage crosses 80 % of its budget", async () => {
    const { repo, notifications, today, poly } = setup();
    const p = await poly();
    const b = await repo.budget(p.id);
    const site = b.lines.find((l) => l.group === "site")!;
    const need = Math.ceil(site.budgetPaise * 0.8) - site.spentPaise + 100;
    await repo.create(p.id, input(today, { billNumber: "BIG-1", amountPaise: need }), { status: "accepted" });
    const alerts = (await notifications.list("u_admin")).filter((n) => n.kind === "budget_alert" && n.key.includes(":site:80"));
    expect(alerts).toHaveLength(1);
  });
});
