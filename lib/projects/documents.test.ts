import { describe, expect, it } from "vitest";
import { seedQuoteId } from "@/lib/crm/seed-links";
import { SessionStorageCrmRepository } from "@/lib/crm/session-repo";
import { SessionStorageRepository } from "@/lib/data/session-repo";
import { PeopleStore } from "@/lib/employees/store";
import { NotificationStore } from "@/lib/notifications/store";
import { LocalSettingsRepository } from "@/lib/settings/local-repo";
import { SettingsStore } from "@/lib/settings/store";
import { memoryStorage } from "@/lib/storage";
import { DEFAULT_LISTS } from "./config";
import { LocalProjectRepository, type Actor } from "./local-repo";
import { todayIso } from "./rules";
import type { NewProjectDocument } from "./types";

function setup() {
  const data = memoryStorage();
  const actor: { current: Actor | null } = { current: { id: "u_admin", role: "admin" } };
  const quotes = new SessionStorageRepository(() => data, 0, true, async () => actor.current?.id ?? null);
  const crm = new SessionStorageCrmRepository({ storage: () => data, quotes, getActor: async () => actor.current!.id, isAdmin: async () => actor.current?.role === "admin", latencyMs: 0 });
  const people = new PeopleStore(() => data);
  const settings = new SettingsStore(() => data);
  const notifications = new NotificationStore(() => data);
  const repo = new LocalProjectRepository({
    storage: () => data,
    sources: { enquiries: () => crm.readAllEnquiries(), clients: () => crm.readAllClients(), quotations: () => quotes.readAllRecords() },
    people,
    settings,
    notifications,
    getActor: async () => actor.current,
    latencyMs: 0,
  });
  const settingsRepo = new LocalSettingsRepository(settings, async () => actor.current?.role ?? null);
  const projectId = async (name: string) => (await repo.list({ statuses: [] })).find((p) => p.name.includes(name))!.id;
  return { data, actor, crm, repo, settings, settingsRepo, projectId };
}

const pdf = (o: Partial<NewProjectDocument> = {}): NewProjectDocument => ({ slot: "anchor_plan", fileId: `f-${Math.random()}`, name: "Anchor plan.pdf", type: "application/pdf", size: 120_000, ...o });

describe("project documents", () => {
  it("adds the linked quotation to existing projects once, and not again after an admin removes it", async () => {
    const { repo, projectId } = setup();
    const id = await projectId("Nagpur");
    const p = await repo.get(id);
    const q = p.documents.find((d) => d.kind === "quotation")!;
    expect(q).toMatchObject({ slot: "quotation", quotationId: p.quotationId, source: "quotation", fileId: "" });
    expect(q.name).toMatch(/^Offer .+\/.+ \(R\d+\)$/);
    expect(p.quotationDocAdded).toBe(true);
    await repo.removeDocument(id, q.id);
    expect((await repo.get(id)).documents.some((d) => d.kind === "quotation")).toBe(false);
  });

  it("files the quotation and the enquiry's attachments when a project is created", async () => {
    const { crm, repo } = setup();
    await crm.addAttachment("e_kalyani", { name: "Site layout.pdf", type: "application/pdf", size: 2048, url: "", fileId: "file-layout" });
    await crm.changeStatus("e_kalyani", { to: "finalised", finalised: { quotationId: seedQuoteId("15", "01"), poNumber: "KSL/PO/1", poDate: todayIso() } });
    const { created } = await repo.reconcile();
    const p = await repo.get(created[0]);
    expect(p.documents.map((d) => [d.slot, d.kind, d.source])).toEqual([
      ["quotation", "quotation", "quotation"],
      ["client_docs", "file", "enquiry"],
    ]);
    expect(p.documents[0].quotationId).toBe(seedQuoteId("15", "01"));
    expect(p.documents[1]).toMatchObject({ fileId: "file-layout", name: "Site layout.pdf" });
  });

  it("lets Admin, the PM and site engineers upload; only Admin removes", async () => {
    const { actor, repo, projectId } = setup();
    const id = await projectId("Nagpur"); // PM Priya, Rahul is site engineer
    actor.current = { id: "u_priya", role: "staff" };
    const p1 = await repo.addDocument(id, pdf({ name: "Anchor plan R0.pdf" }));
    actor.current = { id: "u_rahul", role: "staff" };
    await repo.addDocument(id, pdf({ slot: "handover", name: "Handover.jpg", type: "image/jpeg" }));
    await expect(repo.removeDocument(id, p1.documents.at(-1)!.id)).rejects.toThrow(/Only admins/);
    actor.current = { id: "u_sneha", role: "staff" }; // not on the team
    await expect(repo.addDocument(id, pdf())).rejects.toThrow(/team/);
    actor.current = { id: "u_admin", role: "admin" };
    const after = await repo.get(id);
    expect(after.documents.filter((d) => d.kind !== "quotation").map((d) => [d.slot, d.uploadedBy])).toEqual([
      ["anchor_plan", "u_priya"],
      ["handover", "u_rahul"],
    ]);
  });

  it("keeps closed projects for Admin only", async () => {
    const { actor, repo, projectId } = setup();
    const id = await projectId("Agartala"); // completed, PM is a site manager there
    const pm = (await repo.get(id)).projectManagerId;
    actor.current = { id: pm, role: pm === "u_admin" ? "admin" : "staff" };
    if (pm !== "u_admin") await expect(repo.addDocument(id, pdf())).rejects.toThrow(/completed|team/);
    actor.current = { id: "u_admin", role: "admin" };
    expect((await repo.addDocument(id, pdf())).documents.some((d) => d.slot === "anchor_plan")).toBe(true);
  });

  it("checks the type, the file kind and the size", async () => {
    const { repo, settingsRepo, settings, projectId } = setup();
    const id = await projectId("Nagpur");
    await expect(repo.addDocument(id, pdf({ slot: "nope" }))).rejects.toThrow(/document type/);
    await expect(repo.addDocument(id, pdf({ name: "notes.exe" }))).rejects.toThrow(/only PDF/);
    await expect(repo.addDocument(id, pdf({ size: 51 * 1024 * 1024 }))).rejects.toThrow(/50 MB/);
    expect((await repo.addDocument(id, pdf({ name: "Layout.DWG", type: "" }))).documents.at(-1)!.name).toBe("Layout.DWG");
    await settingsRepo.saveList("documentTypes", settings.read().lists.documentTypes.map((t) => (t.value === "contract" ? { ...t, archived: true } : t)));
    await expect(repo.addDocument(id, pdf({ slot: "contract" }))).rejects.toThrow(/document type/);
  });

  it("marks the replaced version as older, and makes it current again if the new one is removed", async () => {
    const { repo, projectId } = setup();
    const id = await projectId("Nagpur");
    const a = (await repo.addDocument(id, pdf({ name: "Shop dwg.pdf", slot: "shop_drawings", revision: "R1" }))).documents.at(-1)!;
    const p = await repo.addDocument(id, pdf({ name: "Shop dwg.pdf", slot: "shop_drawings", revision: " R2 " }), { replaces: a.id });
    const b = p.documents.at(-1)!;
    expect(b.revision).toBe("R2");
    expect(p.documents.find((d) => d.id === a.id)!.supersededBy).toBe(b.id);
    await expect(repo.addDocument(id, pdf({ slot: "drawings" }), { replaces: b.id })).rejects.toThrow(/same type/);
    await expect(repo.addDocument(id, pdf({ slot: "shop_drawings" }), { replaces: a.id })).rejects.toThrow(/current document/);
    const after = await repo.removeDocument(id, b.id);
    expect(after.documents.find((d) => d.id === a.id)!.supersededBy).toBeNull();
  });
});

describe("document types in Settings", () => {
  it("keeps Required, and never archives or drops the app's own types", async () => {
    const { settingsRepo, settings } = setup();
    const types = settings.read().lists.documentTypes;
    expect(types.filter((t) => t.required).map((t) => t.value)).toEqual(["po", "drawings", "anchor_plan"]);
    const edited = types
      .filter((t) => t.value !== "client_docs")
      .map((t) => (t.value === "quotation" ? { ...t, archived: true, label: "Offer" } : t.value === "contract" ? { ...t, required: true } : t));
    const saved = (await settingsRepo.saveList("documentTypes", [...edited, { value: "", label: "Site photos", required: true }])).lists.documentTypes;
    expect(saved.find((t) => t.value === "quotation")).toEqual({ value: "quotation", label: "Offer" });
    expect(saved.some((t) => t.value === "client_docs")).toBe(true);
    expect(saved.find((t) => t.value === "contract")!.required).toBe(true);
    expect(saved.find((t) => t.label === "Site photos")).toMatchObject({ value: "site_photos", required: true });
  });

  it("gives settings saved before document types the default list", () => {
    const { data } = setup();
    data.setItem("pppl.settings.v1", JSON.stringify({ lists: { units: DEFAULT_LISTS.units } }));
    expect(new SettingsStore(() => data).read().lists.documentTypes.map((t) => t.value)).toContain("anchor_plan");
  });
});
