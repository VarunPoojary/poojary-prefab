import type { AuthService } from "./service";
import { AccountLockedError, InvalidCredentialsError, LoginDisabledError, PasswordChangeError, type Session } from "./types";

/**
 * Cloud auth implementation – NOT USED YET.
 *
 * Expected endpoints (logins are created by an admin in the Employee module; there is no sign-up):
 *   POST /auth/login     { username, password } -> Session
 *                        401 bad credentials · 423 { until } locked · 403 disabled
 *   POST /auth/logout                           -> 204
 *   GET  /auth/me                               -> Session (401 when signed out, expired or revoked)
 *   POST /me/password    { current, next }      -> Session (422 { issues })
 *
 * Hash passwords on the server (bcrypt / ASP.NET Identity) and enforce the 5-attempt / 15-minute lockout there.
 * Prefer an httpOnly session cookie; then add proxy.ts for server-side route protection.
 */
export class ApiAuthService implements AuthService {
  readonly label = "Cloud login";

  constructor(private readonly baseUrl: string) {}

  private async send(path: string, init: RequestInit = {}) {
    return fetch(`${this.baseUrl}${path}`, {
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      ...init,
    });
  }

  async login(username: string, password: string): Promise<Session> {
    const res = await this.send(`/auth/login`, { method: "POST", body: JSON.stringify({ username: username.trim(), password }) });
    if (res.status === 401) throw new InvalidCredentialsError();
    if (res.status === 423) throw new AccountLockedError(((await res.json()) as { until: string }).until);
    if (res.status === 403) throw new LoginDisabledError();
    if (!res.ok) throw new Error(`Login failed (${res.status})`);
    return (await res.json()) as Session;
  }

  async logout(): Promise<void> {
    await this.send(`/auth/logout`, { method: "POST" });
  }

  async getSession(): Promise<Session | null> {
    const res = await this.send(`/auth/me`);
    return res.ok ? ((await res.json()) as Session) : null;
  }

  async changePassword(current: string, next: string): Promise<Session> {
    const res = await this.send(`/me/password`, { method: "POST", body: JSON.stringify({ current, next }) });
    if (res.status === 422) throw new PasswordChangeError(((await res.json()) as { issues: string[] }).issues);
    if (!res.ok) throw new Error(`Could not change the password (${res.status})`);
    return (await res.json()) as Session;
  }

  /** Pass to ApiRepository / ApiCrmRepository as their token getter. */
  getToken = async () => (await this.getSession())?.token ?? null;
}
