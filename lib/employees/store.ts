import { appStorage, type KeyValueStorage } from "@/lib/storage";
import { StorageFullError } from "@/lib/data/types";
import { seedPeople } from "./seed";
import type { Employee, Login, Lookups } from "./types";

export const EMPLOYEES_KEY = "pppl.employees.v1";
export const LOGINS_KEY = "pppl.logins.v1";
export const LOOKUPS_KEY = "pppl.lookups.v1";

/**
 * Raw access to the employee, login and lookup lists in browser storage. Shared by the sign-in
 * service and the employee repository; screens never use it directly.
 */
export class PeopleStore {
  constructor(
    private readonly storage: () => KeyValueStorage = appStorage,
    private readonly seed = true,
    private readonly now: () => number = () => Date.now(),
  ) {}

  private ensure() {
    const s = this.storage();
    if (s.getItem(EMPLOYEES_KEY) !== null) return;
    const data = this.seed
      ? seedPeople(this.now())
      : { employees: [], logins: [], lookups: { designations: [], departments: [], nextEmployeeNumber: 1 } };
    this.write(EMPLOYEES_KEY, data.employees);
    this.write(LOGINS_KEY, data.logins);
    this.write(LOOKUPS_KEY, data.lookups);
  }

  private read<T>(key: string, fallback: T): T {
    this.ensure();
    const raw = this.storage().getItem(key);
    if (raw === null) return fallback;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }

  private write(key: string, value: unknown) {
    try {
      this.storage().setItem(key, JSON.stringify(value));
    } catch (e) {
      if (e instanceof Error && /quota/i.test(e.name + e.message)) throw new StorageFullError();
      throw e;
    }
  }

  employees(): Employee[] {
    return this.read<Employee[]>(EMPLOYEES_KEY, []);
  }
  saveEmployees(list: Employee[]) {
    this.write(EMPLOYEES_KEY, list);
  }
  logins(): Login[] {
    return this.read<Login[]>(LOGINS_KEY, []);
  }
  saveLogins(list: Login[]) {
    this.write(LOGINS_KEY, list);
  }
  lookups(): Lookups {
    return this.read<Lookups>(LOOKUPS_KEY, { designations: [], departments: [], nextEmployeeNumber: 1 });
  }
  saveLookups(l: Lookups) {
    this.write(LOOKUPS_KEY, l);
  }

  /** Reads another module's list (enquiries, clients, quotations) to check for references. */
  readOther<T>(key: string): T[] {
    const raw = this.storage().getItem(key);
    if (!raw) return [];
    try {
      const v = JSON.parse(raw);
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  }

  reset() {
    const s = this.storage();
    s.removeItem(EMPLOYEES_KEY);
    s.removeItem(LOGINS_KEY);
    s.removeItem(LOOKUPS_KEY);
    this.ensure();
  }
}
