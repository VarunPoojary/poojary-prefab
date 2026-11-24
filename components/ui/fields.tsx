"use client";

import React, { useId, useState } from "react";

const inputCls =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-red-600 focus:ring-2 focus:ring-red-100 disabled:bg-slate-100";

export function Label({ htmlFor, children, required }: { htmlFor?: string; children: React.ReactNode; required?: boolean }) {
  return (
    <label htmlFor={htmlFor} className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">
      {children}
      {required ? <span className="ml-0.5 text-red-600">*</span> : null}
    </label>
  );
}

interface BaseProps {
  label?: string;
  hint?: string;
  required?: boolean;
  className?: string;
}

export function TextField({
  label,
  hint,
  required,
  className,
  value,
  onChange,
  placeholder,
  list,
  type = "text",
}: BaseProps & {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  list?: string;
  type?: "text" | "date";
}) {
  const id = useId();
  return (
    <div className={className}>
      {label ? (
        <Label htmlFor={id} required={required}>
          {label}
        </Label>
      ) : null}
      <input
        id={id}
        type={type}
        className={`${inputCls} ${required && !value.trim() ? "border-amber-400" : ""}`}
        value={value}
        placeholder={placeholder}
        list={list}
        onChange={(e) => onChange(e.target.value)}
      />
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

/** Numeric input that keeps the raw text while typing and reports number | null. */
export function NumberField({
  label,
  hint,
  required,
  className,
  value,
  onChange,
  placeholder,
  suffix,
}: BaseProps & { value: number | null; onChange: (v: number | null) => void; placeholder?: string; suffix?: string }) {
  const id = useId();
  const [text, setText] = useState(value === null ? "" : String(value));
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    const parsed = text.trim() === "" ? null : Number(text.replace(/,/g, ""));
    if (parsed !== value) setText(value === null ? "" : String(value));
  }
  return (
    <div className={className}>
      {label ? (
        <Label htmlFor={id} required={required}>
          {label}
        </Label>
      ) : null}
      <div className="relative">
        <input
          id={id}
          inputMode="decimal"
          className={`${inputCls} text-right ${suffix ? "pr-10" : ""} ${required && value === null ? "border-amber-400" : ""}`}
          value={text}
          placeholder={placeholder}
          onChange={(e) => {
            const raw = e.target.value;
            if (!/^-?[\d,]*\.?\d*$/.test(raw)) return;
            setText(raw);
            const n = raw.trim() === "" || raw === "-" || raw === "." ? null : Number(raw.replace(/,/g, ""));
            onChange(n === null || Number.isNaN(n) ? null : n);
          }}
        />
        {suffix ? (
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-slate-500">
            {suffix}
          </span>
        ) : null}
      </div>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

export function TextArea({
  label,
  hint,
  required,
  className,
  value,
  onChange,
  rows = 4,
  onReset,
  placeholder,
}: BaseProps & {
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  onReset?: () => void;
  placeholder?: string;
}) {
  const id = useId();
  return (
    <div className={className}>
      <div className="flex items-end justify-between">
        {label ? (
          <Label htmlFor={id} required={required}>
            {label}
          </Label>
        ) : (
          <span />
        )}
        {onReset ? (
          <button type="button" onClick={onReset} className="mb-1 text-xs font-medium text-red-700 hover:underline">
            Reset to default
          </button>
        ) : null}
      </div>
      <textarea
        id={id}
        rows={rows}
        className={`${inputCls} font-[inherit] leading-relaxed`}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

export function Select<T extends string>({
  label,
  hint,
  className,
  value,
  onChange,
  options,
}: BaseProps & { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  const id = useId();
  return (
    <div className={className}>
      {label ? <Label htmlFor={id}>{label}</Label> : null}
      <select id={id} className={inputCls} value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  hint,
  className,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: React.ReactNode;
  hint?: string;
  className?: string;
}) {
  return (
    <label className={`flex cursor-pointer items-start gap-3 ${className ?? ""}`}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full transition ${checked ? "bg-red-700" : "bg-slate-300"}`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${checked ? "translate-x-4" : "translate-x-0.5"}`}
        />
      </button>
      <span>
        <span className="text-sm font-medium text-slate-800">{label}</span>
        {hint ? <span className="block text-xs text-slate-500">{hint}</span> : null}
      </span>
    </label>
  );
}

export function Checkbox({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
      <input
        type="checkbox"
        className="h-4 w-4 accent-red-700"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        aria-label={label}
      />
      {label ? <span>{label}</span> : null}
    </label>
  );
}

export function Card({
  title,
  description,
  actions,
  children,
  className,
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-xl border border-slate-200 bg-white p-5 shadow-sm ${className ?? ""}`}>
      {title || actions ? (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            {title ? <h3 className="text-base font-semibold text-slate-900">{title}</h3> : null}
            {description ? <p className="mt-0.5 text-sm text-slate-500">{description}</p> : null}
          </div>
          {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function Button({
  children,
  onClick,
  variant = "secondary",
  disabled,
  size = "md",
  title,
  type = "button",
  "aria-label": ariaLabel,
}: {
  children: React.ReactNode;
  "aria-label"?: string;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  disabled?: boolean;
  size?: "sm" | "md";
  title?: string;
  type?: "button" | "submit";
}) {
  const v = {
    primary: "bg-red-700 text-white hover:bg-red-800 disabled:bg-red-300",
    secondary: "border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 disabled:text-slate-400",
    ghost: "text-slate-600 hover:bg-slate-100 disabled:text-slate-300",
    danger: "text-red-700 hover:bg-red-50 disabled:text-slate-300",
  }[variant];
  const sz = size === "sm" ? "px-2 py-1 text-xs" : "px-4 py-2 text-sm";
  return (
    <button
      type={type}
      title={title}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition disabled:cursor-not-allowed ${v} ${sz}`}
    >
      {children}
    </button>
  );
}

/** Move up / move down / delete controls for repeating rows. */
export function RowActions({
  index,
  count,
  onMove,
  onRemove,
}: {
  index: number;
  count: number;
  onMove: (from: number, to: number) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-0.5">
      <Button size="sm" variant="ghost" title="Move up" disabled={index === 0} onClick={() => onMove(index, index - 1)}>
        ↑
      </Button>
      <Button
        size="sm"
        variant="ghost"
        title="Move down"
        disabled={index === count - 1}
        onClick={() => onMove(index, index + 1)}
      >
        ↓
      </Button>
      <Button size="sm" variant="danger" title="Remove" onClick={onRemove}>
        ✕
      </Button>
    </div>
  );
}

export function move<T>(arr: T[], from: number, to: number) {
  if (to < 0 || to >= arr.length) return;
  const [x] = arr.splice(from, 1);
  arr.splice(to, 0, x);
}
