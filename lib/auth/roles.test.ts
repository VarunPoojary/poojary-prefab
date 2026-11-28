import { afterEach, describe, expect, it } from "vitest";
import { canAccess, canAccessPath, homeFor, NAV_ITEMS, visibleNavItems } from "@/lib/navigation";
import { LocalSettingsRepository } from "@/lib/settings/local-repo";
import { SettingsStore } from "@/lib/settings/store";
import type { KeyValueStorage } from "@/lib/storage";
import { DEFAULT_ROLES, normaliseRoles, roleHasPage, roleIdFor, roleName, setRoleSource, type RoleDef } from "./roles";

const memory = (): KeyValueStorage => {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
};

const siteEngineer: RoleDef = { id: "site_engineer", name: "Site engineer", pages: ["projects", "my-tasks", "attendance"] };

afterEach(() => setRoleSource(() => undefined));

describe("role registry", () => {
  it("defaults to Admin, Staff and Accountant with today's pages", () => {
    expect(normaliseRoles().map((r) => r.id)).toEqual(["admin", "staff", "accountant"]);
    expect(roleHasPage("accountant", "payroll")).toBe(true);
    expect(roleHasPage("staff", "payroll")).toBe(false);
    expect(roleHasPage("admin", "expenses")).toBe(true);
  });

  it("keeps Admin complete and first, drops unknown pages and duplicate ids", () => {
    const out = normaliseRoles([
      { id: "admin", name: "Boss", pages: [] },
      { id: "x", name: " X ", pages: ["projects", "nope" as never] },
      { id: "x", name: "Again", pages: [] },
    ]);
    expect(out[0]).toMatchObject({ id: "admin", name: "Admin", builtIn: true });
    expect(out[0].pages).toHaveLength(10);
    expect(out.slice(1)).toEqual([{ id: "x", name: "X", pages: ["projects"] }]);
  });

  it("gives deleted or unknown roles no pages and shows their id", () => {
    expect(roleHasPage("ghost", "projects")).toBe(false);
    expect(roleHasPage(null, "projects")).toBe(false);
    expect(roleName("ghost")).toBe("ghost");
  });

  it("makes unique ids from names", () => {
    expect(roleIdFor("Site Engineer", ["admin"])).toBe("site_engineer");
    expect(roleIdFor("Site engineer!", ["site_engineer"])).toBe("site_engineer_2");
  });
});

describe("menu access follows the role's pages", () => {
  it("shows a custom role exactly its pages; Employees and Settings stay Admin-only", () => {
    setRoleSource(() => [...DEFAULT_ROLES, siteEngineer]);
    const u = { role: "site_engineer" };
    expect(visibleNavItems(u).map((i) => i.key)).toEqual(["projects", "my-tasks", "attendance"]);
    expect(homeFor(u)).toBe("/projects");
    expect(canAccessPath(u, "/projects/p1/progress")).toBe(true);
    expect(canAccessPath(u, "/quotations")).toBe(false);
    expect(canAccess(u, NAV_ITEMS.find((i) => i.key === "settings")!)).toBe(false);
    expect(visibleNavItems({ role: "admin" }).map((i) => i.key)).toContain("settings");
  });

  it("lets any role with Payroll open an employee's Payroll tab, but not the rest of the record", () => {
    setRoleSource(() => [...DEFAULT_ROLES, { id: "hr", name: "HR", pages: ["payroll"] }]);
    expect(canAccessPath({ role: "hr" }, "/employees/u_staff/payroll")).toBe(true);
    expect(canAccessPath({ role: "hr" }, "/employees/u_staff/details")).toBe(false);
    expect(canAccessPath({ role: "staff" }, "/employees/u_staff/payroll")).toBe(false);
  });

  it("applies edits to a starting role", () => {
    setRoleSource(() => [{ id: "staff", name: "Sales", pages: ["enquiries", "clients"] }]);
    expect(visibleNavItems({ role: "staff" }).map((i) => i.key)).toEqual(["enquiries", "clients"]);
    expect(roleName("staff")).toBe("Sales");
  });
});

describe("saving roles in Settings", () => {
  const setup = (role: string | null = "admin", inUse: Record<string, number> = {}) => {
    const mem = memory();
    const store = new SettingsStore(() => mem);
    const repo = new LocalSettingsRepository(store, async () => role, () => new Map(Object.entries(inUse)));
    return { store, repo };
  };

  it("adds a role with a generated id and keeps Admin unchanged", async () => {
    const { repo } = setup();
    const s = await repo.saveRoles([
      { id: "admin", name: "Changed", pages: [] },
      ...DEFAULT_ROLES.slice(1),
      { id: "", name: "Site engineer", pages: ["projects", "attendance"] },
    ]);
    expect(s.roles[0]).toMatchObject({ id: "admin", name: "Admin" });
    expect(s.roles.at(-1)).toEqual({ id: "site_engineer", name: "Site engineer", pages: ["projects", "attendance"] });
  });

  it("rejects empty and duplicate names", async () => {
    const { repo } = setup();
    await expect(repo.saveRoles([...DEFAULT_ROLES, { id: "", name: " ", pages: [] }])).rejects.toThrow(/needs a name/);
    await expect(repo.saveRoles([...DEFAULT_ROLES, { id: "", name: "staff", pages: [] }])).rejects.toThrow(/already a role/);
    await expect(repo.saveRoles([...DEFAULT_ROLES, { id: "", name: "Admin", pages: [] }])).rejects.toThrow(/already a role/);
  });

  it("won't delete a role that a login still has", async () => {
    const { repo } = setup("admin", { accountant: 1 });
    await expect(repo.saveRoles(DEFAULT_ROLES.filter((r) => r.id !== "accountant"))).rejects.toThrow(/still given to 1 login/);
    const s = await repo.saveRoles(DEFAULT_ROLES.filter((r) => r.id !== "staff"));
    expect(s.roles.map((r) => r.id)).toEqual(["admin", "accountant"]);
  });

  it("is Admin-only", async () => {
    const { repo } = setup("staff");
    await expect(repo.saveRoles(DEFAULT_ROLES)).rejects.toThrow(/Only admins/);
  });

  it("gives settings saved before custom roles the starting roles", () => {
    const storage = memory();
    storage.setItem("pppl.settings.v1", JSON.stringify({ payroll: { startMonth: "2026-01" } }));
    expect(new SettingsStore(() => storage).read().roles.map((r) => r.id)).toEqual(["admin", "staff", "accountant"]);
  });
});
