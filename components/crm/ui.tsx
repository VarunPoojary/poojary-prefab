"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { statusMeta } from "@/lib/crm/config";
import { useUsers } from "@/lib/crm/hooks";
import type { EnquiryStatus } from "@/lib/crm/types";

export function StatusBadge({ status, className = "" }: { status: EnquiryStatus; className?: string }) {
  const m = statusMeta(status);
  return (
    <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${m.badge} ${className}`}>
      {m.label}
    </span>
  );
}

/** Looks up user names for "assigned to", "created by" and history entries. */
export function useUserName() {
  const { data } = useUsers();
  return (id: string | null | undefined) => {
    if (!id) return "";
    if (id === "system") return "System";
    return data?.find((u) => u.id === id)?.name ?? id;
  };
}

export function PageHeader({
  title,
  subtitle,
  back,
  actions,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  back?: { href: string; label: string };
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-5">
      {back ? (
        <Link href={back.href} className="mb-2 inline-block text-xs font-medium text-slate-500 hover:text-slate-800">
          ← {back.label}
        </Link>
      ) : null}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
          {subtitle ? <div className="mt-0.5 text-sm text-slate-500">{subtitle}</div> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}

export function PageContainer({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return <div className={`mx-auto w-full ${wide ? "max-w-7xl" : "max-w-5xl"} px-4 py-6 sm:px-6`}>{children}</div>;
}

export function ErrorList({ issues }: { issues: string[] }) {
  if (!issues.length) return null;
  return (
    <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
      <ul className="list-disc space-y-0.5 pl-4">
        {issues.map((i) => (
          <li key={i}>{i}</li>
        ))}
      </ul>
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="p-10 text-center">
      <p className="font-medium text-slate-900">{title}</p>
      {children ? <div className="mt-2 text-sm text-slate-500">{children}</div> : null}
    </div>
  );
}

export function LoadingRows({ rows = 5 }: { rows?: number }) {
  return (
    <div className="divide-y divide-slate-100">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex animate-pulse gap-4 px-5 py-4">
          <div className="h-4 w-24 rounded bg-slate-200" />
          <div className="h-4 flex-1 rounded bg-slate-100" />
          <div className="h-4 w-20 rounded bg-slate-200" />
        </div>
      ))}
    </div>
  );
}

export interface SearchOption {
  value: string;
  label: string;
  sub?: string;
  badge?: React.ReactNode;
}

/**
 * Searchable dropdown: the parent owns the query and supplies matching options
 * (so results can come from the repository).
 */
export function SearchSelect({
  label,
  placeholder,
  query,
  onQuery,
  options,
  loading,
  onSelect,
  selectedLabel,
  onClear,
  emptyText = "No matches",
  footer,
  autoFocus,
}: {
  label?: string;
  placeholder?: string;
  query: string;
  onQuery: (q: string) => void;
  options: SearchOption[];
  loading?: boolean;
  onSelect: (value: string) => void;
  selectedLabel?: string;
  onClear?: () => void;
  emptyText?: string;
  footer?: React.ReactNode;
  autoFocus?: boolean;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  if (selectedLabel) {
    return (
      <div>
        {label ? <div className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">{label}</div> : null}
        <div className="flex items-center justify-between gap-2 rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-sm">
          <span className="truncate font-medium text-slate-900">{selectedLabel}</span>
          {onClear ? (
            <button type="button" className="text-xs font-medium text-red-700 hover:underline" onClick={onClear}>
              Change
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  const pick = (v: string) => {
    onSelect(v);
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      {label ? (
        <label htmlFor={id} className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">
          {label}
        </label>
      ) : null}
      <input
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        autoComplete="off"
        autoFocus={autoFocus}
        value={query}
        placeholder={placeholder}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          onQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, options.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter" && open && options[active]) {
            e.preventDefault();
            pick(options[active].value);
          } else if (e.key === "Escape") setOpen(false);
        }}
        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-red-600 focus:ring-2 focus:ring-red-100"
      />
      {open ? (
        <div className="absolute z-30 mt-1 max-h-80 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          <ul id={`${id}-list`} role="listbox">
            {options.map((o, i) => (
              <li
                key={o.value}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(o.value);
                }}
                onMouseEnter={() => setActive(i)}
                className={`flex cursor-pointer items-start justify-between gap-3 px-3 py-2 text-sm ${i === active ? "bg-red-50" : ""}`}
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium text-slate-900">{o.label}</span>
                  {o.sub ? <span className="block truncate text-xs text-slate-500">{o.sub}</span> : null}
                </span>
                {o.badge}
              </li>
            ))}
          </ul>
          {!options.length ? (
            <div className="px-3 py-2 text-sm text-slate-500">{loading ? "Searching…" : emptyText}</div>
          ) : null}
          {footer ? <div className="border-t border-slate-100 px-2 py-1.5">{footer}</div> : null}
        </div>
      ) : null}
    </div>
  );
}

export function useDebounced<T>(value: T, ms = 250) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 py-1 text-sm">
      <dt className="w-36 shrink-0 text-slate-500">{label}</dt>
      <dd className="min-w-0 flex-1 break-words text-slate-900">{children || <span className="text-slate-400">–</span>}</dd>
    </div>
  );
}
