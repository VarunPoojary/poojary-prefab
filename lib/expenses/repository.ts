import type { Paise } from "@/lib/paise";
import type {
  AddAs,
  BudgetVsActual,
  CasualFill,
  DuplicateHit,
  Expense,
  ExpenseFilters,
  ExpenseInput,
  ExpensePayment,
  ExpenseTotals,
  ProjectExpenseAccess,
  UncoveredCasualDay,
} from "./types";

export interface ProjectName {
  id: string;
  code: string;
  name: string;
  status: string;
}

export interface ExpensePageAccess {
  canView: boolean;
  isAdmin: boolean;
  canPay: boolean;
}

/**
 * Project expenses. Site managers request; Admins accept, pay, reject, edit and delete; the Accountant
 * (Expenses page) sees all and marks Accepted expenses as Paid. Every action is written to the project
 * timeline (Admins and site managers only).
 */
export interface ExpenseRepository {
  readonly label: string;
  projectAccess(projectId: string): Promise<ProjectExpenseAccess>;
  pageAccess(): Promise<ExpensePageAccess>;
  /** With `projectId`: one project (Admin / its site managers). Without: every project (Admin / Accountant). */
  list(filters: ExpenseFilters): Promise<{ items: Expense[]; totals: ExpenseTotals }>;
  get(id: string): Promise<Expense>;
  /** Admin only: budget vs actual by work stage and spend by category. */
  budget(projectId: string): Promise<BudgetVsActual>;
  /** Admin only: spend per project (Accepted + Paid), for the project list and header tiles. */
  spendByProject(): Promise<Record<string, Paise>>;
  /** Site manager → Requested. Admin may add directly as Accepted or Paid. */
  create(projectId: string, input: ExpenseInput, as?: AddAs): Promise<Expense>;
  /** Admin. Requested → Accepted. Returns how many changed. */
  accept(ids: string[]): Promise<number>;
  /** Admin (Requested or Accepted) / Accountant (Accepted) → Paid. */
  pay(ids: string[], payment: ExpensePayment): Promise<number>;
  /** Admin. Requested → Rejected; reason required. */
  reject(id: string, reason: string): Promise<Expense>;
  /** Admin. Reason required when the amount, category or work stage of an Accepted / Paid expense changes. */
  edit(id: string, input: ExpenseInput, reason: string, payment?: ExpensePayment): Promise<Expense>;
  /** Admin. Soft delete with a reason; visible with "Show deleted". */
  remove(id: string, reason: string): Promise<Expense>;
  duplicates(projectId: string, input: Pick<ExpenseInput, "billNumber" | "paidTo" | "amountPaise" | "date">, excludeId?: string): Promise<DuplicateHit[]>;
  /** The day's casual workers at the site with their daily rate, for a casual labour request. */
  casualFill(projectId: string, date: string): Promise<CasualFill>;
  /** Site days with casual workers but no casual labour expense (Admin / site managers). */
  uncoveredCasualDays(projectId: string): Promise<UncoveredCasualDay[]>;
  /** Admin / Accountant: names of all projects, for the Expenses page. */
  projectNames(): Promise<ProjectName[]>;
  resetDemoData?(): Promise<void>;
}
