import { BUDGET_GROUPS, type BudgetGroup } from "@/lib/projects/config";
import type { ExpenseStatus, ExpenseCategory, ExpensePaymentMode } from "./types";

/** Expenses are booked against the budget work stages (Details → Money); the category is the work stage. */
export const EXPENSE_CATEGORIES: ExpenseCategory[] = BUDGET_GROUPS.map((g) => ({ value: g.value, label: g.label, group: g.value }));
export const categoryLabel = (v: string) => BUDGET_GROUPS.find((g) => g.value === v)?.label ?? v;
export const isCategory = (v: string): v is BudgetGroup => BUDGET_GROUPS.some((g) => g.value === v);

/** Work stage used for daily casual (nakke) labour requests. */
export const CASUAL_LABOUR_CATEGORY: BudgetGroup = "labour";

export const EXPENSE_STATUSES: { value: ExpenseStatus; label: string; badge: string; spend: boolean }[] = [
  { value: "requested", label: "Requested", badge: "bg-amber-100 text-amber-900", spend: false },
  { value: "accepted", label: "Accepted", badge: "bg-sky-100 text-sky-900", spend: true },
  { value: "paid", label: "Paid", badge: "bg-emerald-100 text-emerald-800", spend: true },
  { value: "rejected", label: "Rejected", badge: "bg-red-100 text-red-800", spend: false },
  { value: "deleted", label: "Deleted", badge: "bg-slate-200 text-slate-600 line-through", spend: false },
];
export const expenseStatusMeta = (s: ExpenseStatus) => EXPENSE_STATUSES.find((x) => x.value === s)!;

export const EXPENSE_PAYMENT_MODES: { value: ExpensePaymentMode; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "upi", label: "UPI" },
  { value: "neft", label: "NEFT / RTGS" },
  { value: "cheque", label: "Cheque" },
  { value: "card", label: "Company card" },
];
export const paymentModeLabel = (m: string) => EXPENSE_PAYMENT_MODES.find((x) => x.value === m)?.label ?? m;

/** Expense dates may be at most this many days in the future. */
export const FUTURE_DAYS = 7;

/** Budget alerts to Admins when a work stage's spend crosses these shares of its budget. */
export const BUDGET_ALERT_LEVELS = [80, 100] as const;

export const isSpend = (s: ExpenseStatus) => s === "accepted" || s === "paid";
