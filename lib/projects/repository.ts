import type {
  DashboardData,
  NewProjectDocument,
  DashboardPage,
  Delay,
  EventListParams,
  ExternalParty,
  ManualProjectInput,
  Milestone,
  MyTask,
  NewNote,
  NewTask,
  NewUpdate,
  Payment,
  Project,
  ProjectContact,
  ProjectEvent,
  ProjectInfoInput,
  ProjectListParams,
  ProjectStatus,
  ProjectSummary,
  ProgressUpdate,
  StageKey,
  TeamMember,
  Variation,
} from "./types";
import type { BudgetGroup } from "./config";

export interface AvailableEnquiry {
  id: string;
  number: string;
  clientName: string;
  projectName: string;
}

/**
 * Single entry point for projects. Screens use only this interface (through lib/projects/hooks.ts), so the
 * browser-storage version can be swapped for the cloud API in lib/projects/index.ts.
 *
 * Access: Admins see everything; Staff only projects whose team they are on today, never money fields or
 * payment / expense timeline entries.
 */
export interface ProjectRepository {
  readonly label: string;

  /** Creates projects for Finalised enquiries that don't have one (idempotent) and refreshes warnings/alerts. */
  reconcile(): Promise<{ created: string[] }>;

  list(params?: ProjectListParams): Promise<ProjectSummary[]>;
  get(id: string): Promise<Project>;
  /** Finalised enquiries without a project, for manual creation. Admin only. */
  availableEnquiries(): Promise<AvailableEnquiry[]>;
  createManual(input: ManualProjectInput): Promise<Project>;

  /* details (Admin) */
  updateInfo(id: string, input: ProjectInfoInput): Promise<Project>;
  setPlannedCompletion(id: string, date: string, reason: string): Promise<Project>;
  setStatus(id: string, status: ProjectStatus, reason: string): Promise<Project>;
  resolveEnquiryWarning(id: string, keep: boolean, reason: string): Promise<Project>;
  saveTeam(id: string, team: TeamMember[]): Promise<Project>;
  saveContacts(id: string, contacts: ProjectContact[]): Promise<Project>;
  saveParties(id: string, parties: ExternalParty[]): Promise<Project>;
  /** Admin, or the PM / site engineers on the team, or a role with the Design page (active or on-hold projects). `replaces`: older version of the same type. */
  addDocument(id: string, doc: NewProjectDocument, opts?: { replaces?: string }): Promise<Project>;
  /** Several uploads in one change: one timeline entry each, one notice to the PM and site engineers. */
  addDocuments(id: string, items: { doc: NewProjectDocument; replaces?: string }[]): Promise<Project>;
  removeDocument(id: string, docId: string): Promise<Project>;
  /** Fills empty totals of tasks measured in MT with the steel weight. Returns how many were filled. */
  fillSteelTotals(id: string): Promise<number>;
  /** Admin: switch site attendance on / off and set this project's reminder time ("" = default). */
  setAttendanceSettings(id: string, s: { enabled: boolean; reminderTime: string }): Promise<Project>;

  /* money (Admin) */
  setValue(id: string, valueBasic: number, gstRate: number): Promise<Project>;
  addVariation(id: string, v: Pick<Variation, "date" | "description" | "amount" | "approvedBy">): Promise<Project>;
  removeVariation(id: string, variationId: string): Promise<Project>;
  saveMilestones(id: string, milestones: Milestone[]): Promise<Project>;
  addPayment(id: string, p: Pick<Payment, "date" | "amount" | "mode" | "reference" | "milestoneId">): Promise<Project>;
  removePayment(id: string, paymentId: string): Promise<Project>;
  saveBudget(id: string, budget: Partial<Record<BudgetGroup, number>>): Promise<Project>;

  /* progress */
  setWeights(id: string, weights: Record<StageKey, number>): Promise<Project>;
  setStageDates(id: string, dates: Partial<Record<StageKey, { start: string; end: string }>>, reason: string): Promise<Project>;
  setStageApplicable(id: string, stage: StageKey, notApplicable: boolean): Promise<Project>;
  addTask(id: string, stage: StageKey, task: NewTask): Promise<Project>;
  updateTask(id: string, taskId: string, task: NewTask, reason?: string): Promise<Project>;
  deleteTask(id: string, taskId: string): Promise<Project>;
  setBlocked(id: string, taskId: string, reason: string | null): Promise<Project>;
  addUpdate(id: string, taskId: string, update: NewUpdate): Promise<ProgressUpdate>;
  listUpdates(id: string, taskId?: string): Promise<ProgressUpdate[]>;
  recordStageDelay(id: string, stage: StageKey, reason: string, note: string): Promise<Delay>;
  listDelays(id: string): Promise<Delay[]>;
  /** Active and on-hold projects with their updates and delays, no money. Needs the dashboard page in the role. */
  dashboardData(page: DashboardPage): Promise<DashboardData>;
  /** Pins a project to the top of the Factory dashboard (reason required) or unpins it (null). */
  setFactoryPin(id: string, reason: string | null): Promise<Project>;

  /* timeline */
  events(id: string, params?: EventListParams): Promise<{ items: ProjectEvent[]; hasMore: boolean }>;
  addNote(id: string, note: NewNote): Promise<ProjectEvent>;
  editNote(id: string, eventId: string, text: string, tag: string): Promise<ProjectEvent>;
  deleteNote(id: string, eventId: string): Promise<void>;

  /** Open tasks assigned to the signed-in user in projects they can see. */
  myTasks(): Promise<MyTask[]>;

  resetDemoData?(): Promise<void>;
}
