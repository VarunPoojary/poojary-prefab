import type { MonthStatus, PaymentInput, PayrollPaymentMode, PayrollPaymentType } from "./types";

export const PAYMENT_MODES: { value: PayrollPaymentMode; label: string }[] = [
  { value: "neft", label: "NEFT / IMPS" },
  { value: "bank_bulk", label: "Bank bulk upload" },
  { value: "upi", label: "UPI" },
  { value: "cash", label: "Cash" },
  { value: "cheque", label: "Cheque" },
];
export const payModeLabel = (m: string) => PAYMENT_MODES.find((x) => x.value === m)?.label ?? m;

export const PAYMENT_TYPES: { value: PayrollPaymentType; label: string }[] = [
  { value: "advance", label: "Advance" },
  { value: "salary", label: "Salary" },
  { value: "other", label: "Other" },
];
export const payTypeLabel = (t: PayrollPaymentType) => PAYMENT_TYPES.find((x) => x.value === t)!.label;

export const MONTH_STATUSES: Record<MonthStatus, { label: string; badge: string }> = {
  open: { label: "Open", badge: "bg-sky-100 text-sky-900" },
  closed: { label: "Closed", badge: "bg-amber-100 text-amber-900" },
  partly_paid: { label: "Partly paid", badge: "bg-amber-50 text-amber-900 ring-1 ring-inset ring-amber-300" },
  paid: { label: "Paid", badge: "bg-emerald-100 text-emerald-800" },
  not_in_payroll: { label: "Not in payroll", badge: "bg-slate-100 text-slate-600" },
  before_start: { label: "Before payroll start", badge: "bg-slate-100 text-slate-600" },
};

/** Wages must be paid before the end of the 7th of the next month (Code on Wages, 2019). */
export const PAY_BY_DAY = 7;

export function paymentIssues(p: PaymentInput, today: string): string[] {
  const issues: string[] = [];
  if (p.amountPaise === null || !Number.isSafeInteger(p.amountPaise) || p.amountPaise <= 0) issues.push("Enter the amount (more than ₹0).");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.date)) issues.push("Enter the date the money was given.");
  else if (p.date > today) issues.push("The date can't be in the future.");
  if (!PAYMENT_MODES.some((m) => m.value === p.mode)) issues.push("Choose the payment mode.");
  else if (p.mode !== "cash" && !p.reference.trim()) issues.push("Enter the payment reference (UTR, cheque no., UPI ref. or batch no.).");
  return issues;
}
