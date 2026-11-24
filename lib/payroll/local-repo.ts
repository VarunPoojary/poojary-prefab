import type { LocalAttendanceRepository } from "@/lib/attendance/local-repo";
import type { AttendanceStatus } from "@/lib/attendance/types";
import type { Role } from "@/lib/auth/types";
import { CrmNotFoundError, ValidationError } from "@/lib/crm/types";
import { activeAdminIds } from "@/lib/employees/rules";
import type { PeopleStore } from "@/lib/employees/store";
import type { Employee } from "@/lib/employees/types";
import type { NotificationStore } from "@/lib/notifications/store";
import { Frac, formatPaise, rupeesToPaise, type Paise } from "@/lib/paise";
import { todayIso } from "@/lib/projects/rules";
import { ProjectForbiddenError } from "@/lib/projects/types";
import type { SettingsStore } from "@/lib/settings/store";
import { appStorage, type KeyValueStorage } from "@/lib/storage";
import {
  DIVISOR,
  addMonths,
  calcMonth,
  closeFigures,
  closeIssues,
  daysCheck,
  monthEnd,
  monthLabel,
  monthOf,
  monthStart,
  notInPayroll,
  salaryOn,
  type MonthCalc,
  type OneOff,
  type PayrollPerson,
} from "./calc";
import { PAYMENT_MODES, paymentIssues, payModeLabel } from "./config";
import type { PayrollAccess, PayrollRepository } from "./repository";
import type {
  ClosedMonth,
  CompanyMonth,
  CompanyRow,
  EmployeeLabourCost,
  EmployeeMonthView,
  MonthStatus,
  PaymentInput,
  PayrollAction,
  PayrollCheck,
  PayrollEmployee,
  PayrollLogEntry,
  PayrollPayment,
  PayrollPaymentType,
  SettleInput,
  SettleLine,
  SettlePreview,
  SettleResult,
  SettlementBatch,
  YearRow,
} from "./types";

export const PAY_MONTHS_KEY = "pppl.payroll-months.v1";
export const PAY_PAYMENTS_KEY = "pppl.payroll-payments.v1";
export const PAY_BATCHES_KEY = "pppl.payroll-batches.v1";
export const PAY_LOG_KEY = "pppl.payroll-log.v1";
const LOG_KEEP = 500;

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const newId = (p: string) => `${p}_${typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2)}`;
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

export interface Actor {
  id: string;
  role: Role;
}

export interface LocalPayrollOptions {
  storage?: () => KeyValueStorage;
  people: PeopleStore;
  settings: SettingsStore;
  attendance: Pick<LocalAttendanceRepository, "readAllRecords">;
  notifications: NotificationStore;
  getActor: () => Promise<Actor | null>;
  latencyMs?: number;
  seed?: boolean;
  now?: () => number;
}

/** Everything one calculation needs, read once. */
interface Ctx {
  today: string;
  start: string;
  employees: Employee[];
  months: ClosedMonth[];
  payments: PayrollPayment[];
  att: Map<string, Map<string, AttendanceStatus>>;
}

/**
 * TEMPORARY payroll store in the browser's localStorage. Replace with ApiPayrollRepository
 * (lib/payroll/api-repo.ts) when the cloud database is ready; the server must do the same calculations
 * (lib/payroll/calc.ts) and enforce the same rules.
 */
export class LocalPayrollRepository implements PayrollRepository {
  readonly label = "This browser (temporary)";
  private readonly storage: () => KeyValueStorage;
  private readonly latencyMs: number;
  private readonly now: () => number;
  /** Timestamp used while writing demo data. */
  private at: string | null = null;

  constructor(private readonly o: LocalPayrollOptions) {
    this.storage = o.storage ?? appStorage;
    this.latencyMs = o.latencyMs ?? 100;
    this.now = o.now ?? (() => Date.now());
  }

  /* ---------- storage ---------- */

  private async delay() {
    if (this.latencyMs > 0) await new Promise((r) => setTimeout(r, this.latencyMs));
  }
  private iso() {
    return this.at ?? new Date(this.now()).toISOString();
  }
  private today() {
    return todayIso(this.now());
  }
  private read<T>(key: string): T[] {
    this.ensure();
    try {
      const v = JSON.parse(this.storage().getItem(key) ?? "[]");
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  }
  private write(key: string, v: unknown) {
    this.storage().setItem(key, JSON.stringify(v));
  }
  private ensure() {
    if (this.storage().getItem(PAY_MONTHS_KEY) !== null) return;
    for (const k of [PAY_MONTHS_KEY, PAY_PAYMENTS_KEY, PAY_BATCHES_KEY, PAY_LOG_KEY]) this.write(k, []);
    if (this.o.seed !== false) this.seedDemo();
  }
  private closedMonths() {
    return this.read<ClosedMonth>(PAY_MONTHS_KEY);
  }
  private allPayments() {
    return this.read<PayrollPayment>(PAY_PAYMENTS_KEY);
  }
  private allBatches() {
    return this.read<SettlementBatch>(PAY_BATCHES_KEY);
  }
  private log_(by: string, action: PayrollAction, employeeId: string | null, month: string | null, text: string) {
    const list = this.read<PayrollLogEntry>(PAY_LOG_KEY);
    list.push({ id: newId("plog"), at: this.iso(), by, action, employeeId, month, text });
    this.write(PAY_LOG_KEY, list.slice(-LOG_KEEP));
  }

  /* ---------- access ---------- */

  private async actor(): Promise<Actor> {
    await this.delay();
    const a = await this.o.getActor();
    if (!a) throw new ProjectForbiddenError("Please sign in again.");
    return a;
  }
  private async payrollUser(): Promise<Actor> {
    const a = await this.actor();
    if (a.role !== "admin" && a.role !== "accountant") throw new ProjectForbiddenError("Only admins and the accountant can open payroll.");
    return a;
  }
  private async admin(): Promise<Actor> {
    const a = await this.actor();
    if (a.role !== "admin") throw new ProjectForbiddenError("Only admins can do this.");
    return a;
  }
  async access(): Promise<PayrollAccess> {
    const a = await this.actor();
    return { canView: a.role === "admin" || a.role === "accountant", isAdmin: a.role === "admin" };
  }

  /* ---------- context ---------- */

  private ctx(): Ctx {
    const att = new Map<string, Map<string, AttendanceStatus>>();
    let earliest = "";
    for (const r of this.o.attendance.readAllRecords()) {
      if (r.personKind !== "employee") continue;
      let m = att.get(r.personId);
      if (!m) att.set(r.personId, (m = new Map()));
      m.set(r.date, r.status);
      if (!earliest || r.date < earliest) earliest = r.date;
    }
    const today = this.today();
    return {
      today,
      start: this.o.settings.read().payroll.startMonth || (earliest ? monthOf(earliest) : monthOf(today)),
      employees: this.o.people.employees(),
      months: this.closedMonths(),
      payments: this.allPayments(),
      att,
    };
  }
  private employeeOf(c: Ctx, id: string) {
    const e = c.employees.find((x) => x.id === id);
    if (!e) throw new CrmNotFoundError("Employee", id);
    return e;
  }
  private person(e: Employee): PayrollPerson {
    return { id: e.id, dateOfJoining: e.dateOfJoining, leavingDate: e.leaving?.date ?? "", salary: e.salary };
  }
  private header(e: Employee, today: string): PayrollEmployee {
    const s = salaryOn(e, today);
    return {
      id: e.id,
      code: e.code,
      name: e.fullName,
      designation: e.designation,
      department: e.department,
      active: e.status === "active",
      dateOfJoining: e.dateOfJoining,
      leavingDate: e.leaving?.date ?? "",
      currentSalary: s ? { payType: s.payType, amountPaise: rupeesToPaise(s.amount) } : null,
    };
  }
  private calc(c: Ctx, e: Employee, month: string): MonthCalc {
    return calcMonth(this.person(e), month, c.att.get(e.id) ?? new Map(), c.today);
  }

  /* ---------- the employee-month ---------- */

  private view(c: Ctx, e: Employee, month: string): EmployeeMonthView {
    const p = this.person(e);
    const reason = notInPayroll(p, month);
    const ended = monthEnd(month) < c.today;
    const mine = c.payments.filter((x) => x.employeeId === e.id && !x.deleted);
    const paidFor = (m: string, t: PayrollPaymentType) => sum(mine.filter((x) => x.forMonth === m && x.type === t).map((x) => x.amountPaise));
    const closedAll = c.months.filter((m) => m.employeeId === e.id).sort((a, b) => a.month.localeCompare(b.month));
    const closed = closedAll.find((m) => m.month === month) ?? null;
    // Advance movements of a closed month: overpaid salary and a negative net become advances; recoveries reduce them.
    const movement = (m: ClosedMonth) => Math.max(0, paidFor(m.month, "salary") - m.figures.netPaise) + m.figures.shortfallPaise - m.figures.recoveryPaise;
    const advancesUpTo = (m: string) => sum(mine.filter((x) => x.type === "advance" && x.forMonth <= m).map((x) => x.amountPaise));
    const outstandingForMonth = advancesUpTo(month) + sum(closedAll.filter((m) => m.month < month).map(movement));
    const outstandingNow = advancesUpTo("9999-12") + sum(closedAll.map(movement));
    const carriedFrom = (from: string) => sum(closedAll.flatMap((m) => m.adjustments.filter((a) => a.fromMonth === from).map((a) => a.amountPaise)));
    const pendingOf = (m: ClosedMonth) => this.calc(c, e, m.month).grossPaise - m.figures.grossPaise - carriedFrom(m.month);
    const live = reason ? null : this.calc(c, e, month);
    const salaryPaid = paidFor(month, "salary");
    const base = {
      employee: this.header(e, c.today),
      month,
      reason: reason ?? "",
      ended,
      live,
      closed: closed ? clone(closed) : null,
      advancesThisMonthPaise: sum(mine.filter((x) => x.type === "advance" && x.forMonth === month).map((x) => x.amountPaise)),
      outstandingForMonthPaise: outstandingForMonth,
      outstandingNowPaise: outstandingNow,
      salaryPaidPaise: salaryPaid,
      otherPaidPaise: paidFor(month, "other"),
      payments: clone(mine.filter((x) => x.forMonth === month).sort((a, b) => b.date.localeCompare(a.date) || b.at.localeCompare(a.at))),
    };
    const empty = { figures: null, adjustmentsIn: [], pendingAdjustmentPaise: 0, balancePaise: 0, checks: [], canClose: false, closeBlockers: [], canReopen: false, reopenBlocker: "" };
    if (reason) return { ...base, ...empty, status: "not_in_payroll" };
    if (month < c.start) return { ...base, ...empty, status: "before_start", reason: `Payroll starts from ${monthLabel(c.start)}.` };

    const checks: PayrollCheck[] = [];
    const calc = closed?.calc ?? live!;
    checks.push({
      label: "Days add up",
      ok: daysCheck(calc),
      detail: `Paid days ${calc.paidDays} + Absent ${calc.counts.absent} + ½ × Half days ${calc.counts.half} + outside employment ${calc.counts.outside} = ${calc.daysInMonth} days`,
    });

    if (closed) {
      const f = closed.figures;
      const balance = f.netPaise - salaryPaid;
      const latest = closedAll[closedAll.length - 1]?.month === month;
      const ok = f.grossPaise - f.recoveryPaise + f.additionsPaise - f.deductionsPaise + f.adjustmentPaise + f.shortfallPaise === f.netPaise;
      checks.push({ label: "Net payable", ok, detail: `Gross ${formatPaise(f.grossPaise)} − recovery ${formatPaise(f.recoveryPaise)} ± other ${formatPaise(f.additionsPaise - f.deductionsPaise, { sign: true })} ± adjustment ${formatPaise(f.adjustmentPaise, { sign: true })} = ${formatPaise(f.netPaise)}` });
      checks.push({ label: "Balance", ok: true, detail: `Net payable ${formatPaise(f.netPaise)} − salary paid ${formatPaise(salaryPaid)} = ${formatPaise(balance)}` });
      const status: MonthStatus = balance <= 0 ? "paid" : salaryPaid > 0 ? "partly_paid" : "closed";
      return {
        ...base,
        status,
        figures: clone(f),
        adjustmentsIn: [],
        pendingAdjustmentPaise: pendingOf(closed),
        balancePaise: balance,
        checks,
        canClose: false,
        closeBlockers: [],
        canReopen: latest && salaryPaid === 0,
        reopenBlocker: !latest ? "Only the latest closed month can be reopened." : salaryPaid > 0 ? "Salary has been paid against this month; it can't be reopened." : "",
      };
    }

    const adjustmentsIn = closedAll.filter((m) => m.month < month).map((m) => ({ fromMonth: m.month, amountPaise: pendingOf(m) })).filter((a) => a.amountPaise !== 0);
    const f = closeFigures({ grossPaise: live!.grossPaise, outstandingPaise: Math.max(0, outstandingForMonth), adjustmentPaise: sum(adjustmentsIn.map((a) => a.amountPaise)) });
    const blockers: string[] = [];
    if (!ended) blockers.push(`The month hasn't ended yet; it can be closed from ${monthStart(addMonths(month, 1))}.`);
    const prev = addMonths(month, -1);
    if (prev >= c.start && !notInPayroll(p, prev) && !closedAll.some((m) => m.month === prev)) blockers.push(`Close ${monthLabel(prev)} first.`);
    if (ended && live!.counts.notLogged) {
      const days = live!.days.filter((d) => d.kind === "not_logged").map((d) => Number(d.date.slice(8)));
      blockers.push(`${live!.counts.notLogged} day${live!.counts.notLogged === 1 ? " is" : "s are"} Not logged (${days.join(", ")}). Mark attendance first.`);
    }
    checks.push({ label: "Every day has a status", ok: live!.counts.notLogged === 0, detail: live!.counts.notLogged ? `${live!.counts.notLogged} Not logged` : "No Not logged days" });
    for (const ch of checks) if (!ch.ok && ch.label === "Days add up") blockers.push(`Check failed: ${ch.detail}`);
    return {
      ...base,
      status: "open",
      figures: f,
      adjustmentsIn,
      pendingAdjustmentPaise: 0,
      balancePaise: f.netPaise - salaryPaid,
      checks,
      canClose: blockers.length === 0,
      closeBlockers: blockers,
      canReopen: false,
      reopenBlocker: "",
    };
  }

  /* ---------- reading ---------- */

  async startMonth() {
    await this.payrollUser();
    return this.ctx().start;
  }

  async employee(id: string) {
    await this.payrollUser();
    const c = this.ctx();
    return this.header(this.employeeOf(c, id), c.today);
  }

  async employeeMonth(id: string, month: string) {
    await this.payrollUser();
    const c = this.ctx();
    return this.view(c, this.employeeOf(c, id), month);
  }

  async employeeYear(id: string, year: number): Promise<YearRow[]> {
    await this.payrollUser();
    const c = this.ctx();
    const e = this.employeeOf(c, id);
    const current = monthOf(c.today);
    const rows: YearRow[] = [];
    for (let m = 1; m <= 12; m++) {
      const month = `${year}-${String(m).padStart(2, "0")}`;
      if (month > current) break;
      const v = this.view(c, e, month);
      if (v.status === "not_in_payroll" || v.status === "before_start") continue;
      rows.push({
        month,
        status: v.status,
        grossPaise: v.figures!.grossPaise,
        recoveryPaise: v.figures!.recoveryPaise,
        netPaise: v.figures!.netPaise,
        paidPaise: v.salaryPaidPaise,
        balancePaise: v.balancePaise,
        estimate: v.status === "open",
      });
    }
    return rows.reverse();
  }

  async payments(id: string) {
    await this.payrollUser();
    return clone(this.allPayments().filter((p) => p.employeeId === id)).sort((a, b) => b.date.localeCompare(a.date) || b.at.localeCompare(a.at));
  }

  async companyMonth(month: string): Promise<CompanyMonth> {
    await this.payrollUser();
    const c = this.ctx();
    const rows: CompanyRow[] = [];
    const excluded: CompanyMonth["excluded"] = [];
    if (month >= c.start)
      for (const e of c.employees) {
        const v = this.view(c, e, month);
        if (v.status === "not_in_payroll") {
          if (!/Not employed/.test(v.reason)) excluded.push({ employee: v.employee, reason: v.reason });
          continue;
        }
        const calc = v.closed?.calc ?? v.live!;
        rows.push({
          employee: v.employee,
          status: v.status,
          salaryPaise: calc.salaryPaise,
          lopDays: calc.lopDays,
          grossPaise: v.figures!.grossPaise,
          advancesThisMonthPaise: v.advancesThisMonthPaise,
          outstandingNowPaise: v.outstandingNowPaise,
          recoveryPaise: v.figures!.recoveryPaise,
          netPaise: v.figures!.netPaise,
          paidPaise: v.salaryPaidPaise,
          balancePaise: v.balancePaise,
          notLoggedDays: v.live?.counts.notLogged ?? 0,
          estimate: v.status === "open",
        });
      }
    rows.sort((a, b) => a.employee.name.localeCompare(b.employee.name));
    const s = (k: keyof CompanyRow) => sum(rows.map((r) => r[k] as number));
    return {
      month,
      ended: monthEnd(month) < c.today,
      startMonth: c.start,
      rows,
      summary: {
        count: rows.length,
        salaryPaise: s("salaryPaise"),
        grossPaise: s("grossPaise"),
        advancesPaise: s("advancesThisMonthPaise"),
        recoveryPaise: s("recoveryPaise"),
        netPaise: s("netPaise"),
        paidPaise: s("paidPaise"),
        balancePaise: s("balancePaise"),
      },
      excluded,
      batches: clone(this.allBatches().filter((b) => b.month === month)).sort((a, b) => b.at.localeCompare(a.at)),
    };
  }

  async log(limit = 100) {
    await this.payrollUser();
    return clone(this.read<PayrollLogEntry>(PAY_LOG_KEY))
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, limit);
  }

  /* ---------- closing ---------- */

  private closeNow(c: Ctx, e: Employee, month: string, input: { recoveryPaise: Paise | null; oneOffs: OneOff[] }, by: string): ClosedMonth {
    const v = this.view(c, e, month);
    if (v.status !== "open") throw new ValidationError([`${monthLabel(month)} is ${v.status === "not_in_payroll" ? "not in payroll" : v.status === "before_start" ? "before payroll starts" : "already closed"} for ${e.fullName}.`]);
    if (!v.canClose) throw new ValidationError(v.closeBlockers);
    const oneOffs = input.oneOffs.map((x) => ({ label: x.label.trim(), amountPaise: x.amountPaise, reason: x.reason.trim() }));
    const f = closeFigures({
      grossPaise: v.live!.grossPaise,
      outstandingPaise: Math.max(0, v.outstandingForMonthPaise),
      oneOffs,
      adjustmentPaise: sum(v.adjustmentsIn.map((a) => a.amountPaise)),
      recoveryPaise: input.recoveryPaise,
    });
    const issues = closeIssues(f, oneOffs);
    if (issues.length) throw new ValidationError(issues);
    const m: ClosedMonth = {
      id: newId("pm"),
      employeeId: e.id,
      month,
      calc: v.live!,
      oneOffs,
      adjustments: v.adjustmentsIn,
      outstandingPaise: Math.max(0, v.outstandingForMonthPaise),
      figures: f,
      closedAt: this.iso(),
      closedBy: by,
    };
    c.months = [...c.months, m];
    this.write(PAY_MONTHS_KEY, c.months);
    this.log_(by, "closed", e.id, month, `${e.fullName} – ${monthLabel(month)} closed: gross ${formatPaise(f.grossPaise)}, recovery ${formatPaise(f.recoveryPaise)}, net payable ${formatPaise(f.netPaise)}`);
    return m;
  }

  async closeMonth(id: string, month: string, input: { recoveryPaise: Paise | null; oneOffs: OneOff[] }) {
    const a = await this.payrollUser();
    const c = this.ctx();
    return clone(this.closeNow(c, this.employeeOf(c, id), month, input, a.id));
  }

  async reopenMonth(id: string, month: string, reason: string) {
    const a = await this.admin();
    if (!reason.trim()) throw new ValidationError(["Enter the reason for reopening."]);
    const c = this.ctx();
    const e = this.employeeOf(c, id);
    const v = this.view(c, e, month);
    if (!v.closed) throw new ValidationError([`${monthLabel(month)} isn't closed.`]);
    if (!v.canReopen) throw new ValidationError([v.reopenBlocker]);
    this.write(PAY_MONTHS_KEY, c.months.filter((m) => m.id !== v.closed!.id));
    this.log_(a.id, "reopened", e.id, month, `${e.fullName} – ${monthLabel(month)} reopened: ${reason.trim()}`);
  }

  /* ---------- payments ---------- */

  private addPayment(c: Ctx, e: Employee, type: PayrollPaymentType, input: PaymentInput, forMonth: string, by: string, batchId: string | null = null): PayrollPayment {
    const issues = paymentIssues(input, c.today);
    if (issues.length) throw new ValidationError(issues);
    const amount = input.amountPaise!;
    if (type === "advance") {
      const v = this.view(c, e, forMonth);
      if (v.status === "not_in_payroll") throw new ValidationError([`${e.fullName} is not in payroll in ${monthLabel(forMonth)}: ${v.reason}`]);
      if (v.status === "before_start") throw new ValidationError([v.reason]);
      if (v.status !== "open") throw new ValidationError([`${monthLabel(forMonth)} is closed for ${e.fullName}; date the advance in an open month.`]);
    } else if (type === "salary") {
      const v = this.view(c, e, forMonth);
      if (!v.closed) throw new ValidationError([`Close ${monthLabel(forMonth)} for ${e.fullName} before paying the salary.`]);
      if (v.balancePaise <= 0) throw new ValidationError([`Nothing is left to pay for ${monthLabel(forMonth)}.`]);
      if (amount > v.balancePaise) throw new ValidationError([`Only ${formatPaise(v.balancePaise)} is left to pay for ${monthLabel(forMonth)}.`]);
    } else if (!/^\d{4}-\d{2}$/.test(forMonth)) throw new ValidationError(["Choose the month the payment is for."]);
    const pay: PayrollPayment = {
      id: newId("pp"),
      employeeId: e.id,
      type,
      forMonth,
      date: input.date,
      amountPaise: amount,
      mode: input.mode as PayrollPayment["mode"],
      reference: input.reference.trim(),
      remarks: input.remarks.trim(),
      batchId,
      by,
      at: this.iso(),
      history: [],
      deleted: null,
    };
    c.payments = [...c.payments, pay];
    this.write(PAY_PAYMENTS_KEY, c.payments);
    if (!batchId)
      this.log_(by, type === "advance" ? "advance" : "payment", e.id, forMonth, `${type === "advance" ? "Advance" : type === "salary" ? "Salary" : "Payment"} ${formatPaise(amount)} to ${e.fullName} for ${monthLabel(forMonth)} · ${payModeLabel(pay.mode)}${pay.reference ? ` ${pay.reference}` : ""}`);
    return pay;
  }

  async giveAdvance(id: string, input: PaymentInput) {
    const a = await this.payrollUser();
    const c = this.ctx();
    return clone(this.addPayment(c, this.employeeOf(c, id), "advance", input, monthOf(input.date || c.today), a.id));
  }

  async recordPayment(id: string, input: PaymentInput & { type: "salary" | "other"; forMonth: string }) {
    const a = await this.payrollUser();
    const c = this.ctx();
    return clone(this.addPayment(c, this.employeeOf(c, id), input.type, input, input.forMonth, a.id));
  }

  async editPayment(paymentId: string, input: PaymentInput, reason: string) {
    const a = await this.admin();
    if (!reason.trim()) throw new ValidationError(["Enter the reason for the change."]);
    const c = this.ctx();
    const pay = c.payments.find((p) => p.id === paymentId);
    if (!pay || pay.deleted) throw new CrmNotFoundError("Payment", paymentId);
    const e = this.employeeOf(c, pay.employeeId);
    const issues = paymentIssues(input, c.today);
    if (issues.length) throw new ValidationError(issues);
    const forMonth = pay.type === "advance" ? monthOf(input.date) : pay.forMonth;
    if (pay.type === "advance") {
      for (const m of new Set([pay.forMonth, forMonth]))
        if (this.view(c, e, m).status !== "open") throw new ValidationError([`${monthLabel(m)} is closed for ${e.fullName}; reopen it to change this advance.`]);
    } else if (pay.type === "salary") {
      const v = this.view(c, e, pay.forMonth);
      if (input.amountPaise! > v.balancePaise + pay.amountPaise) throw new ValidationError([`At most ${formatPaise(v.balancePaise + pay.amountPaise)} can be paid for ${monthLabel(pay.forMonth)}.`]);
    }
    const from = { amountPaise: pay.amountPaise, date: pay.date, mode: pay.mode, reference: pay.reference, remarks: pay.remarks };
    Object.assign(pay, { amountPaise: input.amountPaise!, date: input.date, mode: input.mode, reference: input.reference.trim(), remarks: input.remarks.trim(), forMonth });
    pay.history.push({ at: this.iso(), by: a.id, reason: reason.trim(), from });
    this.write(PAY_PAYMENTS_KEY, c.payments);
    this.log_(a.id, "payment_edited", e.id, pay.forMonth, `${pay.type === "advance" ? "Advance" : "Payment"} to ${e.fullName} changed ${formatPaise(from.amountPaise)} → ${formatPaise(pay.amountPaise)} (${from.date} → ${pay.date}): ${reason.trim()}`);
    return clone(pay);
  }

  async deletePayment(paymentId: string, reason: string) {
    const a = await this.admin();
    if (!reason.trim()) throw new ValidationError(["Enter the reason for deleting."]);
    const c = this.ctx();
    const pay = c.payments.find((p) => p.id === paymentId);
    if (!pay || pay.deleted) throw new CrmNotFoundError("Payment", paymentId);
    const e = this.employeeOf(c, pay.employeeId);
    if (pay.type === "advance" && this.view(c, e, pay.forMonth).status !== "open")
      throw new ValidationError([`${monthLabel(pay.forMonth)} is closed for ${e.fullName}; the advance was already counted. Reopen the month first.`]);
    pay.deleted = { at: this.iso(), by: a.id, reason: reason.trim() };
    this.write(PAY_PAYMENTS_KEY, c.payments);
    this.log_(a.id, "payment_deleted", e.id, pay.forMonth, `${pay.type === "advance" ? "Advance" : "Payment"} ${formatPaise(pay.amountPaise)} to ${e.fullName} deleted: ${reason.trim()}`);
  }

  /* ---------- settle all ---------- */

  private preview(c: Ctx, month: string): SettlePreview {
    if (monthEnd(month) >= c.today) throw new ValidationError([`${monthLabel(month)} hasn't ended yet; only a finished month can be settled.`]);
    if (month < c.start) throw new ValidationError([`Payroll starts from ${monthLabel(c.start)}.`]);
    const out: SettlePreview = { month, ready: [], nothingToPay: [], leftOut: [] };
    for (const e of c.employees) {
      const v = this.view(c, e, month);
      if (v.status === "not_in_payroll" || v.status === "before_start") continue;
      if (v.status === "open" && !v.canClose) {
        out.leftOut.push({ employee: v.employee, reason: v.closeBlockers.join(" ") });
        continue;
      }
      const f = v.figures!;
      const line: SettleLine = {
        employee: v.employee,
        alreadyClosed: !!v.closed,
        grossPaise: f.grossPaise,
        maxRecoveryPaise: f.maxRecoveryPaise,
        recoveryPaise: f.recoveryPaise,
        adjustmentPaise: f.adjustmentPaise,
        netPaise: f.netPaise,
        paidPaise: v.salaryPaidPaise,
        balancePaise: v.balancePaise,
      };
      if (line.balancePaise <= 0) out.nothingToPay.push({ employee: v.employee, reason: v.closed ? "Already paid in full." : "Net payable is ₹0." });
      else out.ready.push(line);
    }
    const byName = (a: { employee: PayrollEmployee }, b: { employee: PayrollEmployee }) => a.employee.name.localeCompare(b.employee.name);
    out.ready.sort(byName);
    out.leftOut.sort(byName);
    return out;
  }

  async settlePreview(month: string) {
    await this.payrollUser();
    return this.preview(this.ctx(), month);
  }

  /** Closes the ready months (with any lowered recoveries) and pays each balance in one batch. */
  private settle(c: Ctx, input: SettleInput, by: string, only?: string[]): SettleResult {
    const pre = this.preview(c, input.month);
    const lines = pre.ready
      .filter((l) => !only || only.includes(l.employee.id))
      .map((l) => {
        if (l.alreadyClosed) return l;
        const r = input.recoveries?.[l.employee.id];
        if (r === undefined || r === l.recoveryPaise) return l;
        const f = closeFigures({ grossPaise: l.grossPaise, outstandingPaise: l.maxRecoveryPaise, adjustmentPaise: l.adjustmentPaise, recoveryPaise: r });
        const issues = closeIssues({ ...f, maxRecoveryPaise: l.maxRecoveryPaise }, []);
        if (issues.length) throw new ValidationError([`${l.employee.name}: ${issues.join(" ")}`]);
        return { ...l, recoveryPaise: r, netPaise: f.netPaise, balancePaise: f.netPaise - l.paidPaise };
      })
      .filter((l) => l.balancePaise > 0);
    const total = sum(lines.map((l) => l.balancePaise));
    if (input.confirmTotalPaise !== total) throw new ValidationError([`Type the exact total ${formatPaise(total, { always: true })} to confirm.`]);
    const pIssues = paymentIssues({ amountPaise: total || 1, date: input.date, mode: input.mode, reference: input.reference, remarks: "" }, c.today);
    if (pIssues.length) throw new ValidationError(pIssues);
    if (!lines.length) return { batch: null, paid: [], leftOut: pre.leftOut };
    const batches = this.allBatches();
    const seq = batches.filter((b) => b.month === input.month).length + 1;
    const batch: SettlementBatch = {
      id: newId("psb"),
      code: `SAL-${input.month}-${seq}`,
      month: input.month,
      date: input.date,
      mode: input.mode as SettlementBatch["mode"],
      reference: input.reference.trim(),
      paymentIds: [],
      totalPaise: total,
      by,
      at: this.iso(),
      reversed: null,
    };
    const paid: SettleResult["paid"] = [];
    for (const l of lines) {
      const e = this.employeeOf(c, l.employee.id);
      if (!l.alreadyClosed) this.closeNow(c, e, input.month, { recoveryPaise: l.recoveryPaise, oneOffs: [] }, by);
      const pay = this.addPayment(
        c,
        e,
        "salary",
        { amountPaise: l.balancePaise, date: input.date, mode: input.mode, reference: input.references?.[e.id]?.trim() || input.reference, remarks: `Settlement ${batch.code}` },
        input.month,
        by,
        batch.id,
      );
      batch.paymentIds.push(pay.id);
      paid.push({ employee: l.employee, amountPaise: l.balancePaise });
    }
    this.write(PAY_BATCHES_KEY, [...batches, batch]);
    this.log_(by, "settled", null, input.month, `Settle all ${monthLabel(input.month)} (${batch.code}): ${formatPaise(total)} to ${paid.length} employee${paid.length === 1 ? "" : "s"} · ${payModeLabel(batch.mode)}${batch.reference ? ` ${batch.reference}` : ""}`);
    return { batch: clone(batch), paid, leftOut: pre.leftOut };
  }

  async settleAll(input: SettleInput) {
    const a = await this.payrollUser();
    return this.settle(this.ctx(), input, a.id);
  }

  async reverseBatch(batchId: string, reason: string) {
    const a = await this.admin();
    if (!reason.trim()) throw new ValidationError(["Enter the reason for reversing the settlement."]);
    const batches = this.allBatches();
    const b = batches.find((x) => x.id === batchId);
    if (!b) throw new CrmNotFoundError("Settlement", batchId);
    if (b.reversed) throw new ValidationError([`${b.code} is already reversed.`]);
    const c = this.ctx();
    for (const p of c.payments) if (b.paymentIds.includes(p.id) && !p.deleted) p.deleted = { at: this.iso(), by: a.id, reason: `Settlement ${b.code} reversed: ${reason.trim()}` };
    b.reversed = { at: this.iso(), by: a.id, reason: reason.trim() };
    this.write(PAY_PAYMENTS_KEY, c.payments);
    this.write(PAY_BATCHES_KEY, batches);
    this.log_(a.id, "reversed", null, b.month, `Settlement ${b.code} reversed (${formatPaise(b.totalPaise)}): ${reason.trim()}`);
  }

  /* ---------- labour cost & reminders ---------- */

  async projectLabourCost(projectId: string): Promise<EmployeeLabourCost> {
    await this.admin();
    const employees = new Map(this.o.people.employees().map((e) => [e.id, e]));
    const by = new Map<string, { manDays: number; cost: Frac }>();
    for (const r of this.o.attendance.readAllRecords()) {
      if (r.personKind !== "employee" || r.location !== "site" || r.projectId !== projectId || (r.status !== "present" && r.status !== "half")) continue;
      const e = employees.get(r.personId);
      const s = e ? salaryOn(e, r.date) : null;
      if (!s) continue;
      const days = r.status === "present" ? 1 : 0.5;
      const rate = s.payType === "monthly" ? new Frac(rupeesToPaise(s.amount), DIVISOR) : new Frac(rupeesToPaise(s.amount));
      const cur = by.get(r.personId) ?? { manDays: 0, cost: new Frac(0) };
      by.set(r.personId, { manDays: cur.manDays + days, cost: cur.cost.add(rate.mul(days)) });
    }
    const rows = [...by.entries()]
      .map(([employeeId, v]) => ({ employeeId, name: employees.get(employeeId)?.fullName ?? employeeId, manDays: v.manDays, costPaise: v.cost.toRupeePaise() }))
      .sort((a, b) => b.costPaise - a.costPaise);
    return { rows, manDays: sum(rows.map((r) => r.manDays)), totalPaise: sum(rows.map((r) => r.costPaise)) };
  }

  async reconcileReminders() {
    const c = this.ctx();
    if (Number(c.today.slice(8)) < 3) return;
    const month = addMonths(monthOf(c.today), -1);
    if (month < c.start) return;
    const unpaid = c.employees.filter((e) => {
      const v = this.view(c, e, month);
      return v.status === "open" || v.status === "closed" || v.status === "partly_paid";
    });
    if (!unpaid.length) return;
    const logins = this.o.people.logins();
    const active = new Set(c.employees.filter((e) => e.status === "active").map((e) => e.id));
    const to = [...new Set([...activeAdminIds(logins, c.employees), ...logins.filter((l) => l.role === "accountant" && l.enabled && active.has(l.employeeId)).map((l) => l.employeeId)])];
    this.o.notifications.push(
      to.map((userId) => ({
        userId,
        kind: "payroll_due" as const,
        title: `Salaries for ${monthLabel(month)} not fully paid`,
        body: `${unpaid.length} employee${unpaid.length === 1 ? "" : "s"} · wages are due by 7 ${monthLabel(monthOf(c.today)).split(" ")[0]}`,
        href: `/payroll?month=${month}`,
        key: `payroll:due:${month}`,
      })),
    );
  }

  /* ---------- demo data ---------- */

  /**
   * Last month: advances, closed and settled in one batch for most employees, one partly paid, one still
   * open (so the 3rd-of-month reminder and Settle all have something to show). This month: two advances.
   */
  private seedDemo() {
    const c = this.ctx();
    const today = c.today;
    const cur = monthOf(today);
    const prev = addMonths(cur, -1);
    if (prev < c.start) return;
    const stamp = (date: string, hhmm: string) => new Date(Math.min(new Date(`${date}T${hhmm}:00`).getTime(), this.now())).toISOString();
    const has = (id: string) => c.employees.some((e) => e.id === id);
    const day = (m: string, d: number) => `${m}-${String(d).padStart(2, "0")}`;
    const tryDo = (fn: () => void) => {
      try {
        fn();
      } catch {
        // Demo data that doesn't fit today's date or the stored attendance is skipped.
      }
    };
    const advance = (id: string, date: string, rupees: number, mode: PaymentInput["mode"], reference: string, remarks: string, by = "u_admin") =>
      tryDo(() => {
        if (!has(id) || date > today) return;
        this.at = stamp(date, "11:00");
        this.addPayment(c, this.employeeOf(c, id), "advance", { amountPaise: rupeesToPaise(rupees), date, mode, reference, remarks }, monthOf(date), by);
      });
    advance("e_sunil", day(prev, 8), 10000, "cash", "", "Family function");
    advance("e_kavita", day(prev, 5), 40000, "neft", "UTR 584410", "Medical emergency – recover over 3 months");
    // Close last month for everyone except Priya (left open for Settle all), on the 2nd.
    const closeOn = day(cur, 2);
    this.at = stamp(closeOn, "11:00");
    for (const e of c.employees)
      if (e.id !== "u_priya")
        tryDo(() => {
          if (this.view(c, e, prev).canClose) this.closeNow(c, e, prev, { recoveryPaise: null, oneOffs: e.id === "u_staff" ? [{ label: "Diwali bonus", amountPaise: 500000, reason: "Festival bonus" }] : [] }, "e_meera");
        });
    // Settle all on the 3rd by bank transfer, Sunil paid half in cash separately.
    tryDo(() => {
      const payDate = day(cur, 3);
      if (payDate > today) return;
      this.at = stamp(payDate, "15:30");
      const pre = this.preview(c, prev);
      const ids = pre.ready.filter((l) => l.alreadyClosed && l.employee.id !== "e_sunil").map((l) => l.employee.id);
      const total = sum(pre.ready.filter((l) => ids.includes(l.employee.id)).map((l) => l.balancePaise));
      this.settle(c, { month: prev, date: payDate, mode: "bank_bulk", reference: `HDFC BULK ${prev.replace("-", "")}`, confirmTotalPaise: total }, "e_meera", ids);
      const sunil = c.employees.find((e) => e.id === "e_sunil");
      const v = sunil ? this.view(c, sunil, prev) : null;
      if (sunil && v?.closed && v.balancePaise > 0)
        this.addPayment(c, sunil, "salary", { amountPaise: Math.round(v.balancePaise / 200) * 100, date: payDate, mode: "cash", reference: "", remarks: "Part payment; rest after site bill" }, prev, "e_meera");
    });
    advance("u_staff", day(cur, 6), 5000, "upi", "UPI 5531900241", "School fees", "e_meera");
    advance("u_rahul", day(cur, 12), 3000, "cash", "", "Travel to Nagpur site");
    this.at = null;
  }

  async resetDemoData() {
    for (const k of [PAY_MONTHS_KEY, PAY_PAYMENTS_KEY, PAY_BATCHES_KEY, PAY_LOG_KEY]) this.storage().removeItem(k);
    this.ensure();
  }
}

export { PAYMENT_MODES };
