import { CrmNotFoundError, ValidationError } from "@/lib/crm/types";
import type { Paise } from "@/lib/paise";
import { ProjectForbiddenError } from "@/lib/projects/types";
import type { ExpensePageAccess, ExpenseRepository, ProjectName } from "./repository";
import {
  ExpenseTransitionError,
  type AddAs,
  type BudgetVsActual,
  type CasualFill,
  type DuplicateHit,
  type Expense,
  type ExpenseFilters,
  type ExpenseInput,
  type ExpensePayment,
  type ExpenseTotals,
  type ProjectExpenseAccess,
  type UncoveredCasualDay,
} from "./types";

/**
 * Cloud expense implementation – NOT USED YET.
 *
 * Expected endpoints (JSON; amounts in paise; 403 no access, 404 not found, 409 { message } wrong status, 422 { issues }):
 *   GET  /projects/:id/expenses/access          GET /expenses/access
 *   GET  /expenses?projectId=&search=&category=&status=&from=&to=&requestedBy=&stage=&showDeleted=  → { items, totals }
 *   GET  /expenses/:id                          GET /projects/:id/expenses/budget   GET /expenses/spend-by-project
 *   POST /projects/:id/expenses { input, as }   PUT /expenses/:id { input, reason, payment }
 *   POST /expenses/accept { ids }               POST /expenses/pay { ids, payment }
 *   POST /expenses/:id/reject { reason }        POST /expenses/:id/delete { reason }
 *   POST /projects/:id/expenses/duplicates { billNumber, paidTo, amountPaise, date, excludeId }
 *   GET  /projects/:id/expenses/casual?date=    GET /projects/:id/expenses/uncovered-casual-days   GET /expenses/projects
 *
 * The server assigns EXP-YYYY-NNNN codes, enforces the status flow and roles, writes the project timeline
 * (Admins + site managers) and sends the notifications and budget alerts.
 */
export class ApiExpenseRepository implements ExpenseRepository {
  readonly label = "Cloud database";
  constructor(private readonly baseUrl: string) {}

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, { credentials: "include", headers: { "Content-Type": "application/json" }, ...init });
    if (res.status === 403) throw new ProjectForbiddenError();
    if (res.status === 404) throw new CrmNotFoundError("Expense", path);
    if (res.status === 409) throw new ExpenseTransitionError(((await res.json()) as { message: string }).message);
    if (res.status === 422) throw new ValidationError(((await res.json()) as { issues: string[] }).issues);
    if (!res.ok) throw new Error(`Request failed (${res.status})`);
    return (res.status === 204 ? undefined : await res.json()) as T;
  }
  private send<T>(method: string, path: string, body?: unknown) {
    return this.request<T>(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });
  }
  private qs = (p: object) =>
    new URLSearchParams(Object.entries(p).filter(([, v]) => v !== undefined && v !== "" && v !== false).map(([k, v]) => [k, String(v)])).toString();

  projectAccess(projectId: string) {
    return this.request<ProjectExpenseAccess>(`/projects/${projectId}/expenses/access`);
  }
  pageAccess() {
    return this.request<ExpensePageAccess>(`/expenses/access`);
  }
  list(filters: ExpenseFilters) {
    return this.request<{ items: Expense[]; totals: ExpenseTotals }>(`/expenses?${this.qs(filters)}`);
  }
  get(id: string) {
    return this.request<Expense>(`/expenses/${id}`);
  }
  budget(projectId: string) {
    return this.request<BudgetVsActual>(`/projects/${projectId}/expenses/budget`);
  }
  spendByProject() {
    return this.request<Record<string, Paise>>(`/expenses/spend-by-project`);
  }
  create(projectId: string, input: ExpenseInput, as?: AddAs) {
    return this.send<Expense>("POST", `/projects/${projectId}/expenses`, { input, as });
  }
  accept(ids: string[]) {
    return this.send<number>("POST", `/expenses/accept`, { ids });
  }
  pay(ids: string[], payment: ExpensePayment) {
    return this.send<number>("POST", `/expenses/pay`, { ids, payment });
  }
  reject(id: string, reason: string) {
    return this.send<Expense>("POST", `/expenses/${id}/reject`, { reason });
  }
  edit(id: string, input: ExpenseInput, reason: string, payment?: ExpensePayment) {
    return this.send<Expense>("PUT", `/expenses/${id}`, { input, reason, payment });
  }
  remove(id: string, reason: string) {
    return this.send<Expense>("POST", `/expenses/${id}/delete`, { reason });
  }
  duplicates(projectId: string, input: Pick<ExpenseInput, "billNumber" | "paidTo" | "amountPaise" | "date">, excludeId?: string) {
    return this.send<DuplicateHit[]>("POST", `/projects/${projectId}/expenses/duplicates`, { ...input, excludeId });
  }
  casualFill(projectId: string, date: string) {
    return this.request<CasualFill>(`/projects/${projectId}/expenses/casual?${this.qs({ date })}`);
  }
  projectNames() {
    return this.request<ProjectName[]>(`/expenses/projects`);
  }
  uncoveredCasualDays(projectId: string) {
    return this.request<UncoveredCasualDay[]>(`/projects/${projectId}/expenses/uncovered-casual-days`);
  }
}
