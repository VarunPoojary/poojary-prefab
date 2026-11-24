import { normalizePhone } from "@/lib/crm/rules";
import { MIN_AGE_YEARS, PASSWORD_MIN_LENGTH } from "./config";
import type { Employee, EmployeeInput, Login, NewSalary, SalaryEntry } from "./types";

export const todayIso = (now = Date.now()) => {
  const d = new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** Whole years between a yyyy-mm-dd birth date and today. */
export function ageOn(dob: string, today: string): number {
  const [y, m, d] = dob.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  return ty - y - (tm < m || (tm === m && td < d) ? 1 : 0);
}

export function validateEmployee(e: EmployeeInput, now = Date.now()): Record<string, string> {
  const errors: Record<string, string> = {};
  const today = todayIso(now);
  if (!e.fullName.trim()) errors.fullName = "Full name is required.";
  if (!e.mobile.trim()) errors.mobile = "Mobile number is required.";
  else if (!normalizePhone(e.mobile)) errors.mobile = "Enter a valid 10-digit Indian mobile number.";
  if (e.dob) {
    if (e.dob > today) errors.dob = "Date of birth can't be in the future.";
    else if (ageOn(e.dob, today) < MIN_AGE_YEARS) errors.dob = `Employees must be at least ${MIN_AGE_YEARS} years old.`;
  }
  if (!e.designation) errors.designation = "Designation is required.";
  if (!e.department) errors.department = "Department is required.";
  if (!e.employmentType) errors.employmentType = "Employment type is required.";
  if (!e.dateOfJoining) errors.dateOfJoining = "Date of joining is required.";
  else if (e.dob && e.dateOfJoining <= e.dob) errors.dateOfJoining = "Date of joining must be after the date of birth.";
  if (e.emergencyContact.phone.trim() && !normalizePhone(e.emergencyContact.phone))
    errors.emergencyPhone = "Enter a valid 10-digit mobile number for the emergency contact.";
  return errors;
}

export function validateSalary(s: NewSalary): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!s.payType) errors.payType = "Choose the pay type.";
  if (s.amount === null || !(s.amount > 0)) errors.amount = "Salary amount must be more than ₹0.";
  if (!s.effectiveFrom) errors.effectiveFrom = "Effective date is required.";
  return errors;
}

export function validateLeaving(date: string, reason: string, other: string, joining: string): string[] {
  const issues: string[] = [];
  if (!date) issues.push("Enter the date of leaving.");
  else if (joining && date < joining) issues.push("The date of leaving can't be before the date of joining.");
  if (!reason) issues.push("Choose the reason for leaving.");
  if (reason === "other" && !other.trim()) issues.push("Describe the reason for leaving.");
  return issues;
}

/** The salary in force today: latest entry whose effective date has arrived (ties: newest record). */
export function currentSalary(entries: SalaryEntry[], today: string): SalaryEntry | null {
  return (
    [...entries]
      .filter((s) => s.effectiveFrom <= today)
      .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom) || a.createdAt.localeCompare(b.createdAt))
      .pop() ?? null
  );
}

export const formatEmployeeCode = (n: number) => `EMP-${String(n).padStart(4, "0")}`;

/* ---------- passwords ---------- */

export function validatePassword(pw: string): string[] {
  const issues: string[] = [];
  if (pw.length < PASSWORD_MIN_LENGTH) issues.push(`Use at least ${PASSWORD_MIN_LENGTH} characters.`);
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) issues.push("Use a mix of letters and numbers.");
  return issues;
}

// No 0/O, 1/l/I so the password is easy to read out over the phone.
const LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz";
const DIGITS = "23456789";

export function generateTemporaryPassword(length = 10): string {
  const all = LETTERS + DIGITS;
  const pick = (set: string) => {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return set[buf[0] % set.length];
  };
  const chars = [pick(LETTERS), pick(LETTERS), pick(DIGITS), pick(DIGITS)];
  while (chars.length < length) chars.push(pick(all));
  // Fisher–Yates shuffle so the guaranteed letters/digits aren't always first.
  for (let i = chars.length - 1; i > 0; i--) {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    const j = buf[0] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

/* ---------- admin guard ---------- */

/** Logins of active employees that are enabled admins. */
export function activeAdminIds(logins: Login[], employees: Pick<Employee, "id" | "status">[]): string[] {
  const active = new Set(employees.filter((e) => e.status === "active").map((e) => e.id));
  return logins.filter((l) => l.role === "admin" && l.enabled && active.has(l.employeeId)).map((l) => l.employeeId);
}

/** True when removing this employee's admin access would leave no active admin. */
export function isLastActiveAdmin(employeeId: string, logins: Login[], employees: Pick<Employee, "id" | "status">[]) {
  const admins = activeAdminIds(logins, employees);
  return admins.length === 1 && admins[0] === employeeId;
}

export const normalizeUsername = (u: string) => u.trim().toLowerCase();
