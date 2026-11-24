import type { Role } from "@/lib/auth/types";
import { CrmNotFoundError, ValidationError } from "@/lib/crm/types";
import type { EmployeeRepository, NewDocument } from "./repository";
import {
  ForbiddenError,
  type CreatedLogin,
  type DirectoryEntry,
  type Employee,
  type EmployeeInput,
  type EmployeeListParams,
  type EmployeeSummary,
  type Leaving,
  type LinkedRecords,
  type LoginInfo,
  type Lookups,
  type NewSalary,
} from "./types";

/**
 * Cloud employee implementation – NOT USED YET.
 *
 * Expected endpoints (JSON; 403 → not an admin, 404 → not found, 422 { issues } → validation):
 *   GET    /employees?search=&department=&designation=&employmentType=&status=&hasLogin=&sort=&dir=
 *   GET    /employees/:id                         -> Employee (salary only for admins)
 *   POST   /employees           { input, salary, documents }
 *   PUT    /employees/:id       EmployeeInput
 *   POST   /employees/:id/salary NewSalary
 *   POST   /employees/:id/documents (multipart)  · DELETE /employees/:id/documents/:docId
 *   POST   /employees/:id/deactivate Leaving     · POST /employees/:id/reactivate
 *   GET    /employees/:id/links                  -> LinkedRecords
 *   DELETE /employees/:id?confirm=<full name>
 *   GET    /employees/check-mobile?mobile=&excludeId=
 *   GET    /lookups · POST /lookups/:kind { value }
 *   GET    /employees/:id/login · POST /employees/:id/login { username, role, mustChangePassword } -> CreatedLogin
 *   POST   /employees/:id/login/reset-password -> CreatedLogin
 *   PATCH  /employees/:id/login { role?, enabled? }
 *   GET    /directory                            -> DirectoryEntry[] (any signed-in user; never salaries)
 *
 * The server must enforce: admin-only access, salary hidden from Staff, hashed passwords,
 * the last-active-admin rule, and that admins can't disable themselves.
 */
export class ApiEmployeeRepository implements EmployeeRepository {
  readonly label = "Cloud database";

  constructor(private readonly baseUrl: string) {}

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const isForm = init.body instanceof FormData;
    const res = await fetch(`${this.baseUrl}${path}`, {
      credentials: "include",
      ...init,
      headers: { ...(isForm ? {} : { "Content-Type": "application/json" }), ...init.headers },
    });
    if (res.status === 403) throw new ForbiddenError();
    if (res.status === 404) throw new CrmNotFoundError("Employee", path);
    if (res.status === 422) throw new ValidationError(((await res.json()) as { issues: string[] }).issues);
    if (!res.ok) throw new Error(`Request failed (${res.status})`);
    return (res.status === 204 ? undefined : await res.json()) as T;
  }

  private body = (v: unknown) => JSON.stringify(v);
  private qs = (p: object) =>
    new URLSearchParams(Object.entries(p).filter(([, v]) => v !== undefined && v !== "").map(([k, v]) => [k, String(v)])).toString();

  list(p: EmployeeListParams = {}): Promise<EmployeeSummary[]> {
    return this.request(`/employees?${this.qs(p)}`);
  }
  get(id: string): Promise<Employee> {
    return this.request(`/employees/${id}`);
  }
  create(input: EmployeeInput, salary: NewSalary, documents: NewDocument[] = []): Promise<Employee> {
    return this.request(`/employees`, { method: "POST", body: this.body({ input, salary, documents }) });
  }
  update(id: string, input: EmployeeInput): Promise<Employee> {
    return this.request(`/employees/${id}`, { method: "PUT", body: this.body(input) });
  }
  addSalary(id: string, salary: NewSalary): Promise<Employee> {
    return this.request(`/employees/${id}/salary`, { method: "POST", body: this.body(salary) });
  }
  async addDocument(id: string, doc: NewDocument): Promise<Employee> {
    // Files are uploaded to /files first; the employee only stores the reference.
    return this.request(`/employees/${id}/documents`, { method: "POST", body: this.body({ slot: doc.slot, fileId: doc.fileId, name: doc.name, type: doc.type, size: doc.size }) });
  }
  removeDocument(id: string, documentId: string): Promise<Employee> {
    return this.request(`/employees/${id}/documents/${documentId}`, { method: "DELETE" });
  }
  deactivate(id: string, leaving: Leaving): Promise<Employee> {
    return this.request(`/employees/${id}/deactivate`, { method: "POST", body: this.body(leaving) });
  }
  reactivate(id: string): Promise<Employee> {
    return this.request(`/employees/${id}/reactivate`, { method: "POST" });
  }
  linkedRecords(id: string): Promise<LinkedRecords> {
    return this.request(`/employees/${id}/links`);
  }
  deletePermanently(id: string, confirmName: string): Promise<void> {
    return this.request(`/employees/${id}?${this.qs({ confirm: confirmName })}`, { method: "DELETE" });
  }
  checkMobile(mobile: string, excludeId?: string) {
    return this.request<{ id: string; code: string; fullName: string } | null>(`/employees/check-mobile?${this.qs({ mobile, excludeId })}`);
  }
  lookups(): Promise<Lookups> {
    return this.request(`/lookups`);
  }
  addLookup(kind: "designations" | "departments", value: string): Promise<Lookups> {
    return this.request(`/lookups/${kind}`, { method: "POST", body: this.body({ value }) });
  }
  getLogin(employeeId: string): Promise<LoginInfo | null> {
    return this.request(`/employees/${employeeId}/login`);
  }
  createLogin(employeeId: string, opts: { username: string; role: Role; mustChangePassword: boolean }): Promise<CreatedLogin> {
    return this.request(`/employees/${employeeId}/login`, { method: "POST", body: this.body(opts) });
  }
  resetPassword(employeeId: string): Promise<CreatedLogin> {
    return this.request(`/employees/${employeeId}/login/reset-password`, { method: "POST" });
  }
  setRole(employeeId: string, role: Role): Promise<LoginInfo> {
    return this.request(`/employees/${employeeId}/login`, { method: "PATCH", body: this.body({ role }) });
  }
  setLoginEnabled(employeeId: string, enabled: boolean): Promise<LoginInfo> {
    return this.request(`/employees/${employeeId}/login`, { method: "PATCH", body: this.body({ enabled }) });
  }
  directory(): Promise<DirectoryEntry[]> {
    return this.request(`/directory`);
  }
}
