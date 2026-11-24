import { HttpError, handle, removeAuthUser, requireAdmin, setAuthPassword } from "@/lib/supabase/server";

/**
 * POST /api/admin/logins  (admins only; Authorization: Bearer <access token>)
 *   { action: "set-password", employeeId, password }  – creates the login's Supabase Auth user or sets its password
 *   { action: "remove", employeeId }                   – deletes the login's Supabase Auth user
 * The login record itself (username, role, enabled, …) is saved by the app in app_records (admin-only by RLS).
 */
export async function POST(req: Request) {
  return handle(async () => {
    await requireAdmin(req);
    const body = (await req.json()) as { action?: string; employeeId?: string; password?: string };
    if (!body.employeeId) throw new HttpError(400, "invalid", "employeeId is required.");
    if (body.action === "set-password") {
      if (!body.password) throw new HttpError(400, "invalid", "password is required.");
      await setAuthPassword(body.employeeId, body.password);
      return Response.json({ ok: true });
    }
    if (body.action === "remove") {
      await removeAuthUser(body.employeeId);
      return Response.json({ ok: true });
    }
    throw new HttpError(400, "invalid", "Unknown action.");
  });
}
