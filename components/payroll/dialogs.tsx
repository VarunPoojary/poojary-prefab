"use client";

import { useState } from "react";
import { ErrorList } from "@/components/crm/ui";
import { MoneyField, issuesOf } from "@/components/expenses/bits";
import { useToast } from "@/components/Providers";
import { Button, Select, TextArea, TextField } from "@/components/ui/fields";
import { Modal } from "@/components/ui/overlays";
import { payrollRepo } from "@/lib/payroll";
import { addMonths, closeFigures, closeIssues, monthLabel, monthOf, type OneOff } from "@/lib/payroll/calc";
import { MONTH_STATUSES, PAYMENT_MODES } from "@/lib/payroll/config";
import { useEmployeePayMonth, usePayrollMutation } from "@/lib/payroll/hooks";
import type { EmployeeMonthView, MonthStatus, PaymentInput, PayrollPayment, PayrollPaymentMode } from "@/lib/payroll/types";
import { formatPaise, type Paise } from "@/lib/paise";
import { todayIso } from "@/lib/projects/rules";
import { Plus, TriangleAlert, X } from "lucide-react";
import { Icon } from "@/components/ui/icons";

export const rupee = (p: Paise) => formatPaise(p);
export const rupeeExact = (p: Paise) => formatPaise(p, { always: true });

export function MonthBadge({ status }: { status: MonthStatus }) {
  const m = MONTH_STATUSES[status];
  return <span className={`inline-flex whitespace-nowrap rounded-lg px-2 py-0.5 text-[11px] font-semibold ${m.badge}`}>{m.label}</span>;
}

/** ‹ month › picker. */
export function MonthPicker({ month, onChange, max }: { month: string; onChange: (m: string) => void; max?: string }) {
  return (
    <div className="flex items-center gap-1">
      <Button aria-label="Previous month" onClick={() => onChange(addMonths(month, -1))}>
        ‹
      </Button>
      <input type="month" aria-label="Month" value={month} max={max} onChange={(e) => e.target.value && onChange(max && e.target.value > max ? max : e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      <Button aria-label="Next month" disabled={!!max && month >= max} onClick={() => onChange(addMonths(month, 1))}>
        ›
      </Button>
    </div>
  );
}

const blankPay = (amountPaise: Paise | null = null): PaymentInput => ({ amountPaise, date: todayIso(), mode: "neft", reference: "", remarks: "" });

function PayFields({ value, onChange, amountLabel = "Amount" }: { value: PaymentInput; onChange: (v: PaymentInput) => void; amountLabel?: string }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <MoneyField label={amountLabel} required value={value.amountPaise} onChange={(amountPaise) => onChange({ ...value, amountPaise })} />
      <TextField label="Date given" type="date" value={value.date} onChange={(date) => onChange({ ...value, date })} />
      <Select<PayrollPaymentMode | ""> label="Mode" value={value.mode} onChange={(mode) => onChange({ ...value, mode })} options={PAYMENT_MODES} />
      <TextField label="Reference" value={value.reference} onChange={(reference) => onChange({ ...value, reference })} placeholder={value.mode === "cash" ? "Optional" : "UTR, cheque no., UPI ref."} />
      <TextField className="sm:col-span-2" label="Remarks" value={value.remarks} onChange={(remarks) => onChange({ ...value, remarks })} />
    </div>
  );
}

/** Give advance: shows outstanding and this month's estimated net; warns (doesn't block) when the advance goes above it. */
export function AdvanceDialog({ employeeId, name, onClose }: { employeeId: string; name: string; onClose: () => void }) {
  const toast = useToast();
  const [v, setV] = useState<PaymentInput>(() => blankPay());
  const [issues, setIssues] = useState<string[]>([]);
  const month = monthOf(v.date || todayIso());
  const { data: view } = useEmployeePayMonth(employeeId, month);
  const save = usePayrollMutation(() => payrollRepo.giveAdvance(employeeId, v));
  const outstanding = view?.outstandingNowPaise ?? 0;
  const estNet = view?.live ? view.live.grossPaise + (view.figures?.adjustmentPaise ?? 0) : null;
  const over = estNet !== null && v.amountPaise !== null && outstanding + v.amountPaise > estNet;
  return (
    <Modal
      open
      onClose={onClose}
      title={`Give advance – ${name}`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={save.isPending} onClick={() => save.mutate(undefined, { onSuccess: () => (toast(`Advance ${rupee(v.amountPaise ?? 0)} recorded`), onClose()), onError: (e) => setIssues(issuesOf(e)) })}>
            Save advance
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <dl className="grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-3 text-sm" data-testid="advance-context">
          <dt className="text-slate-500">Advance outstanding</dt>
          <dd className="text-right font-semibold tabular-nums">{rupee(outstanding)}</dd>
          <dt className="text-slate-500">Estimated salary for {monthLabel(month)}</dt>
          <dd className="text-right font-semibold tabular-nums">{estNet !== null ? rupee(estNet) : "–"}</dd>
        </dl>
        <PayFields value={v} onChange={setV} />
        {over ? (
          <p role="alert" className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <Icon icon={TriangleAlert} size={14} className="mr-1 inline-block align-[-2px]" />Outstanding advances would be {rupee(outstanding + (v.amountPaise ?? 0))}, more than this month&apos;s estimated salary. Only up to 50 % of the salary is recovered each month; the rest carries forward.
          </p>
        ) : null}
        <p className="text-xs text-slate-500">Counted in {monthLabel(month)} and recovered when that month is closed.</p>
        <ErrorList issues={issues} />
      </div>
    </Modal>
  );
}

/** Pay salary (balance of a closed month, or less) or an other payment (bonus, reimbursement). */
export function PayDialog({ view, onClose }: { view: EmployeeMonthView; onClose: () => void }) {
  const toast = useToast();
  const [type, setType] = useState<"salary" | "other">(view.balancePaise > 0 && view.closed ? "salary" : "other");
  const [v, setV] = useState<PaymentInput>(() => blankPay(view.balancePaise > 0 && view.closed ? view.balancePaise : null));
  const [issues, setIssues] = useState<string[]>([]);
  const save = usePayrollMutation(() => payrollRepo.recordPayment(view.employee.id, { ...v, type, forMonth: view.month }));
  return (
    <Modal
      open
      onClose={onClose}
      title={`Pay ${view.employee.name} – ${monthLabel(view.month)}`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={save.isPending} onClick={() => save.mutate(undefined, { onSuccess: () => (toast("Payment recorded"), onClose()), onError: (e) => setIssues(issuesOf(e)) })}>
            Record payment
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Select
          label="Type"
          value={type}
          onChange={(t) => {
            setType(t);
            if (t === "salary") setV((x) => ({ ...x, amountPaise: view.balancePaise }));
          }}
          options={[
            ...(view.closed && view.balancePaise > 0 ? [{ value: "salary" as const, label: `Salary (balance ${rupee(view.balancePaise)})` }] : []),
            { value: "other" as const, label: "Other (bonus, reimbursement…)" },
          ]}
        />
        {type === "salary" ? <p className="text-sm text-slate-600">Net payable {rupee(view.figures!.netPaise)} − already paid {rupee(view.salaryPaidPaise)} = <b>{rupee(view.balancePaise)}</b>. A smaller amount is a part payment.</p> : null}
        {type === "other" ? <p className="text-xs text-slate-500">Other payments are listed and printed on the slip but don&apos;t change the month&apos;s net payable.</p> : null}
        <PayFields value={v} onChange={setV} />
        <ErrorList issues={issues} />
      </div>
    </Modal>
  );
}

/** Close month: full breakdown, advance recovery (pre-filled with the maximum), one-off additions / deductions, net payable. */
export function CloseMonthDialog({ view, onClose }: { view: EmployeeMonthView; onClose: () => void }) {
  const toast = useToast();
  const live = view.live!;
  const [recovery, setRecovery] = useState<Paise | null>(view.figures!.maxRecoveryPaise);
  const [oneOffs, setOneOffs] = useState<OneOff[]>([]);
  const [issues, setIssues] = useState<string[]>([]);
  const adj = view.adjustmentsIn.reduce((s, a) => s + a.amountPaise, 0);
  const f = closeFigures({ grossPaise: live.grossPaise, outstandingPaise: Math.max(0, view.outstandingForMonthPaise), oneOffs, adjustmentPaise: adj, recoveryPaise: recovery ?? 0 });
  const local = closeIssues(f, oneOffs);
  const save = usePayrollMutation(() => payrollRepo.closeMonth(view.employee.id, view.month, { recoveryPaise: recovery ?? 0, oneOffs }));
  const line = (label: string, value: string, strong?: boolean) => (
    <div className={`flex justify-between py-1 ${strong ? "border-t border-slate-200 font-semibold" : ""}`}>
      <span className="text-slate-600">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={`Close ${monthLabel(view.month)} – ${view.employee.name}`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={save.isPending || local.length > 0}
            onClick={() => save.mutate(undefined, { onSuccess: () => (toast(`${monthLabel(view.month)} closed – figures frozen`), onClose()), onError: (e) => setIssues(issuesOf(e)) })}
          >
            Confirm and close month
          </Button>
        </>
      }
    >
      <div className="space-y-4 text-sm" data-testid="close-month">
        <div>
          {line("Monthly salary", rupee(live.salaryPaise))}
          {line("Daily rate (÷ 30)", rupeeExact(live.dailyRatePaise))}
          {line("Days", `Present ${live.counts.present} · Half day ${live.counts.half} · Absent ${live.counts.absent} · Holiday ${live.counts.holiday}${live.counts.outside ? ` · Outside employment ${live.counts.outside}` : ""}`)}
          {line("Loss-of-pay days", String(live.lopDays))}
          {line("Paid days (of 30)", String(live.payableDays))}
          {line("Gross salary", rupee(f.grossPaise), true)}
          {view.adjustmentsIn.map((a) => line(`Adjustment for ${monthLabel(a.fromMonth)} (attendance changed after closing)`, formatPaise(a.amountPaise, { sign: true })))}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <MoneyField label="Advance recovery" value={recovery} onChange={setRecovery} hint={`Outstanding ${rupee(Math.max(0, view.outstandingForMonthPaise))} · at most ${rupee(f.maxRecoveryPaise)} (50 % of gross). The rest carries forward.`} />
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">One-off additions / deductions</span>
            <Button size="sm" onClick={() => setOneOffs((x) => [...x, { label: "", amountPaise: 0, reason: "" }])}>
              <Icon icon={Plus} size={14} className="inline-block align-[-2px]" /> Add line
            </Button>
          </div>
          {oneOffs.map((o, i) => (
            <div key={i} className="grid grid-cols-1 gap-2 rounded-lg border border-slate-200 p-2 sm:grid-cols-[1fr_9rem_1fr_auto]">
              <TextField value={o.label} onChange={(label) => setOneOffs((x) => x.map((y, j) => (j === i ? { ...y, label } : y)))} placeholder="e.g. Bonus, Damage" />
              <MoneyField allowNegative value={o.amountPaise || null} placeholder="+ add / − deduct" onChange={(amountPaise) => setOneOffs((x) => x.map((y, j) => (j === i ? { ...y, amountPaise: amountPaise ?? 0 } : y)))} />
              <TextField value={o.reason} onChange={(reason) => setOneOffs((x) => x.map((y, j) => (j === i ? { ...y, reason } : y)))} placeholder="Reason" />
              <button type="button" aria-label="Remove line" className="px-2 text-slate-400 hover:text-red-700" onClick={() => setOneOffs((x) => x.filter((_, j) => j !== i))}>
                <Icon icon={X} size={16} />
              </button>
            </div>
          ))}
        </div>
        <div className="rounded-lg bg-slate-50 p-3">
          {line("Gross", rupee(f.grossPaise))}
          {line("− Advance recovery", rupee(f.recoveryPaise))}
          {f.additionsPaise ? line("+ Additions", rupee(f.additionsPaise)) : null}
          {f.deductionsPaise ? line("− Deductions", rupee(f.deductionsPaise)) : null}
          {f.adjustmentPaise ? line("± Adjustments", formatPaise(f.adjustmentPaise, { sign: true })) : null}
          {line("Net payable", rupee(f.netPaise), true)}
          {f.shortfallPaise ? <p className="text-xs text-amber-800">{rupee(f.shortfallPaise)} more than the salary; it is carried forward as an advance.</p> : null}
          {line("Advance carried forward", rupee(Math.max(0, view.outstandingForMonthPaise) - f.recoveryPaise + f.shortfallPaise))}
        </div>
        <p className="text-xs text-slate-500">On confirm every figure is frozen. If attendance for this month changes later, the difference is added to the next month closed.</p>
        <ErrorList issues={[...local, ...issues]} />
      </div>
    </Modal>
  );
}

/** Admin: change a payment with a reason (kept in its history). */
export function EditPaymentDialog({ payment, onClose }: { payment: PayrollPayment; onClose: () => void }) {
  const toast = useToast();
  const [v, setV] = useState<PaymentInput>({ amountPaise: payment.amountPaise, date: payment.date, mode: payment.mode, reference: payment.reference, remarks: payment.remarks });
  const [reason, setReason] = useState("");
  const [issues, setIssues] = useState<string[]>([]);
  const save = usePayrollMutation(() => payrollRepo.editPayment(payment.id, v, reason));
  return (
    <Modal
      open
      onClose={onClose}
      title="Edit payment"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={save.isPending || !reason.trim()} onClick={() => save.mutate(undefined, { onSuccess: () => (toast("Payment changed"), onClose()), onError: (e) => setIssues(issuesOf(e)) })}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <PayFields value={v} onChange={setV} />
        <TextArea label="Reason for the change" required rows={2} value={reason} onChange={setReason} />
        <ErrorList issues={issues} />
      </div>
    </Modal>
  );
}
