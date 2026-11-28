/*
 * Roles: which pages a login may open. Admins define them in Settings → Roles and access; each login has one role.
 *
 *  - "admin" is built in: every page, the only role that manages roles, employees and settings. It can't be
 *    edited or deleted, so someone can always get back in.
 *  - Every other role is a name plus a list of pages. Inside a page its users work as Staff do; approving
 *    expenses, project money, deleting records and reopening payroll months stay Admin-only. A role with Payroll
 *    or Expenses does what the Accountant does there; a role with Attendance marks attendance like a supervisor.
 *  - "staff" and "accountant" are the starting roles, so logins created before custom roles keep working.
 *
 * Roles are stored with the app settings (key pppl.settings.v1 → roles), in this browser or in Supabase.
 */
import { appStorage } from "@/lib/storage";

export const ADMIN_ROLE = "admin";

/** Pages a role can be given. Employees and Settings are Admin-only. */
export const ASSIGNABLE_PAGES = [
  { key: "enquiries", label: "Enquiries", hint: "Track enquiries to a win or loss" },
  { key: "clients", label: "Clients", hint: "Client list and contacts" },
  { key: "quotations", label: "Quotation Maker", hint: "Create and download quotations" },
  { key: "projects", label: "Projects", hint: "Projects the user is on the team of" },
  { key: "factory-dashboard", label: "Factory dashboard", hint: "Pending factory work of all projects, priorities, delays" },
  { key: "site-dashboard", label: "Site dashboard", hint: "Progress, delays, workers and daily updates of all sites" },
  { key: "my-tasks", label: "My tasks", hint: "Project tasks assigned to the user" },
  { key: "attendance", label: "Attendance", hint: "Mark factory and office attendance (last 7 days)" },
  { key: "payroll", label: "Payroll", hint: "View payroll, give advances, record salary payments" },
  { key: "expenses", label: "Expenses", hint: "View all project expenses and record payments" },
] as const;

export type PageKey = (typeof ASSIGNABLE_PAGES)[number]["key"];
export const PAGE_KEYS: PageKey[] = ASSIGNABLE_PAGES.map((p) => p.key);
export const ADMIN_ONLY_PAGES = ["employees", "settings"] as const;

export interface RoleDef {
  /** Stored on each login; never changes once created. */
  id: string;
  name: string;
  pages: PageKey[];
  /** The Admin role: all pages, not editable. */
  builtIn?: boolean;
}

export const DEFAULT_ROLES: RoleDef[] = [
  { id: ADMIN_ROLE, name: "Admin", pages: [...PAGE_KEYS], builtIn: true },
  { id: "staff", name: "Staff", pages: ["enquiries", "clients", "quotations", "projects", "my-tasks"] },
  { id: "accountant", name: "Accountant", pages: ["payroll", "expenses"] },
];

/** Cleans stored roles: Admin first and complete, known pages only, no duplicate ids. Missing → the defaults. */
export function normaliseRoles(input?: RoleDef[] | null): RoleDef[] {
  const src = Array.isArray(input) && input.length ? input : DEFAULT_ROLES;
  const out: RoleDef[] = [{ id: ADMIN_ROLE, name: "Admin", pages: [...PAGE_KEYS], builtIn: true }];
  const seen = new Set([ADMIN_ROLE]);
  for (const r of src) {
    if (!r || typeof r.id !== "string" || seen.has(r.id)) continue;
    seen.add(r.id);
    out.push({
      id: r.id,
      name: String(r.name ?? r.id).trim() || r.id,
      pages: PAGE_KEYS.filter((k) => Array.isArray(r.pages) && r.pages.includes(k)),
    });
  }
  return out;
}

/** Same key as lib/settings/store (kept literal here to avoid an import cycle). */
const SETTINGS_KEY = "pppl.settings.v1";

/** Where the role list comes from. The browser reads the stored settings; tests and the server get the defaults. */
let source: () => RoleDef[] | undefined = () => {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = appStorage().getItem(SETTINGS_KEY);
    return raw ? (JSON.parse(raw) as { roles?: RoleDef[] }).roles : undefined;
  } catch {
    return undefined;
  }
};

/** Tests can point the registry at their own roles. */
export function setRoleSource(fn: () => RoleDef[] | undefined) {
  source = fn;
}

export function roleDefs(): RoleDef[] {
  try {
    return normaliseRoles(source());
  } catch {
    return normaliseRoles();
  }
}

export const isAdminRole = (role: string | null | undefined) => role === ADMIN_ROLE;

/** True when the role may open the page (Admin: always). Unknown or deleted roles get no pages. */
export function roleHasPage(role: string | null | undefined, page: PageKey): boolean {
  if (!role) return false;
  if (role === ADMIN_ROLE) return true;
  return roleDefs().find((r) => r.id === role)?.pages.includes(page) ?? false;
}

export function roleExists(role: string): boolean {
  return roleDefs().some((r) => r.id === role);
}

/** Display name of a role; a role that was deleted shows its id. */
export function roleName(role: string | null | undefined): string {
  if (!role) return "";
  return roleDefs().find((r) => r.id === role)?.name ?? role;
}

/** A new, unused id from a role name. */
export function roleIdFor(name: string, taken: Iterable<string>): string {
  const base =
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "") || "role";
  const used = new Set(taken);
  let id = base;
  for (let i = 2; used.has(id); i++) id = `${base}_${i}`;
  return id;
}
