import { describe, expect, it } from "vitest";
import { PeopleStore } from "@/lib/employees/store";
import { canAccessPath, homeFor, safeNext, visibleNavItems } from "@/lib/navigation";
import { memoryStorage } from "@/lib/storage";
import { MockAuthService, SESSION_KEY } from "./mock-service";
import { AccountLockedError, InvalidCredentialsError, LoginDisabledError, PasswordChangeError } from "./types";

function setup(start = Date.now()) {
  const data = memoryStorage();
  const tab = memoryStorage();
  const clock = { now: start };
  const people = new PeopleStore(() => data, true, () => clock.now);
  const auth = new MockAuthService(people, () => tab, 0, () => clock.now);
  return { data, tab, clock, people, auth };
}

describe("MockAuthService", () => {
  it("signs in case-insensitively, stores no password and survives a reload", async () => {
    const { people, tab, auth, clock } = setup();
    const s = await auth.login("  ADMIN@poojary.net ", "Admin@123");
    expect(s.user).toMatchObject({ id: "u_admin", role: "admin", username: "admin@poojary.net" });
    expect(JSON.stringify(s)).not.toContain("Admin@123");
    const again = await new MockAuthService(people, () => tab, 0, () => clock.now).getSession();
    expect(again?.user.id).toBe("u_admin");
  });

  it("rejects a wrong password and an unknown username with the same error", async () => {
    const { auth } = setup();
    await expect(auth.login("admin@poojary.net", "admin@123")).rejects.toBeInstanceOf(InvalidCredentialsError);
    await expect(auth.login("nobody", "Admin@123")).rejects.toThrow("Invalid username or password.");
  });

  it("locks the login for 15 minutes after 5 wrong passwords", async () => {
    const { auth, clock } = setup();
    for (let i = 0; i < 4; i++) await expect(auth.login("priya@poojary.net", "wrong")).rejects.toBeInstanceOf(InvalidCredentialsError);
    await expect(auth.login("priya@poojary.net", "wrong")).rejects.toBeInstanceOf(AccountLockedError);
    await expect(auth.login("priya@poojary.net", "Staff@123")).rejects.toBeInstanceOf(AccountLockedError);
    clock.now += 16 * 60_000;
    expect((await auth.login("priya@poojary.net", "Staff@123")).user.id).toBe("u_priya");
  });

  it("refuses disabled logins and inactive employees", async () => {
    const { auth } = setup();
    await expect(auth.login("kavita@poojary.net", "Staff@123")).rejects.toBeInstanceOf(LoginDisabledError);
  });

  it("ends the session when the admin disables the login or resets the password", async () => {
    const { auth, people } = setup();
    await auth.login("rahul@poojary.net", "Staff@123");
    expect(await auth.getSession()).not.toBeNull();
    people.saveLogins(people.logins().map((l) => (l.employeeId === "u_rahul" ? { ...l, sessionVersion: l.sessionVersion + 1 } : l)));
    expect(await auth.getSession()).toBeNull();
  });

  it("reads the role live, so a role change applies without signing out", async () => {
    const { auth, people } = setup();
    await auth.login("rahul@poojary.net", "Staff@123");
    people.saveLogins(people.logins().map((l) => (l.employeeId === "u_rahul" ? { ...l, role: "admin" as const } : l)));
    expect((await auth.getSession())?.user.role).toBe("admin");
  });

  it("forces and then accepts a password change", async () => {
    const { auth } = setup();
    const s = await auth.login("sneha@poojary.net", "Staff@123");
    expect(s.mustChangePassword).toBe(true);
    await expect(auth.changePassword("bad", "NewPass#2024")).rejects.toBeInstanceOf(PasswordChangeError);
    await expect(auth.changePassword("Staff@123", "short")).rejects.toBeInstanceOf(PasswordChangeError);
    const after = await auth.changePassword("Staff@123", "NewPass#2024");
    expect(after.mustChangePassword).toBe(false);
    expect(await auth.getSession()).not.toBeNull();
    await auth.logout();
    await expect(auth.login("sneha@poojary.net", "Staff@123")).rejects.toBeInstanceOf(InvalidCredentialsError);
    expect((await auth.login("sneha@poojary.net", "NewPass#2024")).mustChangePassword).toBe(false);
  });

  it("treats expired or corrupt sessions as signed out", async () => {
    const { auth, tab, clock } = setup();
    await auth.login("staff@poojary.net", "Staff@123");
    clock.now += 9 * 3600_000;
    expect(await auth.getSession()).toBeNull();
    expect(tab.map.has(SESSION_KEY)).toBe(false);
    tab.setItem(SESSION_KEY, "{not json");
    expect(await auth.getSession()).toBeNull();
  });
});

describe("navigation", () => {
  it("only redirects to in-app paths", () => {
    expect(safeNext("/quotations/abc?x=1")).toBe("/quotations/abc?x=1");
    expect(safeNext("https://evil.com")).toBe("/quotations");
    expect(safeNext("//evil.com")).toBe("/quotations");
    expect(safeNext("/login")).toBe("/quotations");
    expect(safeNext(null)).toBe("/quotations");
  });

  it("shows Employees to admins only", () => {
    expect(visibleNavItems({ role: "admin" }).map((i) => i.key)).toEqual(["enquiries", "clients", "quotations", "projects", "my-tasks", "attendance", "payroll", "expenses", "employees", "settings"]);
    expect(visibleNavItems({ role: "accountant" }).map((i) => i.key)).toEqual(["payroll", "expenses"]);
    expect(homeFor({ role: "accountant" })).toBe("/payroll");
    expect(homeFor({ role: "staff" })).toBe("/quotations");
    expect(canAccessPath({ role: "accountant" }, "/employees/u_staff/payroll")).toBe(true);
    expect(canAccessPath({ role: "accountant" }, "/employees/u_staff/details")).toBe(false);
    expect(canAccessPath({ role: "accountant" }, "/quotations")).toBe(false);
    expect(visibleNavItems({ role: "staff" }).map((i) => i.key)).toEqual(["enquiries", "clients", "quotations", "projects", "my-tasks"]);
    expect(visibleNavItems({ role: "staff" }, { supervisor: true }).map((i) => i.key)).toContain("attendance");
    expect(visibleNavItems(null)).toEqual([]);
  });
});
