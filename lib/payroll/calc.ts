import type { AttendanceStatus } from "@/lib/attendance/types";
import type { SalaryEntry } from "@/lib/employees/types";
import { Frac, formatPaise, halfFloorRupee, rupeesToPaise, type Paise } from "@/lib/paise";
import { addDays } from "@/lib/projects/rules";

/*
 * Salary for one employee-month, exactly as in the requirements (Section 3):
 *   daily rate = monthly salary ÷ 30 (a fixed 30 for every month)
 *   LOP days   = Absent + ½ × Half days + days outside employment
 *   gross      = daily rate × max(0, 30 − LOP days), rounded once to the nearest rupee
 * A salary change in the month weights old and new salaries by calendar days first.
 */

export const DIVISOR = 30;

export type DayKind = "present" | "half" | "absent" | "holiday" | "not_logged" | "future" | "outside";

export interface PayrollPerson {
  id: string;
  dateOfJoining: string;
  /** Last working day; empty while employed. */
  leavingDate: string;
  salary: Pick<SalaryEntry, "payType" | "amount" | "effectiveFrom">[];
}

export interface DayRow {
  date: string;
  kind: DayKind;
}

export interface SalarySegment {
  from: string;
  to: string;
  days: number;
  monthlyPaise: Paise;
}

export interface DayCounts {
  present: number;
  half: number;
  absent: number;
  holiday: number;
  notLogged: number;
  future: number;
  outside: number;
}

export interface MonthCalc {
  month: string;
  daysInMonth: number;
  days: DayRow[];
  counts: DayCounts;
  segments: SalarySegment[];
  /** Monthly salary for this month (weighted when it changed), to the paisa for display. */
  salaryPaise: Paise;
  /** Salary ÷ 30, to the paisa for display (the calculation keeps full precision). */
  dailyRatePaise: Paise;
  /** In days; may end in .5. */
  lopDays: number;
  /** 30 − LOP days, not below 0. */
  payableDays: number;
  /** Paid days of the calendar month: Present + ½ Half + Holiday (+ Not logged and still-to-come, not deducted). */
  paidDays: number;
  /** Rounded once to the nearest rupee. */
  grossPaise: Paise;
  /** Full monthly salary (rounded) − gross. */
  lopDeductionPaise: Paise;
  /** No Present, Half day or Holiday day at all → gross ₹0. */
  noWorkedDay: boolean;
  /** Every day has a status (nothing Not logged or still to come). */
  complete: boolean;
}

export const monthOf = (date: string) => date.slice(0, 7);
export const daysInMonth = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};
export const monthStart = (month: string) => `${month}-01`;
export const monthEnd = (month: string) => `${month}-${String(daysInMonth(month)).padStart(2, "0")}`;
export function addMonths(month: string, n: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
export function monthDates(month: string) {
  const out: string[] = [];
  for (let d = monthStart(month); d <= monthEnd(month); d = addDays(d, 1)) out.push(d);
  return out;
}
export const monthLabel = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
};

export const employedOn = (e: Pick<PayrollPerson, "dateOfJoining" | "leavingDate">, date: string) => date >= e.dateOfJoining && (!e.leavingDate || date <= e.leavingDate);

/** Salary entry in effect on a date (the earliest one for days before the first entry). */
export function salaryOn(e: Pick<PayrollPerson, "salary">, date: string) {
  const list = [...e.salary].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  let cur = list[0];
  for (const s of list) if (s.effectiveFrom <= date) cur = s;
  return cur ?? null;
}

/** Why an employee is not in payroll for the month, or null when they are. */
export function notInPayroll(e: PayrollPerson, month: string): string | null {
  const employed = monthDates(month).filter((d) => employedOn(e, d));
  if (!employed.length) return "Not employed in this month.";
  if (!e.salary.length) return "No salary set.";
  if (employed.some((d) => salaryOn(e, d)?.payType === "daily")) return "Daily-wage worker – not in payroll.";
  return null;
}

/** Each day of the month with its attendance (today without a record counts as still to come). */
export function monthDays(e: Pick<PayrollPerson, "dateOfJoining" | "leavingDate">, month: string, statuses: Map<string, AttendanceStatus>, today: string): DayRow[] {
  return monthDates(month).map((date) => {
    if (!employedOn(e, date)) return { date, kind: "outside" as const };
    const s = statuses.get(date);
    if (s) return { date, kind: s };
    return { date, kind: date >= today ? ("future" as const) : ("not_logged" as const) };
  });
}

export function countDays(days: DayRow[]): DayCounts {
  const c: DayCounts = { present: 0, half: 0, absent: 0, holiday: 0, notLogged: 0, future: 0, outside: 0 };
  for (const d of days) {
    if (d.kind === "not_logged") c.notLogged++;
    else c[d.kind]++;
  }
  return c;
}

/** The month's salary: old and new salaries weighted by calendar days. */
export function monthSalary(e: Pick<PayrollPerson, "salary">, month: string): { salary: Frac; segments: SalarySegment[] } {
  const dates = monthDates(month);
  const segments: SalarySegment[] = [];
  for (const d of dates) {
    const monthlyPaise = rupeesToPaise(salaryOn(e, d)?.amount ?? 0);
    const last = segments[segments.length - 1];
    if (last && last.monthlyPaise === monthlyPaise) {
      last.to = d;
      last.days++;
    } else segments.push({ from: d, to: d, days: 1, monthlyPaise });
  }
  const total = segments.reduce((a, s) => a.add(new Frac(s.monthlyPaise * s.days)), new Frac(0));
  return { salary: total.div(dates.length), segments };
}

export function calcMonth(e: PayrollPerson, month: string, statuses: Map<string, AttendanceStatus>, today: string): MonthCalc {
  const days = monthDays(e, month, statuses, today);
  const counts = countDays(days);
  const { salary, segments } = monthSalary(e, month);
  const lopDays = counts.absent + counts.half * 0.5 + counts.outside;
  const payableDays = Math.max(0, DIVISOR - lopDays);
  const complete = counts.notLogged === 0 && counts.future === 0;
  const noWorkedDay = complete && counts.present + counts.half + counts.holiday === 0;
  const daily = salary.div(DIVISOR);
  const grossPaise = noWorkedDay ? 0 : daily.mul(payableDays).toRupeePaise();
  const fullPaise = salary.toRupeePaise();
  return {
    month,
    daysInMonth: days.length,
    days,
    counts,
    segments,
    salaryPaise: salary.toPaise(),
    dailyRatePaise: daily.toPaise(),
    lopDays,
    payableDays,
    paidDays: counts.present + counts.half * 0.5 + counts.holiday + counts.notLogged + counts.future,
    grossPaise,
    lopDeductionPaise: fullPaise - grossPaise,
    noWorkedDay,
    complete,
  };
}

/** Day check: paid days + Absent + ½ Half days + days outside employment = days in the month. */
export const daysCheck = (c: MonthCalc) => c.paidDays + c.counts.absent + c.counts.half * 0.5 + c.counts.outside === c.daysInMonth;

export interface OneOff {
  label: string;
  /** + addition (bonus, arrears) / − deduction. */
  amountPaise: Paise;
  reason: string;
}

export interface CloseFigures {
  grossPaise: Paise;
  /** Most that may be recovered: the lower of advance outstanding and 50 % of gross (less other deductions), rounded down. */
  maxRecoveryPaise: Paise;
  recoveryPaise: Paise;
  additionsPaise: Paise;
  deductionsPaise: Paise;
  adjustmentPaise: Paise;
  /** gross − recovery + additions − deductions ± adjustment; never below 0. */
  netPaise: Paise;
  /** What the employee still owes when the figures above go below 0 (carried to the next month). */
  shortfallPaise: Paise;
}

/**
 * Close-month figures. Under the Code on Wages total deductions can't exceed 50 % of the month's wages,
 * so the advance recovery is capped (rounded down to the rupee); the rest of the advance carries forward.
 */
export function closeFigures(o: { grossPaise: Paise; outstandingPaise: Paise; oneOffs?: OneOff[]; adjustmentPaise?: Paise; recoveryPaise?: Paise | null }): CloseFigures {
  const oneOffs = o.oneOffs ?? [];
  const additionsPaise = oneOffs.filter((x) => x.amountPaise > 0).reduce((s, x) => s + x.amountPaise, 0);
  const deductionsPaise = oneOffs.filter((x) => x.amountPaise < 0).reduce((s, x) => s - x.amountPaise, 0);
  const cap = Math.max(0, halfFloorRupee(o.grossPaise) - deductionsPaise);
  const maxRecoveryPaise = Math.max(0, Math.min(o.outstandingPaise, cap));
  const recoveryPaise = o.recoveryPaise === null || o.recoveryPaise === undefined ? maxRecoveryPaise : o.recoveryPaise;
  const adjustmentPaise = o.adjustmentPaise ?? 0;
  const raw = o.grossPaise - recoveryPaise + additionsPaise - deductionsPaise + adjustmentPaise;
  return { grossPaise: o.grossPaise, maxRecoveryPaise, recoveryPaise, additionsPaise, deductionsPaise, adjustmentPaise, netPaise: Math.max(0, raw), shortfallPaise: Math.max(0, -raw) };
}

export function closeIssues(f: CloseFigures, oneOffs: OneOff[]): string[] {
  const issues: string[] = [];
  if (!Number.isSafeInteger(f.recoveryPaise) || f.recoveryPaise < 0) issues.push("The advance recovery can't be negative.");
  else if (f.recoveryPaise > f.maxRecoveryPaise) issues.push(`The advance recovery can be at most ${formatPaise(f.maxRecoveryPaise)} (the lower of the advance outstanding and 50 % of gross).`);
  if (f.deductionsPaise > halfFloorRupee(f.grossPaise)) issues.push("Deductions can't be more than 50 % of the gross salary.");
  for (const x of oneOffs) {
    if (!x.label.trim()) issues.push("Name every addition / deduction.");
    if (!x.reason.trim()) issues.push(`Enter the reason for “${x.label || "the addition / deduction"}”.`);
    if (!x.amountPaise || !Number.isSafeInteger(x.amountPaise)) issues.push(`Enter the amount for “${x.label || "the addition / deduction"}”.`);
  }
  return issues;
}
