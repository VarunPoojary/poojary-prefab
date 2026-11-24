import { validatePassword } from "@/lib/employees/rules";
import { authEmailFor } from "@/lib/supabase/config";
import { HttpError, LOGINS, adminDb, handle, publicDb, requireCaller, updateRecord } from "@/lib/supabase/server";

/**
 * POST /api/auth/change-password { current, next }  (Authorization: Bearer <access token>)
 * The signed-in user changes their own password. Other sessions are signed out (session version + 1);
 * returns a fresh Supabase session for this tab.
 */
export async function POST(req: Request) {
  return handle(async () => {
    const caller = await requireCaller(req);
    const { current, next } = (await req.json()) as { current?: string; next?: string };
    const email = authEmailFor(caller.employeeId);
    const check = await publicDb().auth.signInWithPassword({ email, password: current ?? "" });
    if (check.error) throw new HttpError(400, "password", "The current password is wrong.", { issues: ["The current password is wrong."] });
    const issues = validatePassword(next ?? "");
    if (current === next) issues.push("Choose a password different from the current one.");
    if (issues.length) throw new HttpError(400, "password", issues.join(" "), { issues });

    const { error } = await adminDb().auth.admin.updateUserById(caller.authUser.id, { password: next });
    if (error) throw new HttpError(400, "password", error.message, { issues: [error.message] });

    const login = { ...caller.login, mustChangePassword: false, passwordChangedAt: new Date().toISOString(), sessionVersion: caller.login.sessionVersion + 1 };
    await updateRecord(LOGINS, caller.employeeId, login);

    const fresh = await publicDb().auth.signInWithPassword({ email, password: next! });
    if (fresh.error || !fresh.data.session) throw new HttpError(500, "server", "Password changed, but signing in again failed. Please sign in with the new password.");
    return Response.json({
      accessToken: fresh.data.session.access_token,
      refreshToken: fresh.data.session.refresh_token,
      sessionVersion: login.sessionVersion,
    });
  });
}
