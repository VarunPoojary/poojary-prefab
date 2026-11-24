export type Role = "admin" | "staff" | "accountant";

export const ROLE_LABELS: Record<Role, string> = { admin: "Admin", staff: "Staff", accountant: "Accountant" };

/** The signed-in person: an employee with a login. */
export interface User {
  /** Employee id; also used for "assigned to" / "created by" everywhere. */
  id: string;
  code: string;
  name: string;
  username: string;
  role: Role;
}

export interface Session {
  user: User;
  token: string;
  /** ISO timestamp. */
  expiresAt: string;
  /** Must match the login's version; resetting the password or disabling the login signs sessions out. */
  sessionVersion: number;
  /** First sign-in with a temporary password: the user must choose their own password first. */
  mustChangePassword: boolean;
  lastLoginAt: string | null;
}

export class InvalidCredentialsError extends Error {
  constructor() {
    super("Invalid username or password.");
    this.name = "InvalidCredentialsError";
  }
}

export class AccountLockedError extends Error {
  constructor(public readonly until: string) {
    const t = new Date(until).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
    super(`Too many wrong attempts. This account is locked until ${t}.`);
    this.name = "AccountLockedError";
  }
}

export class LoginDisabledError extends Error {
  constructor() {
    super("This login is disabled. Please contact your administrator.");
    this.name = "LoginDisabledError";
  }
}

export class PasswordChangeError extends Error {
  constructor(public readonly issues: string[]) {
    super(issues.join(" "));
    this.name = "PasswordChangeError";
  }
}
