"use client";

import { useParams, useSearchParams } from "next/navigation";
import { useState } from "react";
import { EmployeeFrame } from "@/components/employees/EmployeeDetail";
import { EmptyState, LoadingRows, PageContainer, PageHeader, useUserName } from "@/components/crm/ui";
import { ReasonDialog, issuesOf } from "@/components/expenses/bits";
import { useToast } from "@/components/Providers";
import { Button, Card } from "@/components/ui/fields";
import { useAuth } from "@/lib/auth/AuthProvider";
import { ADMIN_ROLE, roleHasPage } from "@/lib/auth/roles";
import { formatDate, formatDateTime } from "@/lib/format";
import { payrollRepo } from "@/lib/payroll";
import { monthLabel, monthOf, type DayKind, type DayRow } from "@/lib/payroll/calc";
import { payModeLabel, payTypeLabel } from "@/lib/payroll/config";
import { useEmployeePayMonth, useEmployeePayYear, usePayrollEmployee, usePayrollMutation, usePayrollPayments } from "@/lib/payroll/hooks";
import type { EmployeeMonthView, PayrollPayment } from "@/lib/payroll/types";
import { formatPaise } from "@/lib/paise";
import { todayIso } from "@/lib/projects/rules";
import { AdvanceDialog, CloseMonthDialog, EditPaymentDialog, MonthBadge, MonthPicker, PayDialog, rupee, rupeeExact } from "./dialogs";
import { downloadSalarySlip } from "./SalarySlip";
import { Check, Download, TriangleAlert, X } from "lucide-react";
import { Icon } from "@/components/ui/icons";

const KIND: Record<DayKind, { label: string; short: string; cls: string }> = {
  present: { label: "Present", short: "P", cls: "bg-emerald-100 text-emerald-800" },
  half: { label: "Half day", short: "½", cls: "bg-amber-100 text-amber-900" },
  absent: { label: "Absent", short: "A", cls: "bg-red-100 text-red-800" },
  holiday: { label: "Holiday", short: "H", cls: "bg-sky-100 text-sky-900" },
  not_logged: { label: "Not logged", short: "?", cls: "bg-red-600 text-white" },
  future: { label: "Still to come", short: "·", cls: "bg-slate-100 text-slate-400" },
  outside: { label: "Outside employment", short: "–", cls: "bg-slate-200 text-slate-500" },
};

/** One line of the month card; tapping it shows how the figure was worked out. */
function Line({ label, value, strong, children, testId }: { label: string; value: React.ReactNode; strong?: boolean; children?: React.ReactNode; testId?: string }) {
  const body = (
    <span className={`flex items-baseline justify-between gap-3 py-1.5 ${strong ? "font-semibold text-slate-900" : "text-slate-700"}`}>
      <span>
        {label}
        {children ? <span className="ml-1 text-[11px] text-slate-400">ⓘ</span> : null}
      </span>
      <span className="text-right tabular-nums" data-testid={testId}>
        {value}
      </span>
    </span>
  );
  if (!children) return <div className="border-b border-slate-100 text-sm">{body}</div>;
  return (
    <details className="border-b border-slate-100 text-sm">
      <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">{body}</summary>
      <div className="mb-2 rounded-lg bg-slate-50 p-2 text-xs text-slate-700">{children}</div>
    </details>
  );
}

function DayGrid({ days }: { days: DayRow[] }) {
  return (
    <div className="grid grid-cols-7 gap-1" data-testid="day-grid">
      {days.map((d) => (
        <span key={d.date} title={`${formatDate(d.date)}: ${KIND[d.kind].label}`} className={`rounded px-1 py-0.5 text-center text-[11px] font-semibold ${KIND[d.kind].cls}`}>
          {Number(d.date.slice(8))} {KIND[d.kind].short}
        </span>
      ))}
    </div>
  );
}

function MonthCard({ v, isAdmin }: { v: EmployeeMonthView; isAdmin: boolean }) {
  const toast = useToast();
  const [dialog, setDialog] = useState<"advance" | "pay" | "close" | "reopen" | null>(null);
  const [slipBusy, setSlipBusy] = useState(false);
  const reopen = usePayrollMutation((reason: string) => payrollRepo.reopenMonth(v.employee.id, v.month, reason));
  if (v.status === "not_in_payroll" || v.status === "before_start")
    return (
      <Card title={monthLabel(v.month)}>
        <p className="text-sm text-slate-600" data-testid="not-in-payroll">
          {v.reason} {/Daily-wage/.test(v.reason) ? "Daily-wage pay is recorded as project site expenses." : ""}
        </p>
      </Card>
    );
  const closed = v.closed;
  const calc = closed?.calc ?? v.live!;
  const f = v.figures!;
  const c = calc.counts;
  const rate = calc.dailyRatePaise;
  const open = v.status === "open";
  const notLoggedPast = v.live?.counts.notLogged ?? 0;
  return (
    <Card
      title={
        <span className="flex flex-wrap items-center gap-2">
          {monthLabel(v.month)} <MonthBadge status={v.status} />
          {open && !v.ended ? <span className="text-xs font-normal text-slate-500">live estimate</span> : null}
          {closed ? <span className="text-xs font-normal text-slate-500">frozen {formatDateTime(closed.closedAt)}</span> : null}
        </span>
      }
      actions={
        <>
          {open ? <Button onClick={() => setDialog("advance")}>Give advance</Button> : null}
          {closed && v.balancePaise > 0 ? (
            <Button variant="primary" onClick={() => setDialog("pay")}>
              Pay salary
            </Button>
          ) : null}
          {closed ? <Button onClick={() => setDialog("pay")}>Other payment</Button> : null}
          {open && v.ended ? (
            <Button variant="primary" disabled={!v.canClose} onClick={() => setDialog("close")}>
              Close month
            </Button>
          ) : null}
          {closed && isAdmin && v.canReopen ? <Button onClick={() => setDialog("reopen")}>Reopen</Button> : null}
          {closed ? (
            <Button
              disabled={slipBusy}
              onClick={() => {
                setSlipBusy(true);
                downloadSalarySlip(v)
                  .catch((e) => toast(issuesOf(e).join(" "), "error"))
                  .finally(() => setSlipBusy(false));
              }}
            >
              <Icon icon={Download} size={16} />
            {slipBusy ? "Preparing…" : "Salary slip"}
            </Button>
          ) : null}
        </>
      }
    >
      {notLoggedPast ? (
        <p role="alert" className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800" data-testid="not-logged-warning">
          <Icon icon={TriangleAlert} size={14} className="mr-1 inline-block align-[-2px]" />{notLoggedPast} past day{notLoggedPast === 1 ? " is" : "s are"} Not logged. The estimate doesn&apos;t deduct them, and the month can&apos;t be closed until every day has a status.
        </p>
      ) : null}
      {closed && v.pendingAdjustmentPaise ? (
        <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900" data-testid="pending-adjustment">
          Attendance changed after closing: {formatPaise(v.pendingAdjustmentPaise, { sign: true })} ({v.pendingAdjustmentPaise > 0 ? "arrears" : "recovery"}). It will be added to the next month that is closed.
        </p>
      ) : null}
      <div data-testid="month-card">
        <Line label="Monthly salary" value={rupee(calc.salaryPaise)}>
          {calc.segments.length > 1 ? (
            <ul>
              {calc.segments.map((s) => (
                <li key={s.from}>
                  {formatDate(s.from)} – {formatDate(s.to)}: {s.days} days at {rupee(s.monthlyPaise)}
                </li>
              ))}
              <li className="mt-1">Weighted by calendar days = {rupeeExact(calc.salaryPaise)}</li>
            </ul>
          ) : (
            "One salary for the whole month."
          )}
        </Line>
        <Line label="Daily rate (÷ 30)" value={rupeeExact(rate)}>
          {rupee(calc.salaryPaise)} ÷ 30 = {rupeeExact(rate)}. Every month uses 30, whatever its length.
        </Line>
        <Line
          label={open && !v.ended ? "Days so far" : "Days"}
          value={
            <span className="text-xs sm:text-sm">
              P {c.present} · ½ {c.half} · A {c.absent} · H {c.holiday}
              {c.notLogged ? <span className="text-red-700"> · Not logged {c.notLogged}</span> : ""}
              {c.future ? ` · Still to come ${c.future}` : ""}
              {c.outside ? ` · Outside ${c.outside}` : ""}
            </span>
          }
          testId="days-line"
        >
          <DayGrid days={calc.days} />
        </Line>
        <Line label={open && !v.ended ? "Deductions so far" : "Loss of pay"} value={rupee(calc.lopDeductionPaise)}>
          Absent {c.absent} × {rupeeExact(rate)} + Half day {c.half} × {rupeeExact(Math.round(rate / 2))}
          {c.outside ? ` + outside employment ${c.outside} × ${rupeeExact(rate)}` : ""} = {calc.lopDays} loss-of-pay days. Gross = {rupeeExact(rate)} × (30 − {calc.lopDays}) = {rupee(f.grossPaise)} (rounded once to the rupee).
        </Line>
        <Line label={open && !v.ended ? "Estimated salary for the month" : "Gross salary"} value={rupee(f.grossPaise)} strong testId="gross">
          {open && c.future ? `Assumes the ${c.future} remaining day${c.future === 1 ? " is" : "s are"} paid. ` : ""}
          {calc.noWorkedDay ? "No Present, Half day or Holiday day in the month: gross is ₹0." : `${rupeeExact(rate)} × ${calc.payableDays} paid days.`}
        </Line>
        <Line label="Advances given this month" value={rupee(v.advancesThisMonthPaise)}>
          {v.payments.filter((p) => p.type === "advance").length
            ? v.payments
                .filter((p) => p.type === "advance")
                .map((p) => `${formatDate(p.date)} ${rupee(p.amountPaise)}`)
                .join(" · ")
            : "None."}
        </Line>
        <Line label={closed ? "Advance recovered" : "Advance recovery (maximum)"} value={`− ${rupee(f.recoveryPaise)}`}>
          Outstanding {rupee(Math.max(0, closed ? closed.outstandingPaise : v.outstandingForMonthPaise))}; at most 50 % of gross ({rupee(f.maxRecoveryPaise)} here). The rest carries forward.
        </Line>
        {f.additionsPaise || f.deductionsPaise ? (
          <Line label="One-off additions / deductions" value={formatPaise(f.additionsPaise - f.deductionsPaise, { sign: true })}>
            {closed?.oneOffs.map((o) => `${o.label}: ${formatPaise(o.amountPaise, { sign: true })} (${o.reason})`).join(" · ")}
          </Line>
        ) : null}
        {f.adjustmentPaise ? (
          <Line label="Adjustments from earlier months" value={formatPaise(f.adjustmentPaise, { sign: true })}>
            {(closed?.adjustments ?? v.adjustmentsIn).map((a) => `${monthLabel(a.fromMonth)}: ${formatPaise(a.amountPaise, { sign: true })}`).join(" · ")}
          </Line>
        ) : null}
        <Line label={closed ? "Net payable" : "Estimated net payable"} value={rupee(f.netPaise)} strong testId="net" />
        {closed ? (
          <>
            <Line label="Salary paid" value={rupee(v.salaryPaidPaise)} />
            <Line label="Balance" value={rupee(v.balancePaise)} strong testId="balance" />
          </>
        ) : null}
        <Line label="Advance outstanding (today)" value={rupee(v.outstandingNowPaise)} testId="outstanding" />
      </div>
      {v.checks.length ? (
        <ul className="mt-3 space-y-0.5 text-xs" data-testid="checks">
          {v.checks.map((ch) => (
            <li key={ch.label} className={`flex items-start gap-1.5 ${ch.ok ? "text-emerald-700" : "text-red-700"}`}>
              <Icon icon={ch.ok ? Check : X} size={14} className="mt-px" />
              <span>
                {ch.label}: {ch.detail}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {open && v.ended && !v.canClose ? (
        <ul className="mt-2 list-disc pl-5 text-xs text-red-700" data-testid="close-blockers">
          {v.closeBlockers.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      ) : null}
      {closed && isAdmin && !v.canReopen && v.reopenBlocker ? <p className="mt-2 text-xs text-slate-500">{v.reopenBlocker}</p> : null}
      {dialog === "advance" ? <AdvanceDialog employeeId={v.employee.id} name={v.employee.name} onClose={() => setDialog(null)} /> : null}
      {dialog === "pay" ? <PayDialog view={v} onClose={() => setDialog(null)} /> : null}
      {dialog === "close" ? <CloseMonthDialog view={v} onClose={() => setDialog(null)} /> : null}
      {dialog === "reopen" ? (
        <ReasonDialog
          title={`Reopen ${monthLabel(v.month)}`}
          message="The frozen figures are removed and the month is calculated live again. Allowed only while no salary has been paid against it."
          confirm="Reopen"
          onConfirm={(r) => reopen.mutateAsync(r).then(() => toast(`${monthLabel(v.month)} reopened`))}
          onClose={() => setDialog(null)}
        />
      ) : null}
    </Card>
  );
}

function YearCard({ employeeId, onPick }: { employeeId: string; onPick: (m: string) => void }) {
  const [year, setYear] = useState(() => Number(todayIso().slice(0, 4)));
  const { data: rows, isPending } = useEmployeePayYear(employeeId, year);
  return (
    <Card
      title="Year view"
      actions={
        <div className="flex items-center gap-1">
          <Button aria-label="Previous year" onClick={() => setYear(year - 1)}>
            ‹
          </Button>
          <span className="px-2 text-sm font-semibold">{year}</span>
          <Button aria-label="Next year" disabled={year >= Number(todayIso().slice(0, 4))} onClick={() => setYear(year + 1)}>
            ›
          </Button>
        </div>
      }
    >
      {isPending ? (
        <LoadingRows rows={2} />
      ) : !rows?.length ? (
        <p className="text-sm text-slate-500">No payroll months in {year}.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="stack-table w-full text-sm stack-flush" data-testid="year-view">
            <thead className="text-left text-xs text-slate-500">
              <tr>
                <th className="py-1">Month</th>
                <th className="text-right">Gross</th>
                <th className="text-right">Advance recovered</th>
                <th className="text-right">Net payable</th>
                <th className="text-right">Paid</th>
                <th className="text-right">Balance</th>
                <th className="text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.month} className="cursor-pointer hover:bg-slate-50" onClick={() => onPick(r.month)}>
                  <td className="py-1.5 font-medium">
                    {monthLabel(r.month)}
                    {r.estimate ? <span className="ml-1 text-xs text-slate-400">(estimate)</span> : null}
                  </td>
                  <td data-half data-label="Gross" className="text-right tabular-nums">{rupee(r.grossPaise)}</td>
                  <td data-half data-label="Advance recovered" className="text-right tabular-nums">{rupee(r.recoveryPaise)}</td>
                  <td data-half data-label="Net payable" className="text-right tabular-nums">{rupee(r.netPaise)}</td>
                  <td data-half data-label="Paid" className="text-right tabular-nums">{rupee(r.paidPaise)}</td>
                  <td data-half data-label="Balance" className="text-right tabular-nums">{rupee(r.balancePaise)}</td>
                  <td data-menu className="text-right">
                    <MonthBadge status={r.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function PaymentsCard({ employeeId, isAdmin, outstanding }: { employeeId: string; isAdmin: boolean; outstanding: number | null }) {
  const toast = useToast();
  const userName = useUserName();
  const { data: payments = [], isPending } = usePayrollPayments(employeeId);
  const [editing, setEditing] = useState<PayrollPayment | null>(null);
  const [deleting, setDeleting] = useState<PayrollPayment | null>(null);
  const remove = usePayrollMutation(({ id, reason }: { id: string; reason: string }) => payrollRepo.deletePayment(id, reason));
  return (
    <Card title="Payments" description={outstanding !== null ? `Advance outstanding: ${rupee(outstanding)} (advances given − recovered).` : undefined}>
      {isPending ? (
        <LoadingRows rows={2} />
      ) : !payments.length ? (
        <p className="text-sm text-slate-500">No payments yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="stack-table w-full min-w-[760px] text-sm stack-flush" data-testid="payments">
            <thead className="text-left text-xs text-slate-500">
              <tr>
                <th className="py-1">Date</th>
                <th>Type</th>
                <th>For month</th>
                <th className="text-right">Amount</th>
                <th>Mode and reference</th>
                <th>Paid by</th>
                <th>Remarks</th>
                {isAdmin ? <th /> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {payments.map((p) => (
                <tr key={p.id} data-testid="payment-row" className={p.deleted ? "text-slate-400 line-through" : ""}>
                  <td className="py-1.5 max-md:font-medium">{formatDate(p.date)}</td>
                  <td data-half data-label="Type">{payTypeLabel(p.type)}</td>
                  <td data-half data-label="For month">{monthLabel(p.forMonth)}</td>
                  <td data-half data-label="Amount" className="text-right tabular-nums">{rupeeExact(p.amountPaise)}</td>
                  <td data-half data-label="Mode">
                    {payModeLabel(p.mode)}
                    {p.reference ? ` · ${p.reference}` : ""}
                  </td>
                  <td data-half data-label="Paid by">{userName(p.by)}</td>
                  <td data-label="Remarks" className="max-w-[14rem] text-xs">
                    {p.remarks}
                    {p.history.length ? <span className="block text-slate-500 no-underline">edited {p.history.length}× – {p.history[p.history.length - 1].reason}</span> : null}
                    {p.deleted ? <span className="block text-red-700">Deleted: {p.deleted.reason}</span> : null}
                  </td>
                  {isAdmin ? (
                    <td data-menu className="whitespace-nowrap text-right">
                      {!p.deleted ? (
                        <span className="inline-flex gap-1">
                          <button type="button" className="h-8 rounded-lg px-2 text-xs text-slate-600 transition-colors hover:bg-slate-100 md:h-auto md:px-1 md:hover:bg-transparent md:hover:underline" onClick={() => setEditing(p)}>
                            Edit
                          </button>
                          <button type="button" className="h-8 rounded-lg px-2 text-xs text-red-700 transition-colors hover:bg-red-50 md:h-auto md:px-1 md:hover:bg-transparent md:hover:underline" onClick={() => setDeleting(p)}>
                            Delete
                          </button>
                        </span>
                      ) : null}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing ? <EditPaymentDialog payment={editing} onClose={() => setEditing(null)} /> : null}
      {deleting ? (
        <ReasonDialog
          title="Delete payment"
          message={`${payTypeLabel(deleting.type)} ${rupeeExact(deleting.amountPaise)} on ${formatDate(deleting.date)}. It stays in the list, crossed out.`}
          confirm="Delete"
          onConfirm={(reason) => remove.mutateAsync({ id: deleting.id, reason }).then(() => toast("Payment deleted"))}
          onClose={() => setDeleting(null)}
        />
      ) : null}
    </Card>
  );
}

/** Payroll for one employee: month card (live or frozen), year view and every payment. */
export function PayrollPanel({ employeeId }: { employeeId: string }) {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const params = useSearchParams();
  const [current] = useState(() => monthOf(todayIso()));
  const [month, setMonth] = useState(() => params.get("month") || current);
  const { data: v, isPending, error } = useEmployeePayMonth(employeeId, month);
  if (error) return <EmptyState title={issuesOf(error).join(" ")} />;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <MonthPicker month={month} onChange={setMonth} max={current} />
        {month !== current ? (
          <Button variant="ghost" onClick={() => setMonth(current)}>
            This month
          </Button>
        ) : null}
      </div>
      {isPending || !v ? <LoadingRows /> : <MonthCard v={v} isAdmin={isAdmin} />}
      <YearCard employeeId={employeeId} onPick={setMonth} />
      <PaymentsCard employeeId={employeeId} isAdmin={isAdmin} outstanding={v ? v.outstandingNowPaise : null} />
    </div>
  );
}

/** The Accountant can't open employee details, so the Payroll tab gets its own light header. */
function AccountantFrame({ id }: { id: string }) {
  const { data: e, error } = usePayrollEmployee(id);
  if (error) return <PageContainer><EmptyState title={issuesOf(error).join(" ")} /></PageContainer>;
  return (
    <PageContainer>
      <PageHeader back={{ href: "/payroll", label: "Payroll" }} title={e?.name ?? "…"} subtitle={e ? `${e.code} · ${e.designation} · ${e.department}` : ""} />
      <nav className="mb-5 flex gap-1 border-b border-slate-200" aria-label="Employee sections">
        <span aria-current="page" className="-mb-px border-b-2 border-red-700 px-3 py-2 text-sm font-medium text-red-800">
          Payroll
        </span>
      </nav>
      <PayrollPanel employeeId={id} />
    </PageContainer>
  );
}

export function EmployeePayrollTab() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  // Roles with the Payroll page (not Admin) can’t open the rest of the employee record, so they get a payroll-only frame.
  if (user && user.role !== ADMIN_ROLE && roleHasPage(user.role, "payroll")) return <AccountantFrame id={id} />;
  return <EmployeeFrame active="payroll">{(e) => <PayrollPanel employeeId={e.id} />}</EmployeeFrame>;
}

