import { describe, expect, it } from "vitest";
import { createQuotation } from "@/lib/defaults";
import { SessionStorageRepository } from "@/lib/data/session-repo";
import { SessionStorageCrmRepository } from "./session-repo";
import type { ClientInput, EnquiryInput } from "./types";
import { ValidationError } from "./types";

function memory() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
}

function setup(seed = true) {
  const store = memory();
  const quotes = new SessionStorageRepository(() => store, 0, seed);
  let actor = "u_admin";
  const crm = new SessionStorageCrmRepository({ storage: () => store, quotes, getActor: async () => actor, latencyMs: 0, seed });
  return { crm, quotes, setActor: (a: string) => (actor = a) };
}

const newClient = (o: Partial<ClientInput> = {}): ClientInput => ({
  name: "Zenith Autocomp Pvt. Ltd.",
  contacts: [{ id: "", name: "Mr. Ajay Kale", role: "owner", phone: "+91 91234 56789", email: "ajay@zenith.in", primary: true }],
  leadSource: "website",
  leadSourceOther: "",
  referredBy: "",
  address: "",
  city: "Aurangabad",
  state: "Maharashtra",
  gstin: "",
  notes: "",
  active: true,
  ...o,
});

const enquiryInput = (clientId: string, contactId: string): EnquiryInput => ({
  clientId,
  contactId,
  enquiryDate: "2026-11-23",
  projectName: "Warehouse at Waluj",
  siteLocation: "Waluj, Aurangabad",
  buildingType: "warehouse",
  buildingTypeOther: "",
  scope: "supply_erection",
  scopeOther: "",
  size: { length: 50, width: 25, height: 10, areaSqft: null },
  description: "",
  leadSource: "",
  leadSourceOther: "",
  assignedTo: "",
  expectedDecisionDate: "",
  notes: "",
});

describe("SessionStorageCrmRepository", () => {
  it("seeds clients and enquiries linked to the demo quotations", async () => {
    const { crm } = setup();
    expect((await crm.listClients({ active: "all" })).total).toBe(10);
    const enquiries = await crm.listEnquiries({ pageSize: 100 });
    expect(enquiries.total).toBe(11);
    const kalyani = enquiries.items.find((e) => e.projectName === "Warehouse at Chakan")!;
    expect(kalyani.status).toBe("revision_sent");
    expect(kalyani.quotationCount).toBe(2);
    expect(kalyani.latestValue).toBeGreaterThan(0);
    const counts = await crm.statusCounts();
    expect(counts.finalised).toBe(2);
    expect(counts.declined).toBe(1);
  });

  it("creates an enquiry for a new client, which then appears in the client list", async () => {
    const { crm } = setup();
    const client = await crm.createClient(newClient());
    expect(client.contacts[0].phone).toBe("9123456789");
    const e = await crm.createEnquiry(enquiryInput(client.id, client.contacts[0].id));
    expect(e.status).toBe("enquiry");
    expect(e.number).toMatch(/^ENQ-2026-\d{4}$/);
    expect((await crm.listClients({ search: "zenith" })).items[0].enquiryCount).toBe(1);
    const next = (await crm.createEnquiry(enquiryInput(client.id, client.contacts[0].id))).number;
    expect(Number(next.slice(-4))).toBe(Number(e.number.slice(-4)) + 1);
  });

  it("rejects clients without lead source and warns on duplicates", async () => {
    const { crm } = setup();
    await expect(crm.createClient(newClient({ leadSource: "" as never }))).rejects.toBeInstanceOf(ValidationError);
    const dups = await crm.checkDuplicates({ name: "Thermax Limited", phones: ["98220 12345"], emails: [] });
    expect(dups.map((d) => d.field).sort()).toEqual(["name", "phone"]);
  });

  it("links quotations as R0/R1 and moves status automatically when they become final", async () => {
    const { crm, quotes } = setup();
    const client = await crm.createClient(newClient());
    const e = await crm.createEnquiry(enquiryInput(client.id, client.contacts[0].id));

    const r0 = await quotes.create(createQuotation("boq"));
    const link0 = await crm.linkQuotation(r0.id, e.id);
    expect(link0.revision).toBe(0);
    expect(link0.statusChanged).toBeNull(); // still a draft
    expect((await quotes.get(r0.id)).data.meta.revision).toBe("00");

    await quotes.update(r0.id, { status: "final" });
    expect((await crm.onQuotationSaved(r0.id, "draft"))?.statusChanged).toBe("quotation_created");
    expect(await crm.onQuotationSaved(r0.id, "final")).toBeNull();

    await crm.changeStatus(e.id, { to: "quotation_sent" });
    expect((await quotes.get(r0.id)).sentAt).toBeTruthy();
    await crm.changeStatus(e.id, { to: "revision_requested", comment: "Lower price" });

    const r1 = await quotes.create(createQuotation("boq"), "final");
    const link1 = await crm.linkQuotation(r1.id, e.id);
    expect(link1.revision).toBe(1);
    expect(link1.statusChanged).toBe("revision_created");
    expect((await quotes.get(r1.id)).data.meta.revision).toBe("01");

    const history = (await crm.getEnquiry(e.id)).history;
    const statusEvents = history.filter((h) => h.type === "status").map((h) => [h.from, h.to, h.userId]);
    expect(statusEvents).toEqual([
      ["enquiry", "quotation_created", "system"],
      ["quotation_created", "quotation_sent", "u_admin"],
      ["quotation_sent", "revision_requested", "u_admin"],
      ["revision_requested", "revision_created", "system"],
    ]);
  });

  it("enforces finalised/declined rules, locks closed enquiries and reopens declined ones", async () => {
    const { crm, quotes } = setup();
    const client = await crm.createClient(newClient());
    const e = await crm.createEnquiry(enquiryInput(client.id, client.contacts[0].id));
    const q = await quotes.create(createQuotation("boq"), "final");
    await crm.linkQuotation(q.id, e.id);

    await expect(crm.changeStatus(e.id, { to: "finalised" })).rejects.toBeInstanceOf(ValidationError);
    await expect(crm.changeStatus(e.id, { to: "declined" })).rejects.toBeInstanceOf(ValidationError);

    await crm.changeStatus(e.id, {
      to: "declined",
      declined: { reason: "price", competitor: "", other: "", note: "" },
    });
    const declined = await crm.getEnquiry(e.id);
    await expect(crm.updateEnquiry(e.id, { ...enquiryInput(client.id, client.contacts[0].id), projectName: "X" })).resolves.toMatchObject({
      projectName: "Warehouse at Waluj",
    });
    await crm.updateEnquiry(e.id, { ...enquiryInput(client.id, client.contacts[0].id), notes: "Notes still editable" });
    expect((await crm.getEnquiry(e.id)).notes).toBe("Notes still editable");
    await expect(crm.reopen(e.id, "")).rejects.toBeInstanceOf(ValidationError);
    const reopened = await crm.reopen(e.id, "Client came back");
    expect(reopened.status).toBe(declined.statusBeforeDecline);

    const fin = await crm.changeStatus(e.id, {
      to: "finalised",
      finalised: { quotationId: q.id, poNumber: "PO-77", poDate: "2026-11-23" },
    });
    expect(fin.status).toBe("finalised");
    await expect(crm.changeStatus(e.id, { to: "enquiry" })).rejects.toBeInstanceOf(ValidationError);
    await expect(crm.unlinkQuotation(q.id)).rejects.toBeInstanceOf(ValidationError);
  });

  it("blocks deleting clients with enquiries and lists follow-up notifications per owner", async () => {
    const { crm } = setup();
    await expect(crm.deleteClient("c_thermax")).rejects.toBeInstanceOf(ValidationError);
    expect((await crm.notifications("u_sneha")).map((n) => n.projectName)).toContain("Canteen building – Mundhwa");
    expect((await crm.notifications("u_rahul")).map((n) => n.reason)).toContain("Follow-up due today");
    expect((await crm.notifications("u_admin")).map((n) => n.projectName)).toContain("Poly house – Nashik farm");
    expect((await crm.listEnquiries({ needsFollowUp: true })).total).toBe(3);
  });
});
