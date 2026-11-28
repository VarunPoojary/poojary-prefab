import { CrmNotFoundError, ValidationError } from "@/lib/crm/types";
import type { AvailableEnquiry, ProjectRepository } from "./repository";
import {
  ProjectForbiddenError,
  type Delay,
  type EventListParams,
  type ExternalParty,
  type ManualProjectInput,
  type Milestone,
  type MyTask,
  type NewNote,
  type NewTask,
  type NewUpdate,
  type Payment,
  type ProgressUpdate,
  type Project,
  type ProjectContact,
  type ProjectDocument,
  type ProjectEvent,
  type ProjectInfoInput,
  type ProjectListParams,
  type ProjectStatus,
  type ProjectSummary,
  type StageKey,
  type TeamMember,
  type Variation,
  type DashboardData,
  type DashboardPage,
} from "./types";
import type { BudgetGroup } from "./config";

/**
 * Cloud project implementation – NOT USED YET.
 *
 * Expected endpoints (JSON; 403 → no access, 404 → not found, 422 { issues } → validation). The server must:
 *  - create the project in the same transaction that saves an enquiry as Finalised (idempotent per enquiry),
 *    and set the "enquiry no longer Finalised" warning when an admin reopens it;
 *  - return only projects whose team the Staff user is on today, and strip `money` and payment / expense events for Staff;
 *  - recompute task completed values from the progress_updates rows.
 *
 *   POST   /projects/reconcile                         -> { created: string[] }
 *   GET    /projects?search=&statuses=&stage=&projectManagerId=&clientId=&from=&to=&behindOnly=&enquiryId=&quotationId=&sort=&dir=
 *   GET    /projects/:id                               POST /projects (manual)   GET /projects/available-enquiries
 *   PUT    /projects/:id/info                          POST /projects/:id/planned-completion { date, reason }
 *   POST   /projects/:id/status { status, reason }     POST /projects/:id/enquiry-warning { keep, reason }
 *   PUT    /projects/:id/team | /contacts | /parties   POST/DELETE /projects/:id/documents[/:docId]
 *   PUT    /projects/:id/attendance-settings { enabled, reminderTime }
 *   POST   /projects/:id/fill-steel-totals             PUT /projects/:id/value { valueBasic, gstRate }
 *   POST/DELETE /projects/:id/variations[/:vid]        PUT /projects/:id/milestones
 *   POST/DELETE /projects/:id/payments[/:pid]          PUT /projects/:id/budget
 *   PUT    /projects/:id/weights                       PUT /projects/:id/stage-dates { dates, reason }
 *   PUT    /projects/:id/stages/:key { notApplicable }
 *   POST   /projects/:id/stages/:key/tasks             PUT/DELETE /projects/:id/tasks/:taskId
 *   POST   /projects/:id/tasks/:taskId/block { reason | null }
 *   POST   /projects/:id/tasks/:taskId/updates         GET /projects/:id/updates?taskId=
 *   POST   /projects/:id/stages/:key/delays            GET /projects/:id/delays
 *   GET    /projects/:id/events?types=&tag=&by=&from=&to=&before=&limit=
 *   POST   /projects/:id/notes                         PUT/DELETE /projects/:id/notes/:eventId
 *   GET    /me/tasks
 */
export class ApiProjectRepository implements ProjectRepository {
  readonly label = "Cloud database";
  constructor(private readonly baseUrl: string) {}

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, { credentials: "include", headers: { "Content-Type": "application/json" }, ...init });
    if (res.status === 403) throw new ProjectForbiddenError();
    if (res.status === 404) throw new CrmNotFoundError("Project", path);
    if (res.status === 422) throw new ValidationError(((await res.json()) as { issues: string[] }).issues);
    if (!res.ok) throw new Error(`Request failed (${res.status})`);
    return (res.status === 204 ? undefined : await res.json()) as T;
  }
  private send<T>(method: string, path: string, body?: unknown) {
    return this.request<T>(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });
  }
  private qs = (p: object) =>
    new URLSearchParams(
      Object.entries(p)
        .filter(([, v]) => v !== undefined && v !== "" && !(Array.isArray(v) && !v.length))
        .map(([k, v]) => [k, Array.isArray(v) ? v.join(",") : String(v)]),
    ).toString();

  reconcile() {
    return this.send<{ created: string[] }>("POST", "/projects/reconcile");
  }
  list(p: ProjectListParams = {}) {
    return this.request<ProjectSummary[]>(`/projects?${this.qs(p)}`);
  }
  get(id: string) {
    return this.request<Project>(`/projects/${id}`);
  }
  availableEnquiries() {
    return this.request<AvailableEnquiry[]>(`/projects/available-enquiries`);
  }
  createManual(input: ManualProjectInput) {
    return this.send<Project>("POST", `/projects`, input);
  }
  updateInfo(id: string, input: ProjectInfoInput) {
    return this.send<Project>("PUT", `/projects/${id}/info`, input);
  }
  setPlannedCompletion(id: string, date: string, reason: string) {
    return this.send<Project>("POST", `/projects/${id}/planned-completion`, { date, reason });
  }
  setStatus(id: string, status: ProjectStatus, reason: string) {
    return this.send<Project>("POST", `/projects/${id}/status`, { status, reason });
  }
  resolveEnquiryWarning(id: string, keep: boolean, reason: string) {
    return this.send<Project>("POST", `/projects/${id}/enquiry-warning`, { keep, reason });
  }
  saveTeam(id: string, team: TeamMember[]) {
    return this.send<Project>("PUT", `/projects/${id}/team`, team);
  }
  saveContacts(id: string, contacts: ProjectContact[]) {
    return this.send<Project>("PUT", `/projects/${id}/contacts`, contacts);
  }
  saveParties(id: string, parties: ExternalParty[]) {
    return this.send<Project>("PUT", `/projects/${id}/parties`, parties);
  }
  addDocument(id: string, doc: Omit<ProjectDocument, "id" | "uploadedAt" | "uploadedBy">) {
    return this.send<Project>("POST", `/projects/${id}/documents`, doc);
  }
  removeDocument(id: string, docId: string) {
    return this.send<Project>("DELETE", `/projects/${id}/documents/${docId}`);
  }
  fillSteelTotals(id: string) {
    return this.send<number>("POST", `/projects/${id}/fill-steel-totals`);
  }
  setAttendanceSettings(id: string, s: { enabled: boolean; reminderTime: string }) {
    return this.send<Project>("PUT", `/projects/${id}/attendance-settings`, s);
  }
  setValue(id: string, valueBasic: number, gstRate: number) {
    return this.send<Project>("PUT", `/projects/${id}/value`, { valueBasic, gstRate });
  }
  addVariation(id: string, v: Pick<Variation, "date" | "description" | "amount" | "approvedBy">) {
    return this.send<Project>("POST", `/projects/${id}/variations`, v);
  }
  removeVariation(id: string, variationId: string) {
    return this.send<Project>("DELETE", `/projects/${id}/variations/${variationId}`);
  }
  saveMilestones(id: string, milestones: Milestone[]) {
    return this.send<Project>("PUT", `/projects/${id}/milestones`, milestones);
  }
  addPayment(id: string, p: Pick<Payment, "date" | "amount" | "mode" | "reference" | "milestoneId">) {
    return this.send<Project>("POST", `/projects/${id}/payments`, p);
  }
  removePayment(id: string, paymentId: string) {
    return this.send<Project>("DELETE", `/projects/${id}/payments/${paymentId}`);
  }
  saveBudget(id: string, budget: Partial<Record<BudgetGroup, number>>) {
    return this.send<Project>("PUT", `/projects/${id}/budget`, budget);
  }
  setWeights(id: string, weights: Record<StageKey, number>) {
    return this.send<Project>("PUT", `/projects/${id}/weights`, weights);
  }
  setStageDates(id: string, dates: Partial<Record<StageKey, { start: string; end: string }>>, reason: string) {
    return this.send<Project>("PUT", `/projects/${id}/stage-dates`, { dates, reason });
  }
  setStageApplicable(id: string, stage: StageKey, notApplicable: boolean) {
    return this.send<Project>("PUT", `/projects/${id}/stages/${stage}`, { notApplicable });
  }
  addTask(id: string, stage: StageKey, task: NewTask) {
    return this.send<Project>("POST", `/projects/${id}/stages/${stage}/tasks`, task);
  }
  updateTask(id: string, taskId: string, task: NewTask, reason?: string) {
    return this.send<Project>("PUT", `/projects/${id}/tasks/${taskId}`, { task, reason });
  }
  deleteTask(id: string, taskId: string) {
    return this.send<Project>("DELETE", `/projects/${id}/tasks/${taskId}`);
  }
  setBlocked(id: string, taskId: string, reason: string | null) {
    return this.send<Project>("POST", `/projects/${id}/tasks/${taskId}/block`, { reason });
  }
  addUpdate(id: string, taskId: string, update: NewUpdate) {
    return this.send<ProgressUpdate>("POST", `/projects/${id}/tasks/${taskId}/updates`, update);
  }
  listUpdates(id: string, taskId?: string) {
    return this.request<ProgressUpdate[]>(`/projects/${id}/updates?${this.qs({ taskId })}`);
  }
  recordStageDelay(id: string, stage: StageKey, reason: string, note: string) {
    return this.send<Delay>("POST", `/projects/${id}/stages/${stage}/delays`, { reason, note });
  }
  dashboardData(page: DashboardPage) {
    return this.request<DashboardData>(`/dashboards/${page}`);
  }
  setFactoryPin(id: string, reason: string | null) {
    return this.send<Project>("PUT", `/projects/${id}/factory-pin`, { reason });
  }
  listDelays(id: string) {
    return this.request<Delay[]>(`/projects/${id}/delays`);
  }
  events(id: string, p: EventListParams = {}) {
    return this.request<{ items: ProjectEvent[]; hasMore: boolean }>(`/projects/${id}/events?${this.qs(p)}`);
  }
  addNote(id: string, note: NewNote) {
    return this.send<ProjectEvent>("POST", `/projects/${id}/notes`, note);
  }
  editNote(id: string, eventId: string, text: string, tag: string) {
    return this.send<ProjectEvent>("PUT", `/projects/${id}/notes/${eventId}`, { text, tag });
  }
  deleteNote(id: string, eventId: string) {
    return this.send<void>("DELETE", `/projects/${id}/notes/${eventId}`);
  }
  myTasks() {
    return this.request<MyTask[]>(`/me/tasks`);
  }
}
