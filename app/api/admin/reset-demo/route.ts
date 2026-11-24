import { buildDemoData } from "@/lib/supabase/demo-data";
import { HttpError, handle, requireAdmin, writeStartingData } from "@/lib/supabase/server";

/**
 * POST /api/admin/reset-demo  (admins only)
 * Replaces ALL data in Supabase with the demo data and resets the demo logins' passwords. Only allowed when the
 * server has ALLOW_DEMO_RESET=true, so a production database can't be wiped from the app.
 */
export async function POST(req: Request) {
  return handle(async () => {
    await requireAdmin(req);
    if (process.env.ALLOW_DEMO_RESET !== "true")
      throw new HttpError(403, "forbidden", "Resetting to demo data is switched off for this database (set ALLOW_DEMO_RESET=true on the server to allow it).");
    await writeStartingData(await buildDemoData());
    return Response.json({ ok: true });
  });
}
