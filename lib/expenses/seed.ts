import type { AttendanceRecord, CasualWorker } from "@/lib/attendance/types";
import type { Employee } from "@/lib/employees/types";
import { formatPaise, rupeesToPaise } from "@/lib/paise";
import type { EventInput } from "@/lib/projects/local-repo";
import { addDays, normaliseBudget, todayIso } from "@/lib/projects/rules";
import type { Project, StageKey } from "@/lib/projects/types";
import { LEGACY_BUDGET_GROUP, type BudgetGroup } from "@/lib/projects/config";
import { categoryLabel, expenseStatusMeta, isCategory, paymentModeLabel } from "./config";
import { casualLine, formatExpenseCode } from "./rules";
import type { Expense, ExpenseChange, ExpensePaymentMode, ExpenseStatus } from "./types";

/*
 * Demo expenses for the temporary browser store, relative to today: purchases and casual labour on the
 * Nagpur site (one group close to its budget, a pending request, a rejected duplicate and a deleted entry,
 * a few site days without a labour expense), the Sanaswadi godown, the completed Agartala project and Talegaon.
 */

interface Spec {
  p: Project;
  daysAgo: number;
  category: string;
  description: string;
  rupees: number;
  gstPct?: number;
  paidTo: string;
  qty?: [number, string];
  stage?: StageKey;
  by: string;
  status: Exclude<ExpenseStatus, "deleted"> | "deleted";
  mode?: ExpensePaymentMode;
  ref?: string;
  bill?: string;
  reason?: string;
  casual?: Expense["casual"];
}

export function seedExpenses(o: { now: number; projects: Project[]; records: AttendanceRecord[]; casual: CasualWorker[]; employees: Employee[] }) {
  const today = todayIso(o.now);
  const d = (n: number) => addDays(today, -n);
  const at = (n: number, hhmm: string) => new Date(Math.min(new Date(`${d(n)}T${hhmm}:00`).getTime(), o.now)).toISOString();
  const name = (id: string) => o.employees.find((e) => e.id === id)?.fullName ?? id;
  // Specs below name what was bought; each is booked to its budget work stage.
  const stageOf = (v: string): BudgetGroup => (isCategory(v) ? v : LEGACY_BUDGET_GROUP[v] ?? "site");
  const specs: Spec[] = [];
  const add = (s: Spec) => specs.push(s);

  const poly = o.projects.find((p) => p.enquiryId === "e_poly");
  const sana = o.projects.find((p) => p.name === "Godown at Sanaswadi");
  const agartala = o.projects.find((p) => p.enquiryId === "e_agartala");
  const talegaon = o.projects.find((p) => p.name === "Factory shed – Talegaon");
  const budget = (p: Project) => normaliseBudget(p.money?.budget ?? {});
  const r100 = (n: number) => Math.round(n / 100) * 100;

  /** One casual labour expense per logged site day, from the attendance records. */
  const casualDays = (p: Project, by: string, skip: (n: number) => boolean, status: (n: number) => Spec["status"]) => {
    const rates = new Map(o.casual.map((w) => [w.id, w]));
    const byDate = new Map<string, AttendanceRecord[]>();
    for (const r of o.records)
      if (r.personKind === "casual" && r.location === "site" && r.projectId === p.id && (r.status === "present" || r.status === "half")) byDate.set(r.date, [...(byDate.get(r.date) ?? []), r]);
    for (const [date, recs] of byDate) {
      const n = Math.round((new Date(today).getTime() - new Date(date).getTime()) / 86_400_000);
      if (skip(n)) continue;
      const lines = recs.map((r) => casualLine(r.personId, rates.get(r.personId)?.name ?? r.personId, r.status as "present" | "half", rupeesToPaise(rates.get(r.personId)?.dailyRate ?? 0)));
      const total = lines.reduce((s, l) => s + l.amountPaise, 0);
      if (!total) continue;
      const contractor = rates.get(recs[0].personId)?.contractor || "Casual workers (cash)";
      const st = status(n);
      add({
        p,
        daysAgo: n,
        category: "labour",
        description: `Casual labour ${date.slice(8)}/${date.slice(5, 7)}: ${lines.length} workers`,
        rupees: total / 100,
        paidTo: contractor,
        stage: "erection",
        by,
        status: st,
        mode: st === "paid" ? "cash" : undefined,
        ref: "",
        casual: { date, lines },
      });
    }
  };

  if (poly) {
    const b = budget(poly);
    add({ p: poly, daysAgo: 150, category: "design", description: "Structural design and shop drawings – consultant", rupees: r100((b.design ?? 0) * 0.85), gstPct: 18, paidTo: "Shree Structural Consultants", stage: "design", by: "u_admin", status: "paid", mode: "neft", ref: "UTR 550123", bill: "SSC/24-25/118" });
    add({ p: poly, daysAgo: 130, category: "raw_steel", description: "Raw steel – built-up sections, lot 1", rupees: r100((b.factory ?? 0) * 0.4), gstPct: 18, paidTo: "JSW Steel Ltd.", qty: [52, "MT"], stage: "factory", by: "u_admin", status: "paid", mode: "neft", ref: "UTR 561877", bill: "JSW/INV/88412" });
    add({ p: poly, daysAgo: 115, category: "raw_steel", description: "Raw steel – purlins and girts, lot 2", rupees: r100((b.factory ?? 0) * 0.18), gstPct: 18, paidTo: "JSW Steel Ltd.", qty: [24, "MT"], stage: "factory", by: "u_admin", status: "paid", mode: "neft", ref: "UTR 563020", bill: "JSW/INV/89107" });
    add({ p: poly, daysAgo: 100, category: "sheeting", description: "Roof and wall sheeting with accessories", rupees: r100((b.factory ?? 0) * 0.1), gstPct: 18, paidTo: "Tata BlueScope Steel", qty: [4200, "sq m"], stage: "factory", by: "u_admin", status: "accepted", bill: "TBS/7781" });
    add({ p: poly, daysAgo: 95, category: "bolts", description: "Anchor bolts and HSFG bolts", rupees: r100((b.factory ?? 0) * 0.035), gstPct: 18, paidTo: "Unbrako Fasteners", stage: "factory", by: "u_admin", status: "paid", mode: "cheque", ref: "Chq 004512", bill: "UF/2231" });
    add({ p: poly, daysAgo: 90, category: "paint", description: "Primer and enamel paint", rupees: r100((b.factory ?? 0) * 0.03), gstPct: 18, paidTo: "Asian Paints dealer – Chakan", stage: "factory", by: "u_admin", status: "paid", mode: "upi", ref: "UPI 4402918823", bill: "AP/CH/912" });
    add({ p: poly, daysAgo: 75, category: "transport", description: "Trailers Pune → Nagpur, 6 trips", rupees: r100((b.transport ?? 0) * 0.65), gstPct: 12, paidTo: "VRL Logistics", qty: [6, "trips"], stage: "transport", by: "u_admin", status: "paid", mode: "neft", ref: "UTR 571102", bill: "VRL/NGP/3321" });
    add({ p: poly, daysAgo: 40, category: "erection_labour", description: "Erection subcontract – running bill 1", rupees: r100((b.labour ?? 0) * 0.45), paidTo: "Raju Mukadam", stage: "erection", by: "u_admin", status: "paid", mode: "neft", ref: "UTR 580044" });
    add({ p: poly, daysAgo: 12, category: "crane", description: "Crane hire for rafter lifting, 8 hours", rupees: 42000, gstPct: 18, paidTo: "Sai Krupa Cranes", qty: [8, "hours"], stage: "erection", by: "u_rahul", status: "accepted", bill: "SKC/1182" });
    add({ p: poly, daysAgo: 11, category: "crane", description: "Crane hire for rafter lifting, 8 hours", rupees: 42000, gstPct: 18, paidTo: "Sai Krupa Cranes", qty: [8, "hours"], stage: "erection", by: "u_rahul", status: "rejected", bill: "SKC/1182", reason: "Duplicate bill – already entered" });
    add({ p: poly, daysAgo: 9, category: "site", description: "Diesel for DG set", rupees: 6400, paidTo: "HP Petrol Pump, Butibori", qty: [70, "litres"], stage: "erection", by: "u_rahul", status: "deleted", reason: "Entered on the wrong project" });
    add({ p: poly, daysAgo: 3, category: "paint", description: "Paint for touch-up at site", rupees: r100((b.factory ?? 0) * 0.06), gstPct: 18, paidTo: "Berger Paints – Nagpur", qty: [180, "litres"], stage: "erection", by: "u_rahul", status: "requested", bill: "BP/NGP/2210" });
    // Casual labour: paid weekly in cash, the last week accepted, yesterday's still requested; a few days not requested yet.
    casualDays(poly, "u_rahul", (n) => [4, 5, 19].includes(n), (n) => (n <= 2 ? "requested" : n <= 8 ? "accepted" : "paid"));
  }
  if (sana) {
    add({ p: sana, daysAgo: 30, category: "design", description: "Soil test and foundation design", rupees: 85000, gstPct: 18, paidTo: "GeoTech Labs Pune", stage: "design", by: "u_admin", status: "paid", mode: "neft", ref: "UTR 577120", bill: "GTL/442" });
    add({ p: sana, daysAgo: 20, category: "raw_steel", description: "Raw steel – columns and rafters", rupees: 1650000, gstPct: 18, paidTo: "Jindal Steel", qty: [24, "MT"], stage: "factory", by: "u_admin", status: "paid", mode: "neft", ref: "UTR 579001", bill: "JSPL/5512" });
    add({ p: sana, daysAgo: 6, category: "crane", description: "Crane for unloading, 4 hours", rupees: 14000, gstPct: 18, paidTo: "Shree Cranes Chakan", qty: [4, "hours"], stage: "transport", by: "u_rahul", status: "requested", bill: "SC/980" });
    casualDays(sana, "u_rahul", (n) => n === 2, (n) => (n <= 3 ? "requested" : "paid"));
  }
  if (agartala) {
    const b = budget(agartala);
    add({ p: agartala, daysAgo: 300, category: "design", description: "Design and drawings", rupees: r100((b.design ?? 0) * 0.95), paidTo: "Shree Structural Consultants", stage: "design", by: "u_admin", status: "paid", mode: "neft", ref: "UTR 400112" });
    add({ p: agartala, daysAgo: 280, category: "raw_steel", description: "Raw steel – full building", rupees: r100((b.factory ?? 0) * 0.7), gstPct: 18, paidTo: "SAIL", qty: [210, "MT"], stage: "factory", by: "u_admin", status: "paid", mode: "neft", ref: "UTR 401887" });
    add({ p: agartala, daysAgo: 260, category: "sheeting", description: "Sheeting and accessories", rupees: r100((b.factory ?? 0) * 0.26), gstPct: 18, paidTo: "Tata BlueScope Steel", stage: "factory", by: "u_admin", status: "paid", mode: "neft", ref: "UTR 402310" });
    add({ p: agartala, daysAgo: 240, category: "transport", description: "Transport Pune → Agartala, 14 trips", rupees: r100((b.transport ?? 0) * 1.08), gstPct: 12, paidTo: "TCI Freight", qty: [14, "trips"], stage: "transport", by: "u_admin", status: "paid", mode: "neft", ref: "UTR 404551" });
    add({ p: agartala, daysAgo: 200, category: "erection_labour", description: "Erection subcontract – final bill", rupees: r100((b.labour ?? 0) * 0.95), paidTo: "North East Erectors", stage: "erection", by: "u_admin", status: "paid", mode: "neft", ref: "UTR 408870" });
  }
  if (talegaon) {
    add({ p: talegaon, daysAgo: 100, category: "design", description: "Design and drawings", rupees: 110000, gstPct: 18, paidTo: "Shree Structural Consultants", stage: "design", by: "u_admin", status: "paid", mode: "neft", ref: "UTR 571880" });
    add({ p: talegaon, daysAgo: 60, category: "raw_steel", description: "Raw steel – lot 1", rupees: 2100000, gstPct: 18, paidTo: "JSW Steel Ltd.", qty: [30, "MT"], stage: "factory", by: "u_admin", status: "accepted", bill: "JSW/INV/90210" });
  }

  /* Build the records, oldest first, with their history and timeline entries. */
  specs.sort((x, y) => y.daysAgo - x.daysAgo);
  const counter: Record<string, number> = {};
  const events: { projectId: string; by: string; at?: string; event: EventInput }[] = [];
  const expenses: Expense[] = specs.map((s, i) => {
    const date = d(s.daysAgo);
    const requestedAt = at(s.daysAgo, "17:30");
    const year = new Date(requestedAt).getFullYear();
    counter[year] = (counter[year] ?? 0) + 1;
    const code = formatExpenseCode(year, counter[year]);
    const amountPaise = rupeesToPaise(s.rupees);
    const gstPaise = s.gstPct ? Math.round((amountPaise * s.gstPct) / (100 + s.gstPct)) : null;
    const group = stageOf(s.category);
    const direct = s.by === "u_admin";
    const history: ExpenseChange[] = [{ at: requestedAt, by: s.by, action: direct ? "added" : "requested" }];
    const ev = (when: string, text: string) => events.push({ projectId: s.p.id, by: s.by, at: when, event: { type: "expense", text, audience: "managers", source: { kind: "expense", id: `exp_seed_${i}` } } });
    const amt = `${formatPaise(amountPaise)} (${categoryLabel(group)})`;
    const later = (h: number) => new Date(Math.min(new Date(requestedAt).getTime() + h * 3600_000, o.now)).toISOString();
    let status = s.status;
    if (direct && (status === "paid" || status === "accepted")) {
      if (status === "paid") history[0].changes = { Status: ["", "Paid"] };
      else history[0].changes = { Status: ["", "Accepted"] };
      ev(requestedAt, `Expense added as ${expenseStatusMeta(status).label}: ${s.description} ${amt}${status === "paid" ? ` · ${paymentModeLabel(s.mode!)}, ref. ${s.ref}` : ""}`);
    } else {
      if (!direct) ev(requestedAt, `Expense requested: ${s.description} ${amt} — by ${name(s.by)}`);
      else ev(requestedAt, `Expense added as Requested: ${s.description} ${amt}`);
      if (status === "accepted" || status === "paid") {
        history.push({ at: later(16), by: "u_admin", action: "accepted" });
        events.push({ projectId: s.p.id, by: "u_admin", at: later(16), event: { type: "expense", text: `Expense ${code} accepted: ${formatPaise(amountPaise)}`, audience: "managers", source: { kind: "expense", id: `exp_seed_${i}` } } });
      }
      if (status === "paid") {
        history.push({ at: later(40), by: "u_admin", action: "paid" });
        events.push({ projectId: s.p.id, by: "u_admin", at: later(40), event: { type: "expense", text: `Expense ${code} paid: ${formatPaise(amountPaise)} by ${paymentModeLabel(s.mode!)}${s.ref ? `, ref. ${s.ref}` : ""}`, audience: "managers", source: { kind: "expense", id: `exp_seed_${i}` } } });
      }
    }
    if (status === "rejected") {
      history.push({ at: later(20), by: "u_admin", action: "rejected", reason: s.reason });
      events.push({ projectId: s.p.id, by: "u_admin", at: later(20), event: { type: "expense", text: `Expense ${code} rejected: ${s.reason}`, audience: "managers", source: { kind: "expense", id: `exp_seed_${i}` } } });
    }
    if (status === "deleted") {
      history.push({ at: later(4), by: "u_admin", action: "deleted", reason: s.reason });
      events.push({ projectId: s.p.id, by: "u_admin", at: later(4), event: { type: "expense", text: `Expense ${code} deleted: ${s.reason}`, audience: "managers", source: { kind: "expense", id: `exp_seed_${i}` } } });
    }
    if (status === "paid" && !s.mode) status = "accepted";
    return {
      id: `exp_seed_${i}`,
      code,
      projectId: s.p.id,
      date,
      category: group,
      group,
      description: s.description,
      amountPaise,
      gstPaise,
      paidTo: s.paidTo,
      quantity: s.qty?.[0] ?? null,
      unit: s.qty?.[1] ?? "",
      stage: s.stage ?? null,
      bill: null,
      billNumber: s.bill ?? "",
      status,
      payment: status === "paid" ? { mode: s.mode!, reference: s.ref ?? "", date: later(40).slice(0, 10) } : null,
      rejectReason: status === "rejected" ? s.reason ?? "" : "",
      deleteReason: status === "deleted" ? s.reason ?? "" : "",
      deletedFrom: status === "deleted" ? "requested" : null,
      requestedBy: s.by,
      requestedAt,
      casual: s.casual ?? null,
      history,
      updatedAt: history[history.length - 1].at,
    };
  });
  return { expenses, events, counter };
}
