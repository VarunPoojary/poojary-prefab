import { DEFAULT_TRADES } from "@/lib/attendance/config";
import type { EventType, ListItem, PaymentMode, ProjectStatus, StageKey, TemplateTask } from "./types";

export interface StageMeta {
  key: StageKey;
  label: string;
  short: string;
  weight: number;
  /** Typical share of the schedule [start, end] (0–1) used by "Suggest dates". Stages overlap. */
  span: [number, number];
}

/** The 6 stages, in order, with the confirmed default weights. */
export const STAGES: StageMeta[] = [
  { key: "design", label: "Design finalisation", short: "Design", weight: 10, span: [0, 0.2] },
  { key: "factory", label: "Factory work", short: "Factory", weight: 40, span: [0.1, 0.6] },
  { key: "transport", label: "Transportation", short: "Transport", weight: 10, span: [0.35, 0.7] },
  { key: "erection", label: "Assembly and erection", short: "Erection", weight: 30, span: [0.45, 0.9] },
  { key: "quality", label: "Quality check", short: "Quality", weight: 5, span: [0.8, 0.95] },
  { key: "handover", label: "Handover", short: "Handover", weight: 5, span: [0.92, 1] },
];

export const stageMeta = (k: StageKey) => STAGES.find((s) => s.key === k)!;

const t = (key: string, name: string, unit: string): TemplateTask => ({
  key,
  name,
  measure: unit === "%" ? "percent" : "quantity",
  unit: unit === "%" ? "%" : unit,
});

/** Standard task templates loaded on every new project (Admins can change them in Settings). */
export const DEFAULT_TEMPLATES: Record<StageKey, TemplateTask[]> = {
  design: [
    t("approval_drawings", "Approval drawings approved", "%"),
    t("anchor_plan", "Anchor bolt plan issued", "%"),
    t("shop_drawings", "Shop drawings completed", "drawings"),
  ],
  factory: [
    t("raw_material", "Raw material received", "MT"),
    t("cutting", "Cutting", "MT"),
    t("welding", "Built-up welding", "MT"),
    t("blasting_painting", "Shot blasting and painting", "MT"),
    t("purlins", "Purlins / girts roll-formed", "MT"),
    t("sheeting_produced", "Sheeting produced", "sq ft"),
  ],
  transport: [
    t("dispatched_mt", "Material dispatched", "MT"),
    t("trucks", "Trucks dispatched", "trucks"),
    t("received_site", "Material received at site and checked against packing list", "MT"),
  ],
  erection: [
    t("anchor_bolts", "Anchor bolts checked", "Nos"),
    t("columns", "Columns erected", "Nos"),
    t("rafters", "Rafters erected", "Nos"),
    t("purlins_fixed", "Purlins / girts fixed", "MT"),
    t("bracing", "Bracing", "Nos"),
    t("roof_sheeting", "Roof sheeting", "sq ft"),
    t("wall_cladding", "Wall cladding", "sq ft"),
    t("flashing", "Flashing and gutters", "Rmt"),
  ],
  quality: [
    t("alignment", "Alignment and plumb check", "%"),
    t("bolt_tightening", "Bolt tightening check", "Nos"),
    t("touch_up", "Paint touch-up", "%"),
    t("leak_test", "Leak test", "%"),
    t("snags", "Snag items closed", "Nos"),
  ],
  handover: [
    t("final_measurement", "Final measurement", "%"),
    t("completion_certificate", "Completion certificate signed", "%"),
    t("documents_handed", "Documents handed over", "Nos"),
  ],
};

const items = (...labels: [string, string][]): ListItem[] => labels.map(([value, label]) => ({ value, label }));

/** Starting values of the admin-maintained lists. */
export const DEFAULT_LISTS = {
  delayReasons: items(
    ["drawing_approval", "Client drawing approval pending"],
    ["design_change", "Design change by client"],
    ["raw_material", "Raw material delay"],
    ["plant_capacity", "Plant capacity / machine breakdown"],
    ["transport", "Transport / permit"],
    ["site_not_ready", "Site not ready (civil / foundation)"],
    ["weather", "Weather / rain"],
    ["crane", "Crane unavailable"],
    ["labour", "Labour shortage"],
    ["payment_held", "Payment held by client"],
    ["other", "Other"],
  ),
  projectRoles: items(
    ["pm", "Project manager"],
    ["design", "Design engineer"],
    ["production", "Production in-charge"],
    ["site", "Site engineer / Erection supervisor"],
    ["accounts", "Accounts"],
    ["other", "Other"],
  ),
  partyTypes: items(
    ["consultant", "Consultant / Architect"],
    ["pmc", "PMC"],
    ["civil", "Civil contractor"],
    ["erection_sub", "Erection subcontractor"],
    ["transporter", "Transporter"],
    ["crane", "Crane supplier"],
    ["other", "Other"],
  ),
  noteTags: items(
    ["general", "General"],
    ["client", "Client communication"],
    ["site_issue", "Site issue"],
    ["safety", "Safety"],
    ["quality", "Quality"],
    ["decision", "Decision"],
  ),
  trades: items(...DEFAULT_TRADES),
  units: items(["MT", "MT"], ["Nos", "Nos"], ["sq ft", "sq ft"], ["Rmt", "Rmt"], ["trucks", "trucks"], ["drawings", "drawings"], ["m²", "m²"]),
  /** Project document types, in the order their groups show on a project. Values of the old fixed list are kept. */
  documentTypes: [
    { value: "po", label: "PO / LOI", required: true },
    { value: "quotation", label: "Quotation" },
    { value: "drawings", label: "Approved drawings", required: true },
    { value: "shop_drawings", label: "Shop drawings" },
    { value: "anchor_plan", label: "Anchor bolt plan", required: true },
    { value: "client_docs", label: "Client documents" },
    { value: "contract", label: "Contract" },
    { value: "handover", label: "Handover certificate" },
    { value: "other", label: "Other" },
  ] as ListItem[],
};

/** Document type values the app itself uses (linked quotation, enquiry attachments). Keep them in the list. */
export const QUOTATION_DOC_TYPE = "quotation";
export const CLIENT_DOC_TYPE = "client_docs";

/** Files allowed as project documents: PDF, photos and CAD drawings, 10 MB each. */
export const PROJECT_DOC_ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,.dwg,.dxf";
export const PROJECT_DOC_EXTENSIONS = ["pdf", "jpg", "jpeg", "png", "webp", "heic", "heif", "dwg", "dxf"];

export type ListKey = keyof typeof DEFAULT_LISTS;

export const LIST_LABELS: Record<ListKey, { title: string; hint: string }> = {
  documentTypes: { title: "Document types", hint: "Groups of project documents, in this order. Tick Required for documents every project must have." },
  delayReasons: { title: "Delay reasons", hint: "Asked when a task or stage slips past its planned date." },
  projectRoles: { title: "Project roles", hint: "Roles of internal team members on a project." },
  partyTypes: { title: "External party types", hint: "Consultants, contractors and suppliers on a project." },
  noteTags: { title: "Note tags", hint: "Tags for timeline notes; used to count issues per project." },
  units: { title: "Units", hint: "Units for quantity tasks." },
  trades: { title: "Trades", hint: "Trades of casual (daily-wage) workers in the attendance register." },
};

export type BudgetGroup = "design" | "factory" | "transport" | "site" | "labour";

/** The project budget (and every expense) is planned per work stage; site work covers erection, quality check and handover. */
export const BUDGET_GROUPS: { value: BudgetGroup; label: string; stages: StageKey[]; hint?: string }[] = [
  { value: "design", label: "Design", stages: ["design"] },
  { value: "factory", label: "Factory work", stages: ["factory"] },
  { value: "transport", label: "Transportation", stages: ["transport"] },
  { value: "site", label: "Site work", stages: ["erection", "quality", "handover"], hint: "Erection, quality check and handover" },
  { value: "labour", label: "Labour", stages: [], hint: "Fabrication, erection and casual (daily-wage) labour" },
];

/** Budget lines saved by earlier versions (cost categories) and the work stage they belong to. */
export const LEGACY_BUDGET_GROUP: Record<string, BudgetGroup> = {
  raw_steel: "factory",
  sheeting: "factory",
  bolts: "factory",
  paint: "factory",
  fab_labour: "labour",
  transport: "transport",
  erection_labour: "labour",
  crane: "site",
  site: "site",
  other: "site",
};

export const PROJECT_STATUSES: { value: ProjectStatus; label: string; badge: string }[] = [
  { value: "active", label: "Active", badge: "bg-emerald-100 text-emerald-800" },
  { value: "on_hold", label: "On hold", badge: "bg-amber-100 text-amber-800" },
  { value: "completed", label: "Completed", badge: "bg-sky-100 text-sky-800" },
  { value: "cancelled", label: "Cancelled", badge: "bg-slate-200 text-slate-600" },
];

export const PAYMENT_MODES: { value: PaymentMode; label: string }[] = [
  { value: "neft", label: "NEFT / RTGS" },
  { value: "cheque", label: "Cheque" },
  { value: "upi", label: "UPI" },
  { value: "cash", label: "Cash" },
  { value: "other", label: "Other" },
];

export const EVENT_TYPES: { value: EventType; label: string }[] = [
  { value: "note", label: "Notes" },
  { value: "progress", label: "Progress" },
  { value: "task", label: "Tasks" },
  { value: "stage", label: "Stages" },
  { value: "detail", label: "Details" },
  { value: "payment", label: "Payments" },
  { value: "expense", label: "Expenses" },
  { value: "attendance", label: "Attendance" },
];

/** A task is behind when its straight-line expected % is more than this many points above actual. */
export const BEHIND_TOLERANCE_PTS = 10;
/** The forecast is shown once the project has passed this %. */
export const FORECAST_MIN_PROGRESS = 10;
export const MONEY_EVENT_TYPES: EventType[] = ["payment", "expense"];
