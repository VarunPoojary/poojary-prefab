import { addDays } from "@/lib/projects/rules";
import { BUDGET_GROUPS, type BudgetGroup } from "@/lib/projects/config";
import { formatPaise, rupeesToPaise, type Paise } from "@/lib/paise";
import { BUDGET_ALERT_LEVELS, FUTURE_DAYS, isSpend } from "./config";
import type { BudgetVsActual, CasualLine, DuplicateHit, Expense, ExpenseCategory, ExpenseFilters, ExpenseInput, ExpenseTotals } from "./types";

/** EXP-2026-0001 */
export const formatExpenseCode = (year: number, n: number) => `EXP-${year}-${String(n).padStart(4, "0")}`;

export function validateExpense(input: ExpenseInput, opts: { today: string; categories: ExpenseCategory[] }): string[] {
  const issues: string[] = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) issues.push("Enter the date of the expense.");
  else if (input.date > addDays(opts.today, FUTURE_DAYS)) issues.push(`The date can't be more than ${FUTURE_DAYS} days ahead.`);
  if (!input.category || !opts.categories.some((c) => c.value === input.category)) issues.push("Choose a work stage (Design, Factory work, Transportation, Site work or Labour).");
  if (!input.description.trim()) issues.push("Describe the expense.");
  if (input.amountPaise === null || !Number.isSafeInteger(input.amountPaise) || input.amountPaise <= 0) issues.push("Enter the amount (more than ₹0).");
  if (input.gstPaise !== null) {
    if (!Number.isSafeInteger(input.gstPaise) || input.gstPaise < 0) issues.push("GST can't be negative.");
    else if (input.amountPaise !== null && input.gstPaise > input.amountPaise) issues.push("GST can't be more than the total amount.");
  }
  if (!input.paidTo.trim()) issues.push("Enter who the money is paid to.");
  if (input.quantity !== null && !(input.quantity > 0)) issues.push("Quantity must be more than 0, or leave it empty.");
  if (input.quantity !== null && !input.unit.trim()) issues.push("Enter the unit for the quantity (e.g. hours, MT, trips).");
  return issues;
}

export function paymentIssues(p: { mode: string; reference: string; date: string } | undefined, today: string): string[] {
  const issues: string[] = [];
  if (!p?.mode) issues.push("Choose the payment mode.");
  if (!p?.date) issues.push("Enter the payment date.");
  else if (p.date > today) issues.push("The payment date can't be in the future.");
  return issues;
}

export function matchesFilters(e: Expense, f: ExpenseFilters, name: (id: string) => string): boolean {
  if (f.projectId && e.projectId !== f.projectId) return false;
  if (e.status === "deleted" && !f.showDeleted && f.status !== "deleted") return false;
  if (f.status && e.status !== f.status) return false;
  if (f.category && e.category !== f.category) return false;
  if (f.from && e.date < f.from) return false;
  if (f.to && e.date > f.to) return false;
  if (f.requestedBy && e.requestedBy !== f.requestedBy) return false;
  if (f.stage && e.stage !== f.stage) return false;
  const terms = (f.search ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length) {
    const hay = `${e.code} ${e.description} ${e.paidTo} ${e.billNumber} ${name(e.requestedBy)}`.toLowerCase();
    if (!terms.every((t) => hay.includes(t))) return false;
  }
  return true;
}

export function expenseTotals(list: Expense[]): ExpenseTotals {
  const t: ExpenseTotals = { accepted: { count: 0, paise: 0 }, paid: { count: 0, paise: 0 }, pending: { count: 0, paise: 0 }, rejected: { count: 0 }, spend: 0, gst: 0 };
  for (const e of list) {
    const bucket = e.status === "accepted" ? t.accepted : e.status === "paid" ? t.paid : e.status === "requested" ? t.pending : null;
    if (bucket) {
      bucket.count++;
      bucket.paise += e.amountPaise;
    } else if (e.status === "rejected") t.rejected.count++;
    if (isSpend(e.status)) {
      t.spend += e.amountPaise;
      t.gst += e.gstPaise ?? 0;
    }
  }
  return t;
}

/** Spend (Accepted + Paid, including GST) per budget work stage. */
export function spendByGroup(list: Expense[]): Record<BudgetGroup, Paise> {
  const out = Object.fromEntries(BUDGET_GROUPS.map((g) => [g.value, 0])) as Record<BudgetGroup, Paise>;
  for (const e of list) if (isSpend(e.status) && e.group in out) out[e.group] += e.amountPaise;
  return out;
}

/** Budget (₹ per work stage, as saved on the project) against accepted spend. */
export function budgetVsActual(budget: Partial<Record<BudgetGroup, number>>, list: Expense[], categories: ExpenseCategory[]): BudgetVsActual {
  const spent = spendByGroup(list);
  const lines = BUDGET_GROUPS.map((g) => {
    const budgetPaise = rupeesToPaise(budget[g.value] ?? 0);
    const spentPaise = spent[g.value];
    return {
      group: g.value,
      label: g.label,
      budgetPaise,
      spentPaise,
      remainingPaise: budgetPaise - spentPaise,
      pctUsed: budgetPaise > 0 ? (spentPaise / budgetPaise) * 100 : null,
      over: spentPaise > budgetPaise && (budgetPaise > 0 || spentPaise > 0),
    };
  });
  const cats = new Map<string, { spentPaise: Paise; count: number }>();
  for (const e of list) {
    if (!isSpend(e.status)) continue;
    const c = cats.get(e.category) ?? { spentPaise: 0, count: 0 };
    c.spentPaise += e.amountPaise;
    c.count++;
    cats.set(e.category, c);
  }
  return {
    lines,
    totalBudgetPaise: lines.reduce((a, l) => a + l.budgetPaise, 0),
    totalSpentPaise: lines.reduce((a, l) => a + l.spentPaise, 0),
    byCategory: [...cats.entries()]
      .map(([category, v]) => ({ category, label: categories.find((c) => c.value === category)?.label ?? category, ...v }))
      .sort((a, b) => b.spentPaise - a.spentPaise),
  };
}

/** Budget alert levels (80 / 100 %) a stage's spend has newly reached. */
export function alertsCrossed(budgetPaise: Paise, before: Paise, after: Paise): number[] {
  if (budgetPaise <= 0) return [];
  return BUDGET_ALERT_LEVELS.filter((l) => before * 100 < budgetPaise * l && after * 100 >= budgetPaise * l);
}

/**
 * Possible duplicate bills on the project: same bill number, or same paid to + amount within a day.
 * Rejected and deleted expenses are ignored.
 */
export function findDuplicates(input: Pick<ExpenseInput, "billNumber" | "paidTo" | "amountPaise" | "date">, list: Expense[], excludeId?: string): DuplicateHit[] {
  const bill = input.billNumber.trim().toLowerCase();
  const to = input.paidTo.trim().toLowerCase();
  const out: DuplicateHit[] = [];
  for (const e of list) {
    if (e.id === excludeId || e.status === "rejected" || e.status === "deleted") continue;
    if (bill && e.billNumber.trim().toLowerCase() === bill) out.push({ id: e.id, code: e.code, why: `same bill number ${e.billNumber}` });
    else if (
      to &&
      input.amountPaise !== null &&
      e.paidTo.trim().toLowerCase() === to &&
      e.amountPaise === input.amountPaise &&
      input.date &&
      Math.abs(new Date(e.date).getTime() - new Date(input.date).getTime()) <= 86_400_000
    )
      out.push({ id: e.id, code: e.code, why: `same paid to and amount (${formatPaise(e.amountPaise)}) on ${e.date}` });
  }
  return out;
}

/** Present = full daily rate, half day = half. */
export function casualLine(workerId: string, name: string, status: "present" | "half", ratePaise: Paise): CasualLine {
  return { workerId, name, status, ratePaise, amountPaise: status === "present" ? ratePaise : Math.round(ratePaise / 2) };
}

/** Text of a field for the change log. */
export const showPaise = (p: Paise | null) => (p === null ? "–" : formatPaise(p));
