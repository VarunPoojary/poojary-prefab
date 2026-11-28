import { ValidationError } from "@/lib/crm/types";
import { ADMIN_ROLE, normaliseRoles, PAGE_KEYS, roleIdFor, type RoleDef } from "@/lib/auth/roles";
import type { Role } from "@/lib/auth/types";
import { ProjectForbiddenError, type ListItem, type StageKey, type TemplateTask } from "@/lib/projects/types";
import { SettingsStore } from "./store";
import type { ListKey } from "@/lib/projects/config";
import type { AppSettings, AttendanceSettings, PayrollSettings, SettingsRepository } from "./types";

const slug = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "") || "item";

/** Gives new items a unique value and checks labels. */
export function normaliseList(items: ListItem[]): ListItem[] {
  const seen = new Set<string>();
  const labels = new Set<string>();
  return items.map((i) => {
    const label = i.label.trim().replace(/\s+/g, " ");
    if (!label) throw new ValidationError(["Every entry needs a name."]);
    if (!i.archived) {
      if (labels.has(label.toLowerCase())) throw new ValidationError([`“${label}” is in the list twice.`]);
      labels.add(label.toLowerCase());
    }
    let value = i.value || slug(label);
    while (seen.has(value)) value = `${value}_2`;
    seen.add(value);
    return { value, label, ...(i.archived ? { archived: true } : {}) };
  });
}

/** TEMPORARY settings store in localStorage. Replace with an API version when the cloud database is ready. */
export class LocalSettingsRepository implements SettingsRepository {
  readonly label = "This browser (temporary)";
  constructor(
    private readonly store: SettingsStore,
    private readonly getRole: () => Promise<Role | null>,
    /** Role ids currently given to a login (a role in use can't be deleted). */
    private readonly rolesInUse: () => Map<string, number> = () => new Map(),
  ) {}

  private async admin() {
    if ((await this.getRole()) !== "admin") throw new ProjectForbiddenError("Only admins can change settings.");
  }

  async get(): Promise<AppSettings> {
    return this.store.read();
  }

  async saveTemplates(stage: StageKey, tasks: TemplateTask[]): Promise<AppSettings> {
    await this.admin();
    const keys = new Set<string>();
    const clean = tasks.map((t) => {
      const name = t.name.trim();
      if (!name) throw new ValidationError(["Every task needs a name."]);
      if (t.measure === "quantity" && !t.unit.trim()) throw new ValidationError([`Choose a unit for “${name}”.`]);
      let key = t.key || slug(name);
      while (keys.has(key)) key = `${key}_2`;
      keys.add(key);
      return { key, name, measure: t.measure, unit: t.measure === "percent" ? "%" : t.unit.trim() };
    });
    const s = this.store.read();
    const next = { ...s, templates: { ...s.templates, [stage]: clean }, updatedAt: new Date().toISOString() };
    this.store.write(next);
    return next;
  }

  async saveList(key: ListKey, items: ListItem[]): Promise<AppSettings> {
    await this.admin();
    const clean = normaliseList(items);
    if (!clean.some((i) => !i.archived)) throw new ValidationError(["Keep at least one active entry."]);
    const s = this.store.read();
    const next = { ...s, lists: { ...s.lists, [key]: clean }, updatedAt: new Date().toISOString() };
    this.store.write(next);
    return next;
  }

  async saveAttendance(a: AttendanceSettings): Promise<AppSettings> {
    await this.admin();
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(a.reminderTime)) throw new ValidationError(["Enter the reminder time as HH:MM."]);
    const uniq = (ids: string[]) => [...new Set(ids.filter(Boolean))];
    const s = this.store.read();
    const next = {
      ...s,
      attendance: { reminderTime: a.reminderTime, supervisors: { factory: uniq(a.supervisors.factory), office: uniq(a.supervisors.office) } },
      updatedAt: new Date().toISOString(),
    };
    this.store.write(next);
    return next;
  }

  async savePayroll(p: PayrollSettings): Promise<AppSettings> {
    await this.admin();
    if (p.startMonth && !/^\d{4}-(0[1-9]|1[0-2])$/.test(p.startMonth)) throw new ValidationError(["Choose the first payroll month."]);
    const s = this.store.read();
    const next = { ...s, payroll: { startMonth: p.startMonth }, updatedAt: new Date().toISOString() };
    this.store.write(next);
    return next;
  }

  async saveRoles(roles: RoleDef[]): Promise<AppSettings> {
    await this.admin();
    const issues: string[] = [];
    const names = new Set<string>();
    const ids = new Set<string>([ADMIN_ROLE]);
    const clean: RoleDef[] = [];
    for (const r of roles) {
      if (r.id === ADMIN_ROLE) continue; // Admin is built in and never changes.
      const name = r.name.trim().replace(/\s+/g, " ");
      if (!name) {
        issues.push("Every role needs a name.");
        continue;
      }
      if (name.toLowerCase() === "admin" || names.has(name.toLowerCase())) issues.push(`There is already a role called “${name}”.`);
      names.add(name.toLowerCase());
      const id = r.id && !ids.has(r.id) ? r.id : roleIdFor(name, ids);
      ids.add(id);
      clean.push({ id, name, pages: PAGE_KEYS.filter((k) => r.pages.includes(k)) });
    }
    const s = this.store.read();
    const kept = new Set(clean.map((r) => r.id));
    for (const [id, count] of this.rolesInUse()) {
      if (id === ADMIN_ROLE || kept.has(id)) continue;
      const was = s.roles.find((r) => r.id === id)?.name ?? id;
      issues.push(`“${was}” is still given to ${count} login${count === 1 ? "" : "s"}. Change their role on the employee page first.`);
    }
    if (issues.length) throw new ValidationError([...new Set(issues)]);
    const next = { ...s, roles: normaliseRoles([{ id: ADMIN_ROLE, name: "Admin", pages: [] }, ...clean]), updatedAt: new Date().toISOString() };
    this.store.write(next);
    return next;
  }

  async resetDemoData() {
    this.store.reset();
  }
}
