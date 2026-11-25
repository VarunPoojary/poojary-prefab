"use client";

import { PROJECT_STATUSES, stageMeta } from "@/lib/projects/config";
import type { ProjectStatus, StageKey } from "@/lib/projects/types";
import { Flag } from "lucide-react";
import { Icon } from "@/components/ui/icons";

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  const m = PROJECT_STATUSES.find((s) => s.value === status)!;
  return <span className={`inline-flex whitespace-nowrap rounded-lg px-2 py-0.5 text-[11px] font-semibold ${m.badge}`}>{m.label}</span>;
}

export function ProgressBar({ pct, className = "", tone }: { pct: number; className?: string; tone?: "red" | "green" | "slate" }) {
  const v = Math.max(0, Math.min(100, pct));
  const color = tone === "red" ? "bg-red-600" : tone === "slate" ? "bg-slate-400" : v >= 99.999 ? "bg-emerald-600" : "bg-red-700";
  return (
    <div className={`h-2 w-full overflow-hidden rounded-full bg-slate-200 ${className}`} role="progressbar" aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={100}>
      <div className={`h-full rounded-full ${color}`} style={{ width: `${v}%` }} />
    </div>
  );
}

export function BehindFlag({ behind, label = "Behind schedule" }: { behind: boolean; label?: string }) {
  if (!behind) return null;
  return (
    <span title={label} aria-label={label} className="inline-flex items-center gap-1 rounded-lg bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-800">
      <Icon icon={Flag} size={14} className="mr-1 inline-block align-[-2px]" />Behind
    </span>
  );
}

export const stageLabel = (k: StageKey | null) => (k ? stageMeta(k).label : "All stages done");
export const pctText = (n: number) => `${Math.round(n)}%`;
