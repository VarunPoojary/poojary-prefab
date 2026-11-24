import { describe, expect, it } from "vitest";
import type { Login } from "@/lib/employees/types";
import { COLLECTIONS, toRows } from "./collections";
import { SUPABASE_PASSWORD_MARKER } from "./config";
import { buildDemoData, buildStarterData } from "./demo-data";

describe("starting data for Supabase", () => {
  it("builds every module's demo data, with ids for every row and the demo passwords for the logins", async () => {
    const d = await buildDemoData();
    for (const key of Object.keys(COLLECTIONS)) expect(d.values.has(key), key).toBe(true);
    for (const [key, raw] of d.values) {
      const rows = toRows(key, JSON.parse(raw));
      expect(new Set(rows.map((r) => r.id)).size, key).toBe(rows.length);
      expect(rows.every((r) => r.id && r.id !== "undefined"), key).toBe(true);
    }
    const logins = JSON.parse(d.values.get("pppl.logins.v1")!) as Login[];
    expect(logins.every((l) => l.passwordHash === SUPABASE_PASSWORD_MARKER)).toBe(true);
    expect(d.logins.find((l) => l.username === "admin@poojary.net")?.password).toBe("Admin@123");
    expect(d.logins.find((l) => l.username === "priya@poojary.net")?.password).toBe("Staff@123");
    expect(d.logins).toHaveLength(logins.length);
  }, 30_000);

  it("starts a real database with one admin and no demo records", async () => {
    const s = await buildStarterData({ username: "owner", password: "Secret123" });
    const logins = JSON.parse(s.values.get("pppl.logins.v1")!) as Login[];
    expect(logins).toEqual([expect.objectContaining({ username: "owner", role: "admin", enabled: true, mustChangePassword: true })]);
    expect(JSON.parse(s.values.get("pppl.employees.v1")!)).toHaveLength(1);
    for (const key of ["pppl.quotations.v2", "pppl.projects.v1", "pppl.attendance.v1", "pppl.expenses.v1", "pppl.payroll-months.v1"])
      expect(JSON.parse(s.values.get(key)!), key).toEqual([]);
    expect(s.logins).toEqual([{ employeeId: logins[0]!.employeeId, username: "owner", password: "Secret123" }]);
  }, 30_000);
});
