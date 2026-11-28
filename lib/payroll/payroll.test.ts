import { describe, expect, it } from "vitest";
import { LocalAttendanceRepository } from "@/lib/attendance/local-repo";
import { SessionStorageCrmRepository } from "@/lib/crm/session-repo";
import { SessionStorageRepository } from "@/lib/data/session-repo";
import { PeopleStore } from "@/lib/employees/store";
import { NotificationStore } from "@/lib/notifications/store";
import { halfFloorRupee } from "@/lib/paise";
import { LocalProjectRepository, type Actor } from "@/lib/projects/local-repo";
import { todayIso } from "@/lib/projects/rules";
import { SettingsStore } from "@/lib/settings/store";
import { memoryStorage } from "@/lib/storage";
import { addMonths, monthOf } from "./calc";
import { LocalPayrollRepository } from "./local-repo";

function setup(seed = false) {
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
  const repo = new LocalPayrollRepository({ storage: () => data, people, settings, attendance, notifications, getActor, latencyMs: 0, seed, now: () => clock.now });
  const today = todayIso(clock.now);
  const prev = addMonths(monthOf(today), -1);
  return { actor, repo, attendance, projects, notifications, today, prev };
}

const money = (rupees: number, date: string, mode: "cash" | "neft" = "neft") => ({ amountPaise: rupees * 100, date, mode, reference: mode === "cash" ? "" : "UTR 1", remarks: "" });

describe("LocalPayrollRepository", () => {
  it("closes a finished month, recovers advances up to 50 % of gross and carries the rest forward", async () => {
    const { repo, prev } = setup();
    await repo.giveAdvance("e_kavita", money(40000, `${prev}-05`));
    const v = await repo.employeeMonth("e_kavita", prev);
    expect(v).toMatchObject({ status: "open", canClose: true, advancesThisMonthPaise: 4_000_000 });
    const cap = halfFloorRupee(v.figures!.grossPaise);
    expect(v.figures!.maxRecoveryPaise).toBe(cap);
    await expect(repo.closeMonth("e_kavita", prev, { recoveryPaise: cap + 100, oneOffs: [] })).rejects.toThrow(/at most/);
    const closed = await repo.closeMonth("e_kavita", prev, { recoveryPaise: null, oneOffs: [] });
    expect(closed.figures.recoveryPaise).toBe(cap);
    expect(closed.figures.netPaise).toBe(closed.figures.grossPaise - cap);
    const cur = await repo.employeeMonth("e_kavita", monthOf(new Date().toISOString().slice(0, 10)));
    expect(cur.outstandingForMonthPaise).toBe(4_000_000 - cap);
    expect(cur.canClose).toBe(false);
    expect(cur.closeBlockers.join(" ")).toMatch(/hasn't ended/);
    await expect(repo.giveAdvance("e_kavita", money(100, `${prev}-20`))).rejects.toThrow(/closed/);
    const after = await repo.employeeMonth("e_kavita", prev);
    expect(after.checks.every((c) => c.ok)).toBe(true);
  });

  it("settles a finished month once: one payment per employee for exactly the balance, never more", async () => {
    const { repo, actor, prev, today } = setup();
    const pre = await repo.settlePreview(prev);
    expect(pre.ready.length).toBeGreaterThan(3);
    expect(pre.ready.some((l) => l.employee.id === "e_ganesh")).toBe(false); // daily wage: not in payroll
    const total = pre.ready.reduce((s, l) => s + l.balancePaise, 0);
    const input = { month: prev, date: today, mode: "bank_bulk" as const, reference: "HDFC BULK 1", confirmTotalPaise: total - 100 };
    await expect(repo.settleAll(input)).rejects.toThrow(/exact total/);
    actor.current = { id: "e_meera", role: "accountant" };
    const res = await repo.settleAll({ ...input, confirmTotalPaise: total });
    expect(res.paid).toHaveLength(pre.ready.length);
    expect(res.batch?.totalPaise).toBe(total);
    for (const l of pre.ready) expect((await repo.employeeMonth(l.employee.id, prev)).status).toBe("paid");
    expect((await repo.settlePreview(prev)).ready).toHaveLength(0);
    expect((await repo.settleAll({ ...input, confirmTotalPaise: 0 })).batch).toBeNull();
    await expect(repo.recordPayment("e_kavita", { ...money(1, today), type: "salary", forMonth: prev })).rejects.toThrow(/Nothing is left/);
    await expect(repo.reverseBatch(res.batch!.id, "wrong file")).rejects.toThrow(/Only admins/);
    actor.current = { id: "u_admin", role: "admin" };
    await repo.reverseBatch(res.batch!.id, "Bank rejected the file");
    expect((await repo.employeeMonth("e_kavita", prev)).status).toBe("closed");
    expect((await repo.log()).some((l) => l.action === "reversed")).toBe(true);
  });

  it("pays a closed month only up to its balance and reopens only without salary payments", async () => {
    const { repo, actor, prev, today } = setup();
    const m = await repo.closeMonth("u_staff", prev, { recoveryPaise: null, oneOffs: [{ label: "Bonus", amountPaise: 500_000, reason: "Diwali" }] });
    expect(m.figures.netPaise).toBe(m.figures.grossPaise + 500_000);
    await expect(repo.recordPayment("u_staff", { ...money(m.figures.netPaise / 100 + 1, today), type: "salary", forMonth: prev })).rejects.toThrow(/Only/);
    actor.current = { id: "e_meera", role: "accountant" };
    await expect(repo.reopenMonth("u_staff", prev, "x")).rejects.toThrow(/Only admins/);
    const part = await repo.recordPayment("u_staff", { ...money(10000, today), type: "salary", forMonth: prev });
    expect((await repo.employeeMonth("u_staff", prev)).status).toBe("partly_paid");
    actor.current = { id: "u_admin", role: "admin" };
    await expect(repo.reopenMonth("u_staff", prev, "wrong bonus")).rejects.toThrow(/paid/);
    await expect(repo.editPayment(part.id, money(20000, today), "")).rejects.toThrow(/reason/);
    const ed = await repo.editPayment(part.id, money(20000, today), "typo");
    expect(ed.history[0]).toMatchObject({ reason: "typo", from: { amountPaise: 1_000_000 } });
    await repo.deletePayment(part.id, "entered twice");
    await repo.reopenMonth("u_staff", prev, "wrong bonus");
    expect((await repo.employeeMonth("u_staff", prev)).status).toBe("open");
  });

  it("keeps a closed month frozen when attendance changes and carries the difference to the next month", async () => {
    const { repo, attendance, prev } = setup();
    const closed = await repo.closeMonth("e_kavita", prev, { recoveryPaise: null, oneOffs: [] });
    const day = closed.calc.days.find((d) => d.kind === "present")!.date;
    await attendance.setRecord("e_kavita", day, { status: "absent", location: null, projectId: null, remarks: "corrected" });
    const v = await repo.employeeMonth("e_kavita", prev);
    expect(v.figures!.grossPaise).toBe(closed.figures.grossPaise);
    expect(v.pendingAdjustmentPaise).toBeLessThan(0);
    const cur = await repo.employeeMonth("e_kavita", addMonths(prev, 1));
    expect(cur.adjustmentsIn).toEqual([{ fromMonth: prev, amountPaise: v.pendingAdjustmentPaise }]);
    expect(cur.figures!.adjustmentPaise).toBe(v.pendingAdjustmentPaise);
  });

  it("lets only Admins and the Accountant open payroll", async () => {
    const { repo, actor, prev } = setup();
    actor.current = { id: "u_priya", role: "staff" };
    await expect(repo.employeeMonth("u_priya", prev)).rejects.toThrow(/doesn.t include the Payroll page/);
    await expect(repo.companyMonth(prev)).rejects.toThrow(/doesn.t include the Payroll page/);
  });

  it("seeds a settled last month with one employee open and reminds from the 3rd", async () => {
    const { repo, notifications, prev, today } = setup(true);
    const c = await repo.companyMonth(prev);
    expect(c.rows.length).toBeGreaterThan(3);
    expect(c.summary.balancePaise).toBe(c.rows.reduce((s, r) => s + r.balancePaise, 0));
    expect(c.summary.netPaise - c.summary.paidPaise).toBe(c.summary.balancePaise);
    await repo.reconcileReminders();
    const due = (await notifications.list("u_admin")).filter((n) => n.kind === "payroll_due");
    expect(due.length).toBe(Number(today.slice(8)) >= 3 ? 1 : 0);
  });
});
