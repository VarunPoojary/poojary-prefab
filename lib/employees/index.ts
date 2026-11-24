import { authService } from "@/lib/auth";
import { cloudEnabled, withCloudSync } from "@/lib/supabase";
import { callApi } from "@/lib/supabase/client";
import { SUPABASE_PASSWORD_MARKER } from "@/lib/supabase/config";
import { browserLogins, LocalEmployeeRepository, type LoginBackend } from "./local-repo";
import type { EmployeeRepository } from "./repository";
import { PeopleStore } from "./store";

/** Supabase: passwords are set in Supabase Auth by the server (admins only). */
const supabaseLogins: LoginBackend = {
  async setPassword(employeeId, password) {
    await callApi("/api/admin/logins", { action: "set-password", employeeId, password });
    return SUPABASE_PASSWORD_MARKER;
  },
  async remove(employeeId) {
    await callApi("/api/admin/logins", { action: "remove", employeeId });
  },
};

/*
 * The one place that decides where employees and logins are stored: lib/storage (Supabase when configured,
 * otherwise this browser).
 */
export const employeeRepo: EmployeeRepository = withCloudSync(
  new LocalEmployeeRepository(
    new PeopleStore(undefined, !cloudEnabled),
    async () => {
      const s = await authService.getSession();
      return s ? { id: s.user.id, role: s.user.role } : null;
    },
    cloudEnabled ? 0 : 150,
    () => Date.now(),
    cloudEnabled ? supabaseLogins : browserLogins,
  ),
);

export * from "./types";
export type { EmployeeRepository, NewDocument } from "./repository";
