import { authService } from "@/lib/auth";
import { LocalEmployeeRepository } from "./local-repo";
import type { EmployeeRepository } from "./repository";
import { PeopleStore } from "./store";

/*
 * The one place that decides where employees and logins are stored.
 * To switch to the cloud database:
 *   import { ApiEmployeeRepository } from "./api-repo";
 *   export const employeeRepo: EmployeeRepository = new ApiEmployeeRepository("/api");
 */
export const employeeRepo: EmployeeRepository = new LocalEmployeeRepository(new PeopleStore(), async () => {
  const s = await authService.getSession();
  return s ? { id: s.user.id, role: s.user.role } : null;
});

export * from "./types";
export type { EmployeeRepository, NewDocument } from "./repository";
