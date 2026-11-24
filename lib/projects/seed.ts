import type { NewNotification } from "@/lib/notifications/types";
import type { AppSettings } from "@/lib/settings/types";
import { blankProject, newId, projectFromEnquiry, type BuildContext } from "./build";
import { stageMeta } from "./config";
import type { ProjectSources } from "./local-repo";
import { addDays, formatProjectCode, stagePct, suggestStageDates, todayIso } from "./rules";
import type { Delay, ProgressUpdate, Project, ProjectEvent, StageKey } from "./types";

/*
 * Demo projects for the temporary browser store: the two Finalised demo enquiries plus three older
 * projects entered by hand, at different stages, with update history, payments, delays and notes.
 * Dates are relative to today.
 */

const DAY = 86_400_000;

interface Out {
  projects: Project[];
  updates: ProgressUpdate[];
  events: ProjectEvent[];
  delays: Delay[];
  counters: Record<string, number>;
  notifications: NewNotification[];
}

export function seedProjects(now: number, sources: ProjectSources, settings: AppSettings): Out {
  const today = todayIso(now);
  const d = (daysAgo: number) => addDays(today, -daysAgo);
  const at = (daysAgo: number, hour = 11) => new Date(now - daysAgo * DAY + (hour - 12) * 3600_000).toISOString();
  const out: Out = { projects: [], updates: [], events: [], delays: [], counters: {}, notifications: [] };
  const code = (daysAgo: number) => {
    const year = new Date(now - daysAgo * DAY).getFullYear();
    out.counters[year] = (out.counters[year] ?? 0) + 1;
    return formatProjectCode(year, out.counters[year]);
  };
  const ctx = (daysAgo: number, by = "u_admin"): BuildContext => ({ code: code(daysAgo), createdBy: by, at: at(daysAgo, 10), templates: settings.templates });
  const ev = (p: Project, daysAgo: number, by: string, e: Partial<ProjectEvent> & Pick<ProjectEvent, "type" | "text">, hour = 12) =>
    out.events.push({
      id: newId("pev"),
      projectId: p.id,
      at: at(daysAgo, hour),
      by,
      tag: "",
      source: null,
      mentions: [],
      files: [],
      automatic: e.type !== "note",
      adminOnly: e.type === "payment" || e.type === "expense",
      ...e,
    });

  /** Plans every stage from start to planned completion with the typical overlaps. */
  const plan = (p: Project) => {
    const dates = suggestStageDates(p.startDate, p.plannedCompletion);
    p.stages = p.stages.map((s) => ({ ...s, plannedStart: dates[s.key].start, plannedEnd: dates[s.key].end, baselineStart: dates[s.key].start, baselineEnd: dates[s.key].end }));
  };

  const DEFAULT_COUNTS: Record<string, number> = {
    shop_drawings: 36, anchor_bolts: 96, columns: 24, rafters: 24, bracing: 48, bolt_tightening: 400, snags: 18, documents_handed: 6,
  };
  /**
   * Posts progress on every task of a stage up to `fraction` (earlier tasks further along), spread between
   * two days, and sets totals.
   */
  const work = (p: Project, key: StageKey, o: { fraction: number; from: number; to: number; by: string; remarks?: string[] }) => {
    const stage = p.stages.find((s) => s.key === key)!;
    const n = stage.tasks.length;
    stage.tasks = stage.tasks.map((t, i) => {
      const unitTotal =
        t.measure === "percent"
          ? 100
          : t.unit === "MT"
            ? p.steelMt ?? 50
            : t.unit === "sq ft"
              ? p.size.areaSqft ?? 12000
              : t.unit === "trucks"
                ? Math.ceil((p.steelMt ?? 50) / 12)
                : t.unit === "Rmt"
                  ? 420
                  : DEFAULT_COUNTS[t.templateKey ?? ""] ?? 20;
      const f = o.fraction >= 1 ? 1 : Math.max(0, Math.min(1, o.fraction * (1.15 - (0.3 * i) / Math.max(1, n - 1))));
      // Steel is in MT with one decimal; counts, areas and percentages are whole numbers.
      const whole = t.unit !== "MT";
      const round = (v: number) => (whole ? Math.round(v) : Math.round(v * 10) / 10);
      const target = t.measure === "percent" ? Math.round(f * 100) : round(unitTotal * f);
      const next = { ...t, total: unitTotal, plannedStart: t.plannedStart || stage.plannedStart, plannedEnd: t.plannedEnd || stage.plannedEnd };
      if (!target) return next;
      const steps = Math.max(1, Math.min(whole && target < 6 ? target : 6, Math.round(target / (unitTotal / 6))));
      let done = 0;
      for (let k = 1; k <= steps; k++) {
        const day = Math.round(o.from - ((o.from - o.to) * k) / steps);
        const amount = k === steps ? round(target - done) : round(target / steps);
        done = round(done + amount);
        const u: ProgressUpdate = {
          id: newId("upd"),
          projectId: p.id,
          stageKey: key,
          taskId: t.id,
          workDate: d(day),
          recordedAt: at(day, 18),
          quantity: amount,
          runningTotal: done,
          remarks: o.remarks?.[(i + k) % o.remarks.length] ?? "",
          delayReason: "",
          photos: [],
          by: o.by,
        };
        out.updates.push(u);
        const pct = Math.round((done / unitTotal) * 100);
        ev(p, day, o.by, {
          type: "progress",
          text: `${t.name} +${amount}${t.measure === "percent" ? "%" : ` ${t.unit}`} (${t.measure === "percent" ? `${done}%` : `${done} of ${unitTotal}, ${pct}%`})`,
          source: { kind: "update", id: u.id, stageKey: key },
        }, 18);
      }
      return { ...next, completed: done };
    });
    if (stagePct(stage) >= 99.999) ev(p, o.to, o.by, { type: "stage", text: `${stageMeta(key).label} reached 100%`, source: { kind: "stage", id: key, stageKey: key } }, 19);
  };

  const pay = (p: Project, daysAgo: number, msIndex: number, amount: number, mode: "neft" | "cheque" | "upi", ref: string) => {
    const ms = p.money!.milestones[msIndex];
    const id = newId("pay");
    p.money!.payments.push({ id, date: d(daysAgo), amount, mode, reference: ref, milestoneId: ms?.id ?? "", createdBy: "u_admin", createdAt: at(daysAgo) });
    ev(p, daysAgo, "u_admin", {
      type: "payment",
      text: `₹${amount.toLocaleString("en-IN")} received${ms ? ` – ${ms.name}` : ""}, ${mode === "neft" ? "NEFT / RTGS" : mode === "cheque" ? "Cheque" : "UPI"} (ref. ${ref})`,
      source: { kind: "payment", id },
    });
  };
  const note = (p: Project, daysAgo: number, by: string, tag: string, text: string, mentions: string[] = []) =>
    ev(p, daysAgo, by, { type: "note", tag, text, mentions, source: { kind: "note", id: "" } }, 15);
  const member = (p: Project, employeeId: string, role: string, from: string, to = "") => p.team.push({ id: newId("tm"), employeeId, role, from, to });

  const enquiries = sources.enquiries();
  const quotes = sources.quotations();
  const fromEnquiry = (enquiryId: string) => {
    const e = enquiries.find((x) => x.id === enquiryId);
    if (!e || e.status !== "finalised") return null;
    const q = quotes.find((r) => r.id === e.finalised?.quotationId) ?? null;
    const startDays = Math.max(0, Math.round((now - new Date(e.finalised?.poDate || today).getTime()) / DAY));
    const p = projectFromEnquiry(e, q, ctx(startDays, "system"));
    ev(p, startDays, "system", { type: "detail", text: `Project created automatically from ${e.number}${q ? `, offer ${q.data.meta.offerNo} (R${q.enquiryRevision ?? 0})` : ""}.` }, 10);
    return { p, startDays };
  };

  /* 1. Agartala – completed */
  const a = fromEnquiry("e_agartala");
  if (a) {
    const { p, startDays } = a;
    p.steelMt = 210;
    p.siteAddress = "Agartala Bypass, near Amtali, Tripura West";
    p.lat = 23.7957;
    p.lng = 91.2868;
    p.plannedCompletion = p.plannedCompletionBaseline = d(startDays - 150);
    ev(p, startDays - 2, "u_admin", { type: "detail", text: `Planned completion set to ${p.plannedCompletion} (baseline)` });
    plan(p);
    member(p, "e_sunil", "site", d(startDays - 60));
    const s = startDays;
    work(p, "design", { fraction: 1, from: s - 3, to: s - 25, by: "u_admin" });
    work(p, "factory", { fraction: 1, from: s - 20, to: s - 85, by: "u_admin" });
    work(p, "transport", { fraction: 1, from: s - 55, to: s - 100, by: "u_admin" });
    work(p, "erection", { fraction: 1, from: s - 70, to: s - 140, by: "u_admin" });
    work(p, "quality", { fraction: 1, from: s - 135, to: s - 150, by: "u_admin" });
    work(p, "handover", { fraction: 1, from: s - 152, to: s - 158, by: "u_admin" });
    p.status = "completed";
    p.actualCompletion = d(s - 158);
    p.attendance = { enabled: false, enabledFrom: p.startDate, reminderTime: "" };
    p.statusReason = null;
    ev(p, s - 158, "u_admin", { type: "detail", text: "Status changed Active → Completed" }, 19);
    const m = p.money!;
    m.budget = { design: Math.round(m.valueBasic * 0.02), factory: Math.round(m.valueBasic * 0.6), transport: Math.round(m.valueBasic * 0.07), site: Math.round(m.valueBasic * 0.06), labour: Math.round(m.valueBasic * 0.09) };
    m.milestones = m.milestones.map((x, i) => ({ ...x, expectedDate: d(s - [5, 70, 150][i] ) }));
    m.milestones.forEach((x, i) => pay(p, s - [8, 78, 165][i], i, i === 2 ? x.amount - Math.round(x.amount * 0.05) : x.amount, i === 1 ? "cheque" : "neft", `DRA/${2300 + i * 17}`));
    note(p, s - 160, "u_admin", "decision", "Retention of 5% on the balance agreed with the client till the leak test report is countersigned.");
    out.projects.push(p);
  }

  /* 2. RIL Nagpur poly houses – in erection, Priya PM */
  const b = fromEnquiry("e_poly");
  if (b) {
    const { p, startDays } = b;
    const s = startDays;
    p.steelMt = 95;
    p.attendance = { enabled: true, enabledFrom: d(42), reminderTime: "" };
    p.siteAddress = "RIL plant, MIDC Butibori, Nagpur";
    p.lat = 20.9372;
    p.lng = 78.9608;
    p.size = { ...p.size, length: 100, width: 35, eaveHeight: 7.5 };
    p.plannedCompletion = p.plannedCompletionBaseline = d(s - 180);
    ev(p, s - 1, "u_admin", { type: "detail", text: `Planned completion set to ${p.plannedCompletion} (baseline)` });
    plan(p);
    member(p, "u_rahul", "site", d(s - 70));
    member(p, "e_ganesh", "other", d(s - 20));
    p.externalParties.push(
      { id: newId("xp"), type: "crane", company: "Sai Krupa Cranes", person: "Mr. Balaji Ingle", phone: "9881122334", email: "" },
      { id: newId("xp"), type: "pmc", company: "Thermax Projects (PMC)", person: "Ms. Anita Rao", phone: "9822098765", email: "anita.rao@thermaxglobal.com" },
    );
    p.extraContacts.push({ id: newId("pc"), name: "Mr. Dinesh Wankhede", role: "Site in-charge", phone: "9765432109", email: "" });
    const remarks = ["As per shop drawings", "Checked by QC", "Night shift included", "", "Bay 3 to 5 done"];
    work(p, "design", { fraction: 1, from: s - 2, to: s - 30, by: "u_priya" });
    work(p, "factory", { fraction: 1, from: s - 20, to: s - 105, by: "u_priya", remarks });
    work(p, "transport", { fraction: 1, from: s - 65, to: 22, by: "u_priya" });
    work(p, "erection", { fraction: 0.86, from: s - 85, to: 1, by: "u_rahul", remarks });
    const m = p.money!;
    m.milestones = m.milestones.map((x, i) => ({ ...x, expectedDate: d(s - [5, 95, 185][i]) }));
    pay(p, s - 9, 0, m.milestones[0]?.amount ?? 0, "neft", "THX/UTR/88213");
    if (m.milestones[1]) pay(p, s - 110, 1, Math.round(m.milestones[1].amount * 0.6), "neft", "THX/UTR/90117");
    m.variations.push({ id: newId("var"), date: d(s - 60), description: "Additional canopy over loading bay (6 m × 4 m)", amount: 185000, approvedBy: "Mr. Mukesh Shukla", createdBy: "u_admin", createdAt: at(s - 60) });
    ev(p, s - 60, "u_admin", { type: "detail", adminOnly: true, text: "Variation +₹1,85,000: Additional canopy over loading bay (6 m × 4 m) (approved by Mr. Mukesh Shukla)" });
    m.budget = { design: Math.round(m.valueBasic * 0.025), factory: Math.round(m.valueBasic * 0.6), transport: Math.round(m.valueBasic * 0.05), site: Math.round(m.valueBasic * 0.08), labour: Math.round(m.valueBasic * 0.09) };
    note(p, 40, "u_priya", "client", "Client confirmed the canopy variation by email; drawings revised to R2.");
    note(p, 12, "u_rahul", "site_issue", "Two anchor bolts at grid C/4 are out by 25 mm. Civil contractor to re-drill; erection continues on other bays.", ["u_priya"]);
    note(p, 5, "u_rahul", "safety", "Toolbox talk held on working at height; all crew have harnesses.");
    note(p, 2, "u_priya", "general", "Crane booked for next Monday–Wednesday for the last two bays.", ["u_rahul"]);
    out.notifications.push({ userId: "u_priya", kind: "mention", title: "Rahul Jadhav mentioned you on " + p.code, body: "Two anchor bolts at grid C/4 are out by 25 mm…", href: `/projects/${p.id}/details#timeline`, key: `mention:seed:${p.id}:1` });
    out.notifications.push({ userId: "u_rahul", kind: "mention", title: "Priya Deshmukh mentioned you on " + p.code, body: "Crane booked for next Monday–Wednesday for the last two bays.", href: `/projects/${p.id}/details#timeline`, key: `mention:seed:${p.id}:2` });
    const ere = p.stages.find((x) => x.key === "erection")!;
    ere.tasks = ere.tasks.map((t) => (t.templateKey === "columns" || t.templateKey === "roof_sheeting" ? { ...t, assignedTo: "u_rahul" } : t));
    out.projects.push(p);
  }

  /* 3. Bharat Forge godown – fabrication behind schedule, Rahul PM */
  {
    const s = 120;
    const p = blankProject(
      { name: "Godown at Sanaswadi", clientId: "c_bharat", contactId: "ct_bharat_1", siteLocation: "Sanaswadi, Pune, Maharashtra", startDate: d(s), plannedCompletion: d(-30), projectManagerId: "u_rahul", valueBasic: 6250000, gstRate: 18, poNumber: "BFL/PO/2026/0412", poDate: d(s + 3) },
      ctx(s - 1),
    );
    p.buildingType = "warehouse";
    p.scope = "supply_erection";
    p.size = { length: 60, width: 30, eaveHeight: 9, areaSqft: 19375 };
    p.steelMt = 140;
    p.attendance = { enabled: true, enabledFrom: d(14), reminderTime: "18:30" };
    ev(p, s - 1, "u_admin", { type: "detail", text: "Project created by hand (old project already running)." }, 10);
    plan(p);
    member(p, "u_sneha", "design", d(s), d(60));
    member(p, "e_ganesh", "production", d(s - 25));
    work(p, "design", { fraction: 1, from: s - 2, to: s - 28, by: "u_sneha" });
    work(p, "factory", { fraction: 0.5, from: s - 26, to: 3, by: "u_rahul", remarks: ["", "Plate shortage", "Machine down half day", "Second shift started"] });
    work(p, "transport", { fraction: 0.12, from: 20, to: 4, by: "u_rahul" });
    const fac = p.stages.find((x) => x.key === "factory")!;
    fac.tasks = fac.tasks.map((t) => (t.templateKey === "welding" || t.templateKey === "cutting" ? { ...t, assignedTo: "u_rahul" } : t));
    for (const [days, reason, txt] of [
      [45, "raw_material", "Plates of 12 mm delayed by the mill by 10 days"],
      [18, "plant_capacity", "Welding SAW machine breakdown, 3 days"],
    ] as const) {
      out.delays.push({ id: newId("dly"), projectId: p.id, stageKey: "factory", taskId: null, reason, note: txt, plannedEnd: fac.plannedEnd, recordedAt: at(days), by: "u_rahul" });
      ev(p, days, "u_rahul", { type: "stage", text: `Delay recorded on Factory work: ${reason === "raw_material" ? "Raw material delay" : "Plant capacity / machine breakdown"} – ${txt}`, source: { kind: "stage", id: "factory", stageKey: "factory" } });
    }
    const m = p.money!;
    m.milestones = [
      { id: newId("ms"), name: "Advance", pct: 30, amount: Math.round(m.valueWithGst * 0.3), expectedDate: d(s - 5) },
      { id: newId("ms"), name: "Against material inspection / dispatch", pct: 60, amount: Math.round(m.valueWithGst * 0.6), expectedDate: d(10) },
      { id: newId("ms"), name: "Balance against running bills / erection", pct: 10, amount: m.valueWithGst - Math.round(m.valueWithGst * 0.3) - Math.round(m.valueWithGst * 0.6), expectedDate: d(-40) },
    ];
    pay(p, s - 6, 0, m.milestones[0].amount, "neft", "BFL/UTR/55120");
    m.budget = { design: 120000, factory: 4560000, transport: 260000, site: 450000, labour: 300000 };
    note(p, 30, "u_rahul", "decision", "Agreed with client: dispatch in 3 lots instead of 2 to match the foundation readiness.");
    out.projects.push(p);
  }

  /* 4. Tata Projects – just started, in design */
  {
    const s = 12;
    const p = blankProject(
      { name: "Factory shed – Talegaon", clientId: "c_tata", contactId: "ct_tata_1", siteLocation: "Talegaon MIDC, Pune, Maharashtra", startDate: d(s), plannedCompletion: d(-110), projectManagerId: "u_admin", valueBasic: 9800000, gstRate: 18, poNumber: "TPL/LOI/7781", poDate: d(s) },
      ctx(s),
    );
    p.buildingType = "factory";
    p.attendance = { enabled: false, enabledFrom: p.startDate, reminderTime: "" };
    p.scope = "supply_erection";
    p.size = { length: 80, width: 40, eaveHeight: 10, areaSqft: 34445 };
    ev(p, s, "u_admin", { type: "detail", text: "Project created by hand (not linked to an enquiry)." }, 10);
    plan(p);
    member(p, "u_sneha", "design", d(s));
    work(p, "design", { fraction: 0.6, from: s - 2, to: 1, by: "u_sneha" });
    const des = p.stages.find((x) => x.key === "design")!;
    des.tasks = des.tasks.map((t) => ({ ...t, assignedTo: "u_sneha" }));
    p.money!.milestones = [{ id: newId("ms"), name: "Advance", pct: 20, amount: Math.round(p.money!.valueWithGst * 0.2), expectedDate: d(s - 10) }];
    note(p, 3, "u_sneha", "client", "Approval drawings sent to Mr. Srinivas; awaiting comments on the crane beam level.");
    out.projects.push(p);
  }

  /* 5. Green Valley – on hold */
  {
    const s = 75;
    const p = blankProject(
      { name: "Cold storage – Nashik", clientId: "c_green", contactId: "ct_green_1", siteLocation: "Nashik, Maharashtra", startDate: d(s), plannedCompletion: d(-20), projectManagerId: "u_admin", valueBasic: 3400000, gstRate: 18, poNumber: "GVA/PO/19", poDate: d(s) },
      ctx(s),
    );
    p.buildingType = "cold_storage";
    p.attendance = { enabled: false, enabledFrom: p.startDate, reminderTime: "" };
    p.scope = "supply";
    p.steelMt = 38;
    ev(p, s, "u_admin", { type: "detail", text: "Project created by hand (not linked to an enquiry)." }, 10);
    plan(p);
    work(p, "design", { fraction: 1, from: s - 2, to: s - 15, by: "u_admin" });
    work(p, "factory", { fraction: 0.25, from: s - 14, to: 35, by: "u_admin" });
    p.status = "on_hold";
    p.statusReason = { reason: "Client's foundation work stopped (funding); restart expected next quarter.", at: at(30), by: "u_admin" };
    ev(p, 30, "u_admin", { type: "detail", text: `Status changed Active → On hold, reason: ${p.statusReason.reason}` });
    p.money!.milestones = [{ id: newId("ms"), name: "Advance", pct: 25, amount: Math.round(p.money!.valueWithGst * 0.25), expectedDate: d(s - 7) }];
    pay(p, s - 8, 0, p.money!.milestones[0].amount, "cheque", "000417");
    out.projects.push(p);
  }

  for (const p of out.projects) {
    p.updatedAt = out.events.filter((e) => e.projectId === p.id).reduce((m, e) => (e.at > m ? e.at : m), p.createdAt);
  }
  return out;
}
