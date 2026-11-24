import type { Role } from "@/lib/auth/types";

export type Gender = "male" | "female" | "other" | "undisclosed";
export type BloodGroup = "A+" | "A-" | "B+" | "B-" | "AB+" | "AB-" | "O+" | "O-" | "unknown";
export type EmploymentType = "permanent" | "probation" | "contract" | "daily_wage";
export type PayType = "monthly" | "daily";
export type LeavingReason = "resigned" | "terminated" | "contract_ended" | "other";
export type DocumentSlot = "id_proof" | "address_proof" | "offer_letter" | "certificate" | "other";

export interface SalaryEntry {
  id: string;
  payType: PayType;
  /** ₹ per month or ₹ per day, depending on payType. */
  amount: number;
  /** yyyy-mm-dd */
  effectiveFrom: string;
  createdAt: string;
  createdBy: string;
}

export interface EmergencyContact {
  name: string;
  relation: string;
  phone: string;
}

export interface EmployeeDocument {
  id: string;
  slot: DocumentSlot;
  name: string;
  type: string;
  size: number;
  /** Stored file (browser file store now, cloud storage later). */
  fileId?: string;
  /** Older records only: the file inline as a data: URL. */
  url: string;
  uploadedAt: string;
  uploadedBy: string;
}

export interface Leaving {
  date: string;
  reason: LeavingReason;
  other: string;
}

export type EmployeeEventType =
  | "created"
  | "edited"
  | "salary"
  | "document_added"
  | "document_removed"
  | "deactivated"
  | "reactivated"
  | "login_created"
  | "login_reset"
  | "login_role"
  | "login_enabled"
  | "login_disabled";

export interface EmployeeEvent {
  id: string;
  at: string;
  userId: string;
  type: EmployeeEventType;
  /** Field label for "edited" events. */
  field?: string;
  from?: string;
  to?: string;
  comment?: string;
}

export interface Employee {
  id: string;
  /** EMP-0001; sequential and never reused. */
  code: string;
  fullName: string;
  mobile: string;
  dob: string;
  gender: Gender | "";
  bloodGroup: BloodGroup | "";
  address: string;
  designation: string;
  department: string;
  employmentType: EmploymentType;
  dateOfJoining: string;
  status: "active" | "inactive";
  leaving: Leaving | null;
  /** Oldest first. Stripped for non-admins. */
  salary: SalaryEntry[];
  emergencyContact: EmergencyContact;
  documents: EmployeeDocument[];
  history: EmployeeEvent[];
  createdAt: string;
  createdBy: string;
  updatedAt: string;
}

/** Fields entered on the add / edit form. Salary is only given on create; later changes use addSalary. */
export interface EmployeeInput {
  fullName: string;
  mobile: string;
  dob: string;
  gender: Gender | "";
  bloodGroup: BloodGroup | "";
  address: string;
  designation: string;
  department: string;
  employmentType: EmploymentType | "";
  dateOfJoining: string;
  emergencyContact: EmergencyContact;
}

export interface NewSalary {
  payType: PayType | "";
  amount: number | null;
  effectiveFrom: string;
}

export interface Login {
  employeeId: string;
  username: string;
  role: Role;
  enabled: boolean;
  /** pbkdf2$<iterations>$<salt b64>$<hash b64> */
  passwordHash: string;
  mustChangePassword: boolean;
  failedAttempts: number;
  lockedUntil: string | null;
  lastLoginAt: string | null;
  passwordChangedAt: string | null;
  /** Bumped when the password is reset or the login is disabled, signing out existing sessions. */
  sessionVersion: number;
  createdAt: string;
}

/** Login details without the password hash, safe to show in the UI. */
export type LoginInfo = Omit<Login, "passwordHash">;

export interface Lookups {
  designations: string[];
  departments: string[];
  /** Next employee number to hand out; codes are never reused. */
  nextEmployeeNumber: number;
}

export interface EmployeeSummary {
  id: string;
  code: string;
  fullName: string;
  mobile: string;
  designation: string;
  department: string;
  employmentType: EmploymentType;
  dateOfJoining: string;
  status: "active" | "inactive";
  login: { role: Role; enabled: boolean; username: string } | null;
}

export interface EmployeeListParams {
  search?: string;
  department?: string;
  designation?: string;
  employmentType?: EmploymentType | "";
  status?: "active" | "inactive" | "all";
  hasLogin?: "yes" | "no" | "";
  sort?: "code" | "name" | "designation" | "department" | "mobile" | "joining" | "status" | "login";
  dir?: "asc" | "desc";
}

/** Public, salary-free view of an employee used for names and "Assigned to" pickers. */
export interface DirectoryEntry {
  id: string;
  code: string;
  name: string;
  designation: string;
  department: string;
  mobile: string;
  /** For attendance: date of joining and leaving (yyyy-mm-dd; leaving empty while employed). */
  dateOfJoining: string;
  leavingDate: string;
  active: boolean;
  /** Active employee with an enabled login: can be assigned enquiries and receives reminders. */
  assignable: boolean;
}

export interface LinkedRecords {
  enquiries: number;
  quotations: number;
  clients: number;
  historyEntries: number;
  attendance: number;
  expenses: number;
  payroll: number;
  total: number;
}

export interface CreatedLogin {
  login: LoginInfo;
  /** Shown to the admin once; never stored in plain text. */
  temporaryPassword: string;
}

export class ForbiddenError extends Error {
  constructor(message = "Only admins can do this.") {
    super(message);
    this.name = "ForbiddenError";
  }
}
