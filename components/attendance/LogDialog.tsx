"use client";

import { useState } from "react";
import { ErrorList } from "@/components/crm/ui";
import { PhotoPicker, PhotoThumbs } from "@/components/files/Files";
import { useToast } from "@/components/Providers";
import { Button, Select, TextField } from "@/components/ui/fields";
import { Modal } from "@/components/ui/overlays";
import { attendanceRepo } from "@/lib/attendance";
import { EDIT_WINDOW_DAYS, PHOTO_DISTANCE_WARN_M } from "@/lib/attendance/config";
import { useAttendanceMutation, useCasualWorkers, useProjectDay } from "@/lib/attendance/hooks";
import { addDays, countStatuses, dayLabel, distanceM, todayIso } from "@/lib/attendance/rules";
import { AttendanceConflictError, type AttendanceStatus, type Conflict, type PersonKind, type Resolutions, type SiteDay } from "@/lib/attendance/types";
import { useUsers } from "@/lib/crm/hooks";
import type { PhotoRef } from "@/lib/files";
import type { Project } from "@/lib/projects/types";
import { useList } from "@/lib/settings/hooks";
import { StatusButtons } from "./bits";
import { Camera, CheckCheck, Copy, Plus, TreePalm, TriangleAlert, X } from "lucide-react";
import { Icon } from "@/components/ui/icons";

interface Row {
  personKind: PersonKind;
  personId: string;
  name: string;
  role: string;
  status: AttendanceStatus;
  remarks: string;
}

const issuesOf = (e: unknown) => (e && typeof e === "object" && "issues" in e ? (e as { issues: string[] }).issues : [e instanceof Error ? e.message : String(e)]);
const input = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-red-600 focus:ring-2 focus:ring-red-100";

function PersonRow({ row, onChange, onRemove }: { row: Row; onChange: (r: Row) => void; onRemove: () => void }) {
  const [showRemarks, setShowRemarks] = useState(!!row.remarks);
  return (
    <li className="space-y-2 py-3" data-testid="log-person">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-medium text-slate-900">{row.name}</div>
          <div className="text-xs text-slate-500">{row.role}</div>
        </div>
        <div className="flex shrink-0 gap-1">
          <button type="button" className="rounded px-2 py-1 text-xs text-slate-500 hover:bg-slate-100" onClick={() => setShowRemarks((v) => !v)}>
            {showRemarks ? "Hide note" : "+ Note"}
          </button>
          <button type="button" aria-label={`Remove ${row.name}`} className="rounded px-2 py-1 text-xs text-slate-400 hover:bg-red-50 hover:text-red-700" onClick={onRemove}>
            <Icon icon={X} size={16} />
          </button>
        </div>
      </div>
      <StatusButtons name={row.name} value={row.status} onChange={(status) => onChange({ ...row, status })} />
      {showRemarks ? (
        <input aria-label={`Remarks for ${row.name}`} placeholder="e.g. left at 2 PM" value={row.remarks} onChange={(e) => onChange({ ...row, remarks: e.target.value })} className={input} />
      ) : null}
    </li>
  );
}

function NewCasualForm({ onAdded, onCancel, initialName }: { onAdded: (r: Row) => void; onCancel: () => void; initialName: string }) {
  const trades = useList("trades");
  const [f, setF] = useState({ name: initialName, mobile: "", trade: "", contractor: "" });
  const [issues, setIssues] = useState<string[]>([]);
  const add = useAttendanceMutation(() => attendanceRepo.addCasual(f));
  return (
    <div className="space-y-3 rounded-lg border border-sky-200 bg-sky-50/50 p-3" data-testid="new-casual">
      <div className="text-sm font-semibold text-slate-800">New casual worker</div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <TextField label="Name" required value={f.name} onChange={(name) => setF({ ...f, name })} />
        <Select label="Trade *" value={f.trade} onChange={(trade) => setF({ ...f, trade })} options={[{ value: "", label: "Choose…" }, ...trades.items]} />
        <TextField label="Mobile" value={f.mobile} onChange={(mobile) => setF({ ...f, mobile })} />
        <TextField label="Contractor / mukadam" value={f.contractor} onChange={(contractor) => setF({ ...f, contractor })} />
      </div>
      <ErrorList issues={issues} />
      <div className="flex justify-end gap-2">
        <Button size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          size="sm"
          variant="primary"
          disabled={add.isPending}
          onClick={() =>
            add.mutate(undefined, {
              onSuccess: (w) => onAdded({ personKind: "casual", personId: w.id, name: w.name, role: trades.label(w.trade), status: "present", remarks: "" }),
              onError: (e) => setIssues(issuesOf(e)),
            })
          }
        >
          Add to list
        </Button>
      </div>
    </div>
  );
}

function ConflictPanel({ conflicts, resolutions, onChange }: { conflicts: Conflict[]; resolutions: Resolutions; onChange: (r: Resolutions) => void }) {
  return (
    <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3" role="alert" data-testid="conflicts">
      <p className="text-sm font-semibold text-amber-900">Already marked somewhere else on this day — choose which record to keep:</p>
      {conflicts.map((c) => (
        <div key={c.key} className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="text-amber-900">
            <b>{c.name}</b> is at {c.where} (by {c.loggedByName})
          </span>
          <span className="flex gap-1">
            {(["keep", "replace"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => onChange({ ...resolutions, [c.key]: v })}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${resolutions[c.key] === v ? "bg-amber-600 text-white" : "bg-white text-amber-900 ring-1 ring-amber-300"}`}
              >
                {v === "keep" ? "Keep existing" : "Replace with this one"}
              </button>
            ))}
          </span>
        </div>
      ))}
    </div>
  );
}

function LogForm({
  project,
  date,
  isAdmin,
  initial,
  existingDay,
  onClose,
  dateControl,
}: {
  project: Project;
  date: string;
  isAdmin: boolean;
  initial: Row[];
  existingDay: SiteDay | null;
  onClose: () => void;
  dateControl: React.ReactNode;
}) {
  const toast = useToast();
  const { data: users = [] } = useUsers();
  const trades = useList("trades");
  const [rows, setRows] = useState<Row[]>(initial);
  const [empQuery, setEmpQuery] = useState("");
  const [casQuery, setCasQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [photos, setPhotos] = useState<PhotoRef[]>([]);
  const [geo, setGeo] = useState<SiteDay["photoLocation"]>(null);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [resolutions, setResolutions] = useState<Resolutions>({});
  const [confirming, setConfirming] = useState(false);
  const [issues, setIssues] = useState<string[]>([]);
  const { data: casualFound = [] } = useCasualWorkers(casQuery, false, casQuery.trim().length > 0);
  const save = useAttendanceMutation(() =>
    attendanceRepo.saveSiteDay(project.id, {
      date,
      entries: rows.map(({ personKind, personId, status, remarks }) => ({ personKind, personId, status, remarks })),
      photos,
      photoLocation: geo,
      resolutions,
    }),
  );
  const holiday = useAttendanceMutation(() => attendanceRepo.markSiteHoliday(project.id, date));
  const editing = !!existingDay && !existingDay.holiday;
  const has = (kind: PersonKind, id: string) => rows.some((r) => r.personKind === kind && r.personId === id);
  const addRow = (r: Row) => setRows((x) => (x.some((y) => y.personKind === r.personKind && y.personId === r.personId) ? x : [...x, r]));
  const terms = empQuery.toLowerCase().split(/\s+/).filter(Boolean);
  const empFound = terms.length
    ? users
        .filter((u) => u.active && (!u.dateOfJoining || u.dateOfJoining <= date) && !has("employee", u.id))
        .filter((u) => terms.every((t) => `${u.name} ${u.code} ${u.mobile}`.toLowerCase().includes(t)))
        .slice(0, 6)
    : [];
  const emp = rows.filter((r) => r.personKind === "employee");
  const cas = rows.filter((r) => r.personKind === "casual");
  const needPhoto = !photos.length && !(existingDay && existingDay.photos.length);
  const distance = geo && project.lat !== null && project.lng !== null ? distanceM(geo, { lat: project.lat, lng: project.lng }) : null;

  const copyPrevious = async () => {
    const prev = await attendanceRepo.previousDay(project.id, date);
    if (!prev) return toast("No earlier attendance at this site.", "error");
    const detail = await attendanceRepo.projectDay(project.id, prev.date);
    const people = [...detail.employees, ...detail.casual];
    let n = 0;
    for (const e of prev.entries) {
      const p = people.find((x) => x.personKind === e.personKind && x.personId === e.personId);
      if (!p || has(e.personKind, e.personId)) continue;
      addRow({ personKind: e.personKind, personId: e.personId, name: p.name, role: p.role, status: "present", remarks: "" });
      n++;
    }
    toast(`${n} ${n === 1 ? "person" : "people"} copied from ${dayLabel(prev.date)}`);
  };

  const captureLocation = () => {
    if (geo || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (p) => setGeo({ lat: Math.round(p.coords.latitude * 1e6) / 1e6, lng: Math.round(p.coords.longitude * 1e6) / 1e6, accuracy: Math.round(p.coords.accuracy) }),
      () => undefined,
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const submit = () =>
    save.mutate(undefined, {
      onSuccess: () => {
        toast(editing ? "Attendance updated" : "Attendance saved");
        onClose();
      },
      onError: (e) => {
        setConfirming(false);
        if (e instanceof AttendanceConflictError) {
          setConflicts((c) => [...c.filter((x) => !e.conflicts.some((y) => y.key === x.key)), ...e.conflicts]);
          setIssues([]);
        } else setIssues(issuesOf(e));
      },
    });

  const summary = `${emp.length} employee${emp.length === 1 ? "" : "s"}, ${cas.length} casual worker${cas.length === 1 ? "" : "s"}`;
  const counts = countStatuses(rows.map((r) => r.status));

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={`${editing ? "Edit" : "Log"} attendance – ${dayLabel(date)}`}
      footer={
        confirming ? (
          <>
            <Button onClick={() => setConfirming(false)}>Back</Button>
            <Button variant="primary" disabled={save.isPending} onClick={submit}>
              {save.isPending ? "Saving…" : "Confirm and save"}
            </Button>
          </>
        ) : (
          <>
            {!editing ? (
              <Button
                variant="ghost"
                disabled={holiday.isPending}
                onClick={() =>
                  window.confirm(`Mark ${dayLabel(date)} as a holiday for this site? No list or photo is needed and no reminder is sent.`) &&
                  holiday.mutate(undefined, { onSuccess: () => (toast("Site holiday saved"), onClose()), onError: (e) => setIssues(issuesOf(e)) })
                }
              >
                <Icon icon={TreePalm} size={14} className="mr-1 inline-block align-[-2px]" />Mark site holiday
              </Button>
            ) : null}
            <Button onClick={onClose}>Cancel</Button>
            <Button
              variant="primary"
              disabled={!rows.length || needPhoto}
              title={needPhoto ? "Take a group photo first" : !rows.length ? "Add people first" : undefined}
              onClick={() => {
                const unresolved = conflicts.filter((c) => !resolutions[c.key] && has(c.personKind, c.personId));
                if (unresolved.length) return setIssues(["Choose Keep existing or Replace for everyone marked elsewhere."]);
                setIssues([]);
                setConfirming(true);
              }}
            >
              Save…
            </Button>
          </>
        )
      }
    >
      {confirming ? (
        <div className="space-y-2 text-sm" data-testid="log-summary">
          <p className="text-base font-semibold text-slate-900">Save attendance for {dayLabel(date)}?</p>
          <p>{summary}</p>
          <p className="text-slate-600">
            {counts.present} present · {counts.half} half day · {counts.absent} absent{counts.holiday ? ` · ${counts.holiday} holiday` : ""}
          </p>
          {photos.length ? <p className="text-slate-600"><Icon icon={Camera} size={14} className="mr-1 inline-block align-[-2px]" />{photos.length} group photo{photos.length === 1 ? "" : "s"}</p> : null}
        </div>
      ) : (
        <div className="space-y-5">
          {dateControl}
          {existingDay?.holiday ? <p className="rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-900">This day is marked as a site holiday. Saving a list replaces the holiday.</p> : null}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => void copyPrevious()}>
              <Icon icon={Copy} size={14} className="mr-1 inline-block align-[-2px]" />Copy previous day
            </Button>
            <Button size="sm" disabled={!rows.length} onClick={() => setRows((x) => x.map((r) => ({ ...r, status: "present" })))}>
              <Icon icon={CheckCheck} size={14} className="mr-1 inline-block align-[-2px]" />Mark all present
            </Button>
          </div>

          <section>
            <h4 className="mb-1 text-sm font-semibold text-slate-800">Employees ({emp.length})</h4>
            <input type="search" aria-label="Search employees" placeholder="Search name, employee ID or mobile…" value={empQuery} onChange={(e) => setEmpQuery(e.target.value)} className={input} />
            {empFound.length ? (
              <ul className="mt-1 divide-y divide-slate-100 rounded-lg border border-slate-200">
                {empFound.map((u) => (
                  <li key={u.id}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between px-3 py-2.5 text-left text-sm hover:bg-slate-50"
                      onClick={() => {
                        addRow({ personKind: "employee", personId: u.id, name: u.name, role: u.designation, status: "present", remarks: "" });
                        setEmpQuery("");
                      }}
                    >
                      <span>
                        <b>{u.name}</b> <span className="text-xs text-slate-500">{u.code} · {u.designation}</span>
                      </span>
                      <span className="text-xs font-semibold text-red-700"><Icon icon={Plus} size={14} className="inline-block align-[-2px]" /> Add</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            <ul className="divide-y divide-slate-100">
              {emp.map((r) => (
                <PersonRow key={r.personId} row={r} onChange={(n) => setRows((x) => x.map((y) => (y === r ? n : y)))} onRemove={() => setRows((x) => x.filter((y) => y !== r))} />
              ))}
            </ul>
          </section>

          <section>
            <h4 className="mb-1 text-sm font-semibold text-slate-800">Casual workers ({cas.length})</h4>
            <input type="search" aria-label="Search casual workers" placeholder="Search the casual workers register…" value={casQuery} onChange={(e) => setCasQuery(e.target.value)} className={input} />
            {casQuery.trim() ? (
              <ul className="mt-1 divide-y divide-slate-100 rounded-lg border border-slate-200">
                {casualFound
                  .filter((w) => !has("casual", w.id))
                  .slice(0, 6)
                  .map((w) => (
                    <li key={w.id}>
                      <button
                        type="button"
                        className="flex w-full items-center justify-between px-3 py-2.5 text-left text-sm hover:bg-slate-50"
                        onClick={() => {
                          addRow({ personKind: "casual", personId: w.id, name: w.name, role: trades.label(w.trade), status: "present", remarks: "" });
                          setCasQuery("");
                        }}
                      >
                        <span>
                          <b>{w.name}</b> <span className="text-xs text-slate-500">{[trades.label(w.trade), w.contractor, w.mobile].filter(Boolean).join(" · ")}</span>
                        </span>
                        <span className="text-xs font-semibold text-red-700"><Icon icon={Plus} size={14} className="inline-block align-[-2px]" /> Add</span>
                      </button>
                    </li>
                  ))}
                <li>
                  <button type="button" className="w-full px-3 py-2.5 text-left text-sm font-medium text-sky-800 hover:bg-sky-50" onClick={() => setAdding(true)}>
                    <Icon icon={Plus} size={14} className="inline-block align-[-2px]" /> Add new casual worker “{casQuery.trim()}”
                  </button>
                </li>
              </ul>
            ) : (
              <button type="button" className="mt-1 text-xs font-medium text-sky-800 hover:underline" onClick={() => setAdding(true)}>
                <Icon icon={Plus} size={14} className="inline-block align-[-2px]" /> Add new casual worker
              </button>
            )}
            {adding ? (
              <div className="mt-2">
                <NewCasualForm
                  initialName={casQuery.trim()}
                  onCancel={() => setAdding(false)}
                  onAdded={(r) => {
                    addRow(r);
                    setAdding(false);
                    setCasQuery("");
                  }}
                />
              </div>
            ) : null}
            <ul className="divide-y divide-slate-100">
              {cas.map((r) => (
                <PersonRow key={r.personId} row={r} onChange={(n) => setRows((x) => x.map((y) => (y === r ? n : y)))} onRemove={() => setRows((x) => x.filter((y) => y !== r))} />
              ))}
            </ul>
          </section>

          <section>
            <h4 className="mb-1 text-sm font-semibold text-slate-800">
              Group photo of the crew {editing && existingDay?.photos.length ? "(optional – one is already saved)" : <span className="text-red-700">*</span>}
            </h4>
            {existingDay?.photos.length ? <PhotoThumbs photos={existingDay.photos} /> : null}
            <PhotoPicker photos={photos} onChange={setPhotos} capture label="Take group photo" onAdded={captureLocation} max={4} />
            {distance !== null && distance > PHOTO_DISTANCE_WARN_M ? (
              <p className="mt-1 text-xs font-medium text-amber-800" data-testid="photo-distance">
                <Icon icon={TriangleAlert} size={14} className="mr-1 inline-block align-[-2px]" />This photo was taken about {(distance / 1000).toFixed(1)} km from the site pin. You can still save; it will be noted.
              </p>
            ) : null}
            {needPhoto && rows.length ? <p className="mt-1 text-xs text-slate-500">Save stays disabled until a photo is added.</p> : null}
          </section>

          {conflicts.filter((c) => has(c.personKind, c.personId)).length ? (
            <ConflictPanel conflicts={conflicts.filter((c) => has(c.personKind, c.personId))} resolutions={resolutions} onChange={setResolutions} />
          ) : null}
          {!isAdmin ? <p className="text-xs text-slate-400">Site managers can log or change the last {EDIT_WINDOW_DAYS} days; older days only admins.</p> : null}
          <ErrorList issues={issues} />
        </div>
      )}
    </Modal>
  );
}

/** "Log attendance" popup: date picker, then the form for that date (pre-filled when the day is already logged). */
export function LogDialog({ project, initialDate, isAdmin, onClose }: { project: Project; initialDate: string; isAdmin: boolean; onClose: () => void }) {
  const [today] = useState(() => todayIso());
  const [date, setDate] = useState(initialDate);
  const { data, isPending } = useProjectDay(project.id, date);
  const min = isAdmin ? project.startDate : [addDays(today, -EDIT_WINDOW_DAYS), project.startDate].sort().pop()!;
  if (isPending || !data)
    return (
      <Modal open onClose={onClose} title="Log attendance">
        <p className="text-sm text-slate-500">Loading…</p>
      </Modal>
    );
  const initial: Row[] = [...data.employees, ...data.casual].map((p) => ({ personKind: p.personKind, personId: p.personId, name: p.name, role: p.role, status: p.record.status, remarks: p.record.remarks }));
  return (
    <LogForm
      key={date}
      project={project}
      date={date}
      isAdmin={isAdmin}
      initial={initial}
      existingDay={data.siteDay}
      onClose={onClose}
      dateControl={
        <label className="flex items-center gap-2 text-sm">
          <span className="font-semibold text-slate-700">Date</span>
          <input type="date" aria-label="Attendance date" value={date} min={min} max={today} onChange={(e) => e.target.value && setDate(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
          {date === today ? <span className="text-xs text-slate-500">Today</span> : null}
        </label>
      }
    />
  );
}
