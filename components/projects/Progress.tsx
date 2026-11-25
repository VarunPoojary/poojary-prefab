"use client";

import { CalendarDays, EllipsisVertical, Plus, Scale } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { ErrorList, useUserName } from "@/components/crm/ui";
import { PhotoPicker, PhotoThumbs } from "@/components/files/Files";
import { useToast } from "@/components/Providers";
import { Button, Card, NumberField, Select, TextArea, TextField } from "@/components/ui/fields";
import { Icon, STAGE_ICONS } from "@/components/ui/icons";
import { Modal } from "@/components/ui/overlays";
import { useAuth } from "@/lib/auth/AuthProvider";
import type { PhotoRef } from "@/lib/files";
import { formatDate, formatDateTime } from "@/lib/format";
import { projectRepo } from "@/lib/projects";
import { newId } from "@/lib/projects/build";
import { STAGES, stageMeta } from "@/lib/projects/config";
import { useDelays, useProjectMutation, useUpdates } from "@/lib/projects/hooks";
import {
  checkUpdate,
  effectiveWeights,
  onTeam,
  sCurve,
  stageActualDates,
  stageBehind,
  stagePct,
  suggestStageDates,
  taskBehind,
  taskPct,
  taskStatus,
  todayIso,
  validateWeights,
  type TaskStatus,
} from "@/lib/projects/rules";
import type { NewTask, ProgressUpdate, Project, Stage, StageKey, Task } from "@/lib/projects/types";
import { useList, useSettings } from "@/lib/settings/hooks";
import { BehindFlag, ProgressBar, pctText } from "./bits";
import { useManDays } from "@/lib/attendance/hooks";
import { addDays, dayLabel, productivity } from "@/lib/attendance/rules";

const issuesOf = (e: unknown) => (e && typeof e === "object" && "issues" in e ? (e as { issues: string[] }).issues : [e instanceof Error ? e.message : String(e)]);
const fmtNum = (n: number | null) => (n === null ? "–" : Number.isInteger(n) ? n.toLocaleString("en-IN") : n.toLocaleString("en-IN", { maximumFractionDigits: 1 }));

const STATUS_CHIP: Record<TaskStatus, [string, string]> = {
  not_started: ["Not started", "bg-slate-100 text-slate-600"],
  in_progress: ["In progress", "bg-sky-100 text-sky-800"],
  completed: ["Completed", "bg-emerald-100 text-emerald-800"],
  blocked: ["Blocked", "bg-red-100 text-red-800"],
};

/* ---------- progress update ---------- */

/** Short phone-friendly form to post progress on a task. Exported for My tasks. */
export function UpdateDialog({ projectId, task, onClose, onDone }: { projectId: string; task: Task; onClose: () => void; onDone?: () => void }) {
  const toast = useToast();
  const { user } = useAuth();
  const delayReasons = useList("delayReasons");
  const [today] = useState(() => todayIso());
  // Generated once per form so a retried save (e.g. on a weak connection) is not applied twice.
  const [updateId] = useState(() => newId("upd"));
  const [workDate, setWorkDate] = useState(today);
  const [value, setValue] = useState<number | null>(null);
  const [remarks, setRemarks] = useState("");
  const [delayReason, setDelayReason] = useState("");
  const [photos, setPhotos] = useState<PhotoRef[]>([]);
  const [issues, setIssues] = useState<string[]>([]);
  const save = useProjectMutation(() => projectRepo.addUpdate(projectId, task.id, { id: updateId, workDate, value, remarks, delayReason, photos }));
  const input = { workDate, value, remarks, delayReason, photos };
  const check = checkUpdate(task, input, { today, isAdmin: user?.role === "admin" });
  const pct = task.measure === "percent" ? task.completed : taskPct(task);
  const left = task.measure === "percent" ? 100 - task.completed : (task.total ?? 0) - task.completed;

  return (
    <Modal
      open
      onClose={onClose}
      title={`Update: ${task.name}`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={save.isPending}
            onClick={() => {
              if (check.issues.length) return setIssues(check.issues);
              save.mutate(undefined, {
                onSuccess: () => {
                  toast("Progress saved");
                  onDone?.();
                  onClose();
                },
                onError: (e) => setIssues(issuesOf(e)),
              });
            }}
          >
            {save.isPending ? "Saving…" : "Save update"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
          Done so far: <b>{task.measure === "percent" ? `${fmtNum(task.completed)}%` : `${fmtNum(task.completed)} of ${fmtNum(task.total)} ${task.unit}`}</b>
          {pct !== null ? ` (${pctText(pct)})` : ""}
          {task.measure === "quantity" && task.total ? <span className="block text-xs text-slate-500">Left: {fmtNum(left)} {task.unit}</span> : null}
        </div>
        <TextField label="Date the work was done" required type="date" value={workDate} onChange={setWorkDate} hint="Can be an earlier day if you're posting later; never a future date." />
        <div>
          <NumberField
            label={task.measure === "percent" ? "New % reached" : `Quantity done in this update (${task.unit})`}
            required
            suffix={task.measure === "percent" ? "%" : task.unit}
            value={value}
            onChange={setValue}
          />
          {task.measure === "quantity" && value !== null && check.issues.length === 0 ? (
            <p className="mt-1 text-xs text-slate-500">
              New total: {fmtNum(check.runningTotal)} of {fmtNum(task.total)} {task.unit}
            </p>
          ) : null}
          {task.measure === "quantity" && left > 0 ? (
            <button type="button" className="mt-1 text-xs font-medium text-red-700 hover:underline" onClick={() => setValue(Math.round(left * 10) / 10)}>
              All remaining ({fmtNum(left)} {task.unit})
            </button>
          ) : null}
        </div>
        {check.needsDelayReason ? (
          <Select
            label="Delay reason * (past the planned end)"
            value={delayReason}
            onChange={setDelayReason}
            options={[{ value: "", label: "Choose…" }, ...delayReasons.items]}
          />
        ) : null}
        <TextArea label={check.delta < 0 ? "Correction note *" : "Remarks"} rows={2} value={remarks} onChange={setRemarks} />
        <PhotoPicker photos={photos} onChange={setPhotos} label="Add site photos" />
        <ErrorList issues={issues} />
      </div>
    </Modal>
  );
}

function TaskSheet({ project, stage, task, onClose }: { project: Project; stage: Stage; task: Task; onClose: () => void }) {
  const userName = useUserName();
  const delayReasons = useList("delayReasons");
  const { data: updates = [], isPending } = useUpdates(project.id, task.id);
  const { data: md } = useManDays(project.id);
  const [updating, setUpdating] = useState(false);
  const canUpdate = project.status === "active" && !stage.notApplicable;
  const prod = md && task.measure === "quantity" ? productivity(updates, Object.fromEntries(Object.entries(md).map(([d, v]) => [d, v.employees + v.casual]))) : null;
  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={task.name}
      footer={
        <>
          <Button onClick={onClose}>Close</Button>
          {canUpdate ? (
            <Button variant="primary" onClick={() => setUpdating(true)}>
              <Icon icon={Plus} size={14} className="inline-block align-[-2px]" /> Add update
            </Button>
          ) : null}
        </>
      }
    >
      <div className="mb-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
        <div>
          <div className="text-xs text-slate-500">Done</div>
          <b>{task.measure === "percent" ? `${fmtNum(task.completed)}%` : `${fmtNum(task.completed)} / ${fmtNum(task.total)} ${task.unit}`}</b>
        </div>
        <div>
          <div className="text-xs text-slate-500">Planned</div>
          {task.plannedStart || task.plannedEnd ? `${formatDate(task.plannedStart) || "–"} → ${formatDate(task.plannedEnd) || "–"}` : "Not planned"}
        </div>
        <div>
          <div className="text-xs text-slate-500">Assigned to</div>
          {task.assignedTo ? userName(task.assignedTo) : "Nobody"}
        </div>
        <div>
          <div className="text-xs text-slate-500">Weight</div>
          {task.weight}
        </div>
      </div>
      {prod ? (
        <p className="mb-3 rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-900" data-testid="productivity">
          Productivity: <b>{prod.perManDay.toFixed(2)} {task.unit} per man-day</b>{" "}
          <span className="text-xs">
            ({fmtNum(prod.quantity)} {task.unit} over {prod.days} day{prod.days === 1 ? "" : "s"} with {fmtNum(prod.manDays)} site man-days logged)
          </span>
        </p>
      ) : null}
      {task.blocked ? (
        <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          Blocked: {task.blocked.reason} <span className="text-xs">({userName(task.blocked.by)}, {formatDate(task.blocked.at)})</span>
        </p>
      ) : null}
      <h4 className="mb-2 text-sm font-semibold text-slate-800">Update history</h4>
      {isPending ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : updates.length ? (
        <ul className="max-h-[45vh] divide-y divide-slate-100 overflow-y-auto" data-testid="update-history">
          {updates.map((u: ProgressUpdate) => (
            <li key={u.id} className="py-2 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  <b className={u.quantity < 0 ? "text-red-700" : "text-emerald-700"}>
                    {u.quantity > 0 ? "+" : "−"}
                    {fmtNum(Math.abs(u.quantity))}
                    {task.measure === "percent" ? "%" : ` ${task.unit}`}
                  </b>{" "}
                  → {fmtNum(u.runningTotal)}
                  {task.measure === "percent" ? "%" : ` ${task.unit}`}
                </span>
                <span className="text-xs text-slate-500">
                  Work {formatDate(u.workDate)} · {userName(u.by)} · posted {formatDateTime(u.recordedAt)}
                </span>
              </div>
              {u.remarks ? <p className="text-xs text-slate-700">{u.remarks}</p> : null}
              {u.delayReason ? <p className="text-xs text-red-700">Delay: {delayReasons.label(u.delayReason)}</p> : null}
              {u.photos.length ? (
                <div className="mt-1">
                  <PhotoThumbs photos={u.photos} />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate-500">No updates yet.</p>
      )}
      {updating ? <UpdateDialog projectId={project.id} task={task} onClose={() => setUpdating(false)} /> : null}
    </Modal>
  );
}

/* ---------- add / edit task ---------- */

function TaskDialog({ project, stage, task, onClose }: { project: Project; stage: Stage; task?: Task; onClose: () => void }) {
  const toast = useToast();
  const { user } = useAuth();
  const userName = useUserName();
  const { data: settings } = useSettings();
  const units = useList("units");
  const delayReasons = useList("delayReasons");
  const [today] = useState(() => todayIso());
  const [f, setF] = useState<NewTask>(() =>
    task
      ? { name: task.name, templateKey: task.templateKey, measure: task.measure, unit: task.unit, total: task.total, weight: task.weight, plannedStart: task.plannedStart, plannedEnd: task.plannedEnd, assignedTo: task.assignedTo }
      : { name: "", templateKey: null, measure: "", unit: "", total: null, weight: null, plannedStart: stage.plannedStart, plannedEnd: stage.plannedEnd, assignedTo: "" },
  );
  const [customUnit, setCustomUnit] = useState(false);
  const [reason, setReason] = useState("");
  const [issues, setIssues] = useState<string[]>([]);
  const save = useProjectMutation(() => (task ? projectRepo.updateTask(project.id, task.id, f, reason) : projectRepo.addTask(project.id, stage.key, f)));
  const set = (patch: Partial<NewTask>) => setF((x) => ({ ...x, ...patch }));
  const suggestions = (settings?.templates[stage.key] ?? []).filter((t) => !stage.tasks.some((x) => x.templateKey === t.key));
  const team = [...new Set([project.projectManagerId, ...project.team.map((m) => m.employeeId)])].filter((id) => onTeam(project, id, today));
  const endMoved = !!task?.plannedEnd && f.plannedEnd !== task.plannedEnd;
  const isAdmin = user?.role === "admin";

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={task ? `Edit task – ${stageMeta(stage.key).label}` : `Add task – ${stageMeta(stage.key).label}`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={save.isPending}
            onClick={() => save.mutate(undefined, { onSuccess: () => (toast(task ? "Task saved" : "Task added"), onClose()), onError: (e) => setIssues(issuesOf(e)) })}
          >
            {task ? "Save task" : "Add task"}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {!task && suggestions.length ? (
          <div className="sm:col-span-2">
            <div className="mb-1 text-xs font-semibold text-slate-600">Suggested for this stage</div>
            <div className="flex flex-wrap gap-1.5">
              {suggestions.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => set({ name: s.name, templateKey: s.key, measure: s.measure, unit: s.unit, total: s.measure === "percent" ? 100 : null })}
                  className={`rounded-lg px-3 py-1 text-xs font-medium ring-1 ${f.templateKey === s.key ? "bg-red-700 text-white ring-red-700" : "bg-white text-slate-700 ring-slate-300 hover:bg-slate-50"}`}
                >
                  {s.name}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        <TextField className="sm:col-span-2" label="Task name" required value={f.name} onChange={(v) => set({ name: v, templateKey: null })} />
        <div className="sm:col-span-2">
          <div className="mb-1 text-xs font-semibold text-slate-600">
            Measurement type<span className="text-red-600">*</span>
          </div>
          <div className="flex gap-2" role="radiogroup" aria-label="Measurement type">
            {(
              [
                ["quantity", "Quantity", "e.g. 40 columns, 85 MT"],
                ["percent", "Percent", "total fixed at 100%"],
              ] as const
            ).map(([v, l, hint]) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={f.measure === v}
                disabled={!!task && task.completed > 0 && task.measure !== v}
                onClick={() => set({ measure: v, total: v === "percent" ? 100 : f.measure === "percent" ? null : f.total, unit: v === "percent" ? "%" : f.unit === "%" ? "" : f.unit })}
                className={`flex-1 rounded-lg border px-3 py-2 text-left text-sm disabled:opacity-40 ${f.measure === v ? "border-red-700 bg-red-50 font-semibold text-red-900" : "border-slate-300 bg-white"}`}
              >
                {l}
                <span className="block text-xs font-normal text-slate-500">{hint}</span>
              </button>
            ))}
          </div>
        </div>
        {f.measure === "quantity" ? (
          <>
            <div>
              {customUnit ? (
                <TextField label="Unit" required value={f.unit} onChange={(v) => set({ unit: v })} placeholder="e.g. panels" />
              ) : (
                <Select
                  label="Unit *"
                  value={f.unit}
                  onChange={(v) => (v === "__custom" ? (setCustomUnit(true), set({ unit: "" })) : set({ unit: v }))}
                  options={[
                    { value: "", label: "Choose…" },
                    ...units.items,
                    ...(f.unit && !units.items.some((u) => u.value === f.unit) ? [{ value: f.unit, label: f.unit }] : []),
                    { value: "__custom", label: "Custom unit…" },
                  ]}
                />
              )}
            </div>
            <NumberField label="Total" value={f.total} onChange={(v) => set({ total: v })} suffix={f.unit} hint={task ? `Can't be below what's done (${fmtNum(task.completed)}).` : "Can be filled in later, before posting progress."} />
          </>
        ) : f.measure === "percent" ? (
          <p className="text-sm text-slate-600 sm:col-span-2">Total is fixed at 100%.</p>
        ) : null}
        <TextField label="Planned start" type="date" value={f.plannedStart} onChange={(v) => set({ plannedStart: v })} />
        <TextField label="Planned end" type="date" value={f.plannedEnd} onChange={(v) => set({ plannedEnd: v })} hint="Needed for behind-schedule checks." />
        {endMoved ? (
          <Select className="sm:col-span-2" label="Reason for moving the planned end *" value={reason} onChange={setReason} options={[{ value: "", label: "Choose…" }, ...delayReasons.items]} />
        ) : null}
        <Select label="Assigned to" value={f.assignedTo} onChange={(v) => set({ assignedTo: v })} options={[{ value: "", label: "Nobody" }, ...team.map((id) => ({ value: id, label: userName(id) }))]} />
        {isAdmin ? (
          <NumberField label="Task weight" value={f.weight} onChange={(v) => set({ weight: v })} hint="Default 1. Give bigger tasks more weight." />
        ) : null}
        <div className="sm:col-span-2">
          <ErrorList issues={issues} />
        </div>
      </div>
    </Modal>
  );
}

/* ---------- stage dialogs ---------- */

function WeightsDialog({ project, onClose }: { project: Project; onClose: () => void }) {
  const toast = useToast();
  const [w, setW] = useState<Record<StageKey, number | null>>(() => Object.fromEntries(project.stages.map((s) => [s.key, s.weight])) as Record<StageKey, number | null>);
  const [issues, setIssues] = useState<string[]>([]);
  const total = Object.values(w).reduce<number>((a, v) => a + (v ?? 0), 0);
  const save = useProjectMutation(() => projectRepo.setWeights(project.id, Object.fromEntries(Object.entries(w).map(([k, v]) => [k, v ?? 0])) as Record<StageKey, number>));
  return (
    <Modal
      open
      onClose={onClose}
      title="Stage weights"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={save.isPending}
            onClick={() => {
              const problems = validateWeights(Object.values(w).map((v) => v ?? 0));
              if (problems.length) return setIssues(problems);
              save.mutate(undefined, { onSuccess: () => (toast("Weights saved"), onClose()), onError: (e) => setIssues(issuesOf(e)) });
            }}
          >
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-2">
        {STAGES.map((s) => (
          <div key={s.key} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-sm">
              <Icon icon={STAGE_ICONS[s.key]} className="text-slate-500" /> {s.label}
            </span>
            <div className="w-28">
              <NumberField value={w[s.key]} onChange={(v) => setW({ ...w, [s.key]: v })} suffix="%" />
            </div>
          </div>
        ))}
        <p className={`text-right text-sm font-semibold ${Math.round(total) === 100 ? "text-emerald-700" : "text-red-700"}`}>Total {total}% (must be 100%)</p>
        <p className="text-xs text-slate-500">Stages marked Not applicable are left out and the others are rescaled automatically.</p>
        <ErrorList issues={issues} />
      </div>
    </Modal>
  );
}

function StageDatesDialog({ project, onClose }: { project: Project; onClose: () => void }) {
  const toast = useToast();
  const [d, setD] = useState<Record<StageKey, { start: string; end: string }>>(
    () => Object.fromEntries(project.stages.map((s) => [s.key, { start: s.plannedStart, end: s.plannedEnd }])) as Record<StageKey, { start: string; end: string }>,
  );
  const [reason, setReason] = useState("");
  const [issues, setIssues] = useState<string[]>([]);
  const save = useProjectMutation(() => projectRepo.setStageDates(project.id, d, reason));
  const hadPlan = project.stages.some((s) => s.plannedEnd);
  const canSuggest = !!project.startDate && !!project.plannedCompletion;
  return (
    <Modal
      open
      wide
      onClose={onClose}
      title="Planned stage dates"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={save.isPending} onClick={() => save.mutate(undefined, { onSuccess: () => (toast("Stage dates saved"), onClose()), onError: (e) => setIssues(issuesOf(e)) })}>
            Save
          </Button>
        </>
      }
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm">
        <span>
          {canSuggest
            ? `Suggest dates from the start (${formatDate(project.startDate)}) to planned completion (${formatDate(project.plannedCompletion)}) using typical durations. Stages overlap.`
            : "Set the planned completion date to get suggested stage dates."}
        </span>
        <Button size="sm" disabled={!canSuggest} onClick={() => setD(suggestStageDates(project.startDate, project.plannedCompletion))}>
          Suggest dates
        </Button>
      </div>
      <div className="space-y-2">
        {STAGES.map((s) => (
          <div key={s.key} className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[1fr_10rem_10rem]">
            <span className="flex items-center gap-2 text-sm">
              <Icon icon={STAGE_ICONS[s.key]} className="text-slate-500" /> {s.label}
            </span>
            <input type="date" aria-label={`${s.label} planned start`} value={d[s.key].start} onChange={(e) => setD({ ...d, [s.key]: { ...d[s.key], start: e.target.value } })} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
            <input type="date" aria-label={`${s.label} planned end`} value={d[s.key].end} onChange={(e) => setD({ ...d, [s.key]: { ...d[s.key], end: e.target.value } })} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
          </div>
        ))}
      </div>
      {hadPlan ? <TextArea className="mt-3" label="Reason for changing planned dates" required rows={2} value={reason} onChange={setReason} /> : null}
      <p className="mt-2 text-xs text-slate-500">The first dates are kept as the baseline. Tasks without their own dates use their stage&apos;s dates.</p>
      <div className="mt-2">
        <ErrorList issues={issues} />
      </div>
    </Modal>
  );
}

function StageDelayDialog({ project, stage, onClose }: { project: Project; stage: Stage; onClose: () => void }) {
  const toast = useToast();
  const delayReasons = useList("delayReasons");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [issues, setIssues] = useState<string[]>([]);
  const save = useProjectMutation(() => projectRepo.recordStageDelay(project.id, stage.key, reason, note));
  return (
    <Modal
      open
      onClose={onClose}
      title={`Delay – ${stageMeta(stage.key).label}`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={save.isPending} onClick={() => save.mutate(undefined, { onSuccess: () => (toast("Delay reason recorded"), onClose()), onError: (e) => setIssues(issuesOf(e)) })}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-slate-600">The stage was planned to finish on {formatDate(stage.plannedEnd)} and is at {pctText(stagePct(stage))}.</p>
        <Select label="Delay reason *" value={reason} onChange={setReason} options={[{ value: "", label: "Choose…" }, ...delayReasons.items]} />
        <TextArea label="Note" rows={2} value={note} onChange={setNote} />
        <ErrorList issues={issues} />
      </div>
    </Modal>
  );
}

/* ---------- planned vs actual chart ---------- */

function SCurveChart({ project }: { project: Project }) {
  const { data: updates = [] } = useUpdates(project.id);
  const [today] = useState(() => todayIso());
  const points = useMemo(() => sCurve(project, updates, today), [project, updates, today]);
  if (points.length < 2) return <p className="text-sm text-slate-500">The chart appears once the project has a start date and progress.</p>;
  const W = 640;
  const H = 220;
  const pad = { l: 34, r: 10, t: 10, b: 26 };
  const x = (i: number) => pad.l + (i / (points.length - 1)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - v / 100) * (H - pad.t - pad.b);
  const line = (key: "planned" | "actual") =>
    points
      .map((p, i) => (p[key] === null ? null : `${x(i)},${y(p[key]!)}`))
      .filter(Boolean)
      .join(" ");
  const todayIdx = points.findIndex((p) => p.date >= today);
  const lastActual = [...points].reverse().find((p) => p.actual !== null);
  const plannedNow = points[todayIdx >= 0 ? todayIdx : points.length - 1]?.planned;
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Planned versus actual progress">
        {[0, 25, 50, 75, 100].map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke="var(--color-slate-200)" />
            <text x={pad.l - 6} y={y(v) + 3} textAnchor="end" fontSize="10" fill="var(--color-slate-500)" fontFamily="var(--font-mono)">
              {v}%
            </text>
          </g>
        ))}
        {todayIdx > 0 ? <line x1={x(todayIdx)} x2={x(todayIdx)} y1={pad.t} y2={H - pad.b} stroke="var(--color-slate-400)" strokeDasharray="3 3" /> : null}
        <polyline points={line("planned")} fill="none" stroke="var(--color-slate-400)" strokeWidth="1.5" strokeDasharray="5 4" strokeLinecap="round" strokeLinejoin="round" />
        <polyline points={line("actual")} fill="none" stroke="var(--color-red-700)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        {[0, Math.floor((points.length - 1) / 2), points.length - 1].map((i) => (
          <text key={i} x={x(i)} y={H - 8} textAnchor={i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"} fontSize="10" fill="var(--color-slate-500)" fontFamily="var(--font-mono)">
            {formatDate(points[i].date)}
          </text>
        ))}
      </svg>
      <div className="mt-1 flex flex-wrap gap-4 text-xs text-slate-600">
        <span>
          <span className="mr-1 inline-block h-0.5 w-5 bg-slate-500 align-middle" /> Planned {plannedNow !== null && plannedNow !== undefined ? `(${plannedNow}% by today)` : ""}
        </span>
        <span>
          <span className="mr-1 inline-block h-0.5 w-5 bg-red-700 align-middle" /> Actual {lastActual ? `(${lastActual.actual}%)` : ""}
        </span>
        <span>┆ Today</span>
      </div>
    </div>
  );
}

/* ---------- stage cards and task list ---------- */

function TaskRow({ project, stage, task, onOpen, onUpdate, onEdit }: { project: Project; stage: Stage; task: Task; onOpen: () => void; onUpdate: () => void; onEdit: () => void }) {
  const toast = useToast();
  const { user } = useAuth();
  const userName = useUserName();
  const [today] = useState(() => todayIso());
  const pct = taskPct(task);
  const status = taskStatus(task);
  const behind = taskBehind(task, today);
  const block = useProjectMutation((reason: string | null) => projectRepo.setBlocked(project.id, task.id, reason));
  const del = useProjectMutation(() => projectRepo.deleteTask(project.id, task.id));
  const active = project.status === "active" && !stage.notApplicable;
  return (
    <li className="py-3" data-testid="task-row">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
          <span className="block font-medium text-slate-900">{task.name}</span>
          <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
            <span className={`rounded-lg px-2 py-0.5 font-semibold ${STATUS_CHIP[status][1]}`}>{STATUS_CHIP[status][0]}</span>
            <BehindFlag behind={behind} />
            {task.measure === "quantity" ? (
              task.total ? (
                <span>
                  {fmtNum(task.completed)} / {fmtNum(task.total)} {task.unit}
                </span>
              ) : (
                <span className="font-medium text-amber-700">Total not set ({task.unit})</span>
              )
            ) : (
              <span>{fmtNum(task.completed)}%</span>
            )}
            {task.assignedTo ? <span>· {userName(task.assignedTo)}</span> : null}
            {task.plannedEnd ? <span>· due {formatDate(task.plannedEnd)}</span> : null}
            {task.weight !== 1 ? <span>· weight {task.weight}</span> : null}
          </span>
        </button>
        <div className="flex items-center gap-1">
          {active && status !== "completed" ? (
            <Button variant="primary" onClick={onUpdate}>
              <Icon icon={Plus} size={14} className="inline-block align-[-2px]" /> Update
            </Button>
          ) : null}
          {active ? (
            <details className="relative">
              <summary aria-label={`More for ${task.name}`} className="flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-lg text-lg text-slate-500 hover:bg-slate-100 [&::-webkit-details-marker]:hidden">
                <Icon icon={EllipsisVertical} size={16} />
              </summary>
              <div className="absolute right-0 z-20 mt-1 w-44 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                <button type="button" className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50" onClick={onEdit}>
                  Edit task
                </button>
                <button
                  type="button"
                  className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                  onClick={() => {
                    if (task.blocked) return block.mutate(null, { onSuccess: () => toast("Task unblocked") });
                    const reason = window.prompt("Why is this task blocked?");
                    if (reason !== null) block.mutate(reason, { onSuccess: () => toast("Task marked blocked"), onError: (e) => toast(e.message, "error") });
                  }}
                >
                  {task.blocked ? "Unblock" : "Mark blocked…"}
                </button>
                {user?.role === "admin" ? (
                  <button
                    type="button"
                    className="block w-full px-3 py-2 text-left text-sm text-red-700 hover:bg-red-50"
                    onClick={() => window.confirm(`Delete “${task.name}”? Its update history stays in the timeline.`) && del.mutate(undefined, { onSuccess: () => toast("Task deleted") })}
                  >
                    Delete task
                  </button>
                ) : null}
              </div>
            </details>
          ) : null}
        </div>
      </div>
      {pct !== null ? (
        <div className="mt-2 flex items-center gap-2">
          <ProgressBar pct={pct} tone={behind ? "red" : undefined} />
          <span className="w-10 text-right text-xs font-semibold text-slate-700">{pctText(pct)}</span>
        </div>
      ) : null}
      {task.blocked ? <p className="mt-1 text-xs text-red-700">Blocked: {task.blocked.reason}</p> : null}
    </li>
  );
}

function StageCard({
  project,
  stage,
  open,
  onToggle,
  updates,
  weight,
  hasDelay,
}: {
  project: Project;
  stage: Stage;
  open: boolean;
  onToggle: () => void;
  updates: ProgressUpdate[];
  weight: number;
  hasDelay: boolean;
}) {
  const toast = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const meta = stageMeta(stage.key);
  const [today] = useState(() => todayIso());
  const pct = stagePct(stage);
  const behind = stageBehind(stage, today);
  const actual = stageActualDates(stage, updates);
  const [dialog, setDialog] = useState<"add" | "delay" | null>(null);
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [updateTask, setUpdateTask] = useState<Task | null>(null);
  const openTaskId = params.get("task");
  const openTask = stage.tasks.find((t) => t.id === openTaskId) ?? null;
  const setTask = (id: string | null) => {
    const q = new URLSearchParams(params.toString());
    if (id) {
      q.set("task", id);
      q.set("stage", stage.key);
    } else q.delete("task");
    router.replace(`${pathname}?${q.toString()}`, { scroll: false });
  };
  const na = useProjectMutation((v: boolean) => projectRepo.setStageApplicable(project.id, stage.key, v));
  const pastEnd = !!stage.plannedEnd && today > stage.plannedEnd && pct < 99.999 && !stage.notApplicable;
  const editable = project.status === "active";

  return (
    <section className={`rounded-xl border bg-white shadow-sm ${behind ? "border-red-300" : "border-slate-200"} ${stage.notApplicable ? "opacity-60" : ""}`} data-testid={`stage-${stage.key}`}>
      <button type="button" onClick={onToggle} aria-expanded={open} className="w-full p-4 text-left">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="flex items-center gap-2 font-semibold text-slate-900">
              <Icon icon={STAGE_ICONS[meta.key]} className="text-slate-500" /> {meta.label}
            </h3>
            <p className="text-xs text-slate-500">
              {stage.notApplicable ? "Not applicable" : `Weight ${stage.weight}%${Math.round(weight) !== stage.weight ? ` (${weight.toFixed(1)}% after rescaling)` : ""}`} · {stage.tasks.length} task{stage.tasks.length === 1 ? "" : "s"}
            </p>
          </div>
          <div className="text-right">
            <div className="text-lg font-semibold tabular-nums text-slate-900" data-testid="stage-pct">
              {stage.notApplicable ? "N/A" : pctText(pct)}
            </div>
            <BehindFlag behind={behind} />
          </div>
        </div>
        {!stage.notApplicable ? <ProgressBar className="mt-2" pct={pct} tone={behind ? "red" : undefined} /> : null}
        <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-600">
          <span>
            Planned: {stage.plannedStart ? `${formatDate(stage.plannedStart)} – ${formatDate(stage.plannedEnd)}` : <span className="text-slate-400">not set</span>}
          </span>
          <span>
            Actual: {actual.start ? `${formatDate(actual.start)} – ${actual.end ? formatDate(actual.end) : "ongoing"}` : <span className="text-slate-400">not started</span>}
          </span>
        </div>
      </button>
      {pastEnd && !hasDelay && editable ? (
        <div className="mx-4 mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800">
          <span>Past its planned end. Record why it is late.</span>
          <Button size="sm" onClick={() => setDialog("delay")}>
            Record delay reason
          </Button>
        </div>
      ) : null}
      {open ? (
        <div className="border-t border-slate-100 px-4 pb-4">
          <div className="flex flex-wrap items-center justify-between gap-2 pt-3">
            {editable ? (
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  className="accent-red-700"
                  checked={stage.notApplicable}
                  onChange={(e) => na.mutate(e.target.checked, { onSuccess: () => toast(e.target.checked ? `${meta.label} marked Not applicable` : `${meta.label} applicable again`), onError: (er) => toast(er.message, "error") })}
                />
                Not applicable for this project
              </label>
            ) : (
              <span />
            )}
            {editable && !stage.notApplicable ? (
              <Button onClick={() => setDialog("add")}><Icon icon={Plus} size={14} className="inline-block align-[-2px]" /> Add task</Button>
            ) : null}
          </div>
          {stage.tasks.length ? (
            <ul className="divide-y divide-slate-100">
              {stage.tasks.map((t) => (
                <TaskRow key={t.id} project={project} stage={stage} task={t} onOpen={() => setTask(t.id)} onUpdate={() => setUpdateTask(t)} onEdit={() => setEditTask(t)} />
              ))}
            </ul>
          ) : (
            <p className="py-3 text-sm text-slate-500">No tasks yet; this stage counts as 0% until it has some.</p>
          )}
        </div>
      ) : null}
      {dialog === "add" ? <TaskDialog project={project} stage={stage} onClose={() => setDialog(null)} /> : null}
      {dialog === "delay" ? <StageDelayDialog project={project} stage={stage} onClose={() => setDialog(null)} /> : null}
      {editTask ? <TaskDialog project={project} stage={stage} task={editTask} onClose={() => setEditTask(null)} /> : null}
      {updateTask ? <UpdateDialog projectId={project.id} task={updateTask} onClose={() => setUpdateTask(null)} /> : null}
      {openTask ? <TaskSheet project={project} stage={stage} task={openTask} onClose={() => setTask(null)} /> : null}
    </section>
  );
}

/** Man-days from site attendance over the last 7 days, next to progress. */
function SiteLabourCard({ projectId }: { projectId: string }) {
  const { data } = useManDays(projectId);
  const [today] = useState(() => todayIso());
  if (!data || !Object.keys(data).length) return null;
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  const total = days.reduce((a, d) => a + (data[d]?.employees ?? 0) + (data[d]?.casual ?? 0), 0);
  const max = Math.max(1, ...days.map((d) => (data[d]?.employees ?? 0) + (data[d]?.casual ?? 0)));
  return (
    <Card title="Site labour (last 7 days)" description={`${fmtNum(total)} man-days from the Attendance tab. Productivity per task is shown in each task's history.`}>
      <div className="flex items-end gap-2" data-testid="labour-bars">
        {days.map((d) => {
          const e = data[d]?.employees ?? 0;
          const c = data[d]?.casual ?? 0;
          return (
            <div key={d} className="flex flex-1 flex-col items-center gap-1 text-[11px] text-slate-500">
              <span className="font-semibold text-slate-700">{fmtNum(e + c)}</span>
              <div className="flex h-20 w-full max-w-10 flex-col justify-end overflow-hidden rounded bg-slate-100" title={`${e} employee + ${c} casual man-days`}>
                <div className="bg-sky-400" style={{ height: `${(c / max) * 100}%` }} />
                <div className="bg-red-700" style={{ height: `${(e / max) * 100}%` }} />
              </div>
              {dayLabel(d).slice(0, 3)}
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-slate-500">
        <span className="mr-1 inline-block h-2 w-3 bg-red-700" /> Employees <span className="ml-3 mr-1 inline-block h-2 w-3 bg-sky-400" /> Casual workers
      </p>
    </Card>
  );
}

/** Progress tab: 6 stage cards → tasks → updates; phone-first. */
export function ProjectProgress({ p }: { p: Project }) {
  const toast = useToast();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const params = useSearchParams();
  const { data: updates = [] } = useUpdates(p.id);
  const { data: delays = [] } = useDelays(p.id);
  const [openStage, setOpenStage] = useState<StageKey | null>(() => (params.get("stage") as StageKey | null) ?? null);
  const [dialog, setDialog] = useState<"weights" | "dates" | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const weights = effectiveWeights(p.stages);
  const na = useProjectMutation(() => projectRepo.setStageApplicable(p.id, "erection", true));
  const erection = p.stages.find((s) => s.key === "erection")!;
  const supplyOnly = p.scope === "supply" && !erection.notApplicable && !erection.tasks.some((t) => t.completed > 0) && !dismissed && p.status === "active";
  const unplanned = p.stages.every((s) => !s.plannedEnd);

  return (
    <div className="space-y-4">
      {supplyOnly ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900" data-testid="supply-only-hint">
          <span>This is a supply-only order. Mark “Assembly and erection” Not applicable?</span>
          <span className="flex gap-2">
            <Button size="sm" variant="primary" onClick={() => na.mutate(undefined, { onSuccess: () => toast("Assembly and erection marked Not applicable") })}>
              Mark Not applicable
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setDismissed(true)}>
              Not now
            </Button>
          </span>
        </div>
      ) : null}
      {isAdmin && p.status === "active" ? (
        <div className="flex flex-wrap justify-end gap-2">
          {unplanned ? <span className="mr-auto self-center text-sm text-amber-800">Stages have no planned dates yet – needed for behind-schedule checks.</span> : null}
          <Button onClick={() => setDialog("dates")}><Icon icon={CalendarDays} size={14} className="mr-1 inline-block align-[-2px]" />Plan stage dates</Button>
          <Button onClick={() => setDialog("weights")}><Icon icon={Scale} size={14} className="mr-1 inline-block align-[-2px]" />Edit weights</Button>
        </div>
      ) : null}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {p.stages.map((s) => (
          <StageCard
            key={s.key}
            project={p}
            stage={s}
            open={openStage === s.key}
            onToggle={() => setOpenStage(openStage === s.key ? null : s.key)}
            updates={updates}
            weight={weights[s.key]}
            hasDelay={delays.some((d) => d.stageKey === s.key && d.plannedEnd === s.plannedEnd)}
          />
        ))}
      </div>
      <SiteLabourCard projectId={p.id} />
      <Card title="Planned vs actual progress">
        <SCurveChart project={p} />
      </Card>
      {dialog === "weights" ? <WeightsDialog project={p} onClose={() => setDialog(null)} /> : null}
      {dialog === "dates" ? <StageDatesDialog project={p} onClose={() => setDialog(null)} /> : null}
    </div>
  );
}
