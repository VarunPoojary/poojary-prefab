import { ROLE_LABELS, type Role } from "@/lib/auth/types";
import { hashPassword } from "@/lib/auth/crypto";
import { normalizePhone } from "@/lib/crm/rules";
import { CrmNotFoundError, ValidationError } from "@/lib/crm/types";
import {
  BLOOD_GROUPS,
  DOCUMENT_SLOTS,
  DOCUMENT_TYPES,
  EMPLOYMENT_TYPES,
  GENDERS,
  LEAVING_REASONS,
  MAX_DOCUMENT_BYTES,
  PAY_TYPES,
} from "./config";
import type { EmployeeRepository, NewDocument } from "./repository";
import {
  formatEmployeeCode,
  generateTemporaryPassword,
  isLastActiveAdmin,
  normalizeUsername,
  validateEmployee,
  validateLeaving,
  validateSalary,
} from "./rules";
import { PeopleStore } from "./store";
import {
  ForbiddenError,
  type CreatedLogin,
  type DirectoryEntry,
  type Employee,
  type EmployeeEvent,
  type EmployeeInput,
  type EmployeeListParams,
  type EmployeeSummary,
  type Leaving,
  type LinkedRecords,
  type Login,
  type LoginInfo,
  type Lookups,
  type NewSalary,
} from "./types";

/** Storage keys of other modules, read to find references to an employee. */
export const REFERENCE_KEYS = {
  quotations: "pppl.quotations.v2",
  enquiries: "pppl.enquiries.v1",
  clients: "pppl.clients.v1",
  attendance: "pppl.attendance.v1",
  expenses: "pppl.expenses.v1",
  payrollPayments: "pppl.payroll-payments.v1",
  payrollMonths: "pppl.payroll-months.v1",
};

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const newId = (p: string) => `${p}_${typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2)}`;
const label = <T extends string>(list: { value: T; label: string }[], v: string) => list.find((x) => x.value === v)?.label ?? v;
const stripHash = ({ passwordHash: _ignored, ...rest }: Login): LoginInfo => rest; // eslint-disable-line @typescript-eslint/no-unused-vars

export interface Actor {
  id: string;
  role: Role;
}

/**
 * Where login passwords are kept. Browser version: a PBKDF2 hash in the login record. Supabase version: the
 * password is set in Supabase Auth by the server, and the record keeps only a marker.
 */
export interface LoginBackend {
  /** Sets the login's password; returns the value to keep in Login.passwordHash. */
  setPassword(employeeId: string, password: string): Promise<string>;
  /** Called after a login was deleted with its employee. */
  remove?(employeeId: string): Promise<void>;
}

export const browserLogins: LoginBackend = { setPassword: (_employeeId, password) => hashPassword(password) };

/**
 * TEMPORARY employee store in the browser's localStorage. Replace with ApiEmployeeRepository
 * (lib/employees/api-repo.ts) when the cloud database is ready. Admin checks here only protect the
 * UI; the real API must enforce them on the server.
 */
export class LocalEmployeeRepository implements EmployeeRepository {
  readonly label = "This browser (temporary)";

  constructor(
    private readonly people: PeopleStore,
    private readonly getActor: () => Promise<Actor | null>,
    private readonly latencyMs = 150,
    private readonly now: () => number = () => Date.now(),
    private readonly passwords: LoginBackend = browserLogins,
  ) {}

  private async delay() {
    if (this.latencyMs > 0) await new Promise((r) => setTimeout(r, this.latencyMs));
  }

  private async admin(): Promise<Actor> {
    await this.delay();
    const a = await this.getActor();
    if (!a || a.role !== "admin") throw new ForbiddenError();
    return a;
  }

  private iso() {
    return new Date(this.now()).toISOString();
  }

  private find(list: Employee[], id: string) {
    const e = list.find((x) => x.id === id);
    if (!e) throw new CrmNotFoundError("Employee", id);
    return e;
  }

  private put(list: Employee[], e: Employee) {
    this.people.saveEmployees(list.map((x) => (x.id === e.id ? e : x)));
    return clone(e);
  }

  private event(userId: string, o: Omit<EmployeeEvent, "id" | "at" | "userId">): EmployeeEvent {
    return { id: newId("ev"), at: this.iso(), userId, ...o };
  }

  private log(e: Employee, actor: string, o: Omit<EmployeeEvent, "id" | "at" | "userId">): Employee {
    return { ...e, updatedAt: this.iso(), history: [...e.history, this.event(actor, o)] };
  }

  private assertMobileFree(list: Employee[], mobile: string, excludeId?: string) {
    const m = normalizePhone(mobile);
    const other = list.find((e) => e.id !== excludeId && normalizePhone(e.mobile) === m);
    if (other) throw new ValidationError([`Mobile number ${m} is already used by ${other.fullName} (${other.code}).`]);
  }

  private checkInput(input: EmployeeInput) {
    const errors = validateEmployee(input, this.now());
    if (Object.keys(errors).length) throw new ValidationError(Object.values(errors));
  }

  private checkDocument(doc: NewDocument) {
    if (!DOCUMENT_TYPES.includes(doc.type)) throw new ValidationError([`${doc.name}: only PDF, JPG or PNG files are allowed.`]);
    if (doc.size > MAX_DOCUMENT_BYTES) throw new ValidationError([`${doc.name} is larger than 10 MB.`]);
  }

  private clean(input: EmployeeInput): EmployeeInput {
    return {
      ...input,
      fullName: input.fullName.trim().replace(/\s+/g, " "),
      mobile: normalizePhone(input.mobile) || input.mobile.trim(),
      address: input.address.trim(),
      emergencyContact: {
        name: input.emergencyContact.name.trim(),
        relation: input.emergencyContact.relation.trim(),
        phone: normalizePhone(input.emergencyContact.phone) || input.emergencyContact.phone.trim(),
      },
    };
  }

  /* ---------- employees ---------- */

  async list(params: EmployeeListParams = {}): Promise<EmployeeSummary[]> {
    await this.admin();
    const { search = "", department, designation, employmentType, status = "active", hasLogin, sort = "name", dir = "asc" } = params;
    const logins = new Map(this.people.logins().map((l) => [l.employeeId, l]));
    const terms = search.toLowerCase().split(/\s+/).filter(Boolean);
    const digits = search.replace(/\D/g, "");
    const items: EmployeeSummary[] = this.people
      .employees()
      .filter((e) => status === "all" || e.status === status)
      .filter((e) => !department || e.department === department)
      .filter((e) => !designation || e.designation === designation)
      .filter((e) => !employmentType || e.employmentType === employmentType)
      .filter((e) => !hasLogin || (hasLogin === "yes") === logins.has(e.id))
      .filter((e) => {
        if (!terms.length) return true;
        if (digits.length >= 3 && e.mobile.includes(digits)) return true;
        const hay = [e.code, e.fullName, e.mobile, e.designation].join(" ").toLowerCase();
        return terms.every((t) => hay.includes(t));
      })
      .map((e) => {
        const l = logins.get(e.id);
        return {
          id: e.id,
          code: e.code,
          fullName: e.fullName,
          mobile: e.mobile,
          designation: e.designation,
          department: e.department,
          employmentType: e.employmentType,
          dateOfJoining: e.dateOfJoining,
          status: e.status,
          login: l ? { role: l.role, enabled: l.enabled, username: l.username } : null,
        };
      });
    const key: Record<string, (s: EmployeeSummary) => string> = {
      code: (s) => s.code,
      name: (s) => s.fullName.toLowerCase(),
      designation: (s) => s.designation.toLowerCase(),
      department: (s) => s.department.toLowerCase(),
      mobile: (s) => s.mobile,
      joining: (s) => s.dateOfJoining,
      status: (s) => s.status,
      login: (s) => (s.login ? `${s.login.role}${s.login.enabled ? "1" : "0"}` : ""),
    };
    const sign = dir === "asc" ? 1 : -1;
    return items.sort((a, b) => sign * (key[sort](a).localeCompare(key[sort](b)) || a.fullName.localeCompare(b.fullName)));
  }

  async get(id: string): Promise<Employee> {
    await this.admin();
    return clone(this.find(this.people.employees(), id));
  }

  async create(input: EmployeeInput, salary: NewSalary, documents: NewDocument[] = []): Promise<Employee> {
    const actor = await this.admin();
    const clean = this.clean(input);
    this.checkInput(clean);
    const sErrors = validateSalary(salary);
    if (Object.keys(sErrors).length) throw new ValidationError(Object.values(sErrors));
    documents.forEach((d) => this.checkDocument(d));
    const list = this.people.employees();
    this.assertMobileFree(list, clean.mobile);

    const lookups = this.people.lookups();
    const t = this.iso();
    const e: Employee = {
      ...clean,
      employmentType: clean.employmentType as Employee["employmentType"],
      id: newId("emp"),
      code: formatEmployeeCode(lookups.nextEmployeeNumber),
      status: "active",
      leaving: null,
      salary: [
        { id: newId("sal"), payType: salary.payType as "monthly" | "daily", amount: salary.amount!, effectiveFrom: salary.effectiveFrom, createdAt: t, createdBy: actor.id },
      ],
      documents: documents.map((d) => ({ ...d, id: newId("doc"), uploadedAt: t, uploadedBy: actor.id })),
      history: [this.event(actor.id, { type: "created" })],
      createdAt: t,
      createdBy: actor.id,
      updatedAt: t,
    };
    this.people.saveLookups({ ...lookups, nextEmployeeNumber: lookups.nextEmployeeNumber + 1 });
    this.people.saveEmployees([...list, e]);
    return clone(e);
  }

  async update(id: string, input: EmployeeInput): Promise<Employee> {
    const actor = await this.admin();
    const list = this.people.employees();
    const current = this.find(list, id);
    const clean = this.clean(input);
    this.checkInput(clean);
    this.assertMobileFree(list, clean.mobile, id);

    const fields: [string, (x: EmployeeInput | Employee) => string][] = [
      ["Full name", (x) => x.fullName],
      ["Mobile number", (x) => x.mobile],
      ["Date of birth", (x) => x.dob],
      ["Gender", (x) => label(GENDERS, x.gender)],
      ["Blood group", (x) => label(BLOOD_GROUPS, x.bloodGroup)],
      ["Current address", (x) => x.address],
      ["Designation", (x) => x.designation],
      ["Department", (x) => x.department],
      ["Employment type", (x) => label(EMPLOYMENT_TYPES, x.employmentType)],
      ["Date of joining", (x) => x.dateOfJoining],
      ["Emergency contact name", (x) => x.emergencyContact.name],
      ["Emergency contact relation", (x) => x.emergencyContact.relation],
      ["Emergency contact phone", (x) => x.emergencyContact.phone],
    ];
    const changes = fields
      .map(([f, get]) => ({ field: f, from: get(current), to: get(clean) }))
      .filter((c) => c.from !== c.to);
    if (!changes.length) return clone(current);
    const t = this.iso();
    const updated: Employee = {
      ...current,
      ...clean,
      employmentType: clean.employmentType as Employee["employmentType"],
      updatedAt: t,
      history: [...current.history, ...changes.map((c) => ({ ...this.event(actor.id, { type: "edited" as const }), ...c }))],
    };
    return this.put(list, updated);
  }

  async addSalary(id: string, salary: NewSalary): Promise<Employee> {
    const actor = await this.admin();
    const errors = validateSalary(salary);
    if (Object.keys(errors).length) throw new ValidationError(Object.values(errors));
    const list = this.people.employees();
    const e = this.find(list, id);
    if (salary.effectiveFrom < e.dateOfJoining) throw new ValidationError(["The effective date can't be before the date of joining."]);
    const entry = {
      id: newId("sal"),
      payType: salary.payType as "monthly" | "daily",
      amount: salary.amount!,
      effectiveFrom: salary.effectiveFrom,
      createdAt: this.iso(),
      createdBy: actor.id,
    };
    // Salary values are never written to the change log.
    const unit = label(PAY_TYPES, entry.payType);
    return this.put(
      list,
      this.log({ ...e, salary: [...e.salary, entry] }, actor.id, { type: "salary", comment: `${unit}, effective ${entry.effectiveFrom}` }),
    );
  }

  async addDocument(id: string, doc: NewDocument): Promise<Employee> {
    const actor = await this.admin();
    this.checkDocument(doc);
    const list = this.people.employees();
    const e = this.find(list, id);
    const d = { ...doc, id: newId("doc"), uploadedAt: this.iso(), uploadedBy: actor.id };
    return this.put(
      list,
      this.log({ ...e, documents: [...e.documents, d] }, actor.id, { type: "document_added", comment: `${label(DOCUMENT_SLOTS, doc.slot)}: ${doc.name}` }),
    );
  }

  async removeDocument(id: string, documentId: string): Promise<Employee> {
    const actor = await this.admin();
    const list = this.people.employees();
    const e = this.find(list, id);
    const d = e.documents.find((x) => x.id === documentId);
    if (!d) return clone(e);
    return this.put(
      list,
      this.log({ ...e, documents: e.documents.filter((x) => x.id !== documentId) }, actor.id, {
        type: "document_removed",
        comment: `${label(DOCUMENT_SLOTS, d.slot)}: ${d.name}`,
      }),
    );
  }

  private guardAdminAccess(employeeId: string, action: string) {
    if (isLastActiveAdmin(employeeId, this.people.logins(), this.people.employees()))
      throw new ValidationError([`This is the last active admin, so they can't be ${action}. Make another employee an admin first.`]);
  }

  async deactivate(id: string, leaving: Leaving): Promise<Employee> {
    const actor = await this.admin();
    const list = this.people.employees();
    const e = this.find(list, id);
    if (e.status === "inactive") throw new ValidationError(["This employee is already inactive."]);
    if (actor.id === id) throw new ValidationError(["You can't deactivate yourself."]);
    const issues = validateLeaving(leaving.date, leaving.reason, leaving.other, e.dateOfJoining);
    if (issues.length) throw new ValidationError(issues);
    this.guardAdminAccess(id, "deactivated");
    const logins = this.people.logins();
    const login = logins.find((l) => l.employeeId === id);
    if (login) this.people.saveLogins(logins.map((l) => (l === login ? { ...l, enabled: false, sessionVersion: l.sessionVersion + 1 } : l)));
    const reason = leaving.reason === "other" ? leaving.other.trim() : label(LEAVING_REASONS, leaving.reason);
    return this.put(
      list,
      this.log({ ...e, status: "inactive", leaving: { ...leaving, other: leaving.other.trim() } }, actor.id, {
        type: "deactivated",
        comment: `${reason}, leaving date ${leaving.date}${login ? ". Login disabled." : ""}`,
      }),
    );
  }

  async reactivate(id: string): Promise<Employee> {
    const actor = await this.admin();
    const list = this.people.employees();
    const e = this.find(list, id);
    if (e.status === "active") return clone(e);
    return this.put(list, this.log({ ...e, status: "active", leaving: null }, actor.id, { type: "reactivated" }));
  }

  private references(id: string): LinkedRecords {
    type Enq = { createdBy?: string; assignedTo?: string; history?: { userId: string }[] };
    type Quote = { createdBy?: string | null; updatedBy?: string | null };
    type Cli = { createdBy?: string };
    const enquiries = this.people
      .readOther<Enq>(REFERENCE_KEYS.enquiries)
      .filter((e) => e.createdBy === id || e.assignedTo === id || e.history?.some((h) => h.userId === id)).length;
    const quotations = this.people.readOther<Quote>(REFERENCE_KEYS.quotations).filter((q) => q.createdBy === id || q.updatedBy === id).length;
    const clients = this.people.readOther<Cli>(REFERENCE_KEYS.clients).filter((c) => c.createdBy === id).length;
    const historyEntries = this.people
      .employees()
      .flatMap((e) => e.history)
      .filter((h) => h.userId === id).length;
    const attendance = this.people
      .readOther<{ personKind?: string; personId?: string; loggedBy?: string }>(REFERENCE_KEYS.attendance)
      .filter((r) => (r.personKind === "employee" && r.personId === id) || r.loggedBy === id).length;
    const expenses = this.people.readOther<{ requestedBy?: string; history?: { by?: string }[] }>(REFERENCE_KEYS.expenses).filter((x) => x.requestedBy === id || x.history?.some((h) => h.by === id)).length;
    const payroll =
      this.people.readOther<{ employeeId?: string; by?: string }>(REFERENCE_KEYS.payrollPayments).filter((x) => x.employeeId === id || x.by === id).length +
      this.people.readOther<{ employeeId?: string; closedBy?: string }>(REFERENCE_KEYS.payrollMonths).filter((x) => x.employeeId === id || x.closedBy === id).length;
    return { enquiries, quotations, clients, historyEntries, attendance, expenses, payroll, total: enquiries + quotations + clients + historyEntries + attendance + expenses + payroll };
  }

  async linkedRecords(id: string): Promise<LinkedRecords> {
    await this.admin();
    this.find(this.people.employees(), id);
    return this.references(id);
  }

  async deletePermanently(id: string, confirmName: string): Promise<void> {
    const actor = await this.admin();
    const list = this.people.employees();
    const e = this.find(list, id);
    if (actor.id === id) throw new ValidationError(["You can't delete yourself."]);
    if (this.references(id).total > 0)
      throw new ValidationError(["This employee has linked records (enquiries, quotations or log entries). Deactivate them instead."]);
    if (confirmName.trim() !== e.fullName) throw new ValidationError(["Type the employee's full name exactly to confirm."]);
    this.guardAdminAccess(id, "deleted");
    const hadLogin = this.people.logins().some((l) => l.employeeId === id);
    this.people.saveEmployees(list.filter((x) => x.id !== id));
    this.people.saveLogins(this.people.logins().filter((l) => l.employeeId !== id));
    if (hadLogin) await this.passwords.remove?.(id);
  }

  async checkMobile(mobile: string, excludeId?: string) {
    await this.delay();
    const m = normalizePhone(mobile);
    if (!m) return null;
    const other = this.people.employees().find((e) => e.id !== excludeId && normalizePhone(e.mobile) === m);
    return other ? { id: other.id, code: other.code, fullName: other.fullName } : null;
  }

  /* ---------- lookups ---------- */

  async lookups(): Promise<Lookups> {
    await this.delay();
    return clone(this.people.lookups());
  }

  async addLookup(kind: "designations" | "departments", value: string): Promise<Lookups> {
    await this.admin();
    const v = value.trim().replace(/\s+/g, " ");
    if (!v) throw new ValidationError(["Enter a value."]);
    const l = this.people.lookups();
    if (!l[kind].some((x) => x.toLowerCase() === v.toLowerCase())) l[kind] = [...l[kind], v];
    this.people.saveLookups(l);
    return clone(l);
  }

  /* ---------- logins ---------- */

  async getLogin(employeeId: string): Promise<LoginInfo | null> {
    await this.admin();
    const l = this.people.logins().find((x) => x.employeeId === employeeId);
    return l ? stripHash(l) : null;
  }

  private saveLogin(login: Login) {
    const logins = this.people.logins();
    const exists = logins.some((l) => l.employeeId === login.employeeId);
    this.people.saveLogins(exists ? logins.map((l) => (l.employeeId === login.employeeId ? login : l)) : [...logins, login]);
  }

  private logEmployee(employeeId: string, actor: string, o: Omit<EmployeeEvent, "id" | "at" | "userId">) {
    const list = this.people.employees();
    const e = this.find(list, employeeId);
    this.put(list, this.log(e, actor, o));
  }

  async createLogin(employeeId: string, opts: { username: string; role: Role; mustChangePassword: boolean }): Promise<CreatedLogin> {
    const actor = await this.admin();
    const e = this.find(this.people.employees(), employeeId);
    if (e.status !== "active") throw new ValidationError(["Reactivate the employee before creating a login."]);
    const logins = this.people.logins();
    if (logins.some((l) => l.employeeId === employeeId)) throw new ValidationError(["This employee already has a login."]);
    const username = opts.username.trim();
    if (!username) throw new ValidationError(["Enter a username."]);
    if (/\s/.test(username)) throw new ValidationError(["The username can't contain spaces."]);
    if (logins.some((l) => normalizeUsername(l.username) === normalizeUsername(username)))
      throw new ValidationError([`The username “${username}” is already taken.`]);
    const temporaryPassword = generateTemporaryPassword();
    const login: Login = {
      employeeId,
      username,
      role: opts.role,
      enabled: true,
      passwordHash: await this.passwords.setPassword(employeeId, temporaryPassword),
      mustChangePassword: opts.mustChangePassword,
      failedAttempts: 0,
      lockedUntil: null,
      lastLoginAt: null,
      passwordChangedAt: null,
      sessionVersion: 1,
      createdAt: this.iso(),
    };
    this.saveLogin(login);
    this.logEmployee(employeeId, actor.id, { type: "login_created", comment: `Username ${username}, role ${ROLE_LABELS[opts.role]}` });
    return { login: stripHash(login), temporaryPassword };
  }

  private findLogin(employeeId: string) {
    const l = this.people.logins().find((x) => x.employeeId === employeeId);
    if (!l) throw new ValidationError(["This employee has no login."]);
    return l;
  }

  async resetPassword(employeeId: string): Promise<CreatedLogin> {
    const actor = await this.admin();
    const l = this.findLogin(employeeId);
    const temporaryPassword = generateTemporaryPassword();
    const updated: Login = {
      ...l,
      passwordHash: await this.passwords.setPassword(employeeId, temporaryPassword),
      mustChangePassword: true,
      failedAttempts: 0,
      lockedUntil: null,
      sessionVersion: l.sessionVersion + 1,
    };
    this.saveLogin(updated);
    this.logEmployee(employeeId, actor.id, { type: "login_reset", comment: "Temporary password issued" });
    return { login: stripHash(updated), temporaryPassword };
  }

  async setRole(employeeId: string, role: Role): Promise<LoginInfo> {
    const actor = await this.admin();
    const l = this.findLogin(employeeId);
    if (l.role === role) return stripHash(l);
    if (l.role === "admin") this.guardAdminAccess(employeeId, "demoted");
    const updated = { ...l, role };
    this.saveLogin(updated);
    this.logEmployee(employeeId, actor.id, {
      type: "login_role",
      from: ROLE_LABELS[l.role],
      to: ROLE_LABELS[role],
    });
    return stripHash(updated);
  }

  async setLoginEnabled(employeeId: string, enabled: boolean): Promise<LoginInfo> {
    const actor = await this.admin();
    const l = this.findLogin(employeeId);
    if (l.enabled === enabled) return stripHash(l);
    if (!enabled) {
      if (actor.id === employeeId) throw new ValidationError(["You can't disable your own login."]);
      this.guardAdminAccess(employeeId, "disabled");
    } else {
      const e = this.find(this.people.employees(), employeeId);
      if (e.status !== "active") throw new ValidationError(["Reactivate the employee before enabling the login."]);
    }
    const updated: Login = { ...l, enabled, failedAttempts: 0, lockedUntil: null, sessionVersion: enabled ? l.sessionVersion : l.sessionVersion + 1 };
    this.saveLogin(updated);
    this.logEmployee(employeeId, actor.id, { type: enabled ? "login_enabled" : "login_disabled" });
    return stripHash(updated);
  }

  /* ---------- directory ---------- */

  async directory(): Promise<DirectoryEntry[]> {
    const logins = new Map(this.people.logins().map((l) => [l.employeeId, l]));
    return this.people
      .employees()
      .map((e) => ({
        id: e.id,
        code: e.code,
        name: e.fullName,
        designation: e.designation,
        department: e.department,
        mobile: e.mobile,
        dateOfJoining: e.dateOfJoining,
        leavingDate: e.leaving?.date ?? "",
        active: e.status === "active",
        assignable: e.status === "active" && !!logins.get(e.id)?.enabled,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async resetDemoData(): Promise<void> {
    this.people.reset();
  }
}
