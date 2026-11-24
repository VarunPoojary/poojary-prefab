/*
 * Builds the app's starting data exactly as the browser repositories create it, so it can be written to Supabase
 * (by `npm run db:seed` or the admin "Reset demo data" action). Server / script only.
 */
import { LocalAttendanceRepository } from "@/lib/attendance/local-repo";
import { verifyPassword } from "@/lib/auth/crypto";
import { SessionStorageCrmRepository } from "@/lib/crm/session-repo";
import { SessionStorageRepository } from "@/lib/data/session-repo";
import { LocalEmployeeRepository } from "@/lib/employees/local-repo";
import { PeopleStore } from "@/lib/employees/store";
import type { Employee, Login } from "@/lib/employees/types";
import { LocalExpenseRepository } from "@/lib/expenses/local-repo";
import { NotificationStore } from "@/lib/notifications/store";
import { LocalPayrollRepository } from "@/lib/payroll/local-repo";
import { LocalProjectRepository, type Actor } from "@/lib/projects/local-repo";
import { SettingsStore, defaultSettings } from "@/lib/settings/store";
import { memoryStorage } from "@/lib/storage";
import { COLLECTIONS } from "./collections";
import { SUPABASE_PASSWORD_MARKER } from "./config";

/** Passwords used by the demo logins (see README → Demo accounts). */
const DEMO_PASSWORDS = ["Admin@123", "Staff@123"];

export interface StartingData {
  /** Storage key → JSON value. */
  values: Map<string, string>;
  /** Supabase Auth users to create. */
  logins: { employeeId: string; username: string; password: string }[];
}

/** All modules' demo data (quotations, CRM, employees, projects, attendance, expenses, payroll, …). */
export async function buildDemoData(now = Date.now()): Promise<StartingData> {
  const data = memoryStorage();
  const st = () => data;
  const getActor = async (): Promise<Actor> => ({ id: "u_admin", role: "admin" });
  const quotes = new SessionStorageRepository(st, 0, true);
  const crm = new SessionStorageCrmRepository({ storage: st, quotes, getActor: async () => "u_admin", latencyMs: 0, now: () => now });
  const people = new PeopleStore(st, true, () => now);
  const settings = new SettingsStore(st);
  const notifications = new NotificationStore(st, () => now);
  const sources = { enquiries: () => crm.readAllEnquiries(), clients: () => crm.readAllClients(), quotations: () => quotes.readAllRecords() };
  const projects = new LocalProjectRepository({ storage: st, sources, people, settings, notifications, getActor, latencyMs: 0, now: () => now });
  const attendance = new LocalAttendanceRepository({ storage: st, people, settings, projects, notifications, getActor, latencyMs: 0, now: () => now });
  const expenses = new LocalExpenseRepository({ storage: st, people, settings, projects, attendance, notifications, getActor, latencyMs: 0, now: () => now });
  const payroll = new LocalPayrollRepository({ storage: st, people, settings, attendance, notifications, getActor, latencyMs: 0, now: () => now });
  const employees = new LocalEmployeeRepository(people, getActor, 0, () => now);
  // Same order as "Reset demo data" in the browser: later modules build on the earlier ones.
  await quotes.resetDemoData();
  await crm.resetDemoData();
  await employees.resetDemoData();
  await projects.resetDemoData();
  await attendance.resetDemoData();
  await expenses.resetDemoData();
  await payroll.resetDemoData();
  if (data.getItem("pppl.settings.v1") === null) settings.write(defaultSettings());

  const logins: StartingData["logins"] = [];
  const stored = people.logins();
  for (const l of stored) {
    let password: string | null = null;
    for (const p of DEMO_PASSWORDS) if (await verifyPassword(p, l.passwordHash)) password = p;
    if (!password) throw new Error(`No demo password matches the login ${l.username}.`);
    logins.push({ employeeId: l.employeeId, username: l.username, password });
  }
  people.saveLogins(stored.map((l) => ({ ...l, passwordHash: SUPABASE_PASSWORD_MARKER })));

  return { values: collectValues(data.map), logins };
}

/**
 * A clean start for real use: no demo records, one admin (the demo admin's employee record, to be edited in
 * Employees) with the given username and password. The admin must choose a new password at first sign-in.
 */
export async function buildStarterData(admin: { username: string; password: string }, now = Date.now()): Promise<StartingData> {
  const demo = await buildDemoData(now);
  const values = new Map<string, string>();
  for (const [key, c] of Object.entries(COLLECTIONS)) if (c.kind === "rows") values.set(key, "[]");

  const employees = JSON.parse(demo.values.get("pppl.employees.v1")!) as Employee[];
  const logins = JSON.parse(demo.values.get("pppl.logins.v1")!) as Login[];
  const adminLogin = logins.find((l) => l.role === "admin")!;
  const emp = employees.find((e) => e.id === adminLogin.employeeId)!;
  const iso = new Date(now).toISOString();
  values.set("pppl.employees.v1", JSON.stringify([{ ...emp, documents: [], history: [] }]));
  values.set(
    "pppl.logins.v1",
    JSON.stringify([{ ...adminLogin, username: admin.username, mustChangePassword: true, lastLoginAt: null, failedAttempts: 0, lockedUntil: null, sessionVersion: 1, createdAt: iso }]),
  );
  const lookups = JSON.parse(demo.values.get("pppl.lookups.v1")!) as { designations: string[]; departments: string[]; nextEmployeeNumber: number };
  values.set("pppl.lookups.v1", JSON.stringify({ ...lookups, nextEmployeeNumber: Number(emp.code.replace(/\D/g, "")) + 1 }));
  const s = defaultSettings();
  values.set("pppl.settings.v1", JSON.stringify({ ...s, attendance: { ...s.attendance, supervisors: { factory: [], office: [] } } }));
  return { values, logins: [{ employeeId: adminLogin.employeeId, username: admin.username, password: admin.password }] };
}

function collectValues(map: Map<string, string>) {
  const values = new Map<string, string>();
  for (const [key, raw] of map) if (key.startsWith("pppl.") && key !== "pppl.session.v1") values.set(key, raw);
  return values;
}
