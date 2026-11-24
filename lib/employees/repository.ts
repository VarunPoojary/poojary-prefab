import type { Role } from "@/lib/auth/types";
import type {
  CreatedLogin,
  DirectoryEntry,
  DocumentSlot,
  Employee,
  EmployeeInput,
  EmployeeListParams,
  EmployeeSummary,
  Leaving,
  LinkedRecords,
  LoginInfo,
  Lookups,
  NewSalary,
} from "./types";

export interface NewDocument {
  slot: DocumentSlot;
  name: string;
  type: string;
  size: number;
  url: string;
  fileId?: string;
}

/**
 * Single entry point for employees and their logins. Screens use only this interface (through
 * lib/employees/hooks.ts), so the browser-storage version can be swapped for the cloud API in
 * lib/employees/index.ts. Everything except directory() is admin-only.
 */
export interface EmployeeRepository {
  readonly label: string;

  list(params?: EmployeeListParams): Promise<EmployeeSummary[]>;
  get(id: string): Promise<Employee>;
  create(input: EmployeeInput, salary: NewSalary, documents?: NewDocument[]): Promise<Employee>;
  /** Logs every changed field (old → new). Salary changes go through addSalary. */
  update(id: string, input: EmployeeInput): Promise<Employee>;
  addSalary(id: string, salary: NewSalary): Promise<Employee>;
  addDocument(id: string, doc: NewDocument): Promise<Employee>;
  removeDocument(id: string, documentId: string): Promise<Employee>;
  /** Asks for leaving date and reason; disables the login immediately. */
  deactivate(id: string, leaving: Leaving): Promise<Employee>;
  /** The login stays disabled until an admin enables it. */
  reactivate(id: string): Promise<Employee>;
  linkedRecords(id: string): Promise<LinkedRecords>;
  /** Only for employees without linked records; confirmName must equal the full name. */
  deletePermanently(id: string, confirmName: string): Promise<void>;
  /** Another employee already using this mobile number, if any. */
  checkMobile(mobile: string, excludeId?: string): Promise<{ id: string; code: string; fullName: string } | null>;

  lookups(): Promise<Lookups>;
  addLookup(kind: "designations" | "departments", value: string): Promise<Lookups>;

  getLogin(employeeId: string): Promise<LoginInfo | null>;
  createLogin(employeeId: string, opts: { username: string; role: Role; mustChangePassword: boolean }): Promise<CreatedLogin>;
  resetPassword(employeeId: string): Promise<CreatedLogin>;
  setRole(employeeId: string, role: Role): Promise<LoginInfo>;
  setLoginEnabled(employeeId: string, enabled: boolean): Promise<LoginInfo>;

  /** Salary-free names for everyone signed in: "assigned to" pickers, created-by labels. */
  directory(): Promise<DirectoryEntry[]>;

  resetDemoData?(): Promise<void>;
}
