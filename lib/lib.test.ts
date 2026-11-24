import { describe, expect, it } from "vitest";
import { amountInWords, formatINR, integerToIndianWords } from "./money";
import { areaTotals, boqTotals, shedArea } from "./calc";
import { PRESETS } from "./defaults";
import { fillTemplate, formatLongDate, parseText, templateVars } from "./template";
import { validateQuotation } from "./validate";

const preset = (key: string) => PRESETS.find((p) => p.key === key)!.create();

describe("money", () => {
  it("formats with Indian digit grouping", () => {
    expect(formatINR(10801720)).toBe("1,08,01,720");
    expect(formatINR(431526)).toBe("4,31,526");
    expect(formatINR(1234.5)).toBe("1,234.5");
    expect(formatINR(null)).toBe("");
  });

  it("converts amounts to Indian words", () => {
    expect(integerToIndianWords(10801720)).toBe("One Crore Eight Lakh One Thousand Seven Hundred Twenty");
    expect(integerToIndianWords(100000)).toBe("One Lakh");
    expect(integerToIndianWords(1500000000)).toBe("One Hundred Fifty Crore");
    expect(amountInWords(20797500)).toBe("Rupees Two Crore Seven Lakh Ninety Seven Thousand Five Hundred Only");
    expect(amountInWords(12.5)).toBe("Rupees Twelve and Fifty Paise Only");
  });
});

describe("calculations reproduce the sample quotations", () => {
  it("poly houses BOQ (offer 13)", () => {
    const q = preset("sample-poly");
    const t = boqTotals(q.pricing.boq.items, q.pricing.gstRate);
    expect(t.supplyBasic).toBe(7410000);
    expect(t.installBasic).toBe(1744000);
    expect(t.supplyGst).toBe(1333800);
    expect(t.installGst).toBe(313920);
    expect(t.supplyTotal).toBe(8743800);
    expect(t.installTotal).toBe(2057920);
    expect(t.grandTotal).toBe(10801720);
  });

  it("stairs BOQ (offer 14)", () => {
    const q = preset("sample-stairs");
    expect(boqTotals(q.pricing.boq.items, 18).grandTotal).toBe(20797500);
  });

  it("area-based (offer 71) excludes not-quoted rows and computes rate per sq ft", () => {
    const q = preset("sample-agartala");
    const t = areaTotals(q.pricing.area.rows, 18);
    expect(t.rows[0]).toEqual({ totalArea: 2175.25, amount: 3774140, ratePerArea: 1735 });
    expect(t.rows[4].amount).toBeNull();
    // Original sheet showed 32562968 because Excel rounded unit rates; exact products differ by a few rupees.
    expect(Math.abs(t.basic - 32562968)).toBeLessThan(10);
    expect(t.gst).toBe(Math.round(t.basic * 0.18));
    expect(t.grandTotal).toBe(t.basic + t.gst);
  });

  it("shed area = qty x length x width unless overridden", () => {
    const q = preset("sample-poly");
    expect(q.annexures.shedRows.map(shedArea)).toEqual([325, 400, 600]);
    expect(shedArea({ ...q.annexures.shedRows[0], areaOverride: 330 })).toBe(330);
  });
});

describe("templates", () => {
  it("fills known tokens and keeps unknown ones", () => {
    expect(fillTemplate("GST {{gstRate}}% {{nope}}", { gstRate: "18" })).toBe("GST 18% {{nope}}");
  });

  it("derives clause phrases from term parameters", () => {
    const poly = templateVars(preset("sample-poly"));
    expect(poly.safetyChargePhrase).toBe(", i.e. Rs. 65,000 per month per officer");
    expect(poly.supplyVerb).toBe("start");
    const agartala = templateVars(preset("sample-agartala"));
    expect(agartala.safetyChargePhrase).toBe("");
    expect(agartala.supplyVerb).toBe("be completed");
    expect(agartala.validUntil).toBe("December 19, 2023");
  });

  it("formats dates like the Word quotations", () => {
    expect(formatLongDate("2024-06-18")).toBe("June 18, 2024");
  });

  it("parses bullets, numbered points and gaps", () => {
    expect(parseText("Intro\n- a\n1. b\n\n\nEnd\n")).toEqual([
      { type: "para", text: "Intro" },
      { type: "bullet", text: "a" },
      { type: "numbered", marker: "1.", text: "b" },
      { type: "gap" },
      { type: "para", text: "End" },
    ]);
  });
});

describe("validation", () => {
  it("sample presets have no errors", () => {
    for (const key of ["sample-poly", "sample-stairs", "sample-agartala"]) {
      expect(validateQuotation(preset(key)).filter((i) => i.level === "error")).toEqual([]);
    }
  });

  it("flags missing client details and payment split not totalling 100", () => {
    const q = preset("blank-boq");
    q.terms.params.balancePct = 20;
    const msgs = validateQuotation(q).map((i) => i.message);
    expect(msgs).toContain("Client company name is required.");
    expect(msgs.some((m) => m.includes("must total 100%"))).toBe(true);
  });
});
