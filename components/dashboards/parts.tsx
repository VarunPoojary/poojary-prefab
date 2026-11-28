"use client";

import Link from "next/link";
import { useUserName } from "@/components/crm/ui";
import { stageLabel } from "@/components/projects/bits";
import type { DailyCheckDay, DayState, DelayBreakdown, LookaheadItem } from "@/lib/dashboards/types";
import { formatDate } from "@/lib/format";
import { useList } from "@/lib/settings/hooks";

/** One figure with its label, and an optional note underneath (comparison or context). */
export function StatTile({ label, value, note, tone }: { label: string; value: React.ReactNode; note?: React.ReactNode; tone?: "bad" | "warn" }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`mt-1 text-[26px] font-medium leading-tight tabular-nums ${tone === "bad" ? "text-red-700" : tone === "warn" ? "text-amber-700" : "text-slate-900"}`}>{value}</div>
      {note ? <div className="mt-0.5 text-xs text-slate-500">{note}</div> : null}
    </div>
  );
}

/** Actual % as a bar with a tick at the planned % for today. */
export function PlanBar({ pct, planned, tone }: { pct: number; planned: number | null; tone?: "bad" | "warn" }) {
  const v = Math.max(0, Math.min(100, pct));
  const fill = tone === "bad" ? "bg-red-700" : tone === "warn" ? "bg-amber-500" : v >= 99.999 ? "bg-emerald-600" : "bg-slate-700";
  return (
    <div className="relative h-2.5 w-full rounded-full bg-slate-200" role="img" aria-label={`${Math.round(v)}% done${planned !== null ? `, ${Math.round(planned)}% planned by today` : ""}`}>
      <div className={`h-full rounded-full ${fill}`} style={{ width: `${v}%` }} />
      {planned !== null ? (
        <div className="absolute -top-1 h-[18px] w-0.5 rounded-full bg-slate-900" style={{ left: `calc(${Math.max(0, Math.min(100, planned))}% - 1px)` }} title={`Planned by today: ${Math.round(planned)}%`} />
      ) : null}
    </div>
  );
}

export function PlanLegend() {
  return (
    <span className="inline-flex items-center gap-3 text-xs text-slate-500">
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2 w-4 rounded-full bg-slate-700" /> Done
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-3 w-0.5 rounded-full bg-slate-900" /> Planned by today
      </span>
    </span>
  );
}

const DAY_STYLE: Record<DayState, { cls: string; label: string }> = {
  done: { cls: "bg-emerald-600", label: "Attendance and progress posted" },
  partial: { cls: "bg-amber-400", label: "Only one of attendance / progress" },
  missing: { cls: "bg-red-700", label: "Nothing posted" },
  pending: { cls: "bg-white ring-1 ring-inset ring-slate-400", label: "Today, still time" },
  holiday: { cls: "bg-slate-300", label: "Holiday" },
  off: { cls: "bg-slate-100 ring-1 ring-inset ring-slate-200", label: "Attendance not on" },
};

/** 7 small squares, oldest first, coloured by the daily check. */
export function DayDots({ days }: { days: DailyCheckDay[] }) {
  return (
    <span className="inline-flex gap-1" aria-label="Last 7 days">
      {days.map((d) => (
        <span
          key={d.date}
          title={`${formatDate(d.date)}: ${DAY_STYLE[d.state].label}`}
          className={`h-3.5 w-3.5 rounded-[3px] ${DAY_STYLE[d.state].cls}`}
        />
      ))}
    </span>
  );
}

export function DayLegend() {
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
      {(["done", "partial", "missing", "pending", "holiday"] as DayState[]).map((s) => (
        <span key={s} className="inline-flex items-center gap-1.5">
          <span className={`h-3 w-3 rounded-[3px] ${DAY_STYLE[s].cls}`} />
          {s === "done" ? "Both posted" : s === "partial" ? "One missing" : s === "missing" ? "Neither" : s === "pending" ? "Today, still time" : "Holiday"}
        </span>
      ))}
    </span>
  );
}

/** Horizontal bars, longest = 100%; the largest value is drawn in the accent. */
export function HBars({ items }: { items: { key: string; label: string; value: number; display: string; note?: string }[] }) {
  const max = Math.max(0, ...items.map((i) => i.value));
  return (
    <ul className="space-y-3">
      {items.map((i) => (
        <li key={i.key}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate text-slate-800">{i.label}</span>
            <span className="shrink-0 tabular-nums text-slate-900">{i.display}</span>
          </div>
          <div className="mt-1 h-2 w-full rounded-full bg-slate-100">
            <div className={`h-full rounded-full ${i.value === max && max > 0 ? "bg-red-700" : "bg-slate-400"}`} style={{ width: `${max ? (i.value / max) * 100 : 0}%` }} />
          </div>
          {i.note ? <div className="mt-0.5 text-xs text-slate-500">{i.note}</div> : null}
        </li>
      ))}
    </ul>
  );
}

/** Weekly columns (current week in the accent) with a dashed line at the required level. */
export function WeekBars({ weeks, required, unit }: { weeks: { label: string; value: number; current?: boolean }[]; required: number | null; unit: string }) {
  const W = 320;
  const H = 150;
  const pad = { l: 34, r: 8, t: 12, b: 24 };
  const max = Math.max(1, required ?? 0, ...weeks.map((w) => w.value)) * 1.15;
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / max);
  const bw = (W - pad.l - pad.r) / weeks.length;
  const ticks = [0, max / 2, max].map((v) => Math.round(v));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`${unit} per week${required !== null ? `, ${required} needed` : ""}`}>
      {ticks.map((v) => (
        <g key={v}>
          <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke="var(--color-slate-200)" />
          <text x={pad.l - 6} y={y(v) + 3} textAnchor="end" fontSize="10" fill="var(--color-slate-500)" fontFamily="var(--font-mono)">
            {v}
          </text>
        </g>
      ))}
      {weeks.map((w, i) => {
        const x = pad.l + i * bw + bw * 0.18;
        const h = y(0) - y(w.value);
        return (
          <g key={w.label}>
            <rect x={x} y={y(w.value)} width={bw * 0.64} height={Math.max(0, h)} rx="3" fill={w.current ? "var(--color-red-700)" : "var(--color-slate-400)"}>
              <title>{`${w.label}: ${w.value} ${unit}`}</title>
            </rect>
            <text x={x + bw * 0.32} y={H - 8} textAnchor="middle" fontSize="10" fill="var(--color-slate-500)" fontFamily="var(--font-mono)">
              {w.label}
            </text>
          </g>
        );
      })}
      {required !== null && required > 0 ? (
        <g>
          <line x1={pad.l} x2={W - pad.r} y1={y(required)} y2={y(required)} stroke="var(--color-slate-900)" strokeWidth="1.5" strokeDasharray="5 4" />
          <text x={W - pad.r} y={y(required) - 4} textAnchor="end" fontSize="10" fill="var(--color-slate-900)">
            needed {required}
          </text>
        </g>
      ) : null}
    </svg>
  );
}

/** Tasks due in the coming days, grouped by date. */
export function LookaheadList({ items, emptyText }: { items: LookaheadItem[]; emptyText: string }) {
  const userName = useUserName();
  if (!items.length) return <p className="text-sm text-slate-500">{emptyText}</p>;
  const groups = new Map<string, LookaheadItem[]>();
  for (const i of items) groups.set(i.date, [...(groups.get(i.date) ?? []), i]);
  return (
    <div className="space-y-4">
      {[...groups.entries()].map(([date, list]) => (
        <div key={date}>
          <div className="mb-1 text-xs font-medium text-slate-500">{formatDate(date)}</div>
          <ul className="divide-y divide-slate-100">
            {list.map((i) => (
              <li key={i.taskId} className="flex items-start justify-between gap-3 py-2 text-sm">
                <Link href={`/projects/${i.projectId}/progress?stage=${i.stageKey}&task=${i.taskId}`} className="min-w-0 hover:underline">
                  <span className="block truncate text-slate-900">{i.taskName}</span>
                  <span className="block truncate text-xs text-slate-500">
                    <span className="ref-code">{i.code}</span> · {stageLabel(i.stageKey)}
                    {i.assignedTo ? ` · ${userName(i.assignedTo)}` : ""}
                  </span>
                </Link>
                <span className={`shrink-0 tabular-nums ${i.behind ? "text-red-700" : "text-slate-600"}`}>{i.pct === null ? "–" : `${Math.round(i.pct)}%`}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** Delay reasons with how many times and how many days they cost. */
export function DelayList({ items, emptyText }: { items: DelayBreakdown[]; emptyText: string }) {
  const reasons = useList("delayReasons");
  if (!items.length) return <p className="text-sm text-slate-500">{emptyText}</p>;
  return (
    <HBars
      items={items.map((d) => ({
        key: d.reason,
        label: reasons.label(d.reason),
        value: Math.max(d.daysLost, 0.5),
        display: `${d.daysLost} day${d.daysLost === 1 ? "" : "s"}`,
        note: `${d.count} time${d.count === 1 ? "" : "s"} · ${d.projects.join(", ")}`,
      }))}
    />
  );
}

/** "Missing documents: PO / LOI, Anchor bolt plan" for required document types the project lacks. */
export function MissingDocs({ projectId, docSlots }: { projectId: string; docSlots: string[] }) {
  const types = useList("documentTypes");
  const missing = types.items.filter((t) => t.required && !docSlots.includes(t.value));
  if (!missing.length) return null;
  return (
    <Link href={`/projects/${projectId}/details#documents`} className="mt-2 flex items-start gap-1.5 text-xs text-red-700 hover:underline">
      <span className="font-medium">Missing documents:</span>
      <span>{missing.map((t) => t.label).join(", ")}</span>
    </Link>
  );
}

/** "today", "yesterday", "5 days ago" for a work date. */
export function sinceLabel(date: string | null, today: string) {
  if (!date) return "never";
  const n = Math.round((Date.parse(today) - Date.parse(date)) / 86_400_000);
  return n <= 0 ? "today" : n === 1 ? "yesterday" : `${n} days ago`;
}
