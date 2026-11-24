"use client";

import { useEffect, useRef } from "react";

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
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-4" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`w-full ${wide ? "max-w-3xl" : "max-w-md"} rounded-2xl bg-white shadow-xl`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          <button type="button" aria-label="Close" className="text-slate-400 hover:text-slate-700" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer ? <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3">{footer}</div> : null}
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

/** "⋮" options button with a dropdown. */
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
        className="flex h-8 w-8 cursor-pointer list-none items-center justify-center rounded-md text-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 [&::-webkit-details-marker]:hidden"
      >
        ⋮
      </summary>
      <div role="menu" className="absolute right-0 z-30 mt-1 w-48 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
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
            className={`block w-full px-4 py-2 text-left text-sm disabled:opacity-40 ${
              it.danger ? "text-red-700 hover:bg-red-50" : "text-slate-700 hover:bg-slate-50"
            }`}
          >
            {it.label}
          </button>
        ))}
      </div>
    </details>
  );
}
