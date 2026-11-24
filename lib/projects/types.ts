import type { PhotoRef } from "@/lib/files/types";
import type { BuildingType, Scope } from "@/lib/crm/types";
import type { BudgetGroup } from "./config";

export type StageKey = "design" | "factory" | "transport" | "erection" | "quality" | "handover";
export type ProjectStatus = "active" | "on_hold" | "completed" | "cancelled";
export type Measure = "quantity" | "percent";
export type PaymentMode = "neft" | "cheque" | "upi" | "cash" | "other";
export type ProjectDocSlot = "po" | "drawings" | "anchor_plan" | "contract" | "handover" | "other";
export type EventType = "note" | "progress" | "task" | "stage" | "detail" | "payment" | "expense" | "attendance";

/** One entry of an admin-maintained list (delay reasons, roles, units…). Archived values stay valid on old records. */
export interface ListItem {
  value: string;
  label: string;
  archived?: boolean;
}

export interface TemplateTask {
  key: string;
  name: string;
  measure: Measure;
  unit: string;
}

export interface StatusReason {
  reason: string;
  at: string;
  by: string;
}

export interface TeamMember {
  id: string;
  employeeId: string;
  role: string;
  from: string;
  /** Empty = still on the team. After this date the member no longer sees the project. */
  to: string;
}

export interface ProjectContact {
  id: string;
  name: string;
  role: string;
  phone: string;
  email: string;
}

export interface ExternalParty {
  id: string;
  type: string;
  company: string;
  person: string;
  phone: string;
  email: string;
}

export interface Variation {
  id: string;
  date: string;
  description: string;
  /** Before GST; negative for reductions. */
  amount: number;
  approvedBy: string;
  createdBy: string;
  createdAt: string;
}

export interface Milestone {
  id: string;
  name: string;
  pct: number | null;
  /** With GST. */
  amount: number;
  expectedDate: string;
}

export interface Payment {
  id: string;
  date: string;
  amount: number;
  mode: PaymentMode;
  reference: string;
  milestoneId: string;
  createdBy: string;
  createdAt: string;
}

export interface ProjectMoney {
  valueBasic: number;
  valueWithGst: number;
  gstRate: number;
  variations: Variation[];
  milestones: Milestone[];
  payments: Payment[];
  /** Planned cost (before GST) per work stage group: design, factory, transport, site. */
  budget: Partial<Record<BudgetGroup, number>>;
}

export interface ProjectDocument {
  id: string;
  slot: ProjectDocSlot;
  fileId: string;
  name: string;
  type: string;
  size: number;
  uploadedAt: string;
  uploadedBy: string;
}

export interface ProjectAttendanceSettings {
  enabled: boolean;
  /** Not-logged days and reminders start here (set when attendance is switched on). */
  enabledFrom: string;
  /** "HH:MM"; empty = the default from Settings. */
  reminderTime: string;
}

export interface Task {
  id: string;
  name: string;
  templateKey: string | null;
  measure: Measure;
  unit: string;
  /** Percent tasks are always 100; quantity tasks start empty until the team fills them in. */
  total: number | null;
  completed: number;
  weight: number;
  plannedStart: string;
  plannedEnd: string;
  assignedTo: string;
  blocked: StatusReason | null;
  createdAt: string;
  createdBy: string;
}

export interface Stage {
  key: StageKey;
  weight: number;
  notApplicable: boolean;
  plannedStart: string;
  plannedEnd: string;
  /** First planned dates ever set; later changes keep these for planned-vs-actual. */
  baselineStart: string;
  baselineEnd: string;
  tasks: Task[];
}

export interface Project {
  id: string;
  /** PRJ-2026-001 */
  code: string;
  name: string;
  status: ProjectStatus;
  statusReason: StatusReason | null;
  enquiryId: string | null;
  quotationId: string | null;
  /** Enquiry revision of the accepted quotation (R2 → 2). */
  quotationRevision: number | null;
  /**
   * "open" when the linked enquiry is no longer Finalised and an Admin hasn't decided yet; "kept" after the Admin
   * chose to keep the project. Back to "none" when the enquiry is Finalised again.
   */
  enquiryWarning: "none" | "open" | "kept";
  clientId: string;
  contactId: string;
  extraContacts: ProjectContact[];
  siteLocation: string;
  siteAddress: string;
  lat: number | null;
  lng: number | null;
  buildingType: BuildingType | "";
  buildingTypeOther: string;
  scope: Scope | "";
  scopeOther: string;
  size: { length: number | null; width: number | null; eaveHeight: number | null; areaSqft: number | null };
  steelMt: number | null;
  poNumber: string;
  poDate: string;
  startDate: string;
  plannedCompletion: string;
  plannedCompletionBaseline: string;
  actualCompletion: string;
  projectManagerId: string;
  team: TeamMember[];
  externalParties: ExternalParty[];
  /** Admins only; null in what Staff receive. */
  money: ProjectMoney | null;
  documents: ProjectDocument[];
  stages: Stage[];
  /** Site attendance: logged daily with reminders while enabled. Older records may not have it (see attendanceOf). */
  attendance?: ProjectAttendanceSettings;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
}

/** Never overwritten: every update is its own record. */
export interface ProgressUpdate {
  /** Generated on the device, so an offline queue can sync without duplicates later. */
  id: string;
  projectId: string;
  stageKey: StageKey;
  taskId: string;
  /** Day the work was done (can be earlier than recordedAt, never in the future). */
  workDate: string;
  recordedAt: string;
  /** Added in this update; negative for an admin correction. Percent tasks: points added. */
  quantity: number;
  runningTotal: number;
  remarks: string;
  delayReason: string;
  photos: PhotoRef[];
  by: string;
}

export interface ProjectEvent {
  id: string;
  projectId: string;
  at: string;
  by: string;
  type: EventType;
  tag: string;
  text: string;
  source: { kind: "task" | "stage" | "payment" | "variation" | "section" | "update" | "note" | "expense"; id: string; stageKey?: StageKey } | null;
  mentions: string[];
  files: PhotoRef[];
  automatic: boolean;
  /** Money entries; never sent to Staff. */
  adminOnly: boolean;
  /** "managers" = Admins and the project's site managers only (expense entries). */
  audience?: "managers";
  editedAt?: string;
}

export interface Delay {
  id: string;
  projectId: string;
  stageKey: StageKey;
  taskId: string | null;
  reason: string;
  note: string;
  plannedEnd: string;
  recordedAt: string;
  by: string;
}

/* ---------- inputs & views ---------- */

export interface ProjectSummary {
  id: string;
  code: string;
  name: string;
  clientId: string;
  clientName: string;
  siteLocation: string;
  projectManagerId: string;
  currentStage: StageKey | null;
  progress: number;
  plannedCompletion: string;
  status: ProjectStatus;
  behind: boolean;
  startDate: string;
  enquiryId: string | null;
  quotationId: string | null;
  /** Admins only. */
  value: number | null;
  received: number | null;
}

export interface ProjectListParams {
  search?: string;
  statuses?: ProjectStatus[];
  stage?: StageKey | "";
  projectManagerId?: string;
  clientId?: string;
  from?: string;
  to?: string;
  behindOnly?: boolean;
  enquiryId?: string;
  quotationId?: string;
  sort?: "planned" | "code" | "name" | "client" | "progress" | "start" | "status";
  dir?: "asc" | "desc";
}

export interface NewTask {
  name: string;
  templateKey?: string | null;
  measure: Measure | "";
  unit: string;
  total: number | null;
  weight: number | null;
  plannedStart: string;
  plannedEnd: string;
  assignedTo: string;
}

export interface NewUpdate {
  id?: string;
  workDate: string;
  /** Quantity tasks: amount done in this update. Percent tasks: new % reached. */
  value: number | null;
  remarks: string;
  delayReason: string;
  photos: PhotoRef[];
}

export interface NewNote {
  text: string;
  tag: string;
  mentions: string[];
  files: PhotoRef[];
}

export interface EventListParams {
  types?: EventType[];
  tag?: string;
  by?: string;
  from?: string;
  to?: string;
  /** Load entries older than this ISO time (paging). */
  before?: string;
  limit?: number;
}

export interface MyTask {
  projectId: string;
  projectCode: string;
  projectName: string;
  stageKey: StageKey;
  task: Task;
  behind: boolean;
}

/** Editable project information (section A + B fields). */
export type ProjectInfoInput = Pick<
  Project,
  | "name"
  | "siteLocation"
  | "siteAddress"
  | "lat"
  | "lng"
  | "buildingType"
  | "buildingTypeOther"
  | "scope"
  | "scopeOther"
  | "size"
  | "steelMt"
  | "poNumber"
  | "poDate"
  | "startDate"
  | "projectManagerId"
  | "contactId"
>;

export interface ManualProjectInput {
  enquiryId: string | null;
  clientId: string;
  contactId: string;
  name: string;
  siteLocation: string;
  valueBasic: number | null;
  gstRate: number | null;
  startDate: string;
  plannedCompletion: string;
  projectManagerId: string;
  poNumber: string;
  poDate: string;
}

export class ProjectForbiddenError extends Error {
  constructor(message = "You don't have access to this.") {
    super(message);
    this.name = "ForbiddenError";
  }
}
