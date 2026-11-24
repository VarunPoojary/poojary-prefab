"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { EmptyState, ErrorList, LoadingRows, PageContainer, PageHeader, useDebounced, useUserName } from "@/components/crm/ui";
import { MoneyField, ReasonDialog, csvAmount, downloadCsv, issuesOf } from "@/components/expenses/bits";
import { useToast } from "@/components/Providers";
import { Button, Card, Select, TextField } from "@/components/ui/fields";
import { Modal } from "@/components/ui/overlays";
import { formatDate, formatDateTime } from "@/lib/format";
import { payrollRepo } from "@/lib/payroll";
import { addMonths, closeFigures, monthLabel, monthOf } from "@/lib/payroll/calc";
import { MONTH_STATUSES, PAYMENT_MODES, payModeLabel } from "@/lib/payroll/config";
import { useCompanyPayMonth, usePayrollAccess, usePayrollLog, usePayrollMutation, useSettlePreview } from "@/lib/payroll/hooks";
import type { CompanyRow, EmployeeMonthView, MonthStatus, PayrollPaymentMode, SettleLine, SettleResult } from "@/lib/payroll/types";
import type { Paise } from "@/lib/paise";
import { todayIso } from "@/lib/projects/rules";
import { AdvanceDialog, MonthBadge, MonthPicker, PayDialog, rupee, rupeeExact } from "./dialogs";

const sel = "rounded-md border border-slate-300 bg-white px-2.5 py-2 text-sm";

function Tile({ label, value, testId, strong }: { label: string; value: string; testId?: string; strong?: boolean }) {
  return (
    <div className={`rounded-lg border px-3 py-2 ${strong ? "border-red-200 bg-red-50" : "border-slate-200 bg-white"}`}>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-0.5 text-base font-semibold tabular-nums text-slate-900" data-testid={testId}>
        {value}
      </div>
    </div>
  );
}

/* ---------- settle all ---------- */

function SettleWizard({ initialMonth, maxMonth, onClose }: { initialMonth: string; maxMonth: string; onClose: () => void }) {
  const toast = useToast();
  const [step, setStep] = useState<"review" | "payment" | "confirm" | "done">("review");
  const [month, setMonth] = useState(initialMonth);
  const { data: pre, isPending, error } = useSettlePreview(month);
  const [recoveries, setRecoveries] = useState<Record<string, Paise | null>>({});
  const [date, setDate] = useState(() => todayIso());
  const [mode, setMode] = useState<PayrollPaymentMode | "">("bank_bulk");
  const [reference, setReference] = useState("");
  const [refs, setRefs] = useState<Record<string, string>>({});
  const [typed, setTyped] = useState<Paise | null>(null);
  const [issues, setIssues] = useState<string[]>([]);
  const [result, setResult] = useState<SettleResult | null>(null);
  const settle = usePayrollMutation(() =>
    payrollRepo.settleAll({
      month,
      date,
      mode,
      reference,
      references: refs,
      recoveries: Object.fromEntries(Object.entries(recoveries).map(([k, v]) => [k, v ?? 0])),
      confirmTotalPaise: typed,
    }),
  );
  const lines = (pre?.ready ?? []).map((l): SettleLine => {
    const r = recoveries[l.employee.id];
    if (l.alreadyClosed || r === undefined) return l;
    const f = closeFigures({ grossPaise: l.grossPaise, outstandingPaise: l.maxRecoveryPaise, adjustmentPaise: l.adjustmentPaise, recoveryPaise: r ?? 0 });
    return { ...l, recoveryPaise: r ?? 0, netPaise: f.netPaise, balancePaise: f.netPaise - l.paidPaise };
  });
  const payable = lines.filter((l) => l.balancePaise > 0);
  const total = payable.reduce((s, l) => s + l.balancePaise, 0);
  const badRecovery = lines.find((l) => !l.alreadyClosed && (l.recoveryPaise < 0 || l.recoveryPaise > l.maxRecoveryPaise));

  const footer =
    step === "done" ? (
      <Button variant="primary" onClick={onClose}>
        Done
      </Button>
    ) : (
      <>
        <Button onClick={step === "review" ? onClose : () => setStep(step === "confirm" ? "payment" : "review")}>{step === "review" ? "Cancel" : "Back"}</Button>
        {step === "review" ? (
          <Button variant="primary" disabled={!payable.length || !!badRecovery} onClick={() => setStep("payment")}>
            Next: payment details
          </Button>
        ) : step === "payment" ? (
          <Button variant="primary" onClick={() => setStep("confirm")}>
            Next: confirm
          </Button>
        ) : (
          <Button
            variant="primary"
            disabled={settle.isPending || typed !== total}
            onClick={() =>
              settle.mutate(undefined, {
                onSuccess: (r) => {
                  setResult(r);
                  setStep("done");
                  toast(`Salaries recorded for ${r.paid.length} employees`);
                },
                onError: (e) => setIssues(issuesOf(e)),
              })
            }
          >
            Record payments
          </Button>
        )}
      </>
    );

  return (
    <Modal open wide onClose={onClose} title={`Settle all – ${monthLabel(month)}`} footer={footer}>
      <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1 text-sm" data-testid="settle-wizard">
        {step === "review" ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">Month</span>
              <MonthPicker
                month={month}
                max={maxMonth}
                onChange={(m) => {
                  setMonth(m);
                  setRecoveries({});
                }}
              />
            </div>
            {error ? <ErrorList issues={issuesOf(error)} /> : isPending ? <LoadingRows rows={3} /> : null}
            {pre ? (
              <>
                <p className="text-slate-600">Ready employees are closed now (if not closed yet) and paid their full balance. Recovery can be lowered for months being closed now.</p>
                {lines.length ? (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[640px]" data-testid="settle-ready">
                      <thead className="text-left text-xs uppercase text-slate-500">
                        <tr>
                          <th className="py-1">Employee</th>
                          <th className="text-right">Gross</th>
                          <th className="w-36 text-right">Recovery</th>
                          <th className="text-right">Net payable</th>
                          <th className="text-right">Paid</th>
                          <th className="text-right">Balance</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {lines.map((l) => (
                          <tr key={l.employee.id}>
                            <td className="py-1.5">
                              {l.employee.name}
                              <span className="block text-xs text-slate-500">{l.alreadyClosed ? "Already closed" : "Closes now"}</span>
                            </td>
                            <td className="text-right tabular-nums">{rupee(l.grossPaise)}</td>
                            <td className="text-right">
                              {l.alreadyClosed || !l.maxRecoveryPaise ? (
                                <span className="tabular-nums">{rupee(l.recoveryPaise)}</span>
                              ) : (
                                <MoneyField value={recoveries[l.employee.id] === undefined ? l.recoveryPaise : recoveries[l.employee.id]} placeholder={`Recovery for ${l.employee.name}`} onChange={(v) => setRecoveries((x) => ({ ...x, [l.employee.id]: v }))} hint={`max ${rupee(l.maxRecoveryPaise)}`} />
                              )}
                            </td>
                            <td className="text-right tabular-nums">{rupee(l.netPaise)}</td>
                            <td className="text-right tabular-nums">{rupee(l.paidPaise)}</td>
                            <td className="text-right font-semibold tabular-nums">{rupee(l.balancePaise)}</td>
                          </tr>
                        ))}
                        <tr className="font-semibold">
                          <td className="py-1.5" colSpan={5}>
                            Total to pay ({payable.length} employees)
                          </td>
                          <td className="text-right tabular-nums">{rupeeExact(total)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-slate-600">Nobody is ready to be paid for this month.</p>
                )}
                {badRecovery ? <p className="text-red-700">Recovery for {badRecovery.employee.name} can be at most {rupee(badRecovery.maxRecoveryPaise)}.</p> : null}
                {pre.leftOut.length ? (
                  <div className="rounded-lg bg-amber-50 p-3 text-amber-900" data-testid="settle-left-out">
                    <b>Left out (settle later one by one):</b>
                    <ul className="mt-1 list-disc pl-5">
                      {pre.leftOut.map((x) => (
                        <li key={x.employee.id}>
                          {x.employee.name}: {x.reason}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {pre.nothingToPay.length ? <p className="text-xs text-slate-500">Nothing to pay: {pre.nothingToPay.map((x) => `${x.employee.name} (${x.reason})`).join(", ")}</p> : null}
              </>
            ) : null}
          </>
        ) : null}
        {step === "payment" ? (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <TextField label="Payment date" type="date" value={date} onChange={setDate} />
              <Select<PayrollPaymentMode | ""> label="Mode" value={mode} onChange={setMode} options={PAYMENT_MODES} />
              <TextField label="Batch reference" value={reference} onChange={setReference} placeholder="Bank upload / batch no." />
            </div>
            <details>
              <summary className="cursor-pointer text-sm font-medium text-slate-700">Per-employee references (optional)</summary>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {payable.map((l) => (
                  <TextField key={l.employee.id} label={l.employee.name} value={refs[l.employee.id] ?? ""} onChange={(v) => setRefs((x) => ({ ...x, [l.employee.id]: v }))} placeholder="UTR" />
                ))}
              </div>
            </details>
            <p className="text-xs text-slate-500">Settle all records the payments; it does not move money. Make the transfer in the bank portal; the batch reference links the two.</p>
          </>
        ) : null}
        {step === "confirm" ? (
          <>
            <p className="text-base text-slate-900" data-testid="settle-confirm-text">
              You are about to record salary payments of <b>{rupeeExact(total)}</b> to <b>{payable.length}</b> employees for <b>{monthLabel(month)}</b>.
            </p>
            <p className="text-slate-600">
              {payModeLabel(mode)} · {formatDate(date)}
              {reference ? ` · ${reference}` : ""}
            </p>
            <MoneyField label="Type the total to confirm" value={typed} onChange={setTyped} hint={typed !== null && typed !== total ? "Doesn't match the total." : undefined} />
            <ErrorList issues={issues} />
          </>
        ) : null}
        {step === "done" && result ? (
          <div data-testid="settle-result">
            <p className="font-semibold text-emerald-800">
              {result.batch ? `${result.batch.code}: ${rupeeExact(result.batch.totalPaise)} recorded for ${result.paid.length} employees.` : "Nothing was left to pay."}
            </p>
            <ul className="mt-2 list-disc pl-5">
              {result.paid.map((p) => (
                <li key={p.employee.id}>
                  {p.employee.name}: {rupeeExact(p.amountPaise)}
                </li>
              ))}
            </ul>
            {result.leftOut.length ? (
              <p className="mt-2 text-amber-800">
                Left out: {result.leftOut.map((x) => `${x.employee.name} (${x.reason})`).join("; ")}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </Modal>
  );
}

/* ---------- page ---------- */

/** ☰ Payroll: the whole company's salaries for a month (Admin and Accountant). */
export function PayrollPage() {
  const toast = useToast();
  const userName = useUserName();
  const params = useSearchParams();
  const [current] = useState(() => monthOf(todayIso()));
  const [month, setMonth] = useState(() => params.get("month") || current);
  const { data: access } = usePayrollAccess();
  const enabled = !!access?.canView;
  const { data, isPending, error } = useCompanyPayMonth(month, enabled);
  const { data: log = [] } = usePayrollLog(enabled);
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("");
  const [status, setStatus] = useState<MonthStatus | "">("");
  const [onlyAdvance, setOnlyAdvance] = useState(false);
  const [onlyNotLogged, setOnlyNotLogged] = useState(false);
  const [advanceFor, setAdvanceFor] = useState<CompanyRow | null>(null);
  const [paying, setPaying] = useState<EmployeeMonthView | null>(null);
  const [settling, setSettling] = useState(false);
  const [reversing, setReversing] = useState<string | null>(null);
  const q = useDebounced(search, 150).toLowerCase();
  const reverse = usePayrollMutation(({ id, reason }: { id: string; reason: string }) => payrollRepo.reverseBatch(id, reason));
  const rows = useMemo(
    () =>
      (data?.rows ?? []).filter(
        (r) =>
          (!q || `${r.employee.name} ${r.employee.code}`.toLowerCase().includes(q)) &&
          (!department || r.employee.department === department) &&
          (!status || r.status === status) &&
          (!onlyAdvance || r.outstandingNowPaise > 0) &&
          (!onlyNotLogged || r.notLoggedDays > 0),
      ),
    [data, q, department, status, onlyAdvance, onlyNotLogged],
  );

  if (access && !access.canView)
    return (
      <PageContainer>
        <EmptyState title="Only admins and the accountant can open payroll." />
      </PageContainer>
    );

  const s = data?.summary;
  const departments = [...new Set((data?.rows ?? []).map((r) => r.employee.department))].sort();
  const notLoggedCount = (data?.rows ?? []).filter((r) => r.notLoggedDays > 0).length;
  const advanceCount = (data?.rows ?? []).filter((r) => r.outstandingNowPaise > 0).length;
  const filtered = rows.length !== (data?.rows.length ?? 0);
  const sum = (k: keyof CompanyRow) => rows.reduce((a, r) => a + (r[k] as number), 0);
  const lastEnded = data?.ended ? month : addMonths(current, -1);
  const pay = (r: CompanyRow) =>
    payrollRepo
      .employeeMonth(r.employee.id, month)
      .then(setPaying)
      .catch((e) => toast(issuesOf(e).join(" "), "error"));
  const exportCsv = () =>
    downloadCsv(`payroll-${month}.csv`, [
      ["Employee", "Employee ID", "Designation", "Department", "Monthly salary (₹)", "LOP days", "Gross (₹)", "Advances this month (₹)", "Advance outstanding (₹)", "Recovery (₹)", "Net payable (₹)", "Paid (₹)", "Balance (₹)", "Status", "Not logged days"],
      ...rows.map((r) => [
        r.employee.name,
        r.employee.code,
        r.employee.designation,
        r.employee.department,
        csvAmount(r.salaryPaise),
        r.lopDays,
        csvAmount(r.grossPaise),
        csvAmount(r.advancesThisMonthPaise),
        csvAmount(r.outstandingNowPaise),
        csvAmount(r.recoveryPaise),
        csvAmount(r.netPaise),
        csvAmount(r.paidPaise),
        csvAmount(r.balancePaise),
        MONTH_STATUSES[r.status].label + (r.estimate ? " (estimate)" : ""),
        r.notLoggedDays,
      ]),
      ["Total", "", "", "", csvAmount(sum("salaryPaise")), "", csvAmount(sum("grossPaise")), csvAmount(sum("advancesThisMonthPaise")), csvAmount(sum("outstandingNowPaise")), csvAmount(sum("recoveryPaise")), csvAmount(sum("netPaise")), csvAmount(sum("paidPaise")), csvAmount(sum("balancePaise")), "", ""],
    ]);

  return (
    <PageContainer wide>
      <PageHeader
        title="Payroll"
        subtitle="Salary = monthly salary ÷ 30 × (30 − loss-of-pay days). Wages are due by the 7th of the next month."
        actions={
          <>
            <Button onClick={exportCsv}>⬇ Export CSV</Button>
            <Button variant="primary" onClick={() => setSettling(true)}>
              Settle all…
            </Button>
          </>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <MonthPicker month={month} onChange={setMonth} max={current} />
        <span className="text-sm font-semibold text-slate-800">
          {monthLabel(month)} {data && !data.ended ? <span className="font-normal text-slate-500">· live estimate</span> : null}
        </span>
      </div>
      {error ? <EmptyState title={issuesOf(error).join(" ")} /> : null}
      {data && month < data.startMonth ? <EmptyState title={`Payroll starts from ${monthLabel(data.startMonth)} (Settings → Payroll).`} /> : null}
      {s && month >= (data?.startMonth ?? "") ? (
        <>
          <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7" data-testid="payroll-summary">
            <Tile label="Total monthly salary" value={rupee(s.salaryPaise)} testId="sum-salary" />
            <Tile label={data!.ended ? "Total gross" : "Total gross (estimate)"} value={rupee(s.grossPaise)} testId="sum-gross" />
            <Tile label="Advances given this month" value={rupee(s.advancesPaise)} testId="sum-advances" />
            <Tile label="Advance recovery" value={rupee(s.recoveryPaise)} testId="sum-recovery" />
            <Tile label="Total net payable" value={rupee(s.netPaise)} testId="sum-net" />
            <Tile label="Paid so far" value={rupee(s.paidPaise)} testId="sum-paid" />
            <Tile label="Balance to pay" value={rupee(s.balancePaise)} testId="sum-balance" strong />
          </div>
          <div className="mb-3 flex flex-wrap items-center gap-2" data-testid="payroll-chips">
            {notLoggedCount ? (
              <button type="button" aria-pressed={onlyNotLogged} onClick={() => setOnlyNotLogged(!onlyNotLogged)} className={`rounded-full px-3 py-1.5 text-sm font-semibold ring-2 ${onlyNotLogged ? "ring-slate-900" : "ring-transparent"} bg-red-100 text-red-800`}>
                ⚠️ {notLoggedCount} with Not logged days
              </button>
            ) : null}
            {advanceCount ? (
              <button type="button" aria-pressed={onlyAdvance} onClick={() => setOnlyAdvance(!onlyAdvance)} className={`rounded-full px-3 py-1.5 text-sm font-semibold ring-2 ${onlyAdvance ? "ring-slate-900" : "ring-transparent"} bg-amber-100 text-amber-900`}>
                {advanceCount} with advance outstanding
              </button>
            ) : null}
            {data!.excluded.length ? <span className="text-xs text-slate-500">Not in payroll: {data!.excluded.map((x) => `${x.employee.name} (${x.reason.replace(/\.$/, "")})`).join(", ")}</span> : null}
          </div>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <input type="search" aria-label="Search employees" placeholder="Search name or employee ID…" value={search} onChange={(e) => setSearch(e.target.value)} className="min-w-[220px] flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
            <select aria-label="Filter by department" value={department} onChange={(e) => setDepartment(e.target.value)} className={sel}>
              <option value="">All departments</option>
              {departments.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
            <select aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value as MonthStatus | "")} className={sel}>
              <option value="">All statuses</option>
              {(["open", "closed", "partly_paid", "paid"] as const).map((k) => (
                <option key={k} value={k}>
                  {MONTH_STATUSES[k].label}
                </option>
              ))}
            </select>
          </div>
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            {isPending ? (
              <LoadingRows />
            ) : (
              <table className="w-full min-w-[1150px] text-sm" data-testid="payroll-list">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Employee</th>
                    <th className="px-2 text-right">Monthly salary</th>
                    <th className="px-2 text-right">LOP days</th>
                    <th className="px-2 text-right">Gross</th>
                    <th className="px-2 text-right">Advances this month</th>
                    <th className="px-2 text-right">Advance outstanding</th>
                    <th className="px-2 text-right">Recovery</th>
                    <th className="px-2 text-right">Net payable</th>
                    <th className="px-2 text-right">Paid</th>
                    <th className="px-2 text-right">Balance</th>
                    <th className="px-2">Status</th>
                    <th className="px-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((r) => (
                    <tr key={r.employee.id} data-testid="payroll-row">
                      <td className="px-3 py-2">
                        <span className="font-medium text-slate-900">{r.employee.name}</span>
                        <span className="block text-xs text-slate-500">
                          {r.employee.code} · {r.employee.designation}
                        </span>
                      </td>
                      <td className="px-2 text-right tabular-nums">{rupee(r.salaryPaise)}</td>
                      <td className="px-2 text-right tabular-nums">
                        {r.lopDays}
                        {r.notLoggedDays ? <span className="block text-xs text-red-700">{r.notLoggedDays} not logged</span> : null}
                      </td>
                      <td className="px-2 text-right tabular-nums">
                        {rupee(r.grossPaise)}
                        {r.estimate ? <span className="block text-[10px] text-slate-400">estimate</span> : null}
                      </td>
                      <td className="px-2 text-right tabular-nums">{rupee(r.advancesThisMonthPaise)}</td>
                      <td className="px-2 text-right tabular-nums">{rupee(r.outstandingNowPaise)}</td>
                      <td className="px-2 text-right tabular-nums">{rupee(r.recoveryPaise)}</td>
                      <td className="px-2 text-right font-semibold tabular-nums">{rupee(r.netPaise)}</td>
                      <td className="px-2 text-right tabular-nums">{rupee(r.paidPaise)}</td>
                      <td className="px-2 text-right tabular-nums">{rupee(r.balancePaise)}</td>
                      <td className="px-2">
                        <MonthBadge status={r.status} />
                      </td>
                      <td className="whitespace-nowrap px-2 text-right">
                        <button type="button" className="px-1 text-xs font-medium text-slate-700 hover:underline" onClick={() => setAdvanceFor(r)} aria-label={`Give advance to ${r.employee.name}`}>
                          Advance
                        </button>
                        {(r.status === "closed" || r.status === "partly_paid") && r.balancePaise > 0 ? (
                          <button type="button" className="px-1 text-xs font-medium text-red-700 hover:underline" onClick={() => void pay(r)} aria-label={`Pay ${r.employee.name}`}>
                            Pay
                          </button>
                        ) : null}
                        <Link className="px-1 text-xs font-medium text-slate-700 hover:underline" href={`/employees/${r.employee.id}/payroll?month=${month}`} aria-label={`View ${r.employee.name}`}>
                          View
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t-2 border-slate-200 font-semibold">
                  {filtered ? (
                    <tr className="text-slate-600">
                      <td className="px-3 py-2">Filtered ({rows.length})</td>
                      <td className="px-2 text-right tabular-nums">{rupee(sum("salaryPaise"))}</td>
                      <td />
                      <td className="px-2 text-right tabular-nums">{rupee(sum("grossPaise"))}</td>
                      <td className="px-2 text-right tabular-nums">{rupee(sum("advancesThisMonthPaise"))}</td>
                      <td className="px-2 text-right tabular-nums">{rupee(sum("outstandingNowPaise"))}</td>
                      <td className="px-2 text-right tabular-nums">{rupee(sum("recoveryPaise"))}</td>
                      <td className="px-2 text-right tabular-nums">{rupee(sum("netPaise"))}</td>
                      <td className="px-2 text-right tabular-nums">{rupee(sum("paidPaise"))}</td>
                      <td className="px-2 text-right tabular-nums">{rupee(sum("balancePaise"))}</td>
                      <td colSpan={2} />
                    </tr>
                  ) : null}
                  <tr data-testid="payroll-totals">
                    <td className="px-3 py-2">Total ({s.count} employees)</td>
                    <td className="px-2 text-right tabular-nums">{rupee(s.salaryPaise)}</td>
                    <td />
                    <td className="px-2 text-right tabular-nums">{rupee(s.grossPaise)}</td>
                    <td className="px-2 text-right tabular-nums">{rupee(s.advancesPaise)}</td>
                    <td className="px-2 text-right tabular-nums">{rupee((data?.rows ?? []).reduce((a, r) => a + r.outstandingNowPaise, 0))}</td>
                    <td className="px-2 text-right tabular-nums">{rupee(s.recoveryPaise)}</td>
                    <td className="px-2 text-right tabular-nums">{rupee(s.netPaise)}</td>
                    <td className="px-2 text-right tabular-nums">{rupee(s.paidPaise)}</td>
                    <td className="px-2 text-right tabular-nums">{rupee(s.balancePaise)}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
          {data!.batches.length ? (
            <Card title="Settlements" className="mt-4">
              <ul className="divide-y divide-slate-100 text-sm" data-testid="batches">
                {data!.batches.map((b) => (
                  <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span>
                      <b>{b.code}</b> · {rupeeExact(b.totalPaise)} to {b.paymentIds.length} employees · {payModeLabel(b.mode)}
                      {b.reference ? ` ${b.reference}` : ""} · {formatDate(b.date)} by {userName(b.by)}
                      {b.reversed ? <span className="block text-xs text-red-700">Reversed {formatDateTime(b.reversed.at)} by {userName(b.reversed.by)}: {b.reversed.reason}</span> : null}
                    </span>
                    {access?.isAdmin && !b.reversed ? (
                      <Button size="sm" variant="danger" onClick={() => setReversing(b.id)}>
                        Reverse…
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </>
      ) : null}

      <Card title="Payroll activity log" className="mt-4">
        {log.length ? (
          <ul className="max-h-80 divide-y divide-slate-100 overflow-y-auto text-sm" data-testid="payroll-log">
            {log.map((l) => (
              <li key={l.id} className="py-1.5">
                <span className="text-xs text-slate-500">
                  {formatDateTime(l.at)} · {userName(l.by)}
                </span>
                <span className="block text-slate-800">{l.text}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">No payroll activity yet.</p>
        )}
      </Card>

      {advanceFor ? <AdvanceDialog employeeId={advanceFor.employee.id} name={advanceFor.employee.name} onClose={() => setAdvanceFor(null)} /> : null}
      {paying ? <PayDialog view={paying} onClose={() => setPaying(null)} /> : null}
      {settling ? <SettleWizard initialMonth={data?.ended ? month : lastEnded} maxMonth={addMonths(current, -1)} onClose={() => setSettling(false)} /> : null}
      {reversing ? (
        <ReasonDialog
          title="Reverse settlement"
          message="Every salary payment of this batch is removed (kept crossed out in each payments list). The months return to Closed, ready to pay again."
          confirm="Reverse settlement"
          onConfirm={(reason) => reverse.mutateAsync({ id: reversing, reason }).then(() => toast("Settlement reversed"))}
          onClose={() => setReversing(null)}
        />
      ) : null}
    </PageContainer>
  );
}
