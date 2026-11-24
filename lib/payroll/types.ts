import type { Paise } from "@/lib/paise";
import type { CloseFigures, DayRow, MonthCalc, OneOff } from "./calc";

export type PayrollPaymentType = "advance" | "salary" | "other";
export type PayrollPaymentMode = "cash" | "upi" | "neft" | "cheque" | "bank_bulk";
export type MonthStatus = "not_in_payroll" | "before_start" | "open" | "closed" | "partly_paid" | "paid";

/** Money given to an employee: an advance during a month, the salary for a closed month, or something else (bonus, reimbursement). */
export interface PayrollPayment {
  id: string;
  employeeId: string;
  type: PayrollPaymentType;
  /** yyyy-mm the payment counts against (advances: the month of their date). */
  forMonth: string;
  /** yyyy-mm-dd the money was given. */
  date: string;
  amountPaise: Paise;
  mode: PayrollPaymentMode;
  reference: string;
  remarks: string;
  /** Settlement batch (Settle all) the payment belongs to. */
  batchId: string | null;
  by: string;
  at: string;
  history: { at: string; by: string; reason: string; from: Partial<Pick<PayrollPayment, "amountPaise" | "date" | "mode" | "reference" | "remarks">> }[];
  deleted: { at: string; by: string; reason: string } | null;
}

export interface PaymentInput {
  amountPaise: Paise | null;
  date: string;
  mode: PayrollPaymentMode | "";
  reference: string;
  remarks: string;
}

/** A month closed for one employee: every figure frozen at closing. */
export interface ClosedMonth {
  id: string;
  employeeId: string;
  month: string;
  calc: MonthCalc;
  oneOffs: OneOff[];
  /** Differences from earlier closed months (attendance edited after closing) added to this month. */
  adjustments: { fromMonth: string; amountPaise: Paise }[];
  /** Advance outstanding available for recovery when the month was closed. */
  outstandingPaise: Paise;
  figures: CloseFigures;
  closedAt: string;
  closedBy: string;
}

export interface SettlementBatch {
  id: string;
  /** SAL-2026-10-1 */
  code: string;
  month: string;
  date: string;
  mode: PayrollPaymentMode;
  reference: string;
  paymentIds: string[];
  totalPaise: Paise;
  by: string;
  at: string;
  reversed: { at: string; by: string; reason: string } | null;
}

export type PayrollAction = "advance" | "payment" | "payment_edited" | "payment_deleted" | "closed" | "reopened" | "settled" | "reversed";

export interface PayrollLogEntry {
  id: string;
  at: string;
  by: string;
  action: PayrollAction;
  employeeId: string | null;
  month: string | null;
  text: string;
}

export interface PayrollEmployee {
  id: string;
  code: string;
  name: string;
  designation: string;
  department: string;
  active: boolean;
  dateOfJoining: string;
  leavingDate: string;
  /** Salary in effect today (₹ per month or per day). */
  currentSalary: { payType: "monthly" | "daily"; amountPaise: Paise } | null;
}

export interface PayrollCheck {
  label: string;
  ok: boolean;
  detail: string;
}

/** One employee-month: live from attendance while open, frozen once closed. */
export interface EmployeeMonthView {
  employee: PayrollEmployee;
  month: string;
  status: MonthStatus;
  /** Why the employee isn't in payroll this month. */
  reason: string;
  /** Has the month ended (closing allowed from the 1st of the next month)? */
  ended: boolean;
  /** Calculated now from attendance (also for closed months, to spot later edits). */
  live: MonthCalc | null;
  closed: ClosedMonth | null;
  /** Closed: frozen. Open: estimate with the maximum recovery and pending adjustments. */
  figures: CloseFigures | null;
  advancesThisMonthPaise: Paise;
  /** Advance outstanding available for recovery in this month. */
  outstandingForMonthPaise: Paise;
  /** Advance outstanding today (all months). */
  outstandingNowPaise: Paise;
  /** Open month: differences from earlier closed months that this month will carry. */
  adjustmentsIn: { fromMonth: string; amountPaise: Paise }[];
  /** Closed month: attendance changed after closing; this difference goes to the next month closed. */
  pendingAdjustmentPaise: Paise;
  salaryPaidPaise: Paise;
  otherPaidPaise: Paise;
  /** Net payable − salary paid (closed months; 0 while open). */
  balancePaise: Paise;
  payments: PayrollPayment[];
  checks: PayrollCheck[];
  canClose: boolean;
  closeBlockers: string[];
  canReopen: boolean;
  reopenBlocker: string;
}

export interface YearRow {
  month: string;
  status: MonthStatus;
  grossPaise: Paise;
  recoveryPaise: Paise;
  netPaise: Paise;
  paidPaise: Paise;
  balancePaise: Paise;
  /** Figures are an estimate (month still open). */
  estimate: boolean;
}

export interface CompanyRow {
  employee: PayrollEmployee;
  status: MonthStatus;
  salaryPaise: Paise;
  lopDays: number;
  grossPaise: Paise;
  advancesThisMonthPaise: Paise;
  outstandingNowPaise: Paise;
  recoveryPaise: Paise;
  netPaise: Paise;
  paidPaise: Paise;
  balancePaise: Paise;
  notLoggedDays: number;
  estimate: boolean;
}

export interface CompanySummary {
  count: number;
  salaryPaise: Paise;
  grossPaise: Paise;
  advancesPaise: Paise;
  recoveryPaise: Paise;
  netPaise: Paise;
  paidPaise: Paise;
  balancePaise: Paise;
}

export interface CompanyMonth {
  month: string;
  ended: boolean;
  startMonth: string;
  rows: CompanyRow[];
  summary: CompanySummary;
  /** Daily-wage / not-in-payroll employees, for information. */
  excluded: { employee: PayrollEmployee; reason: string }[];
  batches: SettlementBatch[];
}

export interface SettleLine {
  employee: PayrollEmployee;
  alreadyClosed: boolean;
  grossPaise: Paise;
  maxRecoveryPaise: Paise;
  recoveryPaise: Paise;
  adjustmentPaise: Paise;
  netPaise: Paise;
  paidPaise: Paise;
  balancePaise: Paise;
}

export interface SettlePreview {
  month: string;
  ready: SettleLine[];
  /** Nothing left to pay (balance ₹0). */
  nothingToPay: { employee: PayrollEmployee; reason: string }[];
  leftOut: { employee: PayrollEmployee; reason: string }[];
}

export interface SettleInput {
  month: string;
  date: string;
  mode: PayrollPaymentMode | "";
  reference: string;
  /** Optional per-employee references (e.g. UTR per transfer). */
  references?: Record<string, string>;
  /** Lowered recoveries for employees whose month is closed now. */
  recoveries?: Record<string, Paise>;
  /** The total typed by the user to confirm. */
  confirmTotalPaise: Paise | null;
}

export interface SettleResult {
  batch: SettlementBatch | null;
  paid: { employee: PayrollEmployee; amountPaise: Paise }[];
  leftOut: { employee: PayrollEmployee; reason: string }[];
}

export interface EmployeeLabourCost {
  rows: { employeeId: string; name: string; manDays: number; costPaise: Paise }[];
  manDays: number;
  totalPaise: Paise;
}

export type { DayRow };
