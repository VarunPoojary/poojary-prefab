import { basicTotal, grandTotal } from "@/lib/calc";
import type { Enquiry } from "@/lib/crm/types";
import type { QuotationRecord } from "@/lib/data/types";
import { STAGES } from "./config";
import { milestonesFromTerms, todayIso } from "./rules";
import type { Project, Stage, StageKey, TemplateTask } from "./types";

export const newId = (p: string) =>
  `${p}_${typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2)}`;

/** The 6 stages with default weights, each loaded with its task template (totals empty). */
export function stagesFromTemplates(templates: Record<StageKey, TemplateTask[]>, createdBy: string, at: string): Stage[] {
  return STAGES.map((s) => ({
    key: s.key,
    weight: s.weight,
    notApplicable: false,
    plannedStart: "",
    plannedEnd: "",
    baselineStart: "",
    baselineEnd: "",
    tasks: (templates[s.key] ?? []).map((t) => ({
      id: newId("task"),
      name: t.name,
      templateKey: t.key,
      measure: t.measure,
      unit: t.unit,
      total: t.measure === "percent" ? 100 : null,
      completed: 0,
      weight: 1,
      plannedStart: "",
      plannedEnd: "",
      assignedTo: "",
      blocked: null,
      createdAt: at,
      createdBy,
    })),
  }));
}

export interface BuildContext {
  code: string;
  createdBy: string;
  at: string;
  templates: Record<StageKey, TemplateTask[]>;
}

/** Day the enquiry was Finalised (its last "→ Finalised" status event), else the PO date. */
export function finalisationDate(e: Enquiry): string {
  const ev = [...e.history].reverse().find((h) => h.type === "status" && h.to === "finalised");
  return ev ? todayIso(new Date(ev.at).getTime()) : e.finalised?.poDate ?? "";
}

/** A project pre-filled from a Finalised enquiry, its accepted quotation and the PO / LOI (Section 1). */
export function projectFromEnquiry(e: Enquiry, q: QuotationRecord | null, ctx: BuildContext): Project {
  const valueWithGst = q ? grandTotal(q.data) : 0;
  const valueBasic = q ? basicTotal(q.data) : 0;
  const paymentOn = !!q?.data.terms.clauses.find((c) => c.key === "payment")?.enabled;
  const startDate = finalisationDate(e) || ctx.at.slice(0, 10);
  const pm = e.assignedTo || e.createdBy;
  return {
    id: newId("prj"),
    code: ctx.code,
    name: e.projectName,
    status: "active",
    statusReason: null,
    enquiryId: e.id,
    quotationId: q?.id ?? null,
    quotationRevision: q?.enquiryRevision ?? null,
    enquiryWarning: "none",
    clientId: e.clientId,
    contactId: e.contactId,
    extraContacts: [],
    siteLocation: e.siteLocation,
    siteAddress: "",
    lat: null,
    lng: null,
    buildingType: e.buildingType,
    buildingTypeOther: e.buildingTypeOther,
    scope: e.scope,
    scopeOther: e.scopeOther,
    size: { length: e.size.length, width: e.size.width, eaveHeight: e.size.height, areaSqft: e.size.areaSqft },
    steelMt: null,
    poNumber: e.finalised?.poNumber ?? "",
    poDate: e.finalised?.poDate ?? "",
    startDate,
    plannedCompletion: "",
    plannedCompletionBaseline: "",
    actualCompletion: "",
    projectManagerId: pm,
    team: pm ? [{ id: newId("tm"), employeeId: pm, role: "pm", from: startDate, to: "" }] : [],
    externalParties: [],
    money: {
      valueBasic,
      valueWithGst,
      gstRate: q?.data.pricing.gstRate ?? 18,
      variations: [],
      milestones: milestonesFromTerms(q?.data.terms.params, paymentOn, valueWithGst).map((m) => ({ ...m, id: newId("ms") })),
      payments: [],
      budget: {},
    },
    documents: [],
    attendance: { enabled: true, enabledFrom: startDate, reminderTime: "" },
    stages: stagesFromTemplates(ctx.templates, ctx.createdBy, ctx.at),
    createdAt: ctx.at,
    createdBy: ctx.createdBy,
    updatedAt: ctx.at,
  };
}

export interface BlankInput {
  name: string;
  clientId: string;
  contactId: string;
  siteLocation: string;
  startDate: string;
  plannedCompletion: string;
  projectManagerId: string;
  valueBasic: number;
  gstRate: number;
  poNumber: string;
  poDate: string;
}

/** A project entered by hand (not linked to an enquiry), e.g. an old project already running. */
export function blankProject(input: BlankInput, ctx: BuildContext): Project {
  return {
    id: newId("prj"),
    code: ctx.code,
    name: input.name,
    status: "active",
    statusReason: null,
    enquiryId: null,
    quotationId: null,
    quotationRevision: null,
    enquiryWarning: "none",
    clientId: input.clientId,
    contactId: input.contactId,
    extraContacts: [],
    siteLocation: input.siteLocation,
    siteAddress: "",
    lat: null,
    lng: null,
    buildingType: "",
    buildingTypeOther: "",
    scope: "",
    scopeOther: "",
    size: { length: null, width: null, eaveHeight: null, areaSqft: null },
    steelMt: null,
    poNumber: input.poNumber,
    poDate: input.poDate,
    startDate: input.startDate,
    plannedCompletion: input.plannedCompletion,
    plannedCompletionBaseline: input.plannedCompletion,
    actualCompletion: "",
    projectManagerId: input.projectManagerId,
    team: input.projectManagerId ? [{ id: newId("tm"), employeeId: input.projectManagerId, role: "pm", from: input.startDate, to: "" }] : [],
    externalParties: [],
    money: {
      valueBasic: input.valueBasic,
      valueWithGst: Math.round(input.valueBasic * (1 + input.gstRate / 100)),
      gstRate: input.gstRate,
      variations: [],
      milestones: [],
      payments: [],
      budget: {},
    },
    documents: [],
    attendance: { enabled: true, enabledFrom: input.startDate, reminderTime: "" },
    stages: stagesFromTemplates(ctx.templates, ctx.createdBy, ctx.at),
    createdAt: ctx.at,
    createdBy: ctx.createdBy,
    updatedAt: ctx.at,
  };
}
