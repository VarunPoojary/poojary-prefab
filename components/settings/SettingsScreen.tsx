"use client";

import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { useState } from "react";
import { ErrorList, PageContainer, PageHeader } from "@/components/crm/ui";
import { useToast } from "@/components/Providers";
import { Button, Card } from "@/components/ui/fields";
import { Icon, STAGE_ICONS } from "@/components/ui/icons";
import { LIST_LABELS, STAGES, type ListKey } from "@/lib/projects/config";
import type { ListItem, Measure, StageKey, TemplateTask } from "@/lib/projects/types";
import { useUsers } from "@/lib/crm/hooks";
import { useSaveAttendanceSettings, useSaveList, useSavePayrollSettings, useSaveTemplates, useSettings } from "@/lib/settings/hooks";
import type { AttendanceSettings, PayrollSettings } from "@/lib/settings/types";

const issuesOf = (e: unknown) => (e && typeof e === "object" && "issues" in e ? (e as { issues: string[] }).issues : [e instanceof Error ? e.message : String(e)]);
const input = "w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-red-600 focus:ring-2 focus:ring-red-100";

function move<T>(arr: T[], i: number, d: number) {
  const j = i + d;
  if (j < 0 || j >= arr.length) return arr;
  const next = [...arr];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

function TemplateEditor({ stage, initial, units }: { stage: StageKey; initial: TemplateTask[]; units: ListItem[] }) {
  const toast = useToast();
  const save = useSaveTemplates();
  const [rows, setRows] = useState(initial);
  const [issues, setIssues] = useState<string[]>([]);
  const meta = STAGES.find((s) => s.key === stage)!;
  const dirty = JSON.stringify(rows) !== JSON.stringify(initial);
  const set = (i: number, patch: Partial<TemplateTask>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  return (
    <Card title={<span className="flex items-center gap-2"><Icon icon={STAGE_ICONS[meta.key]} className="text-slate-500" />{meta.label}</span>} description={`Default weight ${meta.weight}%`} className="h-fit">
      <ul className="space-y-2" data-testid={`template-${stage}`}>
        {rows.map((t, i) => (
          <li key={t.key || i} className="flex flex-wrap items-center gap-2">
            <input aria-label={`Task name ${i + 1}`} value={t.name} onChange={(e) => set(i, { name: e.target.value })} className={`${input} min-w-[12rem] flex-[3]`} />
            <select aria-label={`Measure ${i + 1}`} value={t.measure} onChange={(e) => set(i, { measure: e.target.value as Measure, unit: e.target.value === "percent" ? "%" : t.unit === "%" ? "" : t.unit })} className={`${input} w-28 flex-none`}>
              <option value="quantity">Quantity</option>
              <option value="percent">Percent</option>
            </select>
            {t.measure === "quantity" ? (
              <select aria-label={`Unit ${i + 1}`} value={t.unit} onChange={(e) => set(i, { unit: e.target.value })} className={`${input} w-28 flex-none`}>
                <option value="">Unit…</option>
                {units.map((u) => (
                  <option key={u.value} value={u.value}>
                    {u.label}
                  </option>
                ))}
                {t.unit && !units.some((u) => u.value === t.unit) ? <option value={t.unit}>{t.unit}</option> : null}
              </select>
            ) : (
              <span className="w-28 flex-none text-center text-xs text-slate-500">%</span>
            )}
            <span className="flex flex-none gap-0.5">
              <button type="button" aria-label="Move up" className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100" onClick={() => setRows(move(rows, i, -1))}>
                <Icon icon={ArrowUp} size={16} />
              </button>
              <button type="button" aria-label="Move down" className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100" onClick={() => setRows(move(rows, i, 1))}>
                <Icon icon={ArrowDown} size={16} />
              </button>
              <button type="button" aria-label={`Remove ${t.name}`} className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-red-50 hover:text-red-700" onClick={() => setRows(rows.filter((_, j) => j !== i))}>
                <Icon icon={X} size={16} />
              </button>
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <Button size="sm" onClick={() => setRows([...rows, { key: "", name: "", measure: "quantity", unit: "Nos" }])}>
          <Icon icon={Plus} size={14} className="inline-block align-[-2px]" /> Add task
        </Button>
        {dirty ? (
          <span className="flex gap-2">
            <Button size="sm" onClick={() => setRows(initial)}>
              Undo
            </Button>
            <Button
              size="sm"
              variant="primary"
              disabled={save.isPending}
              onClick={() =>
                save.mutate(
                  { stage, tasks: rows },
                  { onSuccess: (s) => (setRows(s.templates[stage]), setIssues([]), toast(`${meta.label} template saved`)), onError: (e) => setIssues(issuesOf(e)) },
                )
              }
            >
              Save
            </Button>
          </span>
        ) : null}
      </div>
      <ErrorList issues={issues} />
    </Card>
  );
}

function ListEditor({ listKey, initial }: { listKey: ListKey; initial: ListItem[] }) {
  const toast = useToast();
  const save = useSaveList();
  const [rows, setRows] = useState(initial);
  const [issues, setIssues] = useState<string[]>([]);
  const dirty = JSON.stringify(rows) !== JSON.stringify(initial);
  const meta = LIST_LABELS[listKey];
  return (
    <Card title={meta.title} description={meta.hint} className="h-fit">
      <ul className="space-y-1.5" data-testid={`list-${listKey}`}>
        {rows.map((it, i) => (
          <li key={it.value || i} className="flex items-center gap-2">
            <input
              aria-label={`${meta.title} ${i + 1}`}
              value={it.label}
              disabled={it.archived}
              onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
              className={`${input} flex-1 ${it.archived ? "text-slate-400 line-through" : ""}`}
            />
            <button type="button" aria-label="Move up" className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100" onClick={() => setRows(move(rows, i, -1))}>
              <Icon icon={ArrowUp} size={16} />
            </button>
            {it.value && initial.some((x) => x.value === it.value) ? (
              <button
                type="button"
                className="h-9 w-16 rounded-lg px-1.5 text-xs text-slate-500 transition-colors hover:bg-slate-100"
                onClick={() => setRows(rows.map((x, j) => (j === i ? { ...x, archived: !x.archived } : x)))}
                title={it.archived ? "Use this value again" : "Hide from new entries; old records keep it"}
              >
                {it.archived ? "Restore" : "Archive"}
              </button>
            ) : (
              <button type="button" className="h-9 w-16 rounded-lg px-1.5 text-xs text-slate-400 transition-colors hover:bg-red-50 hover:text-red-700" onClick={() => setRows(rows.filter((_, j) => j !== i))}>
                Remove
              </button>
            )}
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <Button size="sm" onClick={() => setRows([...rows, { value: "", label: "" }])}>
          <Icon icon={Plus} size={14} className="inline-block align-[-2px]" /> Add
        </Button>
        {dirty ? (
          <span className="flex gap-2">
            <Button size="sm" onClick={() => setRows(initial)}>
              Undo
            </Button>
            <Button
              size="sm"
              variant="primary"
              disabled={save.isPending}
              onClick={() => save.mutate({ key: listKey, items: rows }, { onSuccess: (s) => (setRows(s.lists[listKey]), setIssues([]), toast(`${meta.title} saved`)), onError: (e) => setIssues(issuesOf(e)) })}
            >
              Save
            </Button>
          </span>
        ) : null}
      </div>
      <ErrorList issues={issues} />
    </Card>
  );
}

function SupervisorPicker({ label, hint, value, onChange }: { label: string; hint: string; value: string[]; onChange: (v: string[]) => void }) {
  const { data: users = [] } = useUsers();
  const candidates = users.filter((u) => u.assignable || value.includes(u.id));
  return (
    <fieldset>
      <legend className="text-sm font-semibold text-slate-800">{label}</legend>
      <p className="mb-2 text-xs text-slate-500">{hint}</p>
      <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
        {candidates.map((u) => (
          <label key={u.id} className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="accent-red-700" checked={value.includes(u.id)} onChange={(e) => onChange(e.target.checked ? [...value, u.id] : value.filter((x) => x !== u.id))} />
            {u.name} <span className="text-xs text-slate-500">{u.designation}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function AttendanceSettingsEditor({ initial }: { initial: AttendanceSettings }) {
  const toast = useToast();
  const save = useSaveAttendanceSettings();
  const [f, setF] = useState(initial);
  const [issues, setIssues] = useState<string[]>([]);
  const dirty = JSON.stringify(f) !== JSON.stringify(initial);
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card title="Site attendance reminder" description="Site managers of active projects get a reminder at this time if the day isn't logged; a second one goes out at 10:00 the next morning, also to admins. Projects can set their own time.">
        <label className="text-sm">
          <span className="mb-1 block text-xs font-semibold text-slate-600">Default reminder time</span>
          <input type="time" aria-label="Default reminder time" value={f.reminderTime} onChange={(e) => setF({ ...f, reminderTime: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </label>
      </Card>
      <Card title="Factory and office supervisors" description="They mark attendance at their location on the Attendance page (today and the last 7 days). Only employees with an active login can be chosen.">
        <div className="space-y-4">
          <SupervisorPicker label="Factory" hint="Mark factory staff (and anyone working at the factory that day)." value={f.supervisors.factory} onChange={(factory) => setF({ ...f, supervisors: { ...f.supervisors, factory } })} />
          <SupervisorPicker label="Office" hint="Mark office staff." value={f.supervisors.office} onChange={(office) => setF({ ...f, supervisors: { ...f.supervisors, office } })} />
        </div>
      </Card>
      <div className="lg:col-span-2">
        <ErrorList issues={issues} />
        <div className="flex justify-end gap-2">
          <Button disabled={!dirty} onClick={() => setF(initial)}>
            Undo
          </Button>
          <Button variant="primary" disabled={!dirty || save.isPending} onClick={() => save.mutate(f, { onSuccess: () => (setIssues([]), toast("Attendance settings saved")), onError: (e) => setIssues(issuesOf(e)) })}>
            Save
          </Button>
        </div>
      </div>
      <p className="text-xs text-slate-500 lg:col-span-2">The list of trades for casual workers is under Lists.</p>
    </div>
  );
}

function PayrollSettingsEditor({ initial }: { initial: PayrollSettings }) {
  const toast = useToast();
  const save = useSavePayrollSettings();
  const [month, setMonth] = useState(initial.startMonth);
  const [issues, setIssues] = useState<string[]>([]);
  return (
    <Card title="Payroll" description="Months before this are not in payroll (no Not logged warnings, nothing to close). Empty = the month of the first attendance record." className="max-w-xl">
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-sm">
          <span className="mb-1 block text-xs font-semibold text-slate-600">Payroll starts from</span>
          <input type="month" aria-label="Payroll starts from" value={month} onChange={(e) => setMonth(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </label>
        <Button variant="primary" disabled={month === initial.startMonth || save.isPending} onClick={() => save.mutate({ startMonth: month }, { onSuccess: () => (setIssues([]), toast("Payroll settings saved")), onError: (e) => setIssues(issuesOf(e)) })}>
          Save
        </Button>
      </div>
      <ul className="mt-4 list-disc space-y-1 pl-5 text-xs text-slate-600">
        <li>Salary = monthly salary ÷ 30 × (30 − loss-of-pay days), rounded once to the rupee. Holidays are paid.</li>
        <li>Advance recovery is at most 50 % of the month&apos;s gross (Code on Wages); the rest carries forward.</li>
        <li>Daily-wage employees are not in payroll. PF, ESI, PT and TDS are not calculated.</li>
      </ul>
      <ErrorList issues={issues} />
    </Card>
  );
}

/** Admin settings: project task templates and the dropdown lists used across projects. */
export function SettingsScreen() {
  const { data, isPending } = useSettings();
  const [tab, setTab] = useState<"templates" | "lists" | "attendance" | "payroll">("templates");
  return (
    <PageContainer wide>
      <PageHeader title="Settings" subtitle="Changes apply to new data only; existing projects keep what they have." />
      <div className="mb-4 flex flex-wrap gap-2" role="tablist">
        {(
          [
            ["templates", "Project task templates"],
            ["lists", "Lists"],
            ["attendance", "Attendance"],
            ["payroll", "Payroll"],
          ] as const
        ).map(([k, l]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium ${tab === k ? "bg-red-700 text-white" : "bg-white text-slate-700 ring-1 ring-slate-300"}`}
          >
            {l}
          </button>
        ))}
      </div>
      {isPending || !data ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : tab === "payroll" ? (
        <PayrollSettingsEditor key={data.updatedAt} initial={data.payroll} />
      ) : tab === "attendance" ? (
        <AttendanceSettingsEditor key={data.updatedAt} initial={data.attendance} />
      ) : tab === "templates" ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {STAGES.map((s) => (
            <TemplateEditor key={s.key} stage={s.key} initial={data.templates[s.key]} units={data.lists.units.filter((u) => !u.archived)} />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {(Object.keys(LIST_LABELS) as ListKey[]).map((k) => (
            <ListEditor key={k} listKey={k} initial={data.lists[k]} />
          ))}
        </div>
      )}
    </PageContainer>
  );
}
