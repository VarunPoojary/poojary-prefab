import { describe, expect, it } from "vitest";
import type { AttendanceStatus } from "@/lib/attendance/types";
import { Frac, formatPaise, halfFloorRupee, paiseInput, parseRupees } from "@/lib/paise";
import { calcMonth, closeFigures, daysCheck, monthDates, notInPayroll, type PayrollPerson } from "./calc";

/** Attendance for a month: `plan` lists [status, count] in order from the first employed day. */
function att(month: string, plan: [AttendanceStatus, number][], from = `${month}-01`) {
  const dates = monthDates(month).filter((d) => d >= from);
  const m = new Map<string, AttendanceStatus>();
  let i = 0;
  for (const [s, n] of plan) for (let k = 0; k < n; k++) m.set(dates[i++], s);
  expect(i).toBe(dates.length);
  return m;
}
const person = (salary: [number, string][], joined = "2020-01-01", leaving = ""): PayrollPerson => ({
  id: "e",
  dateOfJoining: joined,
  leavingDate: leaving,
  salary: salary.map(([amount, effectiveFrom]) => ({ payType: "monthly", amount, effectiveFrom })),
});
const AFTER = "2030-01-01"; // every day of the month is in the past

describe("exact money", () => {
  it("parses and formats rupees without floating-point errors", () => {
    expect(parseRupees("1,23,456.5")).toBe(12345650);
    expect(parseRupees("₹ 0.1")).toBe(10);
    expect(parseRupees("0.07")).toBe(7);
    expect(parseRupees("1.234")).toBeNull();
    expect(parseRupees("abc")).toBeNull();
    expect(formatPaise(12345650)).toBe("₹1,23,456.50");
    expect(formatPaise(2333300)).toBe("₹23,333");
    expect(paiseInput(12345650)).toBe("123456.50");
    // 0.1 + 0.2 in paise is exact
    expect(parseRupees("0.1")! + parseRupees("0.2")!).toBe(parseRupees("0.3"));
  });

  it("rounds once, half up to the rupee; the 50 % cap rounds down", () => {
    expect(new Frac(2_500_000 * 28, 30).toRupeePaise()).toBe(2_333_300);
    expect(new Frac(150, 1).toRupeePaise()).toBe(200);
    expect(new Frac(149, 1).toRupeePaise()).toBe(100);
    expect(halfFloorRupee(2_333_300)).toBe(1_166_600);
  });
});

describe("salary calculation – worked examples (Section 6)", () => {
  it("1: normal month with an advance → gross ₹28,000, net ₹23,000", () => {
    const c = calcMonth(person([[30000, "2020-01-01"]]), "2026-11", att("2026-11", [["present", 22], ["half", 2], ["absent", 1], ["holiday", 5]]), AFTER);
    expect(c.lopDays).toBe(2);
    expect(c.dailyRatePaise).toBe(100_000);
    expect(c.grossPaise).toBe(2_800_000);
    const f = closeFigures({ grossPaise: c.grossPaise, outstandingPaise: 500_000 });
    expect(f.maxRecoveryPaise).toBe(500_000);
    expect(f.netPaise).toBe(2_300_000);
    expect(daysCheck(c)).toBe(true);
  });

  it("2: large advance, 31-day month, rounding → net ₹11,667, ₹3,334 carried", () => {
    const c = calcMonth(person([[25000, "2020-01-01"]]), "2026-12", att("2026-12", [["present", 24], ["absent", 2], ["holiday", 5]]), AFTER);
    expect(c.grossPaise).toBe(2_333_300);
    const f = closeFigures({ grossPaise: c.grossPaise, outstandingPaise: 1_500_000 });
    expect(f.recoveryPaise).toBe(1_166_600);
    expect(f.netPaise).toBe(1_166_700);
    expect(1_500_000 - f.recoveryPaise).toBe(333_400);
  });

  it("3: joined mid-month in February → gross ₹21,000", () => {
    const c = calcMonth(person([[28000, "2027-02-08"]], "2027-02-08"), "2027-02", att("2027-02", [["present", 17], ["half", 1], ["holiday", 3]], "2027-02-08"), AFTER);
    expect(c.counts.outside).toBe(7);
    expect(c.lopDays).toBe(7.5);
    expect(c.grossPaise).toBe(2_100_000);
    expect(daysCheck(c)).toBe(true);
  });

  it("4: salary raised mid-month → gross ₹31,500", () => {
    const c = calcMonth(person([[30000, "2020-01-01"], [33000, "2026-11-16"]]), "2026-11", att("2026-11", [["present", 26], ["holiday", 4]]), AFTER);
    expect(c.salaryPaise).toBe(3_150_000);
    expect(c.grossPaise).toBe(3_150_000);
  });

  it("5: raise in a 31-day month, with an absence → gross ₹30,497", () => {
    const c = calcMonth(person([[30000, "2020-01-01"], [33000, "2026-12-16"]]), "2026-12", att("2026-12", [["present", 25], ["absent", 1], ["holiday", 5]]), AFTER);
    expect(c.salaryPaise).toBe(3_154_839);
    expect(c.grossPaise).toBe(3_049_700);
  });

  it("6: February, full and with absences → ₹28,000 and ₹26,133", () => {
    const p = person([[28000, "2020-01-01"]]);
    expect(calcMonth(p, "2027-02", att("2027-02", [["present", 24], ["holiday", 4]]), AFTER).grossPaise).toBe(2_800_000);
    expect(calcMonth(p, "2027-02", att("2027-02", [["present", 22], ["absent", 2], ["holiday", 4]]), AFTER).grossPaise).toBe(2_613_300);
  });

  it("7: 31-day month, one absence → gross ₹29,000", () => {
    const c = calcMonth(person([[30000, "2020-01-01"]]), "2027-01", att("2027-01", [["present", 25], ["absent", 1], ["holiday", 5]]), AFTER);
    expect(c.grossPaise).toBe(2_900_000);
  });
});

describe("salary calculation – other rules", () => {
  it("pays ₹0 when there is no Present, Half day or Holiday day at all", () => {
    const c = calcMonth(person([[30000, "2020-01-01"]]), "2026-11", att("2026-11", [["absent", 30]]), AFTER);
    expect(c.grossPaise).toBe(0);
  });

  it("does not deduct Not logged or still-to-come days in the live view, and marks the month incomplete", () => {
    const s = att("2026-11", [["present", 10], ["absent", 1], ["holiday", 2], ["present", 17]]);
    s.delete("2026-11-05");
    const c = calcMonth(person([[30000, "2020-01-01"]]), "2026-11", s, "2026-11-20");
    expect(c.counts.notLogged).toBe(1);
    expect(c.counts.future).toBe(0); // records exist for the future days in this test
    expect(c.grossPaise).toBe(2_900_000);
    expect(c.complete).toBe(false);
  });

  it("caps recovery at 50 % of gross less other deductions, and keeps net ≥ 0", () => {
    const f = closeFigures({ grossPaise: 1_000_000, outstandingPaise: 9_000_000, oneOffs: [{ label: "Damage", amountPaise: -100_000, reason: "x" }] });
    expect(f.maxRecoveryPaise).toBe(400_000);
    expect(f.netPaise).toBe(500_000);
    const g = closeFigures({ grossPaise: 100_000, outstandingPaise: 0, adjustmentPaise: -300_000 });
    expect(g.netPaise).toBe(0);
    expect(g.shortfallPaise).toBe(200_000);
  });

  it("leaves daily-wage workers out of payroll", () => {
    const daily: PayrollPerson = { ...person([]), salary: [{ payType: "daily", amount: 900, effectiveFrom: "2020-01-01" }] };
    expect(notInPayroll(daily, "2026-11")).toMatch(/Daily-wage/);
    expect(notInPayroll(person([[30000, "2020-01-01"]], "2020-01-01", "2026-10-15"), "2026-11")).toMatch(/Not employed/);
    expect(notInPayroll(person([[30000, "2020-01-01"]]), "2026-11")).toBeNull();
  });
});
