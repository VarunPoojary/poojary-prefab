"use client";

import { NOT_LOGGED, STATUSES, statusMeta } from "@/lib/attendance/config";
import type { AttendanceStatus, Counts } from "@/lib/attendance/types";

export function AttendanceBadge({ status }: { status: AttendanceStatus | null }) {
  const m = status ? statusMeta(status) : NOT_LOGGED;
  return <span className={`inline-flex whitespace-nowrap rounded-lg px-2 py-0.5 text-[11px] font-semibold ${m.badge}`}>{m.label}</span>;
}

/** Four big buttons: Present / Half day / Absent / Holiday (phone-friendly). */
export function StatusButtons({ value, onChange, name }: { value: AttendanceStatus; onChange: (s: AttendanceStatus) => void; name: string }) {
  return (
    <div className="grid grid-cols-4 gap-1" role="radiogroup" aria-label={`Status of ${name}`}>
      {STATUSES.map((s) => (
        <button
          key={s.value}
          type="button"
          role="radio"
          aria-checked={value === s.value}
          aria-label={`${s.label} – ${name}`}
          onClick={() => onChange(s.value)}
          className={`rounded-lg px-1 py-2 text-xs font-semibold ${value === s.value ? s.button : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}

/** "8 P · 1 ½ · 0 A" */
export function CountsText({ c }: { c: Counts }) {
  const parts = [`${c.present} P`, `${c.half} ½`, `${c.absent} A`];
  if (c.holiday) parts.push(`${c.holiday} H`);
  return <span className="tabular-nums">{parts.join(" · ")}</span>;
}

export const fmtManDays = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
