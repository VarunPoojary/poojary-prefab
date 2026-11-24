"use client";

import { ROLE_LABELS, type Role } from "@/lib/auth/types";

export function StatusPill({ status }: { status: "active" | "inactive" }) {
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase ${
        status === "active" ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-600"
      }`}
    >
      {status}
    </span>
  );
}

export function LoginBadge({ login }: { login: { role: Role; enabled: boolean } | null }) {
  if (!login) return <span className="text-xs text-slate-400">None</span>;
  return (
    <span
      title={login.enabled ? undefined : "Login disabled"}
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
        !login.enabled ? "bg-slate-100 text-slate-500" : login.role === "admin" ? "bg-red-100 text-red-800" : "bg-sky-100 text-sky-800"
      }`}
    >
      {!login.enabled ? <span aria-label="disabled">🔒</span> : null}
      {ROLE_LABELS[login.role]}
    </span>
  );
}

/** "₹ 42,000 per month" */
export function money(amount: number, payType: "monthly" | "daily") {
  return `₹ ${amount.toLocaleString("en-IN")} ${payType === "monthly" ? "per month" : "per day"}`;
}
