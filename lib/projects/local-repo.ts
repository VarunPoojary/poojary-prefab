import { roleHasPage } from "@/lib/auth/roles";
import type { Role } from "@/lib/auth/types";
import { BUILDING_TYPES, SCOPES, labelOf } from "@/lib/crm/config";
import { CrmNotFoundError, ValidationError, type Client, type Enquiry } from "@/lib/crm/types";
import type { QuotationRecord } from "@/lib/data/types";
import { activeAdminIds } from "@/lib/employees/rules";
import type { PeopleStore } from "@/lib/employees/store";
import type { NewNotification } from "@/lib/notifications/types";
import type { NotificationStore } from "@/lib/notifications/store";
import type { SettingsStore } from "@/lib/settings/store";
import { appStorage, type KeyValueStorage } from "@/lib/storage";
import { BUDGET_GROUPS, MONEY_EVENT_TYPES, PAYMENT_MODES, PROJECT_DOC_EXTENSIONS, PROJECT_STATUSES, STAGES, stageMeta, type BudgetGroup } from "./config";
import { blankProject, newId, projectFromEnquiry, quotationDocument, type BuildContext } from "./build";
import type { AvailableEnquiry, ProjectRepository } from "./repository";
import {
  checkUpdate,
  currentStage,
  formatProjectCode,
  attendanceOf,
  moneyTotals,
  isSiteManager,
  normaliseBudget,
  onTeam,
  projectBehind,
  projectPct,
  stagePct,
  taskBehind,
  taskPct,
  todayIso,
  validateTask,
  validateWeights,
} from "./rules";
import { seedProjects } from "./seed";
import {
  ProjectForbiddenError,
  type NewProjectDocument,
  type DashboardData,
  type DashboardPage,
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
  type Stage,
  type StageKey,
  type Task,
  type TeamMember,
  type Variation,
} from "./types";

export const PROJECTS_KEY = "pppl.projects.v1";
export const UPDATES_KEY = "pppl.project-updates.v1";
export const EVENTS_KEY = "pppl.project-events.v1";
export const DELAYS_KEY = "pppl.project-delays.v1";
export const COUNTERS_KEY = "pppl.project-counters.v1";

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const fmtDate = (iso: string) => {
  if (!iso) return "not set";
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1]} ${y}`;
};
const rupees = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const statusLabel = (s: ProjectStatus) => PROJECT_STATUSES.find((x) => x.value === s)!.label;

/** Same limit as the file store (lib/files MAX_FILE_BYTES) and the Supabase bucket. */
const MAX_DOC_BYTES = 10 * 1024 * 1024;

export interface Actor {
  id: string;
  role: Role;
}

/** Other modules' data read by the browser version (the cloud API joins these on the server). */
export interface ProjectSources {
  enquiries(): Enquiry[];
  clients(): Client[];
  quotations(): QuotationRecord[];
}

export interface LocalProjectOptions {
  storage?: () => KeyValueStorage;
  sources: ProjectSources;
  people: PeopleStore;
  settings: SettingsStore;
  notifications: NotificationStore;
  getActor: () => Promise<Actor | null>;
  latencyMs?: number;
  seed?: boolean;
  now?: () => number;
}

export type EventInput = Omit<ProjectEvent, "id" | "projectId" | "at" | "by" | "mentions" | "files" | "automatic" | "adminOnly" | "tag" | "source" | "audience"> &
  Partial<Pick<ProjectEvent, "mentions" | "files" | "adminOnly" | "tag" | "source" | "audience">>;

export { onTeam };

/**
 * TEMPORARY project store in the browser's localStorage. Replace with ApiProjectRepository
 * (lib/projects/api-repo.ts) when the cloud database is ready. Access and money rules here only protect
 * the UI; the real API must enforce them on the server.
 */
export class LocalProjectRepository implements ProjectRepository {
  readonly label = "This browser (temporary)";
  private readonly storage: () => KeyValueStorage;
  private readonly o: LocalProjectOptions;
  private readonly latencyMs: number;
  private readonly now: () => number;

  constructor(o: LocalProjectOptions) {
    this.o = o;
    this.storage = o.storage ?? appStorage;
    this.latencyMs = o.latencyMs ?? 120;
    this.now = o.now ?? (() => Date.now());
  }

  /* ---------- storage ---------- */

  private async delay() {
    if (this.latencyMs > 0) await new Promise((r) => setTimeout(r, this.latencyMs));
  }
  private iso() {
    return new Date(this.now()).toISOString();
  }
  private today() {
    return todayIso(this.now());
  }
  private readArr<T>(key: string): T[] {
    try {
      const v = JSON.parse(this.storage().getItem(key) ?? "[]");
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  }
  private write(key: string, v: unknown) {
    this.storage().setItem(key, JSON.stringify(v));
  }

  private projects(): Project[] {
    if (this.storage().getItem(PROJECTS_KEY) === null) {
      if (this.o.seed === false) this.write(PROJECTS_KEY, []);
      else {
        const s = seedProjects(this.now(), this.o.sources, this.o.settings.read());
        this.write(PROJECTS_KEY, s.projects);
        this.write(UPDATES_KEY, s.updates);
        this.write(EVENTS_KEY, s.events);
        this.write(DELAYS_KEY, s.delays);
        this.write(COUNTERS_KEY, s.counters);
        this.o.notifications.push(s.notifications);
      }
    }
    const list = this.readArr<Project>(PROJECTS_KEY);
    // Budgets saved under the older cost categories move to the work-stage groups once.
    const groups = new Set<string>(BUDGET_GROUPS.map((g) => g.value));
    if (list.some((p) => p.money && Object.keys(p.money.budget).some((k) => !groups.has(k)))) {
      for (const p of list) if (p.money) p.money.budget = normaliseBudget(p.money.budget);
      this.saveProjects(list);
    }
    // Projects created before quotations were filed under Documents get their linked quotation, once.
    if (list.some((p) => p.quotationId && !p.quotationDocAdded)) {
      const quotes = new Map(this.o.sources.quotations().map((q) => [q.id, q]));
      for (const p of list) {
        if (!p.quotationId || p.quotationDocAdded) continue;
        const q = quotes.get(p.quotationId);
        if (q && !p.documents.some((d) => d.kind === "quotation" && d.quotationId === q.id))
          p.documents = [quotationDocument(q, { createdBy: "system", at: p.createdAt || this.iso() }), ...p.documents];
        p.quotationDocAdded = true;
      }
      this.saveProjects(list);
    }
    return list;
  }
  private saveProjects(list: Project[]) {
    this.write(PROJECTS_KEY, list);
  }
  private updates(): ProgressUpdate[] {
    this.projects();
    return this.readArr(UPDATES_KEY);
  }
  private allEvents(): ProjectEvent[] {
    this.projects();
    return this.readArr(EVENTS_KEY);
  }
  private delays(): Delay[] {
    this.projects();
    return this.readArr(DELAYS_KEY);
  }

  private nextCode(year: number) {
    let counters: Record<string, number> = {};
    try {
      counters = JSON.parse(this.storage().getItem(COUNTERS_KEY) ?? "{}");
    } catch {
      /* start again */
    }
    const n = (counters[year] ?? 0) + 1;
    this.write(COUNTERS_KEY, { ...counters, [year]: n });
    return formatProjectCode(year, n);
  }

  /* ---- Used by the browser attendance store (same storage); not part of the public interface. ---- */

  readAllProjects(): Project[] {
    return clone(this.projects());
  }
  readAllUpdates(): ProgressUpdate[] {
    return clone(this.updates());
  }

  /* ---------- dashboards ---------- */

  async dashboardData(page: DashboardPage): Promise<DashboardData> {
    const a = await this.actor();
    if (!roleHasPage(a.role, page)) throw new ProjectForbiddenError("Your role doesn't include this dashboard.");
    const projects = this.projects()
      .filter((p) => p.status === "active" || p.status === "on_hold")
      .map((p) => ({ ...clone(p), money: null }));
    const ids = new Set(projects.map((p) => p.id));
    return {
      projects,
      updates: clone(this.updates().filter((u) => ids.has(u.projectId))),
      delays: clone(this.delays().filter((d) => ids.has(d.projectId))),
      clientNames: Object.fromEntries(this.o.sources.clients().map((c) => [c.id, c.name])),
    };
  }

  async setFactoryPin(id: string, reason: string | null): Promise<Project> {
    const a = await this.actor();
    if (!roleHasPage(a.role, "factory-dashboard")) throw new ProjectForbiddenError("Only people with the Factory dashboard can pin projects.");
    if (reason !== null && !reason.trim()) throw new ValidationError(["Give the reason for putting this project first."]);
    const list = this.projects();
    const p = list.find((x) => x.id === id);
    if (!p) throw new CrmNotFoundError("Project", id);
    const factoryPin = reason === null ? null : { reason: reason.trim(), at: this.iso(), by: a.id };
    const next = { ...p, factoryPin, updatedAt: this.iso() };
    this.saveProjects(list.map((x) => (x.id === id ? next : x)));
    this.log([this.event(id, a.id, { type: "detail", text: factoryPin ? `Pinned to the top of the factory queue: ${factoryPin.reason}` : "Unpinned from the top of the factory queue" })]);
    return this.view(next, a);
  }

  /** Adds automatic timeline entries written by other modules (attendance). */
  appendEvents(entries: { projectId: string; by: string; at?: string; event: EventInput }[]) {
    this.log(entries.map((x) => ({ ...this.event(x.projectId, x.by, x.event), ...(x.at ? { at: x.at } : {}) })));
  }

  /* ---------- access ---------- */

  private async actor(): Promise<Actor> {
    await this.delay();
    const a = await this.o.getActor();
    if (!a) throw new ProjectForbiddenError("Please sign in again.");
    return a;
  }
  private async admin(): Promise<Actor> {
    const a = await this.actor();
    if (a.role !== "admin") throw new ProjectForbiddenError("Only admins can do this.");
    return a;
  }
  private canSee(p: Project, a: Actor) {
    return a.role === "admin" || onTeam(p, a.id, this.today());
  }
  private find(list: Project[], id: string, a: Actor) {
    const p = list.find((x) => x.id === id);
    if (!p) throw new CrmNotFoundError("Project", id);
    if (!this.canSee(p, a)) throw new ProjectForbiddenError("You are not on this project's team.");
    return p;
  }
  /** What the actor may receive: Staff never get money. */
  private view(p: Project, a: Actor): Project {
    const c = clone(p);
    if (a.role !== "admin") c.money = null;
    return c;
  }

  private event(projectId: string, by: string, e: EventInput): ProjectEvent {
    return {
      id: newId("pev"),
      projectId,
      at: this.iso(),
      by,
      tag: "",
      source: null,
      mentions: [],
      files: [],
      adminOnly: MONEY_EVENT_TYPES.includes(e.type) && e.audience !== "managers",
      automatic: e.type !== "note",
      ...e,
    };
  }
  private log(events: ProjectEvent[]) {
    if (events.length) this.write(EVENTS_KEY, [...this.allEvents(), ...events]);
  }

  /**
   * Loads a project, checks access, applies a change and saves it with its timeline entries.
   * Completed / cancelled projects are read-only unless allowClosed.
   */
  private async change(
    id: string,
    opts: { admin?: boolean; allowClosed?: boolean },
    fn: (p: Project, a: Actor) => { project: Project; events?: EventInput[] },
  ): Promise<Project> {
    const a = opts.admin ? await this.admin() : await this.actor();
    const list = this.projects();
    const current = this.find(list, id, a);
    if (!opts.allowClosed && (current.status === "completed" || current.status === "cancelled"))
      throw new ValidationError([`This project is ${statusLabel(current.status).toLowerCase()}; reopen it to make changes.`]);
    const { project, events = [] } = fn(clone(current), a);
    project.updatedAt = this.iso();
    this.saveProjects(list.map((x) => (x.id === id ? project : x)));
    this.log(events.map((e) => this.event(id, a.id, e)));
    return this.view(project, a);
  }

  private notifyAdmins(items: Omit<NewNotification, "userId">[]) {
    const admins = activeAdminIds(this.o.people.logins(), this.o.people.employees());
    this.o.notifications.push(admins.flatMap((userId) => items.map((i) => ({ ...i, userId }))));
  }

  /* ---------- creation ---------- */

  private ctx(createdBy: string): BuildContext {
    const at = this.iso();
    return { code: this.nextCode(new Date(this.now()).getFullYear()), createdBy, at, templates: this.o.settings.read().templates };
  }

  /** Builds a project from a Finalised enquiry, its accepted quotation and the PO / LOI. */
  private fromEnquiry(e: Enquiry, createdBy: string): { project: Project; quotationNote: string } {
    const q = this.o.sources.quotations().find((r) => r.id === e.finalised?.quotationId) ?? null;
    const project = projectFromEnquiry(e, q, this.ctx(createdBy));
    const rev = q?.enquiryRevision ?? null;
    return { project, quotationNote: q ? `offer ${q.data.meta.offerNo}${rev !== null ? ` (R${rev})` : ""}` : "no quotation found" };
  }

  async reconcile(): Promise<{ created: string[] }> {
    const list = this.projects();
    const byEnquiry = new Map(list.filter((p) => p.enquiryId).map((p) => [p.enquiryId!, p]));
    const enquiries = this.o.sources.enquiries();
    const events: ProjectEvent[] = [];
    const created: Project[] = [];
    let changed = false;

    for (const e of enquiries) {
      const p = byEnquiry.get(e.id);
      if (e.status === "finalised" && !p) {
        const { project, quotationNote } = this.fromEnquiry(e, "system");
        created.push(project);
        byEnquiry.set(e.id, project);
        events.push(this.event(project.id, "system", { type: "detail", text: `Project created automatically from ${e.number}, ${quotationNote}.` }));
      } else if (p && e.status === "finalised" && p.enquiryWarning !== "none") {
        p.enquiryWarning = "none";
        changed = true;
        events.push(this.event(p.id, "system", { type: "detail", text: `${e.number} is Finalised again; warning cleared.` }));
      } else if (p && e.status !== "finalised" && p.enquiryWarning === "none") {
        p.enquiryWarning = "open";
        changed = true;
        events.push(this.event(p.id, "system", { type: "detail", text: `Linked enquiry ${e.number} is no longer Finalised.` }));
        this.notifyAdmins([
          { kind: "enquiry_reopened", title: `${p.code}: enquiry reopened`, body: `${e.number} is no longer Finalised. Keep or cancel the project.`, href: `/projects/${p.id}/details`, key: `reopened:${p.id}:${e.updatedAt}` },
        ]);
      }
    }
    if (created.length || changed) this.saveProjects([...list, ...created]);
    this.log(events);
    if (created.length) {
      const clients = new Map(this.o.sources.clients().map((c) => [c.id, c.name]));
      this.notifyAdmins(
        created.map((p) => ({
          kind: "project_created" as const,
          title: `New project ${p.code}`,
          body: `${p.name} – ${clients.get(p.clientId) ?? ""}`,
          href: `/projects/${p.id}/details`,
          key: `created:${p.id}`,
        })),
      );
    }
    // Overdue payment milestones → one alert per milestone and due date, to admins.
    const today = this.today();
    this.notifyAdmins(
      [...list, ...created]
        .filter((p) => p.money && (p.status === "active" || p.status === "on_hold"))
        .flatMap((p) =>
          moneyTotals(p.money!, today).overdue.map((m) => ({
            kind: "milestone_overdue" as const,
            title: `${p.code}: payment overdue`,
            body: `${m.name} (${rupees(m.amount)}) was expected on ${fmtDate(m.expectedDate)}.`,
            href: `/projects/${p.id}/details#money`,
            key: `milestone:${p.id}:${m.id}:${m.expectedDate}`,
          })),
        ),
    );
    return { created: created.map((p) => p.id) };
  }

  async availableEnquiries(): Promise<AvailableEnquiry[]> {
    await this.admin();
    const taken = new Set(this.projects().map((p) => p.enquiryId));
    const clients = new Map(this.o.sources.clients().map((c) => [c.id, c.name]));
    return this.o.sources
      .enquiries()
      .filter((e) => e.status === "finalised" && !taken.has(e.id))
      .map((e) => ({ id: e.id, number: e.number, clientName: clients.get(e.clientId) ?? "", projectName: e.projectName }));
  }

  async createManual(input: ManualProjectInput): Promise<Project> {
    const a = await this.admin();
    const list = this.projects();
    if (input.enquiryId) {
      if (list.some((p) => p.enquiryId === input.enquiryId)) throw new ValidationError(["That enquiry already has a project."]);
      const e = this.o.sources.enquiries().find((x) => x.id === input.enquiryId);
      if (!e) throw new CrmNotFoundError("Enquiry", input.enquiryId);
      if (e.status !== "finalised") throw new ValidationError(["Only Finalised enquiries can be linked."]);
      const { project } = this.fromEnquiry(e, a.id);
      if (input.plannedCompletion) project.plannedCompletion = project.plannedCompletionBaseline = input.plannedCompletion;
      if (input.startDate) project.startDate = input.startDate;
      this.saveProjects([...list, project]);
      this.log([this.event(project.id, a.id, { type: "detail", text: `Project created by hand from ${e.number}.` })]);
      return this.view(project, a);
    }
    const issues: string[] = [];
    if (!input.name.trim()) issues.push("Enter the project name.");
    const client = this.o.sources.clients().find((c) => c.id === input.clientId);
    if (!client) issues.push("Choose the client.");
    if (!input.startDate) issues.push("Enter the start date.");
    if (input.plannedCompletion && input.startDate && input.plannedCompletion < input.startDate) issues.push("Planned completion can't be before the start date.");
    if (input.valueBasic !== null && input.valueBasic < 0) issues.push("The value can't be negative.");
    if (issues.length) throw new ValidationError(issues);
    const pm = input.projectManagerId || a.id;
    const project = blankProject(
      {
        name: input.name.trim(),
        clientId: input.clientId,
        contactId: input.contactId || client!.contacts.find((c) => c.primary)?.id || client!.contacts[0]?.id || "",
        siteLocation: input.siteLocation.trim(),
        startDate: input.startDate,
        plannedCompletion: input.plannedCompletion,
        projectManagerId: pm,
        valueBasic: input.valueBasic ?? 0,
        gstRate: input.gstRate ?? 18,
        poNumber: input.poNumber.trim(),
        poDate: input.poDate,
      },
      this.ctx(a.id),
    );
    this.saveProjects([...list, project]);
    this.log([this.event(project.id, a.id, { type: "detail", text: "Project created by hand (not linked to an enquiry)." })]);
    this.notifyAdmins([{ kind: "project_created", title: `New project ${project.code}`, body: `${project.name} – ${client!.name}`, href: `/projects/${project.id}/details`, key: `created:${project.id}` }]);
    return this.view(project, a);
  }

  /* ---------- list / get ---------- */

  private summary(p: Project, a: Actor, clients: Map<string, string>, today: string): ProjectSummary {
    const totals = p.money ? moneyTotals(p.money, today) : null;
    return {
      id: p.id,
      code: p.code,
      name: p.name,
      clientId: p.clientId,
      clientName: clients.get(p.clientId) ?? "",
      siteLocation: p.siteLocation,
      projectManagerId: p.projectManagerId,
      currentStage: currentStage(p.stages),
      progress: projectPct(p.stages),
      plannedCompletion: p.plannedCompletion,
      status: p.status,
      behind: projectBehind(p, today),
      startDate: p.startDate,
      enquiryId: p.enquiryId,
      quotationId: p.quotationId,
      value: a.role === "admin" && totals ? totals.revisedWithGst : null,
      received: a.role === "admin" && totals ? totals.received : null,
    };
  }

  async list(params: ProjectListParams = {}): Promise<ProjectSummary[]> {
    const a = await this.actor();
    const today = this.today();
    const clients = new Map(this.o.sources.clients().map((c) => [c.id, c.name]));
    const { search = "", statuses, stage, projectManagerId, clientId, from, to, behindOnly, enquiryId, quotationId, sort = "planned", dir = "asc" } = params;
    const terms = search.toLowerCase().split(/\s+/).filter(Boolean);
    const rows = this.projects()
      .filter((p) => this.canSee(p, a))
      .filter((p) => !enquiryId || p.enquiryId === enquiryId)
      .filter((p) => !quotationId || p.quotationId === quotationId)
      .map((p) => this.summary(p, a, clients, today))
      .filter((s) => !statuses?.length || statuses.includes(s.status))
      .filter((s) => !stage || s.currentStage === stage)
      .filter((s) => !projectManagerId || s.projectManagerId === projectManagerId)
      .filter((s) => !clientId || s.clientId === clientId)
      .filter((s) => !from || s.startDate >= from)
      .filter((s) => !to || s.startDate <= to)
      .filter((s) => !behindOnly || s.behind)
      .filter((s) => {
        if (!terms.length) return true;
        const hay = [s.code, s.name, s.clientName, s.siteLocation].join(" ").toLowerCase();
        return terms.every((t) => hay.includes(t));
      });
    const key: Record<NonNullable<ProjectListParams["sort"]>, (s: ProjectSummary) => string | number> = {
      // Projects without a planned date go last.
      planned: (s) => s.plannedCompletion || "9999",
      code: (s) => s.code,
      name: (s) => s.name.toLowerCase(),
      client: (s) => s.clientName.toLowerCase(),
      progress: (s) => s.progress,
      start: (s) => s.startDate,
      status: (s) => PROJECT_STATUSES.findIndex((x) => x.value === s.status),
    };
    const sign = dir === "asc" ? 1 : -1;
    return rows.sort((x, y) => {
      const kx = key[sort](x);
      const ky = key[sort](y);
      const c = typeof kx === "number" ? kx - (ky as number) : kx.localeCompare(ky as string);
      return sign * c || x.code.localeCompare(y.code);
    });
  }

  async get(id: string): Promise<Project> {
    const a = await this.actor();
    return this.view(this.find(this.projects(), id, a), a);
  }

  /* ---------- details ---------- */

  async updateInfo(id: string, input: ProjectInfoInput): Promise<Project> {
    return this.change(id, { admin: true }, (p) => {
      const issues: string[] = [];
      if (!input.name.trim()) issues.push("Enter the project name.");
      if (input.steelMt !== null && input.steelMt < 0) issues.push("Steel weight can't be negative.");
      if ((input.lat === null) !== (input.lng === null)) issues.push("Enter both latitude and longitude, or neither.");
      if (input.lat !== null && (input.lat < -90 || input.lat > 90 || input.lng! < -180 || input.lng! > 180)) issues.push("The map pin is out of range.");
      if (!input.startDate) issues.push("Enter the start date.");
      if (issues.length) throw new ValidationError(issues);
      const n = (v: number | null) => (v === null ? "" : String(v));
      const fields: [string, (x: ProjectInfoInput) => string][] = [
        ["Project name", (x) => x.name.trim()],
        ["Site location", (x) => x.siteLocation.trim()],
        ["Site address", (x) => x.siteAddress.trim()],
        ["Map pin", (x) => (x.lat === null ? "" : `${x.lat}, ${x.lng}`)],
        ["Building type", (x) => (x.buildingType === "other" ? x.buildingTypeOther : labelOf(BUILDING_TYPES, x.buildingType))],
        ["Scope", (x) => (x.scope === "other" ? x.scopeOther : labelOf(SCOPES, x.scope))],
        ["Building size", (x) => [n(x.size.length), n(x.size.width), n(x.size.eaveHeight)].join(" × ") + (x.size.areaSqft ? `, ${x.size.areaSqft} sq ft` : "")],
        ["Total steel weight (MT)", (x) => n(x.steelMt)],
        ["PO / LOI number", (x) => x.poNumber.trim()],
        ["PO / LOI date", (x) => x.poDate],
        ["Start date", (x) => x.startDate],
        ["Project manager", (x) => x.projectManagerId],
        ["Point of contact", (x) => x.contactId],
      ];
      const before: ProjectInfoInput = p;
      const changes = fields.map(([f, get]) => ({ f, from: get(before), to: get(input) })).filter((c) => c.from !== c.to);
      const next: Project = { ...p, ...input, name: input.name.trim(), siteLocation: input.siteLocation.trim(), siteAddress: input.siteAddress.trim(), poNumber: input.poNumber.trim() };
      // The new project manager joins the team automatically.
      if (input.projectManagerId && input.projectManagerId !== p.projectManagerId && !onTeam({ projectManagerId: "", team: p.team }, input.projectManagerId, this.today()))
        next.team = [...p.team, { id: newId("tm"), employeeId: input.projectManagerId, role: "pm", from: this.today(), to: "" }];
      const people = new Map(this.o.people.employees().map((e) => [e.id, e.fullName]));
      const show = (f: string, v: string) => (f === "Project manager" ? people.get(v) ?? v : f.endsWith("date") || f === "Start date" ? fmtDate(v) : v || "empty");
      return {
        project: next,
        events: changes.map((c) => ({
          type: "detail" as const,
          text: c.f === "Point of contact" ? "Point of contact changed" : `${c.f} changed: ${show(c.f, c.from)} → ${show(c.f, c.to)}`,
          source: { kind: "section" as const, id: "info" },
        })),
      };
    });
  }

  async setPlannedCompletion(id: string, date: string, reason: string): Promise<Project> {
    return this.change(id, { admin: true }, (p) => {
      if (!date) throw new ValidationError(["Enter the planned completion date."]);
      if (p.startDate && date < p.startDate) throw new ValidationError(["Planned completion can't be before the start date."]);
      if (date === p.plannedCompletion) return { project: p };
      const first = !p.plannedCompletionBaseline;
      if (!first && !reason.trim()) throw new ValidationError(["Give a reason for changing the planned completion date."]);
      return {
        project: { ...p, plannedCompletion: date, plannedCompletionBaseline: p.plannedCompletionBaseline || date },
        events: [
          {
            type: "detail",
            text: first ? `Planned completion set to ${fmtDate(date)} (baseline)` : `Planned completion changed ${fmtDate(p.plannedCompletion)} → ${fmtDate(date)}, reason: ${reason.trim()}`,
            source: { kind: "section", id: "info" },
          },
        ],
      };
    });
  }

  async setStatus(id: string, status: ProjectStatus, reason: string): Promise<Project> {
    return this.change(id, { admin: true, allowClosed: true }, (p, a) => {
      if (status === p.status) return { project: p };
      if ((status === "on_hold" || status === "cancelled") && !reason.trim()) throw new ValidationError([`Give a reason for putting the project ${status === "on_hold" ? "on hold" : "as cancelled"}.`]);
      const handover = p.stages.find((s) => s.key === "handover")!;
      if (status === "completed" && !handover.notApplicable && stagePct(handover) < 99.999)
        throw new ValidationError(["A project can be marked Completed only when Handover has reached 100%."]);
      const next: Project = {
        ...p,
        status,
        statusReason: reason.trim() ? { reason: reason.trim(), at: this.iso(), by: a.id } : null,
        actualCompletion: status === "completed" ? this.today() : status === "active" || status === "on_hold" ? "" : p.actualCompletion,
      };
      return {
        project: next,
        events: [{ type: "detail", text: `Status changed ${statusLabel(p.status)} → ${statusLabel(status)}${reason.trim() ? `, reason: ${reason.trim()}` : ""}`, source: { kind: "section", id: "info" } }],
      };
    });
  }

  async resolveEnquiryWarning(id: string, keep: boolean, reason: string): Promise<Project> {
    if (keep)
      return this.change(id, { admin: true, allowClosed: true }, (p) => ({
        project: { ...p, enquiryWarning: "kept" },
        events: [{ type: "detail", text: `Admin kept the project although the enquiry is no longer Finalised${reason.trim() ? `: ${reason.trim()}` : ""}.` }],
      }));
    await this.setStatus(id, "cancelled", reason || "Linked enquiry is no longer Finalised");
    return this.change(id, { admin: true, allowClosed: true }, (p) => ({ project: { ...p, enquiryWarning: "kept" } }));
  }

  async saveTeam(id: string, team: TeamMember[]): Promise<Project> {
    return this.change(id, { admin: true }, (p) => {
      const issues: string[] = [];
      team.forEach((m) => {
        if (!m.employeeId) issues.push("Choose the employee for every team row.");
        if (!m.role) issues.push("Choose a project role for every team member.");
        if (m.from && m.to && m.to < m.from) issues.push("A team member's 'to' date can't be before the 'from' date.");
      });
      if (issues.length) throw new ValidationError([...new Set(issues)]);
      const names = new Map(this.o.people.employees().map((e) => [e.id, e.fullName]));
      const before = new Map(p.team.map((m) => [m.id, m]));
      const events: EventInput[] = [];
      const clean = team.map((m) => ({ ...m, id: m.id || newId("tm") }));
      for (const m of clean) {
        const old = before.get(m.id);
        if (!old) events.push({ type: "detail", text: `${names.get(m.employeeId) ?? m.employeeId} added to the team as ${this.o.settings.label("projectRoles", m.role)}` });
        else if (old.to !== m.to && m.to) events.push({ type: "detail", text: `${names.get(m.employeeId) ?? m.employeeId} leaves the team on ${fmtDate(m.to)}` });
        else if (old.role !== m.role || old.employeeId !== m.employeeId || old.from !== m.from || old.to !== m.to)
          events.push({ type: "detail", text: `Team member ${names.get(m.employeeId) ?? m.employeeId} updated` });
      }
      for (const old of p.team) if (!clean.some((m) => m.id === old.id)) events.push({ type: "detail", text: `${names.get(old.employeeId) ?? old.employeeId} removed from the team` });
      // Task assignment notifications for newly added people are not needed: they get them when assigned.
      return { project: { ...p, team: clean }, events: events.map((e) => ({ ...e, source: { kind: "section", id: "people" } })) };
    });
  }

  async saveContacts(id: string, contacts: ProjectContact[]): Promise<Project> {
    return this.change(id, { admin: true }, (p) => {
      if (contacts.some((c) => !c.name.trim())) throw new ValidationError(["Every contact needs a name."]);
      const added = contacts.filter((c) => !c.id || !p.extraContacts.some((x) => x.id === c.id));
      return {
        project: { ...p, extraContacts: contacts.map((c) => ({ ...c, id: c.id || newId("pc"), name: c.name.trim() })) },
        events: added.length ? [{ type: "detail", text: `Client contact added: ${added.map((c) => c.name.trim()).join(", ")}`, source: { kind: "section", id: "client" } }] : [{ type: "detail", text: "Client contacts updated", source: { kind: "section", id: "client" } }],
      };
    });
  }

  async saveParties(id: string, parties: ExternalParty[]): Promise<Project> {
    return this.change(id, { admin: true }, (p) => {
      if (parties.some((x) => !x.type || !x.company.trim())) throw new ValidationError(["Every external party needs a type and a company."]);
      const added = parties.filter((x) => !x.id || !p.externalParties.some((y) => y.id === x.id));
      return {
        project: { ...p, externalParties: parties.map((x) => ({ ...x, id: x.id || newId("xp"), company: x.company.trim() })) },
        events: [
          {
            type: "detail",
            text: added.length ? `External party added: ${added.map((x) => `${x.company.trim()} (${this.o.settings.label("partyTypes", x.type)})`).join(", ")}` : "External parties updated",
            source: { kind: "section", id: "people" },
          },
        ],
      };
    });
  }

  /**
   * Uploads a file document. Admin always; the project manager and site engineers on the team while the project is
   * active or on hold. `replaces` marks an older document of the same type as superseded (kept as an older version).
   */
  async addDocument(id: string, doc: NewProjectDocument, opts: { replaces?: string } = {}): Promise<Project> {
    return this.change(id, { allowClosed: true }, (p, a) => {
      if (a.role !== "admin") {
        if (!isSiteManager(p, a.id, this.today()))
          throw new ProjectForbiddenError("Only Admin, the project manager and site engineers on the team can upload documents.");
        if (p.status === "completed" || p.status === "cancelled")
          throw new ValidationError([`This project is ${statusLabel(p.status).toLowerCase()}; only Admin can add documents now.`]);
      }
      const type = this.o.settings.read().lists.documentTypes.find((t) => t.value === doc.slot);
      if (!type || type.archived) throw new ValidationError(["Choose a document type from the list (Settings → Lists → Document types)."]);
      const ext = doc.name.split(".").pop()?.toLowerCase() ?? "";
      if (!PROJECT_DOC_EXTENSIONS.includes(ext)) throw new ValidationError([`“${doc.name}”: only PDF, photos (JPG, PNG, WebP, HEIC) and CAD drawings (DWG, DXF) can be added.`]);
      if (doc.size > MAX_DOC_BYTES) throw new ValidationError([`“${doc.name}” is larger than 10 MB.`]);
      const revision = doc.revision?.trim() || undefined;
      const newDoc: ProjectDocument = {
        id: newId("pdoc"),
        slot: doc.slot,
        kind: "file",
        source: "upload",
        fileId: doc.fileId,
        name: doc.name,
        type: doc.type,
        size: doc.size,
        ...(revision ? { revision } : {}),
        supersededBy: null,
        uploadedAt: this.iso(),
        uploadedBy: a.id,
      };
      const replaced = opts.replaces ? p.documents.find((d) => d.id === opts.replaces) : undefined;
      if (opts.replaces && (!replaced || replaced.slot !== doc.slot || replaced.supersededBy))
        throw new ValidationError(["The document to replace must be a current document of the same type."]);
      const label = this.o.settings.label("documentTypes", doc.slot);
      return {
        project: { ...p, documents: [...p.documents.map((d) => (d.id === replaced?.id ? { ...d, supersededBy: newDoc.id } : d)), newDoc] },
        events: [
          {
            type: "detail",
            text: `Document uploaded: ${label} – ${doc.name}${revision ? ` (${revision})` : ""}${replaced ? `, replaces ${replaced.name}` : ""}`,
            source: { kind: "section", id: "documents" },
          },
        ],
      };
    });
  }

  /** Admin only. Documents the removed one had replaced become current again. */
  async removeDocument(id: string, docId: string): Promise<Project> {
    return this.change(id, { admin: true, allowClosed: true }, (p) => {
      const d = p.documents.find((x) => x.id === docId);
      if (!d) return { project: p };
      return {
        project: {
          ...p,
          documents: p.documents.filter((x) => x.id !== docId).map((x) => (x.supersededBy === docId ? { ...x, supersededBy: d.supersededBy ?? null } : x)),
        },
        events: [{ type: "detail", text: `Document removed: ${d.name}`, source: { kind: "section", id: "documents" } }],
      };
    });
  }

  async setAttendanceSettings(id: string, s: { enabled: boolean; reminderTime: string }): Promise<Project> {
    return this.change(id, { admin: true }, (p) => {
      if (s.reminderTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(s.reminderTime)) throw new ValidationError(["Enter the reminder time as HH:MM."]);
      const cur = attendanceOf(p);
      const next = { enabled: s.enabled, reminderTime: s.reminderTime, enabledFrom: s.enabled && !cur.enabled ? this.today() : cur.enabledFrom };
      const changes: string[] = [];
      if (cur.enabled !== s.enabled) changes.push(`Site attendance switched ${s.enabled ? "on" : "off"}`);
      if (cur.reminderTime !== s.reminderTime) changes.push(`Attendance reminder time ${s.reminderTime || "set to the default"}`);
      return { project: { ...p, attendance: next }, events: changes.map((text) => ({ type: "attendance" as const, text })) };
    });
  }

  async fillSteelTotals(id: string): Promise<number> {
    let filled = 0;
    await this.change(id, { admin: true }, (p) => {
      if (!p.steelMt) throw new ValidationError(["Enter the total steel weight first."]);
      const stages = p.stages.map((s) => ({
        ...s,
        tasks: s.tasks.map((t) => {
          if (t.measure !== "quantity" || t.unit !== "MT" || t.total) return t;
          filled++;
          return { ...t, total: p.steelMt };
        }),
      }));
      return { project: { ...p, stages }, events: filled ? [{ type: "task", text: `Totals of ${filled} MT tasks set to ${p.steelMt} MT (total steel weight)` }] : [] };
    });
    return filled;
  }

  /* ---------- money ---------- */

  private money(p: Project) {
    if (!p.money) throw new ValidationError(["Money details are not available."]);
    return p.money;
  }

  async setValue(id: string, valueBasic: number, gstRate: number): Promise<Project> {
    return this.change(id, { admin: true }, (p) => {
      const m = this.money(p);
      if (!(valueBasic >= 0)) throw new ValidationError(["Enter the project value."]);
      if (!(gstRate >= 0 && gstRate <= 28)) throw new ValidationError(["Enter a GST rate between 0 and 28%."]);
      const valueWithGst = Math.round(valueBasic * (1 + gstRate / 100));
      return {
        project: { ...p, money: { ...m, valueBasic, gstRate, valueWithGst } },
        events: [{ type: "detail", adminOnly: true, text: `Project value changed ${rupees(m.valueBasic)} → ${rupees(valueBasic)} before GST (GST ${gstRate}%)`, source: { kind: "section", id: "money" } }],
      };
    });
  }

  async addVariation(id: string, v: Pick<Variation, "date" | "description" | "amount" | "approvedBy">): Promise<Project> {
    return this.change(id, { admin: true }, (p, a) => {
      const m = this.money(p);
      const issues: string[] = [];
      if (!v.date) issues.push("Enter the date.");
      if (!v.description.trim()) issues.push("Describe the variation.");
      if (!v.amount) issues.push("Enter the amount (use a minus sign for a reduction).");
      if (!v.approvedBy.trim()) issues.push("Enter who approved it.");
      if (issues.length) throw new ValidationError(issues);
      const row: Variation = { ...v, description: v.description.trim(), approvedBy: v.approvedBy.trim(), id: newId("var"), createdBy: a.id, createdAt: this.iso() };
      return {
        project: { ...p, money: { ...m, variations: [...m.variations, row] } },
        events: [{ type: "detail", adminOnly: true, text: `Variation ${v.amount > 0 ? "+" : "−"}${rupees(Math.abs(v.amount))}: ${row.description} (approved by ${row.approvedBy})`, source: { kind: "variation", id: row.id } }],
      };
    });
  }

  async removeVariation(id: string, variationId: string): Promise<Project> {
    return this.change(id, { admin: true }, (p) => {
      const m = this.money(p);
      const v = m.variations.find((x) => x.id === variationId);
      if (!v) return { project: p };
      return {
        project: { ...p, money: { ...m, variations: m.variations.filter((x) => x.id !== variationId) } },
        events: [{ type: "detail", adminOnly: true, text: `Variation removed: ${v.description} (${rupees(v.amount)})`, source: { kind: "section", id: "money" } }],
      };
    });
  }

  async saveMilestones(id: string, milestones: Milestone[]): Promise<Project> {
    return this.change(id, { admin: true }, (p) => {
      const m = this.money(p);
      if (milestones.some((x) => !x.name.trim())) throw new ValidationError(["Every milestone needs a name."]);
      if (milestones.some((x) => !(x.amount >= 0))) throw new ValidationError(["Milestone amounts can't be negative."]);
      const clean = milestones.map((x) => ({ ...x, id: x.id || newId("ms"), name: x.name.trim() }));
      const removed = m.milestones.filter((x) => !clean.some((y) => y.id === x.id)).map((x) => x.id);
      return {
        // Payments against a removed milestone stay, without a milestone.
        project: { ...p, money: { ...m, milestones: clean, payments: m.payments.map((x) => (removed.includes(x.milestoneId) ? { ...x, milestoneId: "" } : x)) } },
        events: [{ type: "detail", adminOnly: true, text: "Payment milestones updated", source: { kind: "section", id: "money" } }],
      };
    });
  }

  async addPayment(id: string, pay: Pick<Payment, "date" | "amount" | "mode" | "reference" | "milestoneId">): Promise<Project> {
    return this.change(id, { admin: true, allowClosed: true }, (p, a) => {
      const m = this.money(p);
      const issues: string[] = [];
      if (!pay.date) issues.push("Enter the payment date.");
      else if (pay.date > this.today()) issues.push("The payment date can't be in the future.");
      if (!(pay.amount > 0)) issues.push("Enter the amount received.");
      if (!pay.mode) issues.push("Choose the payment mode.");
      if (issues.length) throw new ValidationError(issues);
      const row: Payment = { ...pay, reference: pay.reference.trim(), id: newId("pay"), createdBy: a.id, createdAt: this.iso() };
      const ms = m.milestones.find((x) => x.id === pay.milestoneId);
      return {
        project: { ...p, money: { ...m, payments: [...m.payments, row] } },
        events: [
          {
            type: "payment",
            text: `${rupees(pay.amount)} received${ms ? ` – ${ms.name}` : ""}, ${labelOf(PAYMENT_MODES, pay.mode)}${row.reference ? ` (ref. ${row.reference})` : ""}`,
            source: { kind: "payment", id: row.id },
          },
        ],
      };
    });
  }

  async removePayment(id: string, paymentId: string): Promise<Project> {
    return this.change(id, { admin: true, allowClosed: true }, (p) => {
      const m = this.money(p);
      const pay = m.payments.find((x) => x.id === paymentId);
      if (!pay) return { project: p };
      return {
        project: { ...p, money: { ...m, payments: m.payments.filter((x) => x.id !== paymentId) } },
        events: [{ type: "payment", text: `Payment of ${rupees(pay.amount)} dated ${fmtDate(pay.date)} removed`, source: { kind: "section", id: "money" } }],
      };
    });
  }

  async saveBudget(id: string, budget: Partial<Record<BudgetGroup, number>>): Promise<Project> {
    return this.change(id, { admin: true }, (p) => {
      const m = this.money(p);
      if (Object.values(budget).some((v) => !(v! >= 0))) throw new ValidationError(["Budget amounts can't be negative."]);
      if (Object.keys(budget).some((k) => !BUDGET_GROUPS.some((g) => g.value === k))) throw new ValidationError(["Unknown budget line."]);
      const clean = Object.fromEntries(Object.entries(budget).filter(([, v]) => v! > 0)) as Partial<Record<BudgetGroup, number>>;
      const total = Object.values(clean).reduce((x, v) => x + (v ?? 0), 0);
      return {
        project: { ...p, money: { ...m, budget: clean } },
        events: [{ type: "detail", adminOnly: true, text: `Budget updated, total ${rupees(total)}`, source: { kind: "section", id: "money" } }],
      };
    });
  }

  /* ---------- progress ---------- */

  async setWeights(id: string, weights: Record<StageKey, number>): Promise<Project> {
    return this.change(id, { admin: true }, (p) => {
      const issues = validateWeights(STAGES.map((s) => weights[s.key] ?? 0));
      if (issues.length) throw new ValidationError(issues);
      return {
        project: { ...p, stages: p.stages.map((s) => ({ ...s, weight: weights[s.key] })) },
        events: [{ type: "stage", text: `Stage weights changed to ${STAGES.map((s) => `${s.short} ${weights[s.key]}`).join(", ")}` }],
      };
    });
  }

  async setStageDates(id: string, dates: Partial<Record<StageKey, { start: string; end: string }>>, reason: string): Promise<Project> {
    return this.change(id, { admin: true }, (p, a) => {
      const events: EventInput[] = [];
      const delays: Delay[] = [];
      const stages = p.stages.map((s) => {
        const d = dates[s.key];
        if (!d || (d.start === s.plannedStart && d.end === s.plannedEnd)) return s;
        if (d.start && d.end && d.end < d.start) throw new ValidationError([`${stageMeta(s.key).label}: the end can't be before the start.`]);
        const hadPlan = !!s.plannedEnd;
        if (hadPlan && !reason.trim()) throw new ValidationError(["Give a reason for changing planned stage dates."]);
        events.push({
          type: "stage",
          text: hadPlan
            ? `${stageMeta(s.key).label} planned dates changed (${fmtDate(s.plannedStart)} – ${fmtDate(s.plannedEnd)} → ${fmtDate(d.start)} – ${fmtDate(d.end)}), reason: ${reason.trim()}`
            : `${stageMeta(s.key).label} planned for ${fmtDate(d.start)} – ${fmtDate(d.end)}`,
          source: { kind: "stage", id: s.key, stageKey: s.key },
        });
        if (hadPlan && d.end > s.plannedEnd)
          delays.push({ id: newId("dly"), projectId: p.id, stageKey: s.key, taskId: null, reason: "other", note: `Re-planned: ${reason.trim()}`, plannedEnd: s.plannedEnd, recordedAt: this.iso(), by: a.id });
        return { ...s, plannedStart: d.start, plannedEnd: d.end, baselineStart: s.baselineStart || d.start, baselineEnd: s.baselineEnd || d.end };
      });
      if (delays.length) this.write(DELAYS_KEY, [...this.delays(), ...delays]);
      return { project: { ...p, stages }, events };
    });
  }

  async setStageApplicable(id: string, stage: StageKey, notApplicable: boolean): Promise<Project> {
    return this.change(id, {}, (p) => {
      const s = p.stages.find((x) => x.key === stage)!;
      if (s.notApplicable === notApplicable) return { project: p };
      if (notApplicable && p.stages.filter((x) => !x.notApplicable).length === 1) throw new ValidationError(["At least one stage must stay applicable."]);
      return {
        project: { ...p, stages: p.stages.map((x) => (x.key === stage ? { ...x, notApplicable } : x)) },
        events: [{ type: "stage", text: `${stageMeta(stage).label} marked ${notApplicable ? "Not applicable" : "applicable again"}`, source: { kind: "stage", id: stage, stageKey: stage } }],
      };
    });
  }

  private findTask(p: Project, taskId: string): { stage: Stage; task: Task } {
    for (const stage of p.stages) {
      const task = stage.tasks.find((t) => t.id === taskId);
      if (task) return { stage, task };
    }
    throw new CrmNotFoundError("Task", taskId);
  }

  private assignNotice(p: Project, task: Pick<Task, "id" | "name" | "assignedTo">, actorId: string): NewNotification[] {
    if (!task.assignedTo || task.assignedTo === actorId) return [];
    return [
      {
        userId: task.assignedTo,
        kind: "task_assigned",
        title: `${p.code}: task assigned to you`,
        body: task.name,
        href: `/projects/${p.id}/progress?task=${task.id}`,
        key: `assigned:${task.id}:${task.assignedTo}`,
      },
    ];
  }

  private checkAssignee(p: Project, assignedTo: string) {
    if (assignedTo && !onTeam(p, assignedTo, this.today())) throw new ValidationError(["Tasks can only be assigned to current project team members."]);
  }

  async addTask(id: string, stage: StageKey, input: NewTask): Promise<Project> {
    let notices: NewNotification[] = [];
    const res = await this.change(id, {}, (p, a) => {
      const issues = validateTask(input);
      if (issues.length) throw new ValidationError(issues);
      this.checkAssignee(p, input.assignedTo);
      const task: Task = {
        id: newId("task"),
        name: input.name.trim(),
        templateKey: input.templateKey ?? null,
        measure: input.measure as Task["measure"],
        unit: input.measure === "percent" ? "%" : input.unit.trim(),
        total: input.measure === "percent" ? 100 : input.total,
        completed: 0,
        weight: input.weight ?? 1,
        plannedStart: input.plannedStart,
        plannedEnd: input.plannedEnd,
        assignedTo: input.assignedTo,
        blocked: null,
        createdAt: this.iso(),
        createdBy: a.id,
      };
      if (task.weight !== 1 && a.role !== "admin") throw new ValidationError(["Only admins can change a task's weight."]);
      notices = this.assignNotice(p, task, a.id);
      return {
        project: { ...p, stages: p.stages.map((s) => (s.key === stage ? { ...s, tasks: [...s.tasks, task] } : s)) },
        events: [{ type: "task", text: `Task added to ${stageMeta(stage).label}: ${task.name}${task.total && task.measure === "quantity" ? ` (${task.total} ${task.unit})` : ""}`, source: { kind: "task", id: task.id, stageKey: stage } }],
      };
    });
    this.o.notifications.push(notices);
    return res;
  }

  async updateTask(id: string, taskId: string, input: NewTask, reason = ""): Promise<Project> {
    let notices: NewNotification[] = [];
    const res = await this.change(id, {}, (p, a) => {
      const { stage, task } = this.findTask(p, taskId);
      const issues = validateTask(input);
      if (input.measure !== task.measure && task.completed > 0) issues.push("The measurement type can't change after progress has been posted.");
      if (input.measure === "quantity" && input.total !== null && input.total < task.completed) issues.push(`The total can't be below what is already completed (${task.completed} ${task.unit}).`);
      if (issues.length) throw new ValidationError(issues);
      this.checkAssignee(p, input.assignedTo);
      if ((input.weight ?? 1) !== task.weight && a.role !== "admin") throw new ValidationError(["Only admins can change a task's weight."]);
      const datesMoved = !!task.plannedEnd && input.plannedEnd !== task.plannedEnd;
      if (datesMoved && !reason) throw new ValidationError(["Choose a reason for changing the planned end date."]);
      const next: Task = {
        ...task,
        name: input.name.trim(),
        measure: input.measure as Task["measure"],
        unit: input.measure === "percent" ? "%" : input.unit.trim(),
        total: input.measure === "percent" ? 100 : input.total,
        weight: input.weight ?? 1,
        plannedStart: input.plannedStart,
        plannedEnd: input.plannedEnd,
        assignedTo: input.assignedTo,
      };
      if (next.assignedTo !== task.assignedTo) notices = this.assignNotice(p, next, a.id);
      const changes: string[] = [];
      if (next.name !== task.name) changes.push(`name → ${next.name}`);
      if (next.total !== task.total) changes.push(`total ${task.total ?? "empty"} → ${next.total} ${next.unit}`);
      if (next.weight !== task.weight) changes.push(`weight ${task.weight} → ${next.weight}`);
      if (next.plannedStart !== task.plannedStart || next.plannedEnd !== task.plannedEnd) changes.push(`planned ${fmtDate(next.plannedStart)} – ${fmtDate(next.plannedEnd)}`);
      if (next.assignedTo !== task.assignedTo) changes.push(`assigned to ${this.o.people.employees().find((e) => e.id === next.assignedTo)?.fullName ?? "nobody"}`);
      if (datesMoved && next.plannedEnd > task.plannedEnd)
        this.write(DELAYS_KEY, [...this.delays(), { id: newId("dly"), projectId: p.id, stageKey: stage.key, taskId, reason, note: "Planned end moved", plannedEnd: task.plannedEnd, recordedAt: this.iso(), by: a.id }]);
      return {
        project: { ...p, stages: p.stages.map((s) => (s.key === stage.key ? { ...s, tasks: s.tasks.map((t) => (t.id === taskId ? next : t)) } : s)) },
        events: changes.length
          ? [{ type: "task", text: `Task “${next.name}” edited: ${changes.join("; ")}${datesMoved ? `, delay reason: ${this.o.settings.label("delayReasons", reason)}` : ""}`, source: { kind: "task", id: taskId, stageKey: stage.key } }]
          : [],
      };
    });
    this.o.notifications.push(notices);
    return res;
  }

  async deleteTask(id: string, taskId: string): Promise<Project> {
    return this.change(id, { admin: true }, (p) => {
      const { stage, task } = this.findTask(p, taskId);
      return {
        project: { ...p, stages: p.stages.map((s) => (s.key === stage.key ? { ...s, tasks: s.tasks.filter((t) => t.id !== taskId) } : s)) },
        events: [{ type: "task", text: `Task removed from ${stageMeta(stage.key).label}: ${task.name}${task.completed ? ` (had ${task.completed} ${task.unit} done)` : ""}`, source: { kind: "stage", id: stage.key, stageKey: stage.key } }],
      };
    });
  }

  async setBlocked(id: string, taskId: string, reason: string | null): Promise<Project> {
    return this.change(id, {}, (p, a) => {
      const { stage, task } = this.findTask(p, taskId);
      if (reason !== null && !reason.trim()) throw new ValidationError(["Give the reason the task is blocked."]);
      const blocked = reason === null ? null : { reason: reason.trim(), at: this.iso(), by: a.id };
      return {
        project: { ...p, stages: p.stages.map((s) => (s.key === stage.key ? { ...s, tasks: s.tasks.map((t) => (t.id === taskId ? { ...t, blocked } : t)) } : s)) },
        events: [{ type: "task", text: blocked ? `Task “${task.name}” blocked: ${blocked.reason}` : `Task “${task.name}” unblocked`, source: { kind: "task", id: taskId, stageKey: stage.key } }],
      };
    });
  }

  async addUpdate(id: string, taskId: string, input: NewUpdate): Promise<ProgressUpdate> {
    const a = await this.actor();
    const list = this.projects();
    const p = this.find(list, id, a);
    if (p.status !== "active") throw new ValidationError([`Progress can only be posted on active projects (this one is ${statusLabel(p.status).toLowerCase()}).`]);
    const all = this.updates();
    if (input.id && all.some((u) => u.id === input.id)) return clone(all.find((u) => u.id === input.id)!);
    const { stage, task } = this.findTask(p, taskId);
    if (stage.notApplicable) throw new ValidationError(["This stage is marked Not applicable."]);
    const check = checkUpdate(task, input, { today: this.today(), isAdmin: a.role === "admin" });
    if (check.issues.length) throw new ValidationError(check.issues);
    const before = stagePct(stage);
    const update: ProgressUpdate = {
      id: input.id || newId("upd"),
      projectId: id,
      stageKey: stage.key,
      taskId,
      workDate: input.workDate,
      recordedAt: this.iso(),
      quantity: check.delta,
      runningTotal: check.runningTotal,
      remarks: input.remarks.trim(),
      delayReason: check.needsDelayReason ? input.delayReason : "",
      photos: input.photos,
      by: a.id,
    };
    const nextTask = { ...task, completed: check.runningTotal };
    const nextStage = { ...stage, tasks: stage.tasks.map((t) => (t.id === taskId ? nextTask : t)) };
    const next: Project = { ...p, updatedAt: this.iso(), stages: p.stages.map((s) => (s.key === stage.key ? nextStage : s)) };
    this.saveProjects(list.map((x) => (x.id === id ? next : x)));
    this.write(UPDATES_KEY, [...all, update]);
    if (update.delayReason)
      this.write(DELAYS_KEY, [
        ...this.delays(),
        { id: newId("dly"), projectId: id, stageKey: stage.key, taskId, reason: update.delayReason, note: update.remarks, plannedEnd: task.plannedEnd, recordedAt: update.recordedAt, by: a.id },
      ]);
    const pct = taskPct(nextTask) ?? 0;
    const sign = check.delta > 0 ? "+" : "−";
    const amount = task.measure === "percent" ? `${sign}${Math.abs(check.delta)}%` : `${sign}${Math.abs(check.delta)} ${task.unit}`;
    const of = task.measure === "percent" ? `${Math.round(pct)}%` : `${check.runningTotal} of ${task.total}, ${Math.round(pct)}%`;
    const extra = [
      update.photos.length ? `${update.photos.length} photo${update.photos.length === 1 ? "" : "s"}` : "",
      update.delayReason ? `delay: ${this.o.settings.label("delayReasons", update.delayReason)}` : "",
      check.delta < 0 ? `correction: ${update.remarks}` : "",
      input.workDate !== this.today() ? `work done ${fmtDate(input.workDate)}` : "",
    ].filter(Boolean);
    const events: ProjectEvent[] = [
      this.event(id, a.id, {
        type: "progress",
        text: `${task.name} ${amount} (${of})${extra.length ? ` — ${extra.join(", ")}` : ""}`,
        files: update.photos,
        source: { kind: "update", id: update.id, stageKey: stage.key },
      }),
    ];
    if (before < 99.999 && stagePct(nextStage) >= 99.999)
      events.push(this.event(id, a.id, { type: "stage", text: `${stageMeta(stage.key).label} reached 100%`, source: { kind: "stage", id: stage.key, stageKey: stage.key } }));
    this.log(events);
    return clone(update);
  }

  async listUpdates(id: string, taskId?: string): Promise<ProgressUpdate[]> {
    const a = await this.actor();
    this.find(this.projects(), id, a);
    return this.updates()
      .filter((u) => u.projectId === id && (!taskId || u.taskId === taskId))
      .sort((x, y) => y.workDate.localeCompare(x.workDate) || y.recordedAt.localeCompare(x.recordedAt));
  }

  async recordStageDelay(id: string, stage: StageKey, reason: string, note: string): Promise<Delay> {
    const a = await this.actor();
    const p = this.find(this.projects(), id, a);
    if (!reason) throw new ValidationError(["Choose a delay reason."]);
    const s = p.stages.find((x) => x.key === stage)!;
    const d: Delay = { id: newId("dly"), projectId: id, stageKey: stage, taskId: null, reason, note: note.trim(), plannedEnd: s.plannedEnd, recordedAt: this.iso(), by: a.id };
    this.write(DELAYS_KEY, [...this.delays(), d]);
    this.log([
      this.event(id, a.id, {
        type: "stage",
        text: `Delay recorded on ${stageMeta(stage).label}: ${this.o.settings.label("delayReasons", reason)}${d.note ? ` – ${d.note}` : ""}`,
        source: { kind: "stage", id: stage, stageKey: stage },
      }),
    ]);
    return d;
  }

  async listDelays(id: string): Promise<Delay[]> {
    const a = await this.actor();
    this.find(this.projects(), id, a);
    return this.delays().filter((d) => d.projectId === id);
  }

  /* ---------- timeline ---------- */

  async events(id: string, params: EventListParams = {}): Promise<{ items: ProjectEvent[]; hasMore: boolean }> {
    const a = await this.actor();
    const p = this.find(this.projects(), id, a);
    const { types, tag, by, from, to, before, limit = 30 } = params;
    const manager = a.role === "admin" || isSiteManager(p, a.id, this.today());
    const rows = this.allEvents()
      .filter((e) => e.projectId === id)
      .filter((e) => a.role === "admin" || (!e.adminOnly && (e.audience !== "managers" || manager)))
      .filter((e) => !types?.length || types.includes(e.type))
      .filter((e) => !tag || e.tag === tag)
      .filter((e) => !by || e.by === by)
      .filter((e) => !from || e.at.slice(0, 10) >= from)
      .filter((e) => !to || e.at.slice(0, 10) <= to)
      .filter((e) => !before || e.at < before)
      .sort((x, y) => y.at.localeCompare(x.at));
    return { items: clone(rows.slice(0, limit)), hasMore: rows.length > limit };
  }

  async addNote(id: string, note: NewNote): Promise<ProjectEvent> {
    const a = await this.actor();
    const p = this.find(this.projects(), id, a);
    if (!note.text.trim() && !note.files.length) throw new ValidationError(["Write a note or attach a photo."]);
    const mentions = [...new Set(note.mentions)].filter((m) => m !== a.id);
    for (const m of mentions) if (!onTeam(p, m, this.today())) throw new ValidationError(["You can only mention current project team members."]);
    const e = this.event(id, a.id, { type: "note", text: note.text.trim(), tag: note.tag || "general", mentions, files: note.files, source: { kind: "note", id: "" } });
    e.source = { kind: "note", id: e.id };
    this.log([e]);
    const author = this.o.people.employees().find((x) => x.id === a.id)?.fullName ?? "Someone";
    this.o.notifications.push(
      mentions.map((userId) => ({
        userId,
        kind: "mention" as const,
        title: `${author} mentioned you on ${p.code}`,
        body: note.text.trim().slice(0, 140),
        href: `/projects/${id}/details#timeline`,
        key: `mention:${e.id}`,
      })),
    );
    return clone(e);
  }

  private ownNote(id: string, eventId: string, a: Actor, allowAdmin: boolean) {
    const list = this.allEvents();
    const e = list.find((x) => x.id === eventId && x.projectId === id);
    if (!e) throw new CrmNotFoundError("Note", eventId);
    if (e.automatic) throw new ValidationError(["Automatic entries can't be edited or deleted."]);
    if (e.by !== a.id && !(allowAdmin && a.role === "admin")) throw new ProjectForbiddenError("You can only change your own notes.");
    return { list, e };
  }

  async editNote(id: string, eventId: string, text: string, tag: string): Promise<ProjectEvent> {
    const a = await this.actor();
    this.find(this.projects(), id, a);
    const { list, e } = this.ownNote(id, eventId, a, false);
    if (!text.trim() && !e.files.length) throw new ValidationError(["The note can't be empty."]);
    const next = { ...e, text: text.trim(), tag: tag || e.tag, editedAt: this.iso() };
    this.write(EVENTS_KEY, list.map((x) => (x.id === eventId ? next : x)));
    return clone(next);
  }

  async deleteNote(id: string, eventId: string): Promise<void> {
    const a = await this.actor();
    this.find(this.projects(), id, a);
    const { list } = this.ownNote(id, eventId, a, true);
    this.write(EVENTS_KEY, list.filter((x) => x.id !== eventId));
  }

  /* ---------- my tasks ---------- */

  async myTasks(): Promise<MyTask[]> {
    const a = await this.actor();
    const today = this.today();
    return this.projects()
      .filter((p) => p.status === "active" && this.canSee(p, a))
      .flatMap((p) =>
        p.stages
          .filter((s) => !s.notApplicable)
          .flatMap((s) =>
            s.tasks
              .filter((t) => t.assignedTo === a.id && (taskPct(t) ?? 0) < 99.999)
              .map((t) => ({ projectId: p.id, projectCode: p.code, projectName: p.name, stageKey: s.key, task: clone(t), behind: taskBehind(t, today) })),
          ),
      )
      .sort((x, y) => Number(y.behind) - Number(x.behind) || (x.task.plannedEnd || "9999").localeCompare(y.task.plannedEnd || "9999"));
  }

  async resetDemoData(): Promise<void> {
    for (const k of [PROJECTS_KEY, UPDATES_KEY, EVENTS_KEY, DELAYS_KEY, COUNTERS_KEY]) this.storage().removeItem(k);
    this.projects();
  }
}
