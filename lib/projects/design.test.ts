import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_ROLES, setRoleSource } from "@/lib/auth/roles";
import { SessionStorageCrmRepository } from "@/lib/crm/session-repo";
import { buildDesignBoard } from "@/lib/dashboards/design";
import { SessionStorageRepository } from "@/lib/data/session-repo";
import { PeopleStore } from "@/lib/employees/store";
import { NotificationStore } from "@/lib/notifications/store";
import { SettingsStore } from "@/lib/settings/store";
import { memoryStorage } from "@/lib/storage";
import { DEFAULT_LISTS } from "./config";
import { LocalProjectRepository, type Actor } from "./local-repo";
import { nextRevision, todayIso } from "./rules";
import type { NewProjectDocument } from "./types";

function setup() {
  const data = memoryStorage();
  const actor: { current: Actor | null } = { current: { id: "u_admin", role: "admin" } };
  const quotes = new SessionStorageRepository(() => data, 0, true, async () => actor.current?.id ?? null);
  const crm = new SessionStorageCrmRepository({ storage: () => data, quotes, getActor: async () => actor.current!.id, isAdmin: async () => actor.current?.role === "admin", latencyMs: 0 });
  const notifications = new NotificationStore(() => data);
  const repo = new LocalProjectRepository({
    storage: () => data,
    sources: { enquiries: () => crm.readAllEnquiries(), clients: () => crm.readAllClients(), quotations: () => quotes.readAllRecords() },
    people: new PeopleStore(() => data),
    settings: new SettingsStore(() => data),
    notifications,
    getActor: async () => actor.current,
    latencyMs: 0,
  });
  const projectId = async (name: string) => (await repo.list({ statuses: [] })).find((p) => p.name.includes(name))!.id;
  return { actor, repo, notifications, projectId };
}

const dwg = (o: Partial<NewProjectDocument> = {}): NewProjectDocument => ({ slot: "shop_drawings", fileId: `f-${Math.random()}`, name: "GA-01.pdf", type: "application/pdf", size: 900_000, ...o });

const designer: Actor = { id: "u_sneha", role: "designer" };

describe("Design screen access", () => {
  afterEach(() => setRoleSource(() => undefined));
  const withDesignRole = () => setRoleSource(() => [...DEFAULT_ROLES, { id: "designer", name: "Design", pages: ["design"] }]);

  it("lists every open project for a role with the Design page, without money", async () => {
    const { actor, repo } = setup();
    actor.current = designer;
    await expect(repo.dashboardData("design")).rejects.toThrow(/role/);
    withDesignRole();
    const data = await repo.dashboardData("design");
    expect(data.projects.length).toBeGreaterThan(0);
    expect(data.projects.every((p) => p.money === null && (p.status === "active" || p.status === "on_hold"))).toBe(true);
  });

  it("lets the design team upload to open projects they are not on, in one batch with one notice", async () => {
    const { actor, repo, notifications, projectId } = setup();
    const id = await projectId("Nagpur"); // PM Priya, Rahul site engineer; Sneha is not on the team
    withDesignRole();
    actor.current = designer;
    const p = await repo.addDocuments(id, [{ doc: dwg({ name: "GA-01.pdf", revision: "R0" }) }, { doc: dwg({ name: "GA-02.pdf", revision: "R0" }) }, { doc: dwg({ name: "Base.dwg", type: "", revision: "R0" }) }]);
    const mine = p.documents.filter((d) => d.uploadedBy === "u_sneha");
    expect(mine.map((d) => [d.slot, d.name, d.revision])).toEqual([
      ["shop_drawings", "GA-01.pdf", "R0"],
      ["shop_drawings", "GA-02.pdf", "R0"],
      ["shop_drawings", "Base.dwg", "R0"],
    ]);
    expect(p.money).toBeNull();

    const priya = (await notifications.list("u_priya")).filter((n) => n.kind === "document_uploaded");
    const rahul = (await notifications.list("u_rahul")).filter((n) => n.kind === "document_uploaded");
    expect(priya).toHaveLength(1);
    expect(rahul).toHaveLength(1);
    expect(priya[0].body).toMatch(/^Shop drawings R0 \(3 files\)/);
    expect(priya[0].href).toBe(`/projects/${id}/details#documents`);
    expect((await notifications.list("u_sneha")).some((n) => n.kind === "document_uploaded")).toBe(false);

    actor.current = { id: "u_admin", role: "admin" };
    const ev = await repo.events(id, {});
    expect(ev.items.filter((e) => e.text.startsWith("Document uploaded: Shop drawings")).length).toBe(3);

    // Replacing a version still works for them.
    actor.current = designer;
    const r1 = await repo.addDocuments(id, [{ doc: dwg({ name: "GA-01.pdf", revision: "R1" }), replaces: mine[0].id }]);
    expect(r1.documents.find((d) => d.id === mine[0].id)!.supersededBy).toBe(r1.documents.at(-1)!.id);
  });

  it("refuses closed projects, the Quotation type, and roles without the Design page", async () => {
    const { actor, repo, projectId } = setup();
    const nagpur = await projectId("Nagpur");
    const closed = await projectId("Agartala");
    withDesignRole();
    actor.current = designer;
    await expect(repo.addDocument(closed, dwg())).rejects.toThrow(/completed|cancelled/);
    await expect(repo.addDocument(nagpur, dwg({ slot: "quotation" }))).rejects.toThrow(/Quotation Maker/);
    await expect(repo.addDocuments(nagpur, [{ doc: dwg() }, { doc: dwg({ size: 51 * 1024 * 1024 }) }])).rejects.toThrow(/50 MB/);
    // Nothing from the failed batch was saved.
    actor.current = { id: "u_admin", role: "admin" };
    expect((await repo.get(nagpur)).documents.some((d) => d.uploadedBy === "u_sneha")).toBe(false);
    actor.current = { id: "u_sneha", role: "staff" };
    await expect(repo.addDocument(nagpur, dwg())).rejects.toThrow(/team/);
  });
});

describe("design board", () => {
  it("shows open projects with missing required documents first", async () => {
    const { repo } = setup();
    const data = await repo.dashboardData("design");
    const board = buildDesignBoard({ projects: data.projects, clientNames: data.clientNames, types: DEFAULT_LISTS.documentTypes, today: todayIso() });
    expect(board.rows.length).toBe(data.projects.length);
    expect(board.rows.every((r) => r.status === "active" || r.status === "on_hold")).toBe(true);
    const counts = board.rows.map((r) => r.missing.length);
    expect(counts).toEqual([...counts].sort((a, b) => b - a));
    expect(board.summary.missingRequired).toBe(board.rows.filter((r) => r.missing.length).length);
  });
});

describe("nextRevision", () => {
  it("steps the usual revision styles", () => {
    expect(nextRevision("")).toBe("R0");
    expect(nextRevision(undefined)).toBe("R0");
    expect(nextRevision("R2")).toBe("R3");
    expect(nextRevision("Rev 4")).toBe("Rev 5");
    expect(nextRevision("R09")).toBe("R10");
    expect(nextRevision("A")).toBe("B");
    expect(nextRevision("final")).toBe("");
  });
});
