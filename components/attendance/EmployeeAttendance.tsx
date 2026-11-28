"use client";

import Link from "next/link";
import { useState } from "react";
import { EmptyState, LoadingRows, useUserName } from "@/components/crm/ui";
import { useToast } from "@/components/Providers";
import { Card } from "@/components/ui/fields";
import { attendanceRepo } from "@/lib/attendance";
import { STATUSES } from "@/lib/attendance/config";
import { useAttendanceMutation, useEmployeeMonth } from "@/lib/attendance/hooks";
import { dayLabel, todayIso } from "@/lib/attendance/rules";
import type { AttendanceStatus, RecordPatch } from "@/lib/attendance/types";
import { formatDateTime } from "@/lib/format";
import { useProjects } from "@/lib/projects/hooks";
import type { Employee } from "@/lib/employees/types";
import { fmtManDays } from "./bits";
import { HistoryNote, RecordEditor } from "./RecordEditor";

function Tile({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
      <div className="text-[11px] font-semibold text-slate-500">{label}</div>
      <div className={`text-lg font-semibold ${tone ?? "text-slate-900"}`}>{value}</div>
    </div>
  );
}

/** Employee → Attendance tab: every day of the month (including Not logged), with a monthly summary. Admins edit. */
export function EmployeeAttendance({ employee }: { employee: Employee }) {
  const toast = useToast();
  const userName = useUserName();
  const [month, setMonth] = useState(() => todayIso().slice(0, 7));
  const [status, setStatus] = useState<AttendanceStatus | "not_logged" | "">("");
  const { data, isPending } = useEmployeeMonth(employee.id, month);
  const { data: projects = [] } = useProjects({ statuses: [] });
  const save = useAttendanceMutation(({ date, patch }: { date: string; patch: RecordPatch }) => attendanceRepo.setRecord(employee.id, date, patch));
  const rows = (data?.rows ?? []).filter((r) => !status || (status === "not_logged" ? !r.record : r.record?.status === status));
  const s = data?.summary;
  const projectOf = (id: string | null) => projects.find((p) => p.id === id);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="mb-1 block text-xs font-semibold text-slate-600">Month</span>
          <input type="month" aria-label="Month" value={month} max={todayIso().slice(0, 7)} onChange={(e) => e.target.value && setMonth(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs font-semibold text-slate-600">Status</span>
          <select aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
            <option value="">All days</option>
            {STATUSES.map((x) => (
              <option key={x.value} value={x.value}>
                {x.label}
              </option>
            ))}
            <option value="not_logged">Not logged</option>
          </select>
        </label>
      </div>
      {s ? (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6" data-testid="month-summary">
          <Tile label="Present" value={s.present} tone="text-emerald-700" />
          <Tile label="Half days" value={s.half} tone="text-amber-700" />
          <Tile label="Absent" value={s.absent} tone="text-red-700" />
          <Tile label="Holiday" value={s.holiday} tone="text-sky-700" />
          <Tile label="Not logged" value={s.notLogged} tone="text-slate-500" />
          <Tile label="Days worked" value={fmtManDays(s.daysWorked)} />
        </div>
      ) : null}
      <Card>
        {isPending ? (
          <LoadingRows />
        ) : !rows.length ? (
          <EmptyState title="No days to show for this month." />
        ) : (
          <div className="-mx-4 -my-4 overflow-x-auto sm:-mx-6 sm:-my-6">
            <table className="stack-table w-full min-w-[760px] text-sm" data-testid="employee-attendance">
              <thead className="bg-slate-50 text-left text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-2">Date</th>
                  <th className="px-4 py-2">Status and location</th>
                  <th className="px-4 py-2">Logged by</th>
                  <th className="px-4 py-2">Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map(({ date, record }) => {
                  const pr = projectOf(record?.projectId ?? null);
                  return (
                    <tr key={date} className={record ? "" : "text-slate-400"} data-testid="employee-day">
                      <td className="whitespace-nowrap px-4 py-2 font-medium">{dayLabel(date)}</td>
                      <td className="px-4 py-2">
                        <RecordEditor
                          key={record ? `${record.id}-${record.history.length}` : date}
                          label={dayLabel(date)}
                          record={record}
                          editable
                          locations={["site", "factory", "office"]}
                          projects={projects.filter((p) => p.status === "active" || p.status === "on_hold" || p.id === record?.projectId)}
                          saving={save.isPending}
                          onSave={(patch) => save.mutate({ date, patch }, { onSuccess: () => toast(`${dayLabel(date)} saved`), onError: (e) => toast(e.message, "error") })}
                        />
                        {record?.location === "site" && pr ? (
                          <Link href={`/projects/${pr.id}/attendance`} className="mt-0.5 block text-xs text-red-700 hover:underline">
                            {pr.code} · {pr.name}
                          </Link>
                        ) : null}
                      </td>
                      <td data-half data-label="Logged by" className="whitespace-nowrap px-4 py-2 text-xs text-slate-600">
                        {record ? (
                          <>
                            {userName(record.loggedBy)}
                            <span className="block text-slate-400">{formatDateTime(record.loggedAt)}</span>
                            <HistoryNote record={record} />
                          </>
                        ) : null}
                      </td>
                      <td data-half data-label="Remarks" className="px-4 py-2 text-xs text-slate-600">{record?.remarks}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <p className="text-xs text-slate-400">Days run from the date of joining (or the 1st) to today; days after leaving aren&apos;t shown. Days worked = present + ½ × half days.</p>
    </div>
  );
}
