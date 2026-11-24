import type { BloodGroup, DocumentSlot, EmploymentType, Gender, LeavingReason, PayType } from "./types";

export const GENDERS: { value: Gender; label: string }[] = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Other" },
  { value: "undisclosed", label: "Prefer not to say" },
];

export const BLOOD_GROUPS: { value: BloodGroup; label: string }[] = [
  ...(["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] as const).map((v) => ({ value: v, label: v.replace("-", "−") })),
  { value: "unknown", label: "Unknown" },
];

export const EMPLOYMENT_TYPES: { value: EmploymentType; label: string }[] = [
  { value: "permanent", label: "Permanent" },
  { value: "probation", label: "Probation" },
  { value: "contract", label: "Contract" },
  { value: "daily_wage", label: "Daily-wage worker" },
];

export const PAY_TYPES: { value: PayType; label: string; unit: string }[] = [
  { value: "monthly", label: "Monthly salary", unit: "per month" },
  { value: "daily", label: "Daily wage", unit: "per day" },
];

export const LEAVING_REASONS: { value: LeavingReason; label: string }[] = [
  { value: "resigned", label: "Resigned" },
  { value: "terminated", label: "Terminated" },
  { value: "contract_ended", label: "Contract ended" },
  { value: "other", label: "Other" },
];

export const DOCUMENT_SLOTS: { value: DocumentSlot; label: string }[] = [
  { value: "id_proof", label: "ID proof" },
  { value: "address_proof", label: "Address proof" },
  { value: "offer_letter", label: "Offer / appointment letter" },
  { value: "certificate", label: "Certificate (e.g. welder qualification)" },
  { value: "other", label: "Other" },
];

export const DOCUMENT_ACCEPT = ".pdf,.jpg,.jpeg,.png";
export const DOCUMENT_TYPES = ["application/pdf", "image/jpeg", "image/png"];
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

/** Starting values; admins can add more from the employee form. */
export const DEFAULT_DESIGNATIONS = [
  "Director",
  "Sales",
  "Estimation",
  "Design",
  "Detailing",
  "Production supervisor",
  "Welder",
  "Fitter",
  "Erection supervisor",
  "Accounts",
  "Driver",
];

export const DEFAULT_DEPARTMENTS = ["Sales", "Design", "Production", "Erection", "Accounts", "Admin"];

export const MIN_AGE_YEARS = 18;

/** Login rules from the requirements. */
export const PASSWORD_MIN_LENGTH = 8;
export const MAX_FAILED_ATTEMPTS = 5;
export const LOCKOUT_MINUTES = 15;
export const SESSION_HOURS = 8;
