import { DEMO_ACCOUNTS } from "@/lib/employees/seed";
import { PeopleStore, LOGINS_KEY } from "@/lib/employees/store";
import { appStorage, sessionStore } from "@/lib/storage";
import { cloudStorage } from "@/lib/supabase";
import { callApi, supabase } from "@/lib/supabase/client";
import { showDemoAccounts } from "@/lib/supabase/config";
import { MockAuthService } from "./mock-service";
import type { AuthService } from "./service";
import { AccountLockedError, InvalidCredentialsError, LoginDisabledError, PasswordChangeError, type Session } from "./types";

interface TokenResponse {
  accessToken: string;
  refreshToken: string;
}

type ApiError = Error & { code?: string; details?: { until?: string; issues?: string[] } };

/**
 * Sign-in against Supabase. Passwords live in Supabase Auth; the server route /api/auth/login applies the
 * lockout and the disabled-login rules. After sign-in all data is loaded from the database, and the tab session
 * (role, must-change-password, session version) is checked against the synced login records exactly like the
 * browser version, so a disabled login or a password reset still signs the user out within seconds.
 */
export class SupabaseAuthService implements AuthService {
  readonly label = "Supabase";
  readonly demoAccounts = showDemoAccounts ? DEMO_ACCOUNTS : undefined;
  private readonly tab = new MockAuthService(new PeopleStore(appStorage, false), sessionStore, 0);

  private get store() {
    const s = cloudStorage();
    if (!s) throw new Error("Supabase is not configured.");
    return s;
  }

  private async useTokens(t: TokenResponse) {
    const { error } = await supabase().auth.setSession({ access_token: t.accessToken, refresh_token: t.refreshToken });
    if (error) throw new Error(error.message);
  }

  async login(username: string, password: string): Promise<Session> {
    let res: TokenResponse & { employeeId: string; previousLogin: string | null };
    try {
      res = await callApi("/api/auth/login", { username, password }, { auth: false });
    } catch (e) {
      const err = e as ApiError;
      if (err.code === "invalid") throw new InvalidCredentialsError();
      if (err.code === "locked") throw new AccountLockedError(err.details?.until ?? new Date().toISOString());
      if (err.code === "disabled") throw new LoginDisabledError();
      throw e;
    }
    await this.useTokens(res);
    this.store.clear();
    await this.store.hydrate();
    const session = this.tab.openSession(res.employeeId, res.previousLogin);
    if (!session) {
      await this.logout();
      throw new LoginDisabledError();
    }
    return session;
  }

  async logout(): Promise<void> {
    await this.tab.logout();
    this.store.clear();
    await supabase()
      .auth.signOut({ scope: "local" })
      .catch(() => undefined);
  }

  async getSession(): Promise<Session | null> {
    const { data } = await supabase().auth.getSession();
    const authSession = data.session;
    if (!authSession) {
      await this.tab.logout();
      this.store.clear();
      return null;
    }
    if (!this.store.isHydrated) {
      try {
        await this.store.hydrate();
      } catch {
        return null; // database unreachable: treat as signed out for now (the next check tries again)
      }
    }
    const s = await this.tab.getSession();
    if (!s || authSession.user.app_metadata?.employee_id !== s.user.id) {
      await this.logout();
      return null;
    }
    return s;
  }

  async changePassword(current: string, next: string): Promise<Session> {
    const s = await this.getSession();
    if (!s) throw new PasswordChangeError(["Your session has ended. Please sign in again."]);
    let res: TokenResponse & { sessionVersion: number };
    try {
      res = await callApi("/api/auth/change-password", { current, next });
    } catch (e) {
      const err = e as ApiError;
      if (err.code === "password") throw new PasswordChangeError(err.details?.issues ?? [err.message]);
      throw e;
    }
    await this.useTokens(res);
    // The server bumped the session version; read the login now so this tab isn't signed out by the check.
    await this.store.refresh([LOGINS_KEY]);
    const session: Session = { ...s, sessionVersion: res.sessionVersion, mustChangePassword: false };
    this.tab.storeSession(session);
    return session;
  }
}
