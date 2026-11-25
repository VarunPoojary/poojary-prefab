"use client";

import { useEffect, useRef } from "react";
import { EllipsisVertical, X } from "lucide-react";
import { Icon } from "./icons";

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    // Phones: a sheet from the bottom edge. Larger screens: a centred dialog. Both scroll inside when tall.
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-slate-950/40 sm:items-center sm:p-4" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`flex max-h-[92dvh] w-full flex-col ${wide ? "sm:max-w-3xl" : "sm:max-w-md"} rounded-t-2xl bg-white shadow-[0_8px_24px_rgba(0,0,0,0.12)] sm:max-h-[calc(100dvh-2rem)] sm:rounded-2xl`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 py-3 pl-5 pr-3">
          <h2 className="text-base font-medium text-slate-900">{title}</h2>
          <button
            type="button"
            aria-label="Close"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
            onClick={onClose}
          >
            <Icon icon={X} size={18} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer ? (
          <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-slate-200 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export interface MenuItem {
  label: string;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
}

/** Options button (vertical ellipsis) with a dropdown. */
export function OptionsMenu({ items, label }: { items: MenuItem[]; label: string }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) ref.current.open = false;
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  return (
    <details ref={ref} className="relative" onClick={(e) => e.stopPropagation()}>
      <summary
        aria-label={label}
        className="flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 [&::-webkit-details-marker]:hidden"
      >
        <Icon icon={EllipsisVertical} />
      </summary>
      <div role="menu" className="absolute right-0 z-30 mt-1 w-52 rounded-xl border border-slate-200 bg-white p-1 shadow-[0_8px_24px_rgba(0,0,0,0.08)]">
        {items.map((it) => (
          <button
            key={it.label}
            role="menuitem"
            type="button"
            disabled={it.disabled}
            onClick={() => {
              if (ref.current) ref.current.open = false;
              it.onSelect();
            }}
            className={`flex h-9 w-full items-center rounded-lg px-3 text-left text-sm transition-colors disabled:opacity-40 ${
              it.danger ? "text-red-700 hover:bg-red-50" : "text-slate-700 hover:bg-slate-100"
            }`}
          >
            {it.label}
          </button>
        ))}
      </div>
    </details>
  );
}
