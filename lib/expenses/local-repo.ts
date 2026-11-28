import { roleHasPage } from "@/lib/auth/roles";
import type { Role } from "@/lib/auth/types";
import { CrmNotFoundError, ValidationError } from "@/lib/crm/types";
import { activeAdminIds } from "@/lib/employees/rules";
import type { PeopleStore } from "@/lib/employees/store";
import type { NotificationStore } from "@/lib/notifications/store";
import type { NewNotification } from "@/lib/notifications/types";
import { formatPaise, rupeesToPaise, type Paise } from "@/lib/paise";
import { BUDGET_GROUPS, LEGACY_BUDGET_GROUP, stageMeta, type BudgetGroup } from "@/lib/projects/config";
import type { EventInput, LocalProjectRepository } from "@/lib/projects/local-repo";
import { currentStage, isSiteManager, normaliseBudget, todayIso } from "@/lib/projects/rules";
import { ProjectForbiddenError, type Project, type StageKey } from "@/lib/projects/types";
import type { LocalAttendanceRepository } from "@/lib/attendance/local-repo";
import type { SettingsStore } from "@/lib/settings/store";
import { appStorage, type KeyValueStorage } from "@/lib/storage";
import { CASUAL_LABOUR_CATEGORY, EXPENSE_CATEGORIES, categoryLabel, expenseStatusMeta, isCategory, isSpend, paymentModeLabel } from "./config";
import type { ExpensePageAccess, ExpenseRepository } from "./repository";
import { alertsCrossed, budgetVsActual, casualLine, expenseTotals, findDuplicates, formatExpenseCode, matchesFilters, paymentIssues, showPaise, spendByGroup, validateExpense } from "./rules";
import { seedExpenses } from "./seed";
import {
  ExpenseTransitionError,
  type AddAs,
  type CasualFill,
  type Expense,
  type ExpenseAction,
  type ExpenseFilters,
  type ExpenseInput,
  type ExpensePayment,
  type ProjectExpenseAccess,
  type UncoveredCasualDay,
} from "./types";

export const EXPENSES_KEY = "pppl.expenses.v1";
export const EXPENSE_COUNTER_KEY = "pppl.expense-counter.v1";

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const newId = (p: string) => `${p}_${typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2)}`;

export interface Actor {
  id: string;
  role: Role;
}

export interface LocalExpenseOptions {
  storage?: () => KeyValueStorage;
  people: PeopleStore;
  settings: SettingsStore;
  projects: Pick<LocalProjectRepository, "readAllProjects" | "appendEvents">;
  attendance: Pick<LocalAttendanceRepository, "readAllRecords" | "readCasualWorkers">;
  notifications: NotificationStore;
  getActor: () => Promise<Actor | null>;
  latencyMs?: number;
  seed?: boolean;
  now?: () => number;
}

/**
 * TEMPORARY expense store in the browser's localStorage. Replace with ApiExpenseRepository
 * (lib/expenses/api-repo.ts) when the cloud database is ready. Permission checks here only protect the UI;
 * the real API must enforce them on the server.
 */
export class LocalExpenseRepository implements ExpenseRepository {
  readonly label = "This browser (temporary)";
  private readonly storage: () => KeyValueStorage;
  private readonly latencyMs: number;
  private readonly now: () => number;

  constructor(private readonly o: LocalExpenseOptions) {
    this.storage = o.storage ?? appStorage;
    this.latencyMs = o.latencyMs ?? 100;
    this.now = o.now ?? (() => Date.now());
  }

  /* ---------- storage ---------- */

  private async delay() {
    if (this.latencyMs > 0) await new Promise((r) => setTimeout(r, this.latencyMs));
  }
  private iso() {
    return new Date(this.now()).toISOString();
  }
  private today() {
    return todayIso(this.now());
  }
  private ensure() {
    if (this.storage().getItem(EXPENSES_KEY) !== null) return;
    if (this.o.seed === false) {
      this.storage().setItem(EXPENSES_KEY, "[]");
      return;
    }
    const s = seedExpenses({
      now: this.now(),
      projects: this.o.projects.readAllProjects(),
      records: this.o.attendance.readAllRecords(),
      casual: this.o.attendance.readCasualWorkers(),
      employees: this.o.people.employees(),
    });
    this.storage().setItem(EXPENSES_KEY, JSON.stringify(s.expenses));
    this.storage().setItem(EXPENSE_COUNTER_KEY, JSON.stringify(s.counter));
    this.o.projects.appendEvents(s.events);
  }
  private all(): Expense[] {
    this.ensure();
    try {
      const v = JSON.parse(this.storage().getItem(EXPENSES_KEY) ?? "[]");
      // Expenses saved with the earlier category list (raw steel, crane hire…) are booked to their work stage.
      return Array.isArray(v) ? (v as Expense[]).map((e) => (isCategory(e.category) ? e : { ...e, category: LEGACY_BUDGET_GROUP[e.category] ?? e.group, group: LEGACY_BUDGET_GROUP[e.category] ?? e.group })) : [];
    } catch {
      return [];
    }
  }
  private save(list: Expense[]) {
    this.storage().setItem(EXPENSES_KEY, JSON.stringify(list));
  }
  private nextCode() {
    const year = new Date(this.now()).getFullYear();
    let c: Record<string, number> = {};
    try {
      c = JSON.parse(this.storage().getItem(EXPENSE_COUNTER_KEY) ?? "{}") ?? {};
    } catch {
      c = {};
    }
    const n = (c[year] ?? 0) + 1;
    this.storage().setItem(EXPENSE_COUNTER_KEY, JSON.stringify({ ...c, [year]: n }));
    return formatExpenseCode(year, n);
  }

  /* ---------- access ---------- */

  private async actor(): Promise<Actor> {
    await this.delay();
    const a = await this.o.getActor();
    if (!a) throw new ProjectForbiddenError("Please sign in again.");
    return a;
  }
  private async admin(): Promise<Actor> {
    const a = await this.actor();
    if (a.role !== "admin") throw new ProjectForbiddenError("Only admins can do this.");
    return a;
  }
  private project(id: string): Project {
    const p = this.o.projects.readAllProjects().find((x) => x.id === id);
    if (!p) throw new CrmNotFoundError("Project", id);
    return p;
  }
  private accessFor(p: Project, a: Actor): ProjectExpenseAccess {
    const isAdmin = a.role === "admin";
    const manager = isSiteManager(p, a.id, this.today());
    return {
      isAdmin,
      canView: isAdmin || manager,
      canRequest: isAdmin || (manager && (p.status === "active" || p.status === "on_hold")),
      canPay: roleHasPage(a.role, "expenses"),
    };
  }
  private viewProject(projectId: string, a: Actor) {
    const p = this.project(projectId);
    if (!this.accessFor(p, a).canView) throw new ProjectForbiddenError("Only the project's site managers and admins can see its expenses.");
    return p;
  }
  private name(id: string) {
    return this.o.people.employees().find((e) => e.id === id)?.fullName ?? id;
  }
  private categoryLabel(v: string) {
    return categoryLabel(v);
  }
  private find(list: Expense[], id: string) {
    const e = list.find((x) => x.id === id);
    if (!e) throw new CrmNotFoundError("Expense", id);
    return e;
  }

  async projectAccess(projectId: string) {
    const a = await this.actor();
    return this.accessFor(this.project(projectId), a);
  }

  async pageAccess(): Promise<ExpensePageAccess> {
    const a = await this.actor();
    const ok = roleHasPage(a.role, "expenses");
    return { canView: ok, isAdmin: a.role === "admin", canPay: ok };
  }

  /* ---------- timeline & notifications ---------- */

  private events(by: string, items: { e: Expense; text: string }[]) {
    this.o.projects.appendEvents(
      items.map(({ e, text }) => ({ projectId: e.projectId, by, event: { type: "expense", text, audience: "managers", source: { kind: "expense", id: e.id } } satisfies EventInput })),
    );
  }
  private notify(items: NewNotification[]) {
    if (items.length) this.o.notifications.push(items);
  }
  private href(e: Expense) {
    return `/projects/${e.projectId}/expenses?open=${e.id}`;
  }
  /** Budget alerts for every work stage whose spend newly crosses 80 % / 100 %. */
  private budgetAlerts(projectId: string, before: Expense[], after: Expense[]) {
    const p = this.project(projectId);
    if (!p.money) return;
    const budget = normaliseBudget(p.money.budget);
    const b = spendByGroup(before.filter((e) => e.projectId === projectId));
    const n = spendByGroup(after.filter((e) => e.projectId === projectId));
    const admins = activeAdminIds(this.o.people.logins(), this.o.people.employees());
    const out: NewNotification[] = [];
    for (const g of BUDGET_GROUPS) {
      const budgetPaise = rupeesToPaise(budget[g.value] ?? 0);
      for (const level of alertsCrossed(budgetPaise, b[g.value], n[g.value]))
        for (const userId of admins)
          out.push({
            userId,
            kind: "budget_alert",
            title: `${p.code}: ${g.label} spend reached ${level}% of budget`,
            body: `${formatPaise(n[g.value])} of ${formatPaise(budgetPaise)} · ${p.name}`,
            href: `/projects/${p.id}/expenses`,
            key: `budget:${p.id}:${g.value}:${level}`,
          });
    }
    this.notify(out);
  }
  private decided(e: Expense, a: Actor, what: string) {
    if (e.requestedBy === a.id) return;
    const p = this.project(e.projectId);
    this.notify([
      {
        userId: e.requestedBy,
        kind: "expense_decided",
        title: `${e.code} ${what}: ${e.description}`,
        body: `${formatPaise(e.amountPaise)} · ${p.code} ${p.name}${e.status === "rejected" ? ` · ${e.rejectReason}` : ""}`,
        href: this.href(e),
        key: `expense:${e.id}:${e.status}:${e.history.length}`,
      },
    ]);
  }

  /* ---------- reading ---------- */

  async list(filters: ExpenseFilters) {
    const a = await this.actor();
    if (filters.projectId) this.viewProject(filters.projectId, a);
    else if (!roleHasPage(a.role, "expenses")) throw new ProjectForbiddenError("Your role doesn't include the Expenses page.");
    const f = { ...filters, showDeleted: a.role === "admin" ? filters.showDeleted : false, status: a.role !== "admin" && filters.status === "deleted" ? undefined : filters.status };
    const names = new Map(this.o.people.employees().map((e) => [e.id, e.fullName]));
    const items = this.all()
      .filter((e) => matchesFilters(e, f, (id) => names.get(id) ?? ""))
      .sort((x, y) => y.date.localeCompare(x.date) || y.requestedAt.localeCompare(x.requestedAt));
    return { items: clone(items), totals: expenseTotals(items) };
  }

  async get(id: string) {
    const a = await this.actor();
    const e = this.find(this.all(), id);
    if (!roleHasPage(a.role, "expenses")) this.viewProject(e.projectId, a);
    if (e.status === "deleted" && a.role !== "admin") throw new CrmNotFoundError("Expense", id);
    return clone(e);
  }

  async budget(projectId: string) {
    await this.admin();
    const p = this.project(projectId);
    return budgetVsActual(
      normaliseBudget(p.money?.budget ?? {}),
      this.all().filter((e) => e.projectId === projectId),
      EXPENSE_CATEGORIES,
    );
  }

  async spendByProject() {
    await this.admin();
    const out: Record<string, Paise> = {};
    for (const e of this.all()) if (isSpend(e.status)) out[e.projectId] = (out[e.projectId] ?? 0) + e.amountPaise;
    return out;
  }

  async duplicates(projectId: string, input: Pick<ExpenseInput, "billNumber" | "paidTo" | "amountPaise" | "date">, excludeId?: string) {
    const a = await this.actor();
    this.viewProject(projectId, a);
    return findDuplicates(input, this.all().filter((e) => e.projectId === projectId), excludeId);
  }

  private casualFor(projectId: string, date: string) {
    const workers = new Map(this.o.attendance.readCasualWorkers().map((w) => [w.id, w]));
    return this.o.attendance
      .readAllRecords()
      .filter((r) => r.personKind === "casual" && r.location === "site" && r.projectId === projectId && r.date === date && (r.status === "present" || r.status === "half"))
      .map((r) => ({ r, w: workers.get(r.personId) }));
  }
  private casualExpenseFor(list: Expense[], projectId: string, date: string, excludeId?: string) {
    return list.find((e) => e.projectId === projectId && e.casual?.date === date && e.id !== excludeId && e.status !== "rejected" && e.status !== "deleted") ?? null;
  }

  async casualFill(projectId: string, date: string): Promise<CasualFill> {
    const a = await this.actor();
    this.viewProject(projectId, a);
    const rows = this.casualFor(projectId, date);
    const lines = rows.map(({ r, w }) => casualLine(r.personId, w?.name ?? r.personId, r.status as "present" | "half", rupeesToPaise(w?.dailyRate ?? 0)));
    const existing = this.casualExpenseFor(this.all(), projectId, date);
    return {
      date,
      lines,
      unrated: lines.filter((l) => !l.ratePaise).map((l) => l.name),
      totalPaise: lines.reduce((s, l) => s + l.amountPaise, 0),
      existing: existing ? { id: existing.id, code: existing.code } : null,
    };
  }

  async uncoveredCasualDays(projectId: string): Promise<UncoveredCasualDay[]> {
    const a = await this.actor();
    this.viewProject(projectId, a);
    const list = this.all();
    const rates = new Map(this.o.attendance.readCasualWorkers().map((w) => [w.id, w.dailyRate ?? 0]));
    const byDate = new Map<string, { workers: number; manDays: number; amountPaise: Paise }>();
    for (const r of this.o.attendance.readAllRecords()) {
      if (r.personKind !== "casual" || r.location !== "site" || r.projectId !== projectId || (r.status !== "present" && r.status !== "half")) continue;
      const d = byDate.get(r.date) ?? { workers: 0, manDays: 0, amountPaise: 0 };
      d.workers++;
      d.manDays += r.status === "present" ? 1 : 0.5;
      d.amountPaise += casualLine(r.personId, "", r.status, rupeesToPaise(rates.get(r.personId) ?? 0)).amountPaise;
      byDate.set(r.date, d);
    }
    return [...byDate.entries()]
      .filter(([date]) => date < this.today() && !this.casualExpenseFor(list, projectId, date))
      .map(([date, v]) => ({ date, ...v }))
      .sort((x, y) => y.date.localeCompare(x.date));
  }

  /* ---------- changes ---------- */

  private clean(input: ExpenseInput, p: Project): Omit<Expense, "id" | "code" | "projectId" | "status" | "payment" | "rejectReason" | "deleteReason" | "deletedFrom" | "requestedBy" | "requestedAt" | "history" | "updatedAt"> {
    const issues = validateExpense(input, { today: this.today(), categories: EXPENSE_CATEGORIES });
    if (issues.length) throw new ValidationError(issues);
    return {
      date: input.date,
      category: input.category,
      group: input.category as BudgetGroup,
      description: input.description.trim().replace(/\s+/g, " "),
      amountPaise: input.amountPaise!,
      gstPaise: input.gstPaise,
      paidTo: input.paidTo.trim(),
      quantity: input.quantity,
      unit: input.quantity !== null ? input.unit.trim() : "",
      stage: input.stage || currentStage(p.stages) || null,
      bill: input.bill,
      billNumber: input.billNumber.trim(),
      casual: input.casual?.lines.length ? { date: input.casual.date, lines: input.casual.lines } : null,
    };
  }

  async create(projectId: string, input: ExpenseInput, as: AddAs = { status: "requested" }) {
    const a = await this.actor();
    const p = this.project(projectId);
    const acc = this.accessFor(p, a);
    if (!acc.canRequest) throw new ProjectForbiddenError(acc.canView ? "This project is closed; expenses can't be requested." : "Only the project's site managers and admins can request expenses.");
    if (as.status !== "requested" && !acc.isAdmin) throw new ProjectForbiddenError("Only admins can add an expense as Accepted or Paid.");
    const fields = this.clean(input, p);
    const list = this.all();
    if (fields.casual) {
      const dup = this.casualExpenseFor(list, projectId, fields.casual.date);
      if (dup) throw new ValidationError([`Casual labour for ${fields.casual.date} is already requested (${dup.code}).`]);
    }
    if (as.status === "paid") {
      const issues = paymentIssues(as.payment, this.today());
      if (issues.length) throw new ValidationError(issues);
    }
    const at = this.iso();
    const action: ExpenseAction = as.status === "requested" ? "requested" : "added";
    const e: Expense = {
      id: newId("exp"),
      code: this.nextCode(),
      projectId,
      ...fields,
      status: as.status,
      payment: as.status === "paid" ? { ...as.payment!, reference: as.payment!.reference.trim() } : null,
      rejectReason: "",
      deleteReason: "",
      deletedFrom: null,
      requestedBy: a.id,
      requestedAt: at,
      history: [{ at, by: a.id, action, ...(as.status !== "requested" ? { changes: { Status: ["", expenseStatusMeta(as.status).label] } } : {}) }],
      updatedAt: at,
    };
    const next = [...list, e];
    this.save(next);
    const amt = `${formatPaise(e.amountPaise)} (${this.categoryLabel(e.category)})`;
    this.events(a.id, [
      {
        e,
        text:
          as.status === "requested"
            ? `Expense requested: ${e.description} ${amt} — by ${this.name(a.id)}`
            : `Expense added as ${expenseStatusMeta(as.status).label}: ${e.description} ${amt}${e.payment ? ` · ${paymentModeLabel(e.payment.mode)}${e.payment.reference ? `, ref. ${e.payment.reference}` : ""}` : ""}`,
      },
    ]);
    if (as.status === "requested") {
      const admins = activeAdminIds(this.o.people.logins(), this.o.people.employees()).filter((id) => id !== a.id);
      this.notify(
        admins.map((userId) => ({
          userId,
          kind: "expense_requested" as const,
          title: `${p.code}: expense requested – ${formatPaise(e.amountPaise)}`,
          body: `${e.description} · by ${this.name(a.id)}`,
          href: this.href(e),
          key: `expense:${e.id}:requested`,
        })),
      );
    } else this.budgetAlerts(projectId, list, next);
    return clone(e);
  }

  /** Applies a change to several expenses at once; each one must be allowed. */
  private bulk(ids: string[], a: Actor, fn: (e: Expense) => { text: string; notify?: string }) {
    const list = this.all();
    const before = clone(list);
    const done: { e: Expense; text: string; notify?: string }[] = [];
    for (const id of [...new Set(ids)]) {
      const e = this.find(list, id);
      const r = fn(e);
      e.updatedAt = this.iso();
      done.push({ e, ...r });
    }
    this.save(list);
    this.events(a.id, done);
    for (const d of done) if (d.notify) this.decided(d.e, a, d.notify);
    for (const pid of new Set(done.map((d) => d.e.projectId))) this.budgetAlerts(pid, before, list);
    return done.length;
  }

  async accept(ids: string[]) {
    const a = await this.admin();
    return this.bulk(ids, a, (e) => {
      if (e.status !== "requested") throw new ExpenseTransitionError(`${e.code} is ${expenseStatusMeta(e.status).label.toLowerCase()}; only requested expenses can be accepted.`);
      e.status = "accepted";
      e.history.push({ at: this.iso(), by: a.id, action: "accepted" });
      return { text: `Expense ${e.code} accepted: ${formatPaise(e.amountPaise)}`, notify: "accepted" };
    });
  }

  async pay(ids: string[], payment: ExpensePayment) {
    const a = await this.actor();
    if (!roleHasPage(a.role, "expenses")) throw new ProjectForbiddenError("Your role doesn't include the Expenses page, so it can't record payments.");
    const issues = paymentIssues(payment, this.today());
    if (issues.length) throw new ValidationError(issues);
    const pay = { ...payment, reference: payment.reference.trim() };
    return this.bulk(ids, a, (e) => {
      const ok = e.status === "accepted" || (e.status === "requested" && a.role === "admin");
      if (!ok) throw new ExpenseTransitionError(`${e.code} is ${expenseStatusMeta(e.status).label.toLowerCase()}; ${a.role === "admin" ? "only requested or accepted" : "only accepted"} expenses can be paid.`);
      const from = e.status;
      e.status = "paid";
      e.payment = pay;
      e.history.push({ at: this.iso(), by: a.id, action: "paid", ...(from === "requested" ? { changes: { Status: ["Requested", "Paid"] } } : {}) });
      return { text: `Expense ${e.code} paid: ${formatPaise(e.amountPaise)} by ${paymentModeLabel(pay.mode)}${pay.reference ? `, ref. ${pay.reference}` : ""}`, notify: "paid" };
    });
  }

  async reject(id: string, reason: string) {
    const a = await this.admin();
    if (!reason.trim()) throw new ValidationError(["Enter the reason for rejecting."]);
    let out: Expense | null = null;
    this.bulk([id], a, (e) => {
      if (e.status !== "requested") throw new ExpenseTransitionError(`${e.code} is ${expenseStatusMeta(e.status).label.toLowerCase()}; only requested expenses can be rejected.`);
      e.status = "rejected";
      e.rejectReason = reason.trim();
      e.history.push({ at: this.iso(), by: a.id, action: "rejected", reason: reason.trim() });
      out = e;
      return { text: `Expense ${e.code} rejected: ${reason.trim()}`, notify: "rejected" };
    });
    return clone(out!);
  }

  async edit(id: string, input: ExpenseInput, reason: string, payment?: ExpensePayment) {
    const a = await this.admin();
    const list = this.all();
    const before = clone(list);
    const e = this.find(list, id);
    if (e.status === "deleted" || e.status === "rejected") throw new ExpenseTransitionError(`${e.code} is ${expenseStatusMeta(e.status).label.toLowerCase()} and can't be edited.`);
    const p = this.project(e.projectId);
    const f = this.clean({ ...input, casual: input.casual === undefined ? e.casual : input.casual }, p);
    if (f.casual) {
      const dup = this.casualExpenseFor(list, e.projectId, f.casual.date, e.id);
      if (dup) throw new ValidationError([`Casual labour for ${f.casual.date} is already requested (${dup.code}).`]);
    }
    const stageLabel = (s: StageKey | null) => (s ? stageMeta(s).short : "–");
    const changes: Record<string, [string, string]> = {};
    const cmp = (label: string, o: string, n: string) => {
      if (o !== n) changes[label] = [o || "–", n || "–"];
    };
    cmp("Date", e.date, f.date);
    cmp("Work stage", this.categoryLabel(e.category), this.categoryLabel(f.category));
    cmp("Description", e.description, f.description);
    cmp("Amount", showPaise(e.amountPaise), showPaise(f.amountPaise));
    cmp("GST", showPaise(e.gstPaise), showPaise(f.gstPaise));
    cmp("Paid to", e.paidTo, f.paidTo);
    cmp("Quantity", e.quantity === null ? "" : `${e.quantity} ${e.unit}`, f.quantity === null ? "" : `${f.quantity} ${f.unit}`);
    cmp("Project stage", stageLabel(e.stage), stageLabel(f.stage));
    cmp("Bill number", e.billNumber, f.billNumber);
    cmp("Bill", e.bill?.name ?? "", f.bill?.name ?? "");
    let pay = e.payment;
    if (e.status === "paid" && payment) {
      const issues = paymentIssues(payment, this.today());
      if (issues.length) throw new ValidationError(issues);
      pay = { ...payment, reference: payment.reference.trim() };
      cmp("Payment", e.payment ? `${paymentModeLabel(e.payment.mode)} ${e.payment.reference} ${e.payment.date}`.trim() : "", `${paymentModeLabel(pay.mode)} ${pay.reference} ${pay.date}`.trim());
    }
    if (!Object.keys(changes).length) return clone(e);
    const money = "Amount" in changes || "Work stage" in changes;
    if (isSpend(e.status) && money && !reason.trim()) throw new ValidationError(["Enter the reason for changing the amount or work stage of an accepted / paid expense."]);
    Object.assign(e, f, { payment: pay, updatedAt: this.iso() });
    e.history.push({ at: this.iso(), by: a.id, action: "edited", changes, ...(reason.trim() ? { reason: reason.trim() } : {}) });
    this.save(list);
    const summary = Object.entries(changes)
      .filter(([k]) => k !== "Bill")
      .map(([k, [o, n]]) => `${k.toLowerCase()} ${o} → ${n}`)
      .join(", ");
    this.events(a.id, [{ e, text: `Expense ${e.code} edited: ${summary || "bill changed"}${reason.trim() ? `, reason: ${reason.trim()}` : ""}` }]);
    this.budgetAlerts(e.projectId, before, list);
    return clone(e);
  }

  async remove(id: string, reason: string) {
    const a = await this.admin();
    if (!reason.trim()) throw new ValidationError(["Enter the reason for deleting."]);
    let out: Expense | null = null;
    this.bulk([id], a, (e) => {
      if (e.status === "deleted") throw new ExpenseTransitionError(`${e.code} is already deleted.`);
      e.deletedFrom = e.status;
      e.status = "deleted";
      e.deleteReason = reason.trim();
      e.history.push({ at: this.iso(), by: a.id, action: "deleted", reason: reason.trim() });
      out = e;
      return { text: `Expense ${e.code} deleted: ${reason.trim()}` };
    });
    return clone(out!);
  }

  async projectNames() {
    const a = await this.actor();
    if (!roleHasPage(a.role, "expenses")) throw new ProjectForbiddenError("Your role doesn't include the Expenses page.");
    return this.o.projects.readAllProjects().map((p) => ({ id: p.id, code: p.code, name: p.name, status: p.status }));
  }

  async resetDemoData() {
    this.storage().removeItem(EXPENSES_KEY);
    this.storage().removeItem(EXPENSE_COUNTER_KEY);
    this.ensure();
  }
}

export { CASUAL_LABOUR_CATEGORY };
