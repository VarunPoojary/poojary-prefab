"use client";

import { useState } from "react";
import { useUserName } from "@/components/crm/ui";
import { LOCATIONS, STATUSES, statusMeta } from "@/lib/attendance/config";
import type { AttendanceRecord, AttendanceStatus, RecordPatch, WorkLocation } from "@/lib/attendance/types";
import { formatDateTime } from "@/lib/format";
import { AttendanceBadge } from "./bits";

const sel = "h-10 min-w-0 rounded-lg border border-slate-300 bg-white pl-2.5 text-sm disabled:bg-slate-50 md:h-9";

export interface ProjectOption {
  id: string;
  code: string;
  name: string;
}

/** Status + location (+ project for site) dropdowns that save as soon as the combination is complete. */
export function RecordEditor({
  record,
  editable,
  locations,
  projects,
  defaultLocation,
  label,
  onSave,
  saving,
}: {
  record: AttendanceRecord | null;
  editable: boolean;
  /** Locations this user may choose. */
  locations: WorkLocation[];
  projects: ProjectOption[];
  defaultLocation?: WorkLocation;
  label: string;
  onSave: (patch: RecordPatch) => void;
  saving?: boolean;
}) {
  const [draft, setDraft] = useState<{ status: AttendanceStatus | ""; location: WorkLocation | ""; projectId: string } | null>(null);
  const status = draft?.status ?? record?.status ?? "";
  const location = draft?.location ?? record?.location ?? "";
  const projectId = draft?.projectId ?? record?.projectId ?? "";
  const projectName = (id: string | null) => projects.find((p) => p.id === id);

  if (!editable) {
    const pr = projectName(record?.projectId ?? null);
    return (
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <AttendanceBadge status={record?.status ?? null} />
        <span className="text-slate-700">{record?.location ? `${LOCATIONS.find((l) => l.value === record.location)!.label}${pr ? ` – ${pr.code}` : ""}` : ""}</span>
      </div>
    );
  }

  const tryCommit = (next: { status: AttendanceStatus | ""; location: WorkLocation | ""; projectId: string }) => {
    let loc = next.location;
    if (!loc && next.status && defaultLocation && (next.status === "present" || next.status === "half")) loc = defaultLocation;
    const complete =
      !!next.status &&
      (next.status === "absent" || next.status === "holiday" || !!loc) &&
      (loc !== "site" || !!next.projectId);
    setDraft({ ...next, location: loc });
    if (!complete) return;
    setDraft(null);
    onSave({ status: next.status as AttendanceStatus, location: (loc || null) as WorkLocation | null, projectId: loc === "site" ? next.projectId : null, remarks: record?.remarks ?? "" });
  };
  const needsLocation = (status === "present" || status === "half") && !location;

  return (
    // Phones: status and location side by side, project on its own row. Wider: one wrapping row.
    <div className="grid grid-cols-2 gap-1.5 md:flex md:flex-wrap md:items-center">
      <select
        aria-label={`Status of ${label}`}
        value={status}
        disabled={saving}
        onChange={(e) => tryCommit({ status: e.target.value as AttendanceStatus, location: location as WorkLocation | "", projectId })}
        className={`${sel} ${status ? statusMeta(status).badge : "text-slate-400"}`}
      >
        {!status ? <option value="">Not logged</option> : null}
        {STATUSES.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>
      <select
        aria-label={`Location of ${label}`}
        value={location}
        disabled={saving || !status}
        onChange={(e) => tryCommit({ status, location: e.target.value as WorkLocation | "", projectId: e.target.value === "site" ? projectId : "" })}
        className={`${sel} ${needsLocation ? "border-amber-400 ring-2 ring-amber-100" : ""}`}
      >
        <option value="">{needsLocation ? "Choose location…" : "–"}</option>
        {LOCATIONS.filter((l) => locations.includes(l.value) || l.value === location).map((l) => (
          <option key={l.value} value={l.value} disabled={!locations.includes(l.value)}>
            {l.label}
          </option>
        ))}
      </select>
      {location === "site" ? (
        <select aria-label={`Project of ${label}`} value={projectId} disabled={saving} onChange={(e) => tryCommit({ status, location: "site", projectId: e.target.value })} className={`${sel} col-span-2 md:max-w-[12rem] ${!projectId ? "border-amber-400 ring-2 ring-amber-100" : ""}`}>
          <option value="">Choose project…</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.code} – {p.name}
            </option>
          ))}
          {projectId && !projects.some((p) => p.id === projectId) ? <option value={projectId}>Other project</option> : null}
        </select>
      ) : null}
    </div>
  );
}

/** "edited 2×" with the change history in a popover. */
export function HistoryNote({ record }: { record: AttendanceRecord | null }) {
  const userName = useUserName();
  if (!record?.history.length) return null;
  const fmt = (v: Partial<AttendanceRecord>) =>
    [v.status ? statusMeta(v.status).label : "", v.location !== undefined ? (v.location ? LOCATIONS.find((l) => l.value === v.location)!.label : "no location") : "", v.remarks !== undefined ? `“${v.remarks}”` : ""]
      .filter(Boolean)
      .join(", ");
  return (
    <details className="relative inline-block">
      <summary className="cursor-pointer list-none py-1 text-xs font-medium text-slate-500 hover:text-slate-800 [&::-webkit-details-marker]:hidden">edited {record.history.length}×</summary>
      <div className="absolute left-0 z-20 mt-1 w-[min(18rem,calc(100vw-3rem))] rounded-xl border border-slate-200 bg-white p-3 text-xs shadow-lg md:left-auto md:right-0">
        <ul className="space-y-1.5">
          {[...record.history].reverse().map((h, i) => (
            <li key={i}>
              <span className="text-slate-500">{formatDateTime(h.at)}</span> · {userName(h.by)}
              <span className="block text-slate-800">
                {fmt(h.from) || "–"} → {fmt(h.to) || "–"}
              </span>
              {h.note ? <span className="block text-slate-500">{h.note}</span> : null}
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}
