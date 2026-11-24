import { describe, expect, it } from "vitest";
import {
  autoStatusOnFinal,
  findDuplicates,
  followUpState,
  isNearMatch,
  isValidGstin,
  nextEnquiryNumber,
  normalizePhone,
  validateClient,
  validateStatusChange,
} from "./rules";
import type { Client, ClientInput, Enquiry } from "./types";

const contact = (o: Partial<Client["contacts"][number]> = {}) => ({
  id: "c1",
  name: "Ravi",
  role: "owner" as const,
  phone: "9876543210",
  email: "",
  primary: true,
  ...o,
});

const clientInput = (o: Partial<ClientInput> = {}): ClientInput => ({
  name: "Acme Ltd",
  contacts: [contact()],
  leadSource: "website",
  leadSourceOther: "",
  referredBy: "",
  address: "",
  city: "",
  state: "",
  gstin: "",
  notes: "",
  active: true,
  ...o,
});

const enquiry = (o: Partial<Enquiry> = {}): Enquiry =>
  ({
    id: "e1",
    number: "ENQ-2026-0001",
    status: "enquiry",
    updatedAt: new Date().toISOString(),
    followUpDate: "",
    ...o,
  }) as Enquiry;

describe("contact details", () => {
  it("normalises Indian mobile numbers", () => {
    expect(normalizePhone("+91 98765 43210")).toBe("9876543210");
    expect(normalizePhone("09876543210")).toBe("9876543210");
    expect(normalizePhone("12345")).toBe("");
    expect(normalizePhone("5876543210")).toBe("");
  });

  it("validates GSTIN", () => {
    expect(isValidGstin("27AAACT1234A1Z5")).toBe(true);
    expect(isValidGstin("27AAACT1234A1Z")).toBe(false);
  });
});

describe("client rules", () => {
  it("requires name, primary phone and lead source; referral needs referred-by", () => {
    expect(validateClient(clientInput())).toEqual([]);
    const issues = validateClient(clientInput({ name: "", leadSource: "" as never, contacts: [contact({ phone: "" })] }));
    expect(issues).toContain("Client / company name is required.");
    expect(issues).toContain("Lead source is required.");
    expect(issues.some((i) => i.includes("phone is required"))).toBe(true);
    expect(validateClient(clientInput({ leadSource: "referral" }))).toContain("Referred by is required for referrals.");
    expect(validateClient(clientInput({ contacts: [] }))).toContain("Add at least one contact person.");
  });

  it("detects duplicate phone/email and near-matching names", () => {
    const existing = [
      { id: "x", name: "Thermax Ltd.", contacts: [contact({ phone: "+91 98765 43210", email: "A@B.com" })] },
    ] as Client[];
    const dups = findDuplicates({ name: "THERMAX LIMITED", phones: ["9876543210"], emails: ["a@b.com"] }, existing);
    expect(dups.map((d) => d.field).sort()).toEqual(["email", "name", "phone"]);
    expect(findDuplicates({ name: "Thermax", phones: ["9876543210"] }, existing, "x")).toEqual([]);
    expect(isNearMatch("Kalyani Steels", "Kalyani Steel Pvt Ltd")).toBe(true);
    expect(isNearMatch("Tata Projects", "Bharat Forge")).toBe(false);
  });
});

describe("enquiry rules", () => {
  it("numbers enquiries sequentially per year", () => {
    expect(nextEnquiryNumber([], 2026)).toBe("ENQ-2026-0001");
    expect(nextEnquiryNumber(["ENQ-2026-0009", "ENQ-2025-0042"], 2026)).toBe("ENQ-2026-0010");
  });

  it("enforces finalised and declined requirements and closed states", () => {
    const e = enquiry({ status: "quotation_sent" });
    expect(validateStatusChange(e, { to: "finalised" }, ["q1"])).toEqual([
      "Choose the accepted quotation.",
      "Enter the PO / LOI number.",
      "Enter the PO / LOI date.",
    ]);
    expect(
      validateStatusChange(e, { to: "finalised", finalised: { quotationId: "q9", poNumber: "PO1", poDate: "2026-01-01" } }, ["q1"]),
    ).toEqual(["The accepted quotation must be linked to this enquiry."]);
    expect(
      validateStatusChange(e, { to: "finalised", finalised: { quotationId: "q1", poNumber: "PO1", poDate: "2026-01-01" } }, ["q1"]),
    ).toEqual([]);
    expect(validateStatusChange(e, { to: "declined" }, [])).toContain("Choose a decline reason.");
    expect(
      validateStatusChange(e, { to: "declined", declined: { reason: "competitor", competitor: "", other: "", note: "" } }, []),
    ).toContain("Enter the competitor's name.");
    expect(validateStatusChange(enquiry({ status: "finalised" }), { to: "enquiry" }, [])).toHaveLength(1);
    expect(validateStatusChange(enquiry({ status: "declined" }), { to: "enquiry" }, [])[0]).toMatch(/Reopen/);
  });

  it("moves status automatically when the latest linked quotation becomes final", () => {
    expect(autoStatusOnFinal(enquiry(), 0, 0)).toBe("quotation_created");
    expect(autoStatusOnFinal(enquiry({ status: "revision_requested" }), 1, 1)).toBe("revision_created");
    expect(autoStatusOnFinal(enquiry({ status: "quotation_sent" }), 0, 0)).toBeNull();
    expect(autoStatusOnFinal(enquiry({ status: "revision_requested" }), 0, 1)).toBeNull();
    expect(autoStatusOnFinal(enquiry({ status: "finalised" }), 1, 1)).toBeNull();
  });

  it("flags enquiries after 7 days without update and on-hold follow-up dates", () => {
    const now = new Date("2026-11-23T10:00:00").getTime();
    const day = 86_400_000;
    expect(followUpState(enquiry({ updatedAt: new Date(now - 6 * day).toISOString() }), now).due).toBe(false);
    expect(followUpState(enquiry({ updatedAt: new Date(now - 8 * day).toISOString() }), now)).toEqual({
      due: true,
      reason: "8 days without an update",
    });
    const onHold = enquiry({ status: "on_hold", updatedAt: new Date(now - 30 * day).toISOString(), followUpDate: "2026-11-25" });
    expect(followUpState(onHold, now).due).toBe(false);
    expect(followUpState({ ...onHold, followUpDate: "2026-11-23" }, now).reason).toBe("Follow-up due today");
    expect(followUpState(enquiry({ status: "declined", updatedAt: new Date(0).toISOString() }), now).due).toBe(false);
  });
});
