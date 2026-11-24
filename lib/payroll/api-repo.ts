import { CrmNotFoundError, ValidationError } from "@/lib/crm/types";
import type { Paise } from "@/lib/paise";
import { ProjectForbiddenError } from "@/lib/projects/types";
import type { OneOff } from "./calc";
import type { PayrollAccess, PayrollRepository } from "./repository";
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

/**
 * Cloud payroll implementation – NOT USED YET.
 *
 * Expected endpoints (JSON; amounts in paise as integers or exact decimals; 403 no access, 404 not found, 422 { issues }):
 *   GET  /payroll/access                       GET /payroll/start-month
 *   GET  /payroll/employees/:id                GET /payroll/employees/:id/months/:yyyy-mm   GET /payroll/employees/:id/years/:yyyy
 *   GET  /payroll/employees/:id/payments
 *   POST /payroll/employees/:id/months/:yyyy-mm/close { recoveryPaise, oneOffs }
 *   POST /payroll/employees/:id/months/:yyyy-mm/reopen { reason }
 *   POST /payroll/employees/:id/advances PaymentInput   POST /payroll/employees/:id/payments { ...PaymentInput, type, forMonth }
 *   PUT  /payroll/payments/:id { input, reason }        POST /payroll/payments/:id/delete { reason }
 *   GET  /payroll/months/:yyyy-mm                       GET /payroll/months/:yyyy-mm/settle-preview
 *   POST /payroll/settlements SettleInput               POST /payroll/settlements/:id/reverse { reason }
 *   GET  /payroll/log?limit=                            GET /projects/:id/labour-cost/employees
 *
 * The server runs lib/payroll/calc.ts rules (fixed 30-day divisor, rounding once, 50 % deduction cap),
 * freezes closed months, enforces "never pay more than the balance" in a transaction, and sends the
 * 3rd-of-month reminder from a scheduled job.
 */
export class ApiPayrollRepository implements PayrollRepository {
  readonly label = "Cloud database";
  constructor(private readonly baseUrl: string) {}

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, { credentials: "include", headers: { "Content-Type": "application/json" }, ...init });
    if (res.status === 403) throw new ProjectForbiddenError();
    if (res.status === 404) throw new CrmNotFoundError("Payroll", path);
    if (res.status === 422) throw new ValidationError(((await res.json()) as { issues: string[] }).issues);
    if (!res.ok) throw new Error(`Request failed (${res.status})`);
    return (res.status === 204 ? undefined : await res.json()) as T;
  }
  private send<T>(method: string, path: string, body?: unknown) {
    return this.request<T>(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });
  }

  access() {
    return this.request<PayrollAccess>(`/payroll/access`);
  }
  startMonth() {
    return this.request<string>(`/payroll/start-month`);
  }
  employee(id: string) {
    return this.request<PayrollEmployee>(`/payroll/employees/${id}`);
  }
  employeeMonth(id: string, month: string) {
    return this.request<EmployeeMonthView>(`/payroll/employees/${id}/months/${month}`);
  }
  employeeYear(id: string, year: number) {
    return this.request<YearRow[]>(`/payroll/employees/${id}/years/${year}`);
  }
  payments(id: string) {
    return this.request<PayrollPayment[]>(`/payroll/employees/${id}/payments`);
  }
  companyMonth(month: string) {
    return this.request<CompanyMonth>(`/payroll/months/${month}`);
  }
  closeMonth(id: string, month: string, input: { recoveryPaise: Paise | null; oneOffs: OneOff[] }) {
    return this.send<ClosedMonth>("POST", `/payroll/employees/${id}/months/${month}/close`, input);
  }
  reopenMonth(id: string, month: string, reason: string) {
    return this.send<void>("POST", `/payroll/employees/${id}/months/${month}/reopen`, { reason });
  }
  giveAdvance(id: string, input: PaymentInput) {
    return this.send<PayrollPayment>("POST", `/payroll/employees/${id}/advances`, input);
  }
  recordPayment(id: string, input: PaymentInput & { type: "salary" | "other"; forMonth: string }) {
    return this.send<PayrollPayment>("POST", `/payroll/employees/${id}/payments`, input);
  }
  editPayment(paymentId: string, input: PaymentInput, reason: string) {
    return this.send<PayrollPayment>("PUT", `/payroll/payments/${paymentId}`, { input, reason });
  }
  deletePayment(paymentId: string, reason: string) {
    return this.send<void>("POST", `/payroll/payments/${paymentId}/delete`, { reason });
  }
  settlePreview(month: string) {
    return this.request<SettlePreview>(`/payroll/months/${month}/settle-preview`);
  }
  settleAll(input: SettleInput) {
    return this.send<SettleResult>("POST", `/payroll/settlements`, input);
  }
  reverseBatch(batchId: string, reason: string) {
    return this.send<void>("POST", `/payroll/settlements/${batchId}/reverse`, { reason });
  }
  log(limit = 100) {
    return this.request<PayrollLogEntry[]>(`/payroll/log?limit=${limit}`);
  }
  projectLabourCost(projectId: string) {
    return this.request<EmployeeLabourCost>(`/projects/${projectId}/labour-cost/employees`);
  }
  async reconcileReminders() {
    // Sent by a scheduled job on the server.
  }
}
