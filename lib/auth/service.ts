import type { Session } from "./types";

/**
 * Single entry point for signing in/out. Screens depend only on this interface, so the in-browser
 * implementation can be replaced with the cloud auth service in lib/auth/index.ts.
 */
export interface AuthService {
  /** Throws InvalidCredentialsError, AccountLockedError or LoginDisabledError. */
  login(username: string, password: string): Promise<Session>;
  logout(): Promise<void>;
  /** Current valid session (with the latest role), or null when signed out, expired or revoked. */
  getSession(): Promise<Session | null>;
  /** Changes the signed-in user's own password. Throws PasswordChangeError. */
  changePassword(current: string, next: string): Promise<Session>;
  readonly label: string;
  /** Demo credentials to show on the login page (in-browser demo data only). */
  readonly demoAccounts?: { username: string; password: string; label: string }[];
}
