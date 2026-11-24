"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { EmptyState, ErrorList, LoadingRows, PageContainer, PageHeader, useDebounced, useUserName } from "@/components/crm/ui";
import { useToast } from "@/components/Providers";
import { Button, Card, NumberField, Select, TextField, Toggle } from "@/components/ui/fields";
import { Modal } from "@/components/ui/overlays";
import { attendanceRepo } from "@/lib/attendance";
import { LOCATIONS, NOT_LOGGED, STATUSES, statusMeta } from "@/lib/attendance/config";
import {
  useAttendanceAccess,
  useAttendanceMutation,
  useCasualDay,
  useCasualWorkers,
  useDaySheet,
  useRegister,
  useSitesNotLogged,
} from "@/lib/attendance/hooks";
import { addDays, dateRange, dayLabel, monthBounds, todayIso } from "@/lib/attendance/rules";
import type { AttendanceStatus, CasualWorker, RecordPatch, SheetFilters, SheetRow, WorkLocation } from "@/lib/attendance/types";
import { useAuth } from "@/lib/auth/AuthProvider";
import { formatDate } from "@/lib/format";
import { useProjects } from "@/lib/projects/hooks";
import { useList } from "@/lib/settings/hooks";
import { AttendanceBadge, fmtManDays } from "./bits";
import { HistoryNote, RecordEditor, type ProjectOption } from "./RecordEditor";

const issuesOf = (e: unknown) => (e && typeof e === "object" && "issues" in e ? (e as { issues: string[] }).issues : [e instanceof Error ? e.message : String(e)]);
const sel = "rounded-md border border-slate-300 bg-white px-2.5 py-2 text-sm";

/* ---------- employees (daily sheet) ---------- */

function BulkBar({ count, locations, projects, onApply, busy }: { count: number; locations: WorkLocation[]; projects: ProjectOption[]; onApply: (p: RecordPatch) => void; busy: boolean }) {
  const [status, setStatus] = useState<AttendanceStatus>("present");
  const [location, setLocation] = useState<WorkLocation | "">(locations.length === 1 ? locations[0] : "");
  const [projectId, setProjectId] = useState("");
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-red-200 bg-red-50/60 px-3 py-2 text-sm" data-testid="bulk-bar">
      <b>{count} selected</b>
      <select aria-label="Bulk status" value={status} onChange={(e) => setStatus(e.target.value as AttendanceStatus)} className={sel}>
        {STATUSES.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>
      <select aria-label="Bulk location" value={location} onChange={(e) => setLocation(e.target.value as WorkLocation | "")} className={sel}>
        <option value="">No location</option>
        {LOCATIONS.filter((l) => locations.includes(l.value)).map((l) => (
          <option key={l.value} value={l.value}>
            {l.label}
          </option>
        ))}
      </select>
      {location === "site" ? (
        <select aria-label="Bulk project" value={projectId} onChange={(e) => setProjectId(e.target.value)} className={sel}>
          <option value="">Choose project…</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.code} – {p.name}
            </option>
          ))}
        </select>
      ) : null}
      <Button variant="primary" size="sm" disabled={busy} onClick={() => onApply({ status, location: location || null, projectId: location === "site" ? projectId : null })}>
        Mark selected
      </Button>
    </div>
  );
}

function RemarksCell({ row, editable, onSave }: { row: SheetRow; editable: boolean; onSave: (remarks: string) => void }) {
  const [text, setText] = useState(row.record?.remarks ?? "");
  if (!editable || !row.record) return <span className="text-xs text-slate-600">{row.record?.remarks}</span>;
  return (
    <input
      aria-label={`Remarks for ${row.name}`}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => text !== (row.record?.remarks ?? "") && onSave(text)}
      placeholder="Remarks"
      className="w-full min-w-[8rem] rounded-md border border-transparent px-2 py-1 text-xs hover:border-slate-200 focus:border-slate-300"
    />
  );
}

function EmployeesTab({ date, isAdmin, locations }: { date: string; isAdmin: boolean; locations: WorkLocation[] }) {
  const toast = useToast();
  const { user } = useAuth();
  const userName = useUserName();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<SheetFilters["status"]>("");
  const [location, setLocation] = useState<WorkLocation | "">("");
  const [projectId, setProjectId] = useState("");
  const [department, setDepartment] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const q = useDebounced(search, 200);
  const filters = { search: q, status, location, projectId, department };
  const { data, isPending } = useDaySheet(date, filters);
  const { data: all } = useDaySheet(date, {});
  const { data: projects = [] } = useProjects({ statuses: ["active", "on_hold"] });
  const save = useAttendanceMutation(({ id, patch }: { id: string; patch: RecordPatch }) => attendanceRepo.setRecord(id, date, patch));
  const bulk = useAttendanceMutation((patch: RecordPatch) => attendanceRepo.bulkSet(selected, date, patch));
  const holiday = useAttendanceMutation(() => attendanceRepo.markDayHoliday(date));
  const departments = useMemo(() => [...new Set((all?.rows ?? []).map((r) => r.department))].sort(), [all]);
  const rows = data?.rows ?? [];
  const editableIds = rows.filter((r) => r.editable).map((r) => r.employeeId);
  const s = data?.summary;
  const chips: [SheetFilters["status"], string, number | undefined, string][] = [
    ["present", "Present", s?.present, statusMeta("present").badge],
    ["half", "Half day", s?.half, statusMeta("half").badge],
    ["absent", "Absent", s?.absent, statusMeta("absent").badge],
    ["holiday", "Holiday", s?.holiday, statusMeta("holiday").badge],
    ["not_logged", "Not logged", s?.notLogged, NOT_LOGGED.badge],
  ];

  const saveRow = (row: SheetRow, patch: RecordPatch) => {
    const r = row.record;
    if (isAdmin && r && r.loggedBy !== user?.id && (r.location !== patch.location || r.projectId !== patch.projectId) && r.location) {
      const where = r.location === "site" ? `site ${projects.find((p) => p.id === r.projectId)?.code ?? ""}` : LOCATIONS.find((l) => l.value === r.location)!.label;
      if (!window.confirm(`${row.name} is already marked at ${where} by ${userName(r.loggedBy)}. Replace it?`)) return;
    }
    save.mutate({ id: row.employeeId, patch }, { onSuccess: () => toast(`${row.name}: saved`), onError: (e) => toast(issuesOf(e).join(" "), "error") });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2" data-testid="summary-chips">
        {chips.map(([value, label, n, badge]) => (
          <button
            key={value}
            type="button"
            aria-pressed={status === value}
            onClick={() => setStatus(status === value ? "" : value)}
            className={`rounded-full px-3 py-1.5 text-sm font-semibold ring-2 ${badge} ${status === value ? "ring-slate-900" : "ring-transparent"}`}
          >
            {label} {n ?? "…"}
          </button>
        ))}
        {data?.companyHoliday ? <span className="text-sm font-medium text-sky-800">🏖️ Company holiday</span> : null}
        {isAdmin ? (
          <span className="ml-auto">
            <Button
              size="sm"
              disabled={holiday.isPending}
              onClick={() =>
                window.confirm(`Mark ${dayLabel(date)} as a holiday for every employee without a record? No site reminders will be sent for it.`) &&
                holiday.mutate(undefined, { onSuccess: (n) => toast(`${n} employees marked Holiday`), onError: (e) => toast(e.message, "error") })
              }
            >
              🏖️ Mark day as holiday
            </Button>
          </span>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input type="search" aria-label="Search employees" placeholder="Search name, employee ID, mobile…" value={search} onChange={(e) => setSearch(e.target.value)} className="min-w-[220px] flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
        <select aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value as SheetFilters["status"])} className={sel}>
          <option value="">All statuses</option>
          {STATUSES.map((x) => (
            <option key={x.value} value={x.value}>
              {x.label}
            </option>
          ))}
          <option value="not_logged">Not logged</option>
        </select>
        <select aria-label="Filter by location" value={location} onChange={(e) => setLocation(e.target.value as WorkLocation | "")} className={sel}>
          <option value="">All locations</option>
          {LOCATIONS.map((l) => (
            <option key={l.value} value={l.value}>
              {l.label}
            </option>
          ))}
        </select>
        <select aria-label="Filter by project" value={projectId} onChange={(e) => setProjectId(e.target.value)} className={sel}>
          <option value="">All projects</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.code} – {p.name}
            </option>
          ))}
        </select>
        <select aria-label="Filter by department" value={department} onChange={(e) => setDepartment(e.target.value)} className={sel}>
          <option value="">All departments</option>
          {departments.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </div>
      {selected.length ? (
        <BulkBar
          count={selected.length}
          locations={locations}
          projects={projects}
          busy={bulk.isPending}
          onApply={(patch) =>
            bulk.mutate(patch, {
              onSuccess: (r) => {
                toast(`${r.updated} marked${r.skipped.length ? `, ${r.skipped.length} skipped` : ""}`);
                if (r.skipped.length) toast(r.skipped.join(" · "), "error");
                setSelected([]);
              },
              onError: (e) => toast(issuesOf(e).join(" "), "error"),
            })
          }
        />
      ) : null}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {isPending ? (
          <LoadingRows />
        ) : !rows.length ? (
          <EmptyState title="No employees match." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm" data-testid="day-sheet">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="w-10 px-3 py-2">
                    <input
                      type="checkbox"
                      aria-label="Select all"
                      className="accent-red-700"
                      checked={!!editableIds.length && editableIds.every((id) => selected.includes(id))}
                      onChange={(e) => setSelected(e.target.checked ? editableIds : [])}
                    />
                  </th>
                  <th className="px-3 py-2">Employee</th>
                  <th className="px-3 py-2">Designation · Department</th>
                  <th className="px-3 py-2">Status and location</th>
                  <th className="px-3 py-2">Logged by</th>
                  <th className="px-3 py-2">Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => (
                  <tr key={r.employeeId} data-testid="sheet-row" className={r.record ? "" : "bg-slate-50/50"}>
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        aria-label={`Select ${r.name}`}
                        className="accent-red-700"
                        disabled={!r.editable}
                        checked={selected.includes(r.employeeId)}
                        onChange={(e) => setSelected((x) => (e.target.checked ? [...x, r.employeeId] : x.filter((y) => y !== r.employeeId)))}
                      />
                    </td>
                    <td className="px-3 py-2">
                      {isAdmin ? (
                        <Link href={`/employees/${r.employeeId}/attendance`} className="font-medium text-slate-900 hover:underline">
                          {r.name}
                        </Link>
                      ) : (
                        <span className="font-medium text-slate-900">{r.name}</span>
                      )}
                      <span className="block text-xs text-slate-500">{r.code}</span>
                    </td>
                    <td className="px-3 py-2 text-slate-700">
                      {r.designation}
                      <span className="block text-xs text-slate-500">{r.department}</span>
                    </td>
                    <td className="px-3 py-2">
                      <RecordEditor
                        key={r.record ? `${r.record.id}-${r.record.history.length}` : `${r.employeeId}-${date}`}
                        label={r.name}
                        record={r.record}
                        editable={r.editable}
                        locations={locations}
                        defaultLocation={locations.length === 1 ? locations[0] : undefined}
                        projects={projects}
                        saving={save.isPending}
                        onSave={(patch) => saveRow(r, patch)}
                      />
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-600">
                      {r.record ? (
                        <>
                          {userName(r.record.loggedBy)} · {new Date(r.record.loggedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                          <span className="block">
                            <HistoryNote record={r.record} />
                          </span>
                        </>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">
                      <RemarksCell
                        key={r.record?.id ?? r.employeeId}
                        row={r}
                        editable={r.editable}
                        onSave={(remarks) => save.mutate({ id: r.employeeId, patch: { status: r.record!.status, location: r.record!.location, projectId: r.record!.projectId, remarks } }, { onError: (e) => toast(e.message, "error") })}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {!isAdmin ? <p className="text-xs text-slate-500">You can mark people at the {locations.map((l) => LOCATIONS.find((x) => x.value === l)!.label).join(" / ")} for today and the last 7 days.</p> : null}
    </div>
  );
}

/* ---------- casual workers ---------- */

function CasualEditDialog({ worker, onClose }: { worker: CasualWorker; onClose: () => void }) {
  const toast = useToast();
  const trades = useList("trades");
  const [f, setF] = useState({ name: worker.name, mobile: worker.mobile, trade: worker.trade, contractor: worker.contractor, dailyRate: worker.dailyRate, active: worker.active });
  const [issues, setIssues] = useState<string[]>([]);
  const save = useAttendanceMutation(() => attendanceRepo.updateCasual(worker.id, f));
  return (
    <Modal
      open
      onClose={onClose}
      title={`Edit ${worker.name}`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={save.isPending} onClick={() => save.mutate(undefined, { onSuccess: () => (toast("Casual worker saved"), onClose()), onError: (e) => setIssues(issuesOf(e)) })}>
            Save
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label="Name" required value={f.name} onChange={(name) => setF({ ...f, name })} />
        <Select label="Trade *" value={f.trade} onChange={(trade) => setF({ ...f, trade })} options={[{ value: "", label: "Choose…" }, ...trades.items]} />
        <TextField label="Mobile" value={f.mobile} onChange={(mobile) => setF({ ...f, mobile })} />
        <TextField label="Contractor / mukadam" value={f.contractor} onChange={(contractor) => setF({ ...f, contractor })} />
        <NumberField label="Daily rate (₹)" value={f.dailyRate} onChange={(dailyRate) => setF({ ...f, dailyRate })} hint="Admins only; used for labour cost per project." />
        <Toggle className="self-end" checked={f.active} onChange={(active) => setF({ ...f, active })} label="Active" />
        <div className="sm:col-span-2">
          <ErrorList issues={issues} />
        </div>
      </div>
    </Modal>
  );
}

function MergeDialog({ worker, onClose }: { worker: CasualWorker; onClose: () => void }) {
  const toast = useToast();
  const { data: workers = [] } = useCasualWorkers("", true);
  const [into, setInto] = useState("");
  const [issues, setIssues] = useState<string[]>([]);
  const merge = useAttendanceMutation(() => attendanceRepo.mergeCasual(worker.id, into));
  return (
    <Modal
      open
      onClose={onClose}
      title={`Merge ${worker.name}`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!into || merge.isPending}
            onClick={() => merge.mutate(undefined, { onSuccess: (r) => (toast(`Merged: ${r.moved} days moved${r.dropped ? `, ${r.dropped} duplicate days dropped` : ""}`), onClose()), onError: (e) => setIssues(issuesOf(e)) })}
          >
            Merge
          </Button>
        </>
      }
    >
      <p className="mb-3 text-sm text-slate-600">
        All of {worker.name}&apos;s attendance moves to the worker you choose; days on which both were marked keep the chosen worker&apos;s record. {worker.name} is then removed from the register.
      </p>
      <Select label="Keep this worker" value={into} onChange={setInto} options={[{ value: "", label: "Choose…" }, ...workers.filter((w) => w.id !== worker.id).map((w) => ({ value: w.id, label: `${w.name}${w.mobile ? ` (${w.mobile})` : ""}${w.contractor ? ` · ${w.contractor}` : ""}` }))]} />
      <div className="mt-3">
        <ErrorList issues={issues} />
      </div>
    </Modal>
  );
}

function CasualTab({ date, isAdmin }: { date: string; isAdmin: boolean }) {
  const trades = useList("trades");
  const { data: rows = [], isPending } = useCasualDay(date);
  const [search, setSearch] = useState("");
  const [inactive, setInactive] = useState(false);
  const q = useDebounced(search, 200);
  const { data: register = [] } = useCasualWorkers(q, inactive, isAdmin);
  const [editing, setEditing] = useState<CasualWorker | null>(null);
  const [merging, setMerging] = useState<CasualWorker | null>(null);
  const manDays = rows.reduce((a, r) => a + (r.record.status === "present" ? 1 : r.record.status === "half" ? 0.5 : 0), 0);
  return (
    <div className="space-y-4">
      <Card title={`Casual workers on ${dayLabel(date)}`} description={`${rows.length} logged across all sites · ${fmtManDays(manDays)} man-days`}>
        {isPending ? (
          <LoadingRows rows={2} />
        ) : !rows.length ? (
          <EmptyState title="No casual workers logged on this day." />
        ) : (
          <div className="-mx-5 overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm" data-testid="casual-day">
              <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-1.5">Worker</th>
                  <th className="px-2">Project</th>
                  <th className="px-2">Trade</th>
                  <th className="px-2">Contractor</th>
                  <th className="px-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => (
                  <tr key={r.record.id}>
                    <td className="px-5 py-2 font-medium">{r.worker.name}</td>
                    <td className="px-2 text-slate-700">
                      <Link href={`/projects/${r.record.projectId}/attendance`} className="hover:underline">
                        {r.projectCode}
                      </Link>{" "}
                      <span className="text-xs text-slate-500">{r.projectName}</span>
                    </td>
                    <td className="px-2">{trades.label(r.worker.trade)}</td>
                    <td className="px-2 text-slate-600">{r.worker.contractor || "–"}</td>
                    <td className="px-2">
                      <AttendanceBadge status={r.record.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {isAdmin ? (
        <Card title="Casual workers register" description="Kept separate from the employee list. Site managers add workers from the attendance popup.">
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <input type="search" aria-label="Search the register" placeholder="Search name, mobile, contractor…" value={search} onChange={(e) => setSearch(e.target.value)} className="min-w-[220px] flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <label className="flex items-center gap-1.5 text-sm text-slate-600">
              <input type="checkbox" className="accent-red-700" checked={inactive} onChange={(e) => setInactive(e.target.checked)} /> Show inactive
            </label>
          </div>
          <ul className="divide-y divide-slate-100 text-sm" data-testid="casual-register">
            {register.map((w) => (
              <li key={w.id} className={`flex flex-wrap items-center justify-between gap-2 py-2 ${w.active ? "" : "text-slate-400"}`}>
                <span>
                  <b>{w.name}</b> <span className="text-xs text-slate-500">{[trades.label(w.trade), w.contractor, w.mobile].filter(Boolean).join(" · ")}</span>
                  {!w.active ? <span className="ml-1 text-xs">(inactive)</span> : null}
                </span>
                <span className="flex items-center gap-2">
                  <span className="text-xs text-slate-600">{w.dailyRate ? `₹${w.dailyRate}/day` : "No rate"}</span>
                  <Button size="sm" onClick={() => setEditing(w)}>
                    Edit
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setMerging(w)}>
                    Merge into…
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
      {editing ? <CasualEditDialog worker={editing} onClose={() => setEditing(null)} /> : null}
      {merging ? <MergeDialog worker={merging} onClose={() => setMerging(null)} /> : null}
    </div>
  );
}

/* ---------- monthly register ---------- */

const CELL: Record<AttendanceStatus | "none", [string, string]> = {
  present: ["P", "bg-emerald-50 text-emerald-800"],
  half: ["½", "bg-amber-50 text-amber-800"],
  absent: ["A", "bg-red-50 text-red-800"],
  holiday: ["H", "bg-sky-50 text-sky-800"],
  none: ["–", "text-slate-300"],
};

function RegisterTab() {
  const [month, setMonth] = useState(() => todayIso().slice(0, 7));
  const { data: rows = [], isPending } = useRegister(month);
  const { from, to } = monthBounds(month);
  const dates = dateRange(from, to);
  const exportCsv = () => {
    const header = ["Employee ID", "Name", "Department", ...dates.map((d) => d.slice(8)), "Present", "Half days", "Absent", "Holiday", "Not logged", "Days worked"];
    const cell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const lines = rows.map((r) =>
      [r.code, r.name, r.department, ...dates.map((d) => (r.days[d] === null ? "" : CELL[r.days[d] as AttendanceStatus | "none"][0])), r.summary.present, r.summary.half, r.summary.absent, r.summary.holiday, r.summary.notLogged, r.summary.daysWorked]
        .map((v) => cell(String(v)))
        .join(","),
    );
    const blob = new Blob(["\ufeff" + [header.join(","), ...lines].join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `attendance-register-${month}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Month</span>
          <input type="month" aria-label="Register month" value={month} max={todayIso().slice(0, 7)} onChange={(e) => e.target.value && setMonth(e.target.value)} className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </label>
        <Button disabled={!rows.length} onClick={exportCsv}>
          Export CSV (for payroll)
        </Button>
        <span className="text-xs text-slate-500">P present · ½ half day · A absent · H holiday · – not logged</span>
      </div>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        {isPending ? (
          <LoadingRows />
        ) : (
          <table className="text-xs" data-testid="register">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="sticky left-0 z-10 bg-slate-50 px-3 py-2 text-left">Employee</th>
                {dates.map((d) => (
                  <th key={d} className={`w-7 px-0.5 py-2 text-center font-medium ${dayLabel(d).startsWith("Sun") ? "text-red-700" : ""}`} title={dayLabel(d)}>
                    {Number(d.slice(8))}
                  </th>
                ))}
                <th className="px-2 text-right">Worked</th>
                <th className="px-2 text-right">Absent</th>
                <th className="px-2 text-right">Not logged</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.employeeId}>
                  <td className="sticky left-0 z-10 whitespace-nowrap bg-white px-3 py-1.5">
                    <Link href={`/employees/${r.employeeId}/attendance`} className="font-medium text-slate-900 hover:underline">
                      {r.name}
                    </Link>
                    <span className="block text-[10px] text-slate-500">{r.code}</span>
                  </td>
                  {dates.map((d) => {
                    const v = r.days[d];
                    if (v === null) return <td key={d} className="bg-slate-50" />;
                    const [t, c] = CELL[v];
                    return (
                      <td key={d} className={`px-0.5 text-center font-semibold ${c}`} title={`${dayLabel(d)}: ${v === "none" ? "Not logged" : statusMeta(v).label}`}>
                        {t}
                      </td>
                    );
                  })}
                  <td className="px-2 text-right font-semibold">{fmtManDays(r.summary.daysWorked)}</td>
                  <td className="px-2 text-right text-red-700">{r.summary.absent}</td>
                  <td className="px-2 text-right text-slate-500">{r.summary.notLogged}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/* ---------- page ---------- */

/** Attendance page (☰ menu): daily sheet of all employees for Admins and factory / office supervisors. */
export function AttendancePage() {
  const { data: access, isPending, error } = useAttendanceAccess();
  const [today, setToday] = useState(() => todayIso());
  const [date, setDate] = useState(today);
  const [tab, setTab] = useState<"employees" | "casual" | "register">("employees");
  const isAdmin = !!access?.isAdmin;
  const { data: notLogged = [] } = useSitesNotLogged(date, isAdmin);

  // After midnight the sheet moves on to the new day (if it was showing today).
  useEffect(() => {
    const t = setInterval(() => {
      const now = todayIso();
      if (now !== today) {
        setDate((d) => (d === today ? now : d));
        setToday(now);
      }
    }, 60_000);
    return () => clearInterval(t);
  }, [today]);

  if (error) return <PageContainer><EmptyState title="Only admins and factory / office supervisors can open the Attendance page." /></PageContainer>;
  if (isPending || !access) return <div className="p-6 text-sm text-slate-500">Loading…</div>;
  const locations: WorkLocation[] = isAdmin ? ["site", "factory", "office"] : access.supervises;

  return (
    <PageContainer wide>
      <PageHeader
        title="Attendance"
        subtitle={isAdmin ? "Who is where, every day. Site attendance is logged from each project's Attendance tab." : `Mark attendance at the ${locations.map((l) => LOCATIONS.find((x) => x.value === l)!.label).join(" / ")}.`}
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button aria-label="Previous day" onClick={() => setDate(addDays(date, -1))}>
          ‹
        </Button>
        <input type="date" aria-label="Attendance date" value={date} max={today} onChange={(e) => e.target.value && setDate(e.target.value > today ? today : e.target.value)} className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
        <Button aria-label="Next day" disabled={date >= today} onClick={() => setDate(addDays(date, 1))}>
          ›
        </Button>
        <span className="text-sm font-semibold text-slate-800">{date === today ? `Today, ${formatDate(date)}` : dayLabel(date)}</span>
        {date !== today ? (
          <Button size="sm" variant="ghost" onClick={() => setDate(today)}>
            Go to today
          </Button>
        ) : null}
      </div>
      {isAdmin && notLogged.length ? (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-900" data-testid="sites-not-logged">
          <b>Sites not logged {date === today ? "yet today" : `on ${dayLabel(date)}`}:</b>
          {notLogged.map((p) => (
            <Link key={p.projectId} href={`/projects/${p.projectId}/attendance`} className="rounded-full bg-white px-2.5 py-0.5 font-medium ring-1 ring-red-200 hover:bg-red-100">
              {p.code} {p.name}
            </Link>
          ))}
        </div>
      ) : null}
      <div className="mb-4 flex gap-2" role="tablist">
        {(
          [
            ["employees", "Employees", true],
            ["casual", "Casual workers", true],
            ["register", "Monthly register", isAdmin],
          ] as const
        )
          .filter(([, , show]) => show)
          .map(([k, l]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={tab === k}
              onClick={() => setTab(k)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium ${tab === k ? "bg-red-700 text-white" : "bg-white text-slate-700 ring-1 ring-slate-300"}`}
            >
              {l}
            </button>
          ))}
      </div>
      {tab === "employees" ? <EmployeesTab key={date} date={date} isAdmin={isAdmin} locations={locations} /> : tab === "casual" ? <CasualTab date={date} isAdmin={isAdmin} /> : <RegisterTab />}
    </PageContainer>
  );
}
