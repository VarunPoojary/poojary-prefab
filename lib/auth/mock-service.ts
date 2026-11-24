import { normalizePhone } from "@/lib/crm/rules";
import { LOCKOUT_MINUTES, MAX_FAILED_ATTEMPTS, SESSION_HOURS } from "@/lib/employees/config";
import { validatePassword, normalizeUsername } from "@/lib/employees/rules";
import { DEMO_ACCOUNTS } from "@/lib/employees/seed";
import { PeopleStore } from "@/lib/employees/store";
import type { Login } from "@/lib/employees/types";
import { SESSION_KEY, sessionStore, type KeyValueStorage } from "@/lib/storage";
import { hashPassword, verifyPassword } from "./crypto";
import type { AuthService } from "./service";
import {
  AccountLockedError,
  InvalidCredentialsError,
  LoginDisabledError,
  PasswordChangeError,
  type Session,
} from "./types";

export { SESSION_KEY };

function token() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/**
 * TEMPORARY sign-in against the employee logins kept in browser storage (passwords hashed).
 * The session lives in sessionStorage, so each tab signs in separately.
 * Replace with ApiAuthService when the backend exists.
 */
export class MockAuthService implements AuthService {
  readonly label = "Logins stored in this browser (temporary)";
  readonly demoAccounts = DEMO_ACCOUNTS;

  constructor(
    private readonly people: PeopleStore = new PeopleStore(),
    private readonly session: () => KeyValueStorage = sessionStore,
    private readonly latencyMs = 300,
    private readonly now: () => number = () => Date.now(),
  ) {}

  private async delay() {
    if (this.latencyMs > 0) await new Promise((r) => setTimeout(r, this.latencyMs));
  }

  private findLogin(logins: Login[], username: string) {
    const u = normalizeUsername(username);
    const phone = normalizePhone(username);
    return logins.find((l) => normalizeUsername(l.username) === u || (phone && normalizeUsername(l.username) === phone));
  }

  private saveLogin(login: Login) {
    this.people.saveLogins(this.people.logins().map((l) => (l.employeeId === login.employeeId ? login : l)));
  }

  private buildSession(login: Login, token: string, expiresAt: string): Session | null {
    const emp = this.people.employees().find((e) => e.id === login.employeeId);
    if (!emp) return null;
    return {
      user: { id: emp.id, code: emp.code, name: emp.fullName, username: login.username, role: login.role },
      token,
      expiresAt,
      sessionVersion: login.sessionVersion,
      mustChangePassword: login.mustChangePassword,
      lastLoginAt: login.lastLoginAt,
    };
  }

  async login(username: string, password: string): Promise<Session> {
    await this.delay();
    const login = this.findLogin(this.people.logins(), username);
    if (!login) throw new InvalidCredentialsError();
    const now = this.now();
    if (login.lockedUntil && new Date(login.lockedUntil).getTime() > now) throw new AccountLockedError(login.lockedUntil);

    if (!(await verifyPassword(password, login.passwordHash))) {
      const attempts = login.failedAttempts + 1;
      if (attempts >= MAX_FAILED_ATTEMPTS) {
        const until = new Date(now + LOCKOUT_MINUTES * 60_000).toISOString();
        this.saveLogin({ ...login, failedAttempts: 0, lockedUntil: until });
        throw new AccountLockedError(until);
      }
      this.saveLogin({ ...login, failedAttempts: attempts, lockedUntil: null });
      throw new InvalidCredentialsError();
    }

    const emp = this.people.employees().find((e) => e.id === login.employeeId);
    if (!login.enabled || !emp || emp.status !== "active") throw new LoginDisabledError();

    const previousLogin = login.lastLoginAt;
    const updated: Login = { ...login, failedAttempts: 0, lockedUntil: null, lastLoginAt: new Date(now).toISOString() };
    this.saveLogin(updated);
    const session = this.buildSession(updated, token(), new Date(now + SESSION_HOURS * 3600_000).toISOString())!;
    session.lastLoginAt = previousLogin;
    this.session().setItem(SESSION_KEY, JSON.stringify(session));
    return session;
  }

  async logout(): Promise<void> {
    this.session().removeItem(SESSION_KEY);
  }

  /**
   * Starts this tab's session for a login whose password was already checked elsewhere (the Supabase sign-in).
   * Returns null when the login or its employee doesn't exist.
   */
  openSession(employeeId: string, previousLogin: string | null): Session | null {
    const login = this.people.logins().find((l) => l.employeeId === employeeId);
    if (!login) return null;
    const session = this.buildSession(login, token(), new Date(this.now() + SESSION_HOURS * 3600_000).toISOString());
    if (!session) return null;
    session.lastLoginAt = previousLogin;
    this.storeSession(session);
    return session;
  }

  storeSession(session: Session) {
    this.session().setItem(SESSION_KEY, JSON.stringify(session));
  }

  private readStored(): Session | null {
    const raw = this.session().getItem(SESSION_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as Session;
    } catch {
      return null;
    }
  }

  async getSession(): Promise<Session | null> {
    const s = this.readStored();
    if (!s?.user?.id || !s.token) return this.clear();
    if (!(new Date(s.expiresAt).getTime() > this.now())) return this.clear();
    const login = this.people.logins().find((l) => l.employeeId === s.user.id);
    const emp = this.people.employees().find((e) => e.id === s.user.id);
    if (!login || !emp || !login.enabled || emp.status !== "active" || login.sessionVersion !== s.sessionVersion) return this.clear();
    // Role, name and must-change come from the store, so admin changes apply straight away.
    const fresh = this.buildSession(login, s.token, s.expiresAt)!;
    fresh.lastLoginAt = s.lastLoginAt;
    return fresh;
  }

  private clear(): null {
    this.session().removeItem(SESSION_KEY);
    return null;
  }

  async changePassword(current: string, next: string): Promise<Session> {
    await this.delay();
    const s = await this.getSession();
    if (!s) throw new PasswordChangeError(["Your session has ended. Please sign in again."]);
    const login = this.people.logins().find((l) => l.employeeId === s.user.id)!;
    if (!(await verifyPassword(current, login.passwordHash))) throw new PasswordChangeError(["The current password is wrong."]);
    const issues = validatePassword(next);
    if (current === next) issues.push("Choose a password different from the current one.");
    if (issues.length) throw new PasswordChangeError(issues);
    const updated: Login = {
      ...login,
      passwordHash: await hashPassword(next),
      mustChangePassword: false,
      passwordChangedAt: new Date(this.now()).toISOString(),
      // Signs out other tabs/devices; this tab keeps going with the new version.
      sessionVersion: login.sessionVersion + 1,
    };
    this.saveLogin(updated);
    const session = { ...s, sessionVersion: updated.sessionVersion, mustChangePassword: false };
    this.session().setItem(SESSION_KEY, JSON.stringify(session));
    return session;
  }
}
