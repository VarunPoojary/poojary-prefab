"use client";

import { Camera, FileText, Receipt, X } from "lucide-react";
import { Icon } from "@/components/ui/icons";
import { useId, useRef, useState } from "react";
import { ErrorList } from "@/components/crm/ui";
import { FileLink } from "@/components/files/Files";
import { useToast } from "@/components/Providers";
import { Button, Label, Select, TextArea, TextField } from "@/components/ui/fields";
import { Modal } from "@/components/ui/overlays";
import { EXPENSE_PAYMENT_MODES, expenseStatusMeta } from "@/lib/expenses/config";
import type { ExpensePayment, ExpenseStatus } from "@/lib/expenses/types";
import { uploadPhoto, type PhotoRef } from "@/lib/files";
import { formatPaise, paiseInput, parseRupees, type Paise } from "@/lib/paise";
import { todayIso } from "@/lib/projects/rules";

export const issuesOf = (e: unknown) => (e && typeof e === "object" && "issues" in e ? (e as { issues: string[] }).issues : [e instanceof Error ? e.message : String(e)]);
export const rupee = (p: Paise) => formatPaise(p);

export function ExpenseBadge({ status }: { status: ExpenseStatus }) {
  const m = expenseStatusMeta(status);
  return <span className={`inline-flex whitespace-nowrap rounded-lg px-2 py-0.5 text-[11px] font-semibold ${m.badge}`}>{m.label}</span>;
}

const inputCls =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition-colors focus:border-red-600 focus:ring-2 focus:ring-red-100 disabled:bg-slate-100";

/** ₹ amount typed exactly (rupees and paise), reported in paise. */
export function MoneyField({
  label,
  value,
  onChange,
  required,
  hint,
  className,
  placeholder,
  allowNegative,
}: {
  label?: string;
  value: Paise | null;
  onChange: (p: Paise | null) => void;
  required?: boolean;
  hint?: string;
  className?: string;
  placeholder?: string;
  allowNegative?: boolean;
}) {
  const id = useId();
  const [text, setText] = useState(paiseInput(value));
  const [prev, setPrev] = useState(value);
  if (value !== prev) {
    setPrev(value);
    if (parseRupees(text) !== value) setText(paiseInput(value));
  }
  return (
    <div className={className}>
      {label ? (
        <Label htmlFor={id} required={required}>
          {label}
        </Label>
      ) : null}
      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-slate-500">₹</span>
        <input
          id={id}
          inputMode="decimal"
          aria-label={label ? undefined : placeholder}
          placeholder={placeholder}
          className={`${inputCls} pl-7 text-right ${required && value === null ? "border-amber-400" : ""}`}
          value={text}
          onChange={(e) => {
            const raw = e.target.value;
            if (!(allowNegative ? /^-?[\d,]*\.?\d{0,2}$/ : /^[\d,]*\.?\d{0,2}$/).test(raw)) return;
            setText(raw);
            onChange(raw.trim() === "" || raw === "-" ? null : parseRupees(raw));
          }}
        />
      </div>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

/** One bill / receipt: a photo (camera on phones) or a PDF. */
export function BillPicker({ bill, onChange }: { bill: PhotoRef | null; onChange: (b: PhotoRef | null) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <div>
      <Label>Bill / receipt (optional)</Label>
      <input
        ref={ref}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        aria-label="Bill photo or PDF"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          setBusy(true);
          try {
            onChange(await uploadPhoto(f));
          } catch (err) {
            toast(err instanceof Error ? err.message : String(err), "error");
          }
          setBusy(false);
        }}
      />
      {bill ? (
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm" data-testid="bill">
          <Icon icon={bill.type === "application/pdf" ? FileText : Receipt} className="text-slate-500" />
          <FileLink file={{ fileId: bill.fileId, name: bill.name }} className="flex-1" />
          <button type="button" aria-label="Remove bill" className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-red-700" onClick={() => onChange(null)}>
            <Icon icon={X} size={14} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => ref.current?.click()}
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 text-sm font-medium text-slate-700 transition-colors hover:border-slate-400 hover:bg-slate-50 disabled:opacity-60"
        >
          <Icon icon={Camera} className="text-slate-500" />
          {busy ? "Saving…" : "Add bill photo or PDF"}
        </button>
      )}
    </div>
  );
}

export function PaymentFields({ value, onChange }: { value: ExpensePayment; onChange: (p: ExpensePayment) => void }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <Select label="Payment mode" value={value.mode} onChange={(mode) => onChange({ ...value, mode })} options={EXPENSE_PAYMENT_MODES} />
      <TextField label="Reference (optional)" value={value.reference} onChange={(reference) => onChange({ ...value, reference })} placeholder="Optional – UTR, cheque no., UPI ref." />
      <TextField label="Payment date" type="date" value={value.date} onChange={(date) => onChange({ ...value, date })} />
    </div>
  );
}

export const blankPayment = (): ExpensePayment => ({ mode: "neft", reference: "", date: todayIso() });

/** Mark one or more expenses as Paid. */
export function PayDialog({ count, totalPaise, onPay, onClose }: { count: number; totalPaise: Paise; onPay: (p: ExpensePayment) => Promise<unknown>; onClose: () => void }) {
  const [p, setP] = useState<ExpensePayment>(blankPayment);
  const [issues, setIssues] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      open
      onClose={onClose}
      title={count === 1 ? "Mark as paid" : `Mark ${count} expenses as paid`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              onPay(p)
                .then(onClose)
                .catch((e) => setIssues(issuesOf(e)))
                .finally(() => setBusy(false));
            }}
          >
            Mark paid
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-slate-700">
          Total <b>{rupee(totalPaise)}</b>. This records the payment; the money itself is sent from the bank or paid in cash.
        </p>
        <PaymentFields value={p} onChange={setP} />
        <ErrorList issues={issues} />
      </div>
    </Modal>
  );
}

/** Asks for a reason (reject, delete, reopen, reverse…). */
export function ReasonDialog({
  title,
  message,
  confirm,
  onConfirm,
  onClose,
}: {
  title: string;
  message?: React.ReactNode;
  confirm: string;
  onConfirm: (reason: string) => Promise<unknown>;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const [issues, setIssues] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button onClick={onClose}>Back</Button>
          <Button
            variant="primary"
            disabled={busy || !reason.trim()}
            onClick={() => {
              setBusy(true);
              onConfirm(reason)
                .then(onClose)
                .catch((e) => setIssues(issuesOf(e)))
                .finally(() => setBusy(false));
            }}
          >
            {confirm}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {message ? <div className="text-sm text-slate-700">{message}</div> : null}
        <TextArea label="Reason" required rows={3} value={reason} onChange={setReason} />
        <ErrorList issues={issues} />
      </div>
    </Modal>
  );
}

/** Downloads rows as a CSV file (opens in Excel). */
export function downloadCsv(name: string, rows: (string | number)[][]) {
  const esc = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const blob = new Blob(["\uFEFF" + rows.map((r) => r.map(esc).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 30_000);
}

/** Paise as a plain number for CSV (1234.50). */
export const csvAmount = (p: Paise) => (p / 100).toFixed(2);
