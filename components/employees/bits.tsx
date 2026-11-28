"use client";

import type { Role } from "@/lib/auth/types";
import { useRoles } from "@/lib/settings/hooks";
import { Lock } from "lucide-react";
import { Icon } from "@/components/ui/icons";

export function StatusPill({ status }: { status: "active" | "inactive" }) {
  return (
    <span
      className={`inline-flex rounded-lg px-2 py-0.5 text-[11px] font-semibold ${
        status === "active" ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-600"
      }`}
    >
      {status === "active" ? "Active" : "Inactive"}
    </span>
  );
}

export function LoginBadge({ login }: { login: { role: Role; enabled: boolean } | null }) {
  const roles = useRoles();
  if (!login) return <span className="text-xs text-slate-400">None</span>;
  return (
    <span
      title={login.enabled ? undefined : "Login disabled"}
      className={`inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[11px] font-semibold ${
        !login.enabled ? "bg-slate-100 text-slate-500" : login.role === "admin" ? "bg-red-100 text-red-800" : "bg-sky-100 text-sky-800"
      }`}
    >
      {!login.enabled ? <span aria-label="disabled"><Icon icon={Lock} size={14} className="mr-1 inline-block align-[-2px]" /></span> : null}
      {roles.name(login.role)}
    </span>
  );
}

/** "₹ 42,000 per month" */
export function money(amount: number, payType: "monthly" | "daily") {
  return `₹ ${amount.toLocaleString("en-IN")} ${payType === "monthly" ? "per month" : "per day"}`;
}
