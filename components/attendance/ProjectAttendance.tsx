"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { EmptyState, LoadingRows, useUserName } from "@/components/crm/ui";
import { PhotoThumbs } from "@/components/files/Files";
import { useToast } from "@/components/Providers";
import { Button, Card, TextField, Toggle } from "@/components/ui/fields";
import { EDIT_WINDOW_DAYS, PHOTO_DISTANCE_WARN_M } from "@/lib/attendance/config";
import { useProjectAttendanceAccess, useProjectDay, useProjectDays } from "@/lib/attendance/hooks";
import { addDays, dayLabel, todayIso, withinWindow } from "@/lib/attendance/rules";
import type { DayPerson, ProjectDayRow } from "@/lib/attendance/types";
import { formatDateTime } from "@/lib/format";
import { projectRepo } from "@/lib/projects";
import { useProjectMutation } from "@/lib/projects/hooks";
import { attendanceOf } from "@/lib/projects/rules";
import type { Project } from "@/lib/projects/types";
import { useSettings } from "@/lib/settings/hooks";
import { AttendanceBadge, CountsText, fmtManDays } from "./bits";
import { LogDialog } from "./LogDialog";
import { Plus, TreePalm } from "lucide-react";
import { Icon } from "@/components/ui/icons";

function PeopleList({ title, people }: { title: string; people: DayPerson[] }) {
  return (
    <div>
      <h5 className="mb-1 text-xs font-semibold text-slate-500">
        {title} ({people.length})
      </h5>
      {people.length ? (
        <ul className="divide-y divide-slate-100 text-sm">
          {people.map((p) => (
            <li key={p.personId} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
              <span>
                <span className="font-medium text-slate-900">{p.name}</span> <span className="text-xs text-slate-500">· {p.role}</span>
                {p.record.remarks ? <span className="block text-xs text-slate-600">{p.record.remarks}</span> : null}
              </span>
              <AttendanceBadge status={p.record.status} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-slate-400">None</p>
      )}
    </div>
  );
}

function DayDetail({ project, date, canEdit, onEdit }: { project: Project; date: string; canEdit: boolean; onEdit: () => void }) {
  const userName = useUserName();
  const { data, isPending } = useProjectDay(project.id, date);
  if (isPending || !data) return <p className="px-4 pb-4 text-sm text-slate-500">Loading…</p>;
  const day = data.siteDay;
  return (
    <div className="space-y-4 border-t border-slate-100 px-4 pb-4 pt-3" data-testid="day-detail">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <PeopleList title="Employees" people={data.employees} />
        <PeopleList title="Casual workers" people={data.casual} />
      </div>
      {day?.photos.length ? (
        <div>
          <h5 className="mb-1 text-xs font-semibold text-slate-500">Group photo</h5>
          <PhotoThumbs photos={day.photos} />
          <p className="mt-1 text-xs text-slate-500">
            {day.photos[0].takenAt ? `Taken ${formatDateTime(day.photos[0].takenAt)}` : `Uploaded ${formatDateTime(day.photos[0].uploadedAt)}`}
            {day.photoDistanceM !== null ? ` · ${day.photoDistanceM > PHOTO_DISTANCE_WARN_M ? "far: " : ""}${(day.photoDistanceM / 1000).toFixed(1)} km from the site pin` : ""}
          </p>
        </div>
      ) : day && !day.holiday ? (
        <p className="text-xs text-slate-400">No group photo (imported record).</p>
      ) : null}
      {day?.editedAt ? (
        <p className="text-xs text-slate-500">
          Edited by {userName(day.editedBy)} on {formatDateTime(day.editedAt)}
        </p>
      ) : null}
      {canEdit ? (
        <div className="flex justify-end">
          <Button onClick={onEdit}>Edit</Button>
        </div>
      ) : null}
    </div>
  );
}

function DayRow({ project, row, open, onToggle, canEdit, onLog }: { project: Project; row: ProjectDayRow; open: boolean; onToggle: () => void; canEdit: boolean; onLog: () => void }) {
  const userName = useUserName();
  if (row.kind === "missing")
    return (
      <li className="flex flex-wrap items-center justify-between gap-2 bg-red-50/60 px-4 py-3" data-testid="att-day" data-kind="missing">
        <span className="text-sm">
          <b className="text-slate-900">{dayLabel(row.date)}</b> <span className="ml-2 font-semibold text-red-700">Not logged</span>
        </span>
        {canEdit ? (
          <Button size="sm" variant="primary" onClick={onLog}>
            Log now
          </Button>
        ) : null}
      </li>
    );
  if (row.kind === "holiday" && !row.manDays)
    return (
      <li className="flex items-center justify-between px-4 py-3 text-sm text-slate-500" data-testid="att-day" data-kind="holiday">
        <span>
          <b>{dayLabel(row.date)}</b> <span className="ml-2"><Icon icon={TreePalm} size={14} className="mr-1 inline-block align-[-2px]" />Holiday</span>
        </span>
        <span className="text-xs">{row.loggedBy ? `by ${userName(row.loggedBy)}` : "Company holiday"}</span>
      </li>
    );
  return (
    <li data-testid="att-day" data-kind="logged">
      <button type="button" onClick={onToggle} aria-expanded={open} className="grid w-full grid-cols-2 items-center gap-2 px-4 py-3 text-left text-sm hover:bg-slate-50 md:grid-cols-[9rem_1fr_1fr_6rem_14rem]">
        <b className="text-slate-900">{dayLabel(row.date)}</b>
        <span className="text-slate-700">
          <span className="text-xs text-slate-500 md:hidden">Employees </span>
          <CountsText c={row.employees} />
        </span>
        <span className="text-slate-700">
          <span className="text-xs text-slate-500 md:hidden">Casual </span>
          <CountsText c={row.casual} />
        </span>
        <span className="font-semibold text-slate-900">{fmtManDays(row.manDays)} man-days</span>
        <span className="text-xs text-slate-500">
          {userName(row.loggedBy)} · {row.loggedAt ? new Date(row.loggedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : ""}
          {row.edited ? <span className="ml-1 rounded bg-slate-100 px-1.5 py-0.5 font-semibold text-slate-600">edited</span> : null}
        </span>
      </button>
      {open ? <DayDetail project={project} date={row.date} canEdit={canEdit} onEdit={onLog} /> : null}
    </li>
  );
}

function AttendanceSettingsCard({ project }: { project: Project }) {
  const toast = useToast();
  const { data: settings } = useSettings();
  const att = attendanceOf(project);
  const [time, setTime] = useState(att.reminderTime);
  const save = useProjectMutation((s: { enabled: boolean; reminderTime: string }) => projectRepo.setAttendanceSettings(project.id, s));
  return (
    <Card title="Site attendance settings" description="Admins only.">
      <div className="flex flex-wrap items-end gap-4">
        <Toggle
          checked={att.enabled}
          onChange={(enabled) => save.mutate({ enabled, reminderTime: time }, { onSuccess: () => toast(`Site attendance ${enabled ? "on" : "off"}`), onError: (e) => toast(e.message, "error") })}
          label="Log site attendance for this project"
          hint="Switch off while the project is only in design or factory work. No reminders or Not logged days while off."
        />
        <div className="w-40">
          <TextField label="Reminder time" value={time} onChange={setTime} placeholder={settings?.attendance.reminderTime ?? "18:00"} hint={`Empty = default (${settings?.attendance.reminderTime ?? "18:00"})`} />
        </div>
        <Button size="sm" disabled={time === att.reminderTime || save.isPending} onClick={() => save.mutate({ enabled: att.enabled, reminderTime: time.trim() }, { onSuccess: () => toast("Reminder time saved"), onError: (e) => toast(e.message, "error") })}>
          Save time
        </Button>
      </div>
    </Card>
  );
}

/** Project → Attendance tab: one row per day, newest first, with Not logged gaps. */
export function ProjectAttendance({ p }: { p: Project }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [today] = useState(() => todayIso());
  const [from, setFrom] = useState(() => addDays(todayIso(), -30));
  const [to, setTo] = useState(today);
  const [open, setOpen] = useState<string | null>(null);
  const { data: access } = useProjectAttendanceAccess(p.id);
  const { data: rows, isPending } = useProjectDays(p.id, from, to);
  const logDate = params.get("log");
  const setLog = (date: string | null) => {
    const q = new URLSearchParams(params.toString());
    if (date) q.set("log", date);
    else q.delete("log");
    router.replace(`${pathname}${q.size ? `?${q}` : ""}`, { scroll: false });
  };
  const att = attendanceOf(p);
  const isAdmin = !!access?.isAdmin;
  const canLog = !!access?.canLog && (isAdmin || (att.enabled && p.status === "active"));
  const canEditDate = (d: string) => canLog && (isAdmin || withinWindow(d, today));
  const totals = (rows ?? []).reduce(
    (a, r) => ({ emp: a.emp + r.employees.present + r.employees.half * 0.5, cas: a.cas + r.casual.present + r.casual.half * 0.5, missing: a.missing + (r.kind === "missing" ? 1 : 0) }),
    { emp: 0, cas: 0, missing: 0 },
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-2">
          <TextField label="From" type="date" value={from} onChange={setFrom} />
          <TextField label="To" type="date" value={to} onChange={(v) => setTo(v > today ? today : v)} />
          <div className="flex gap-3 pb-2 text-sm text-slate-700" data-testid="att-totals">
            <span>
              Employees <b>{fmtManDays(totals.emp)}</b> man-days
            </span>
            <span>
              Casual <b>{fmtManDays(totals.cas)}</b> man-days
            </span>
            {totals.missing ? <span className="font-semibold text-red-700">{totals.missing} day{totals.missing === 1 ? "" : "s"} not logged</span> : null}
          </div>
        </div>
        {canLog ? (
          <Button variant="primary" onClick={() => setLog(today)}>
            <Icon icon={Plus} size={14} className="inline-block align-[-2px]" /> Log attendance
          </Button>
        ) : null}
      </div>
      {!att.enabled ? <p className="rounded-lg bg-slate-100 px-4 py-2 text-sm text-slate-600">Site attendance is switched off for this project.</p> : null}
      {access && !access.canLog ? (
        <p className="text-xs text-slate-500">Only the project manager, site engineers / erection supervisors on the team and admins can log attendance.</p>
      ) : !isAdmin && canLog ? (
        <p className="text-xs text-slate-500">You can log or change the last {EDIT_WINDOW_DAYS} days.</p>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="hidden grid-cols-[9rem_1fr_1fr_6rem_14rem] gap-2 bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-500 md:grid">
          <span>Date</span>
          <span>Employees</span>
          <span>Casual workers</span>
          <span>Total</span>
          <span>Logged by</span>
        </div>
        {isPending ? (
          <LoadingRows />
        ) : !rows?.length ? (
          <EmptyState title="No attendance in this range." />
        ) : (
          <ul className="divide-y divide-slate-100" data-testid="att-days">
            {rows.map((r) => (
              <DayRow key={r.date} project={p} row={r} open={open === r.date} onToggle={() => setOpen(open === r.date ? null : r.date)} canEdit={canEditDate(r.date)} onLog={() => setLog(r.date)} />
            ))}
          </ul>
        )}
      </div>

      {isAdmin ? <AttendanceSettingsCard project={p} /> : null}
      {logDate && access ? (
        canLog ? (
          <LogDialog project={p} initialDate={logDate > today ? today : logDate} isAdmin={isAdmin} onClose={() => setLog(null)} />
        ) : null
      ) : null}
    </div>
  );
}
