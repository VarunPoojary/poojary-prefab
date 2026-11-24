import { describe, expect, it } from "vitest";
import { memoryStorage, migrateSessionToLocal, SESSION_KEY } from "@/lib/storage";
import { LocalEmployeeRepository, REFERENCE_KEYS, type Actor } from "./local-repo";
import { ageOn, currentSalary, generateTemporaryPassword, validateEmployee, validateLeaving, validateSalary } from "./rules";
import { PeopleStore } from "./store";
import type { EmployeeInput, SalaryEntry } from "./types";

const NOW = new Date("2026-11-24T10:00:00Z").getTime();

function setup() {
  const data = memoryStorage();
  const people = new PeopleStore(() => data, true, () => NOW);
  const actor: { current: Actor | null } = { current: { id: "u_admin", role: "admin" } };
  const repo = new LocalEmployeeRepository(people, async () => actor.current, 0, () => NOW);
  return { data, people, actor, repo };
}

const input = (over: Partial<EmployeeInput> = {}): EmployeeInput => ({
  fullName: "Mahesh Patil",
  mobile: "98220 12345",
  dob: "1990-04-01",
  gender: "male",
  bloodGroup: "",
  address: "",
  designation: "Welder",
  department: "Production",
  employmentType: "permanent",
  dateOfJoining: "2026-11-01",
  emergencyContact: { name: "", relation: "", phone: "" },
  ...over,
});
const salary = { payType: "monthly" as const, amount: 22000, effectiveFrom: "2026-11-01" };

describe("employee rules", () => {
  it("checks age, joining date, emergency phone and salary", () => {
    expect(ageOn("2008-11-25", "2026-11-24")).toBe(17);
    expect(validateEmployee(input({ dob: "2008-11-25" }), NOW).dob).toMatch(/18/);
    expect(validateEmployee(input({ dob: "2008-11-24" }), NOW).dob).toBeUndefined();
    expect(validateEmployee(input({ dateOfJoining: "1989-01-01" }), NOW).dateOfJoining).toBeDefined();
    expect(validateEmployee(input({ mobile: "123" }), NOW).mobile).toBeDefined();
    expect(validateEmployee(input({ emergencyContact: { name: "A", relation: "B", phone: "12" } }), NOW).emergencyPhone).toBeDefined();
    expect(validateSalary({ ...salary, amount: 0 }).amount).toBeDefined();
    expect(validateLeaving("2026-10-01", "resigned", "", "2026-11-01")).toHaveLength(1);
    expect(validateLeaving("2026-11-20", "other", " ", "2026-11-01")).toHaveLength(1);
  });

  it("uses the latest salary in force and ignores future ones", () => {
    const e = (id: string, effectiveFrom: string, amount: number): SalaryEntry => ({
      id, payType: "monthly", amount, effectiveFrom, createdAt: effectiveFrom, createdBy: "u_admin",
    });
    const list = [e("a", "2024-01-01", 20000), e("b", "2025-04-01", 24000), e("c", "2025-07-01", 26000)];
    expect(currentSalary(list, "2025-06-15")?.amount).toBe(24000);
    expect(currentSalary(list, "2023-01-01")).toBeNull();
  });

  it("generates readable temporary passwords", () => {
    const p = generateTemporaryPassword();
    expect(p).toHaveLength(10);
    expect(p).not.toMatch(/[O0Il1]/);
  });
});

describe("LocalEmployeeRepository", () => {
  it("is admin-only, except the salary-free directory", async () => {
    const { repo, actor } = setup();
    actor.current = { id: "u_priya", role: "staff" };
    await expect(repo.list()).rejects.toHaveProperty("name", "ForbiddenError");
    await expect(repo.get("u_priya")).rejects.toHaveProperty("name", "ForbiddenError");
    const dir = await repo.directory();
    expect(JSON.stringify(dir)).not.toMatch(/salary|amount/i);
    expect(dir.find((d) => d.id === "e_kavita")?.assignable).toBe(false);
    expect(dir.find((d) => d.id === "e_ganesh")?.assignable).toBe(false);
    expect(dir.find((d) => d.id === "u_priya")?.assignable).toBe(true);
  });

  it("gives sequential codes that are never reused, and rejects duplicate mobiles", async () => {
    const { repo } = setup();
    const a = await repo.create(input(), salary);
    expect(a.code).toBe("EMP-0011");
    await expect(repo.create(input({ fullName: "Other" }), salary)).rejects.toThrow(/already used by Mahesh Patil/);
    await repo.deletePermanently(a.id, "Mahesh Patil");
    const b = await repo.create(input({ fullName: "Next One" }), salary);
    expect(b.code).toBe("EMP-0012");
  });

  it("logs field changes and keeps salary history", async () => {
    const { repo } = setup();
    const a = await repo.create(input(), salary);
    const edited = await repo.update(a.id, input({ designation: "Fabricator" }));
    expect(edited.history.at(-1)).toMatchObject({ type: "edited", field: "Designation", from: "Welder", to: "Fabricator" });
    await expect(repo.addSalary(a.id, { ...salary, effectiveFrom: "2026-01-01" })).rejects.toThrow(/before the date of joining/);
    const raised = await repo.addSalary(a.id, { payType: "monthly", amount: 25000, effectiveFrom: "2026-12-01" });
    expect(raised.salary).toHaveLength(2);
    expect(JSON.stringify(raised.history.at(-1))).not.toContain("25000");
  });

  it("deactivation disables the login and signs the user out; self and last admin are protected", async () => {
    const { repo, people } = setup();
    const before = people.logins().find((l) => l.employeeId === "u_rahul")!;
    await repo.deactivate("u_rahul", { date: "2026-11-24", reason: "resigned", other: "" });
    const after = people.logins().find((l) => l.employeeId === "u_rahul")!;
    expect(after.enabled).toBe(false);
    expect(after.sessionVersion).toBe(before.sessionVersion + 1);
    await expect(repo.deactivate("u_admin", { date: "2026-11-24", reason: "resigned", other: "" })).rejects.toThrow(/yourself/);
    await expect(repo.setRole("u_admin", "staff")).rejects.toThrow(/last active admin/);
    await repo.setRole("u_priya", "admin");
    await repo.setRole("u_admin", "staff");
    expect(people.logins().find((l) => l.employeeId === "u_admin")?.role).toBe("staff");
  });

  it("reactivation keeps the login disabled until an admin enables it", async () => {
    const { repo, people } = setup();
    await repo.deactivate("u_rahul", { date: "2026-11-24", reason: "resigned", other: "" });
    await repo.reactivate("u_rahul");
    expect(people.logins().find((l) => l.employeeId === "u_rahul")?.enabled).toBe(false);
    await repo.setLoginEnabled("u_rahul", true);
    expect(people.logins().find((l) => l.employeeId === "u_rahul")?.enabled).toBe(true);
  });

  it("blocks permanent delete while other records refer to the employee", async () => {
    const { repo, data } = setup();
    const a = await repo.create(input(), salary);
    data.setItem(REFERENCE_KEYS.enquiries, JSON.stringify([{ createdBy: "u_admin", assignedTo: a.id, history: [] }]));
    expect((await repo.linkedRecords(a.id)).enquiries).toBe(1);
    await expect(repo.deletePermanently(a.id, "Mahesh Patil")).rejects.toThrow(/linked records/);
    data.setItem(REFERENCE_KEYS.enquiries, "[]");
    await expect(repo.deletePermanently(a.id, "mahesh")).rejects.toThrow(/full name/);
    await repo.deletePermanently(a.id, "Mahesh Patil");
    await expect(repo.get(a.id)).rejects.toBeTruthy();
  });

  it("creates logins with a one-time temporary password and unique usernames", async () => {
    const { repo, people } = setup();
    const a = await repo.create(input(), salary);
    const created = await repo.createLogin(a.id, { username: "9822012345", role: "staff", mustChangePassword: true });
    expect(created.temporaryPassword).toHaveLength(10);
    expect(JSON.stringify(people.logins())).not.toContain(created.temporaryPassword);
    expect(created.login).not.toHaveProperty("passwordHash");
    await expect(repo.createLogin("e_ganesh", { username: "PRIYA@poojary.net", role: "staff", mustChangePassword: true })).rejects.toThrow(/taken/);
  });
});

describe("storage migration", () => {
  it("copies app data (not the sign-in session) from sessionStorage once", () => {
    const from = memoryStorage();
    const to = memoryStorage();
    from.setItem("pppl.quotations.v2", "[1]");
    from.setItem(SESSION_KEY, "{}");
    from.setItem("other.key", "x");
    to.setItem("pppl.enquiries.v1", "[local]");
    from.setItem("pppl.enquiries.v1", "[old]");
    migrateSessionToLocal(from, to);
    expect(to.getItem("pppl.quotations.v2")).toBe("[1]");
    expect(to.getItem("pppl.enquiries.v1")).toBe("[local]");
    expect(to.getItem(SESSION_KEY)).toBeNull();
    expect(to.getItem("other.key")).toBeNull();
    from.setItem("pppl.clients.v1", "[late]");
    migrateSessionToLocal(from, to);
    expect(to.getItem("pppl.clients.v1")).toBeNull();
  });
});
