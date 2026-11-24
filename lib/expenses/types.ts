import type { PhotoRef } from "@/lib/files/types";
import type { BudgetGroup } from "@/lib/projects/config";
import type { StageKey } from "@/lib/projects/types";
import type { Paise } from "@/lib/paise";

export type ExpenseStatus = "requested" | "accepted" | "paid" | "rejected" | "deleted";
export type ExpensePaymentMode = "cash" | "upi" | "neft" | "cheque" | "card";

/** An entry of the shared expense category list (Settings → Expenses). */
export interface ExpenseCategory {
  value: string;
  label: string;
  /** Budget work stage the category's spend counts against (can be changed on each expense). */
  group: BudgetGroup;
  archived?: boolean;
}

export interface ExpensePayment {
  mode: ExpensePaymentMode;
  reference: string;
  /** yyyy-mm-dd */
  date: string;
}

/** One line of a casual labour request: a worker's day at the site. */
export interface CasualLine {
  workerId: string;
  name: string;
  status: "present" | "half";
  /** Daily rate used (paise); half day = half of it. */
  ratePaise: Paise;
  amountPaise: Paise;
}

export type ExpenseAction = "requested" | "added" | "accepted" | "paid" | "rejected" | "edited" | "deleted";

export interface ExpenseChange {
  at: string;
  by: string;
  action: ExpenseAction;
  /** field → [old, new] as display text */
  changes?: Record<string, [string, string]>;
  reason?: string;
}

export interface Expense {
  id: string;
  /** EXP-2026-0001 */
  code: string;
  projectId: string;
  /** yyyy-mm-dd: when the money was or will be spent. */
  date: string;
  category: string;
  group: BudgetGroup;
  description: string;
  /** Total including GST, in paise. */
  amountPaise: Paise;
  /** GST part of the amount (paise), if there is a GST bill. */
  gstPaise: Paise | null;
  paidTo: string;
  quantity: number | null;
  unit: string;
  stage: StageKey | null;
  /** Bill / receipt photo or PDF. */
  bill: PhotoRef | null;
  billNumber: string;
  status: ExpenseStatus;
  payment: ExpensePayment | null;
  rejectReason: string;
  deleteReason: string;
  /** Status before deletion (to show what it was). */
  deletedFrom: ExpenseStatus | null;
  requestedBy: string;
  requestedAt: string;
  /** Casual labour request for one site day. */
  casual: { date: string; lines: CasualLine[] } | null;
  history: ExpenseChange[];
  updatedAt: string;
}

/** Fields entered on the request / add / edit form. */
export interface ExpenseInput {
  date: string;
  category: string;
  group: BudgetGroup | "";
  description: string;
  amountPaise: Paise | null;
  gstPaise: Paise | null;
  paidTo: string;
  quantity: number | null;
  unit: string;
  stage: StageKey | "";
  bill: PhotoRef | null;
  billNumber: string;
  casual?: { date: string; lines: CasualLine[] } | null;
}

/** Admin adding directly as Accepted or Paid. */
export interface AddAs {
  status: "requested" | "accepted" | "paid";
  payment?: ExpensePayment;
}

export interface ExpenseFilters {
  projectId?: string;
  search?: string;
  category?: string;
  status?: ExpenseStatus | "";
  from?: string;
  to?: string;
  requestedBy?: string;
  stage?: StageKey | "";
  showDeleted?: boolean;
}

export interface ExpenseTotals {
  accepted: { count: number; paise: Paise };
  paid: { count: number; paise: Paise };
  pending: { count: number; paise: Paise };
  rejected: { count: number };
  /** Accepted + Paid. */
  spend: Paise;
  gst: Paise;
}

export interface BudgetLine {
  group: BudgetGroup;
  label: string;
  budgetPaise: Paise;
  spentPaise: Paise;
  remainingPaise: Paise;
  /** null when there is no budget for the group. */
  pctUsed: number | null;
  over: boolean;
}

export interface BudgetVsActual {
  lines: BudgetLine[];
  totalBudgetPaise: Paise;
  totalSpentPaise: Paise;
  byCategory: { category: string; label: string; spentPaise: Paise; count: number }[];
}

export interface ProjectExpenseAccess {
  canView: boolean;
  canRequest: boolean;
  isAdmin: boolean;
  canPay: boolean;
}

export interface DuplicateHit {
  id: string;
  code: string;
  why: string;
}

/** A site day with casual workers and no casual labour expense yet. */
export interface UncoveredCasualDay {
  date: string;
  workers: number;
  manDays: number;
  amountPaise: Paise;
}

export interface CasualFill {
  date: string;
  lines: CasualLine[];
  /** Workers without a daily rate (amount 0; enter by hand). */
  unrated: string[];
  totalPaise: Paise;
  /** An earlier casual labour expense for this day (not rejected / deleted). */
  existing: { id: string; code: string } | null;
}

export class ExpenseTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExpenseTransitionError";
  }
}
