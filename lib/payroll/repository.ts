import type { Paise } from "@/lib/paise";
import type { OneOff } from "./calc";
import type {
  ClosedMonth,
  CompanyMonth,
  EmployeeLabourCost,
  EmployeeMonthView,
  PaymentInput,
  PayrollEmployee,
  PayrollLogEntry,
  PayrollPayment,
  SettleInput,
  SettlePreview,
  SettleResult,
  YearRow,
} from "./types";

export interface PayrollAccess {
  canView: boolean;
  isAdmin: boolean;
}

/**
 * Employee payroll (Admin and Accountant). Salary is calculated from attendance and the employee's salary;
 * advances and payments are recorded against months; a closed month never changes silently.
 */
export interface PayrollRepository {
  readonly label: string;
  access(): Promise<PayrollAccess>;
  /** First payroll month (yyyy-mm). */
  startMonth(): Promise<string>;
  employee(id: string): Promise<PayrollEmployee>;
  employeeMonth(id: string, month: string): Promise<EmployeeMonthView>;
  employeeYear(id: string, year: number): Promise<YearRow[]>;
  /** Every payment to the employee, newest first (deleted ones included, marked). */
  payments(id: string): Promise<PayrollPayment[]>;
  companyMonth(month: string): Promise<CompanyMonth>;
  closeMonth(id: string, month: string, input: { recoveryPaise: Paise | null; oneOffs: OneOff[] }): Promise<ClosedMonth>;
  /** Admin only; only the latest closed month, and only if no salary has been paid against it. */
  reopenMonth(id: string, month: string, reason: string): Promise<void>;
  giveAdvance(id: string, input: PaymentInput): Promise<PayrollPayment>;
  recordPayment(id: string, input: PaymentInput & { type: "salary" | "other"; forMonth: string }): Promise<PayrollPayment>;
  /** Admin only, with a reason; the change is kept in the payment's history. */
  editPayment(paymentId: string, input: PaymentInput, reason: string): Promise<PayrollPayment>;
  /** Admin only, with a reason (soft delete). */
  deletePayment(paymentId: string, reason: string): Promise<void>;
  settlePreview(month: string): Promise<SettlePreview>;
  settleAll(input: SettleInput): Promise<SettleResult>;
  /** Admin only, with a reason: removes every payment of the batch; the months return to Closed. */
  reverseBatch(batchId: string, reason: string): Promise<void>;
  log(limit?: number): Promise<PayrollLogEntry[]>;
  /** Admin only: employees' site man-days on a project × their daily salary rate (information only). */
  projectLabourCost(projectId: string): Promise<EmployeeLabourCost>;
  /** From the 3rd of a month: reminds Admins and the Accountant about last month's unpaid salaries. */
  reconcileReminders(): Promise<void>;
  resetDemoData?(): Promise<void>;
}
