import { normalizePhone } from "@/lib/crm/rules";
import { LOCKOUT_MINUTES, MAX_FAILED_ATTEMPTS } from "@/lib/employees/config";
import { normalizeUsername } from "@/lib/employees/rules";
import type { Employee, Login } from "@/lib/employees/types";
import { authEmailFor } from "@/lib/supabase/config";
import { EMPLOYEES, HttpError, adminDb, LOGINS, handle, publicDb, readCollection, readRecord, updateRecord } from "@/lib/supabase/server";

/**
 * POST /api/auth/login { username, password }
 * Finds the login by username or mobile number, applies the lockout (5 wrong passwords → 15 minutes), checks the
 * password with Supabase Auth and returns the Supabase session for the browser.
 */
export async function POST(req: Request) {
  return handle(async () => {
    const { username, password } = (await req.json()) as { username?: string; password?: string };
    if (!username || !password) throw new HttpError(400, "invalid", "Invalid username or password.");

    const logins = await readCollection<Login>(LOGINS);
    const u = normalizeUsername(username);
    const phone = normalizePhone(username);
    const login = logins.find((l) => normalizeUsername(l.username) === u || (phone && normalizeUsername(l.username) === phone));
    if (!login) throw new HttpError(401, "invalid", "Invalid username or password.");

    const now = Date.now();
    if (login.lockedUntil && new Date(login.lockedUntil).getTime() > now)
      throw new HttpError(423, "locked", "Account locked.", { until: login.lockedUntil });

    const { data, error } = await publicDb().auth.signInWithPassword({ email: authEmailFor(login.employeeId), password });
    if (error || !data.session) {
      const attempts = login.failedAttempts + 1;
      if (attempts >= MAX_FAILED_ATTEMPTS) {
        const until = new Date(now + LOCKOUT_MINUTES * 60_000).toISOString();
        await updateRecord(LOGINS, login.employeeId, { ...login, failedAttempts: 0, lockedUntil: until });
        throw new HttpError(423, "locked", "Account locked.", { until });
      }
      await updateRecord(LOGINS, login.employeeId, { ...login, failedAttempts: attempts, lockedUntil: null });
      throw new HttpError(401, "invalid", "Invalid username or password.");
    }

    const emp = await readRecord<Employee>(EMPLOYEES, login.employeeId);
    if (!login.enabled || !emp || emp.status !== "active") {
      await adminDb().auth.admin.signOut(data.session.access_token).catch(() => undefined);
      throw new HttpError(403, "disabled", "This login is disabled. Please contact your administrator.");
    }

    const previousLogin = login.lastLoginAt;
    await updateRecord(LOGINS, login.employeeId, { ...login, failedAttempts: 0, lockedUntil: null, lastLoginAt: new Date(now).toISOString() });
    return Response.json({
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      employeeId: login.employeeId,
      previousLogin,
    });
  });
}
