"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { EmptyState, LoadingRows, useDebounced, useUserName } from "@/components/crm/ui";
import { useToast } from "@/components/Providers";
import { Button, Card } from "@/components/ui/fields";
import { dayLabel } from "@/lib/attendance/rules";
import { expenseRepo } from "@/lib/expenses";
import { EXPENSE_STATUSES } from "@/lib/expenses/config";
import { useExpenseBudget, useExpenseCategories, useExpenses, useProjectExpenseAccess, useUncoveredCasualDays } from "@/lib/expenses/hooks";
import type { CasualFill, Expense, ExpenseFilters, ExpenseStatus, ExpenseTotals } from "@/lib/expenses/types";
import { STAGES } from "@/lib/projects/config";
import type { Project, StageKey } from "@/lib/projects/types";
import { issuesOf, rupee } from "./bits";
import { ExpenseDialog } from "./ExpenseDialog";
import { ExpenseRow } from "./ExpenseList";
import { HardHat } from "lucide-react";
import { Icon } from "@/components/ui/icons";

const sel = "rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm";

export function TotalsBar({ t }: { t: ExpenseTotals | undefined }) {
  const chip = (label: string, value: string, cls: string) => (
    <span className={`rounded-lg px-3 py-1.5 text-sm ${cls}`}>
      {label} <b className="tabular-nums">{value}</b>
    </span>
  );
  if (!t) return null;
  return (
    <div className="flex flex-wrap gap-2" data-testid="expense-totals">
      {chip("Accepted", `${t.accepted.count} · ${rupee(t.accepted.paise)}`, "bg-sky-50 text-sky-900")}
      {chip("Paid", `${t.paid.count} · ${rupee(t.paid.paise)}`, "bg-emerald-50 text-emerald-900")}
      {chip("Pending", `${t.pending.count} · ${rupee(t.pending.paise)}`, "bg-amber-50 text-amber-900")}
      {chip("Rejected", String(t.rejected.count), "bg-red-50 text-red-800")}
      {chip("Spend (accepted + paid)", rupee(t.spend), "bg-slate-100 text-slate-900")}
    </div>
  );
}

function BudgetCard({ projectId }: { projectId: string }) {
  const { data } = useExpenseBudget(projectId);
  if (!data) return null;
  return (
    <Card title="Budget vs actual" description="Accepted + paid expenses, including GST, against the budget of each work stage (Details → Money).">
      <div className="overflow-x-auto">
        <table className="stack-table w-full text-sm stack-flush" data-testid="budget-vs-actual">
          <thead className="text-left text-xs text-slate-500">
            <tr>
              <th className="py-1">Work stage</th>
              <th className="text-right">Budget</th>
              <th className="text-right">Spent</th>
              <th className="text-right">Remaining</th>
              <th className="w-40 text-right">% used</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.lines.map((l) => (
              <tr key={l.group} className={l.over ? "text-red-700" : ""} data-over={l.over ? "true" : undefined}>
                <td className="py-1.5 font-medium">{l.label}</td>
                <td data-half data-label="Budget" className="text-right tabular-nums">{l.budgetPaise ? rupee(l.budgetPaise) : <span className="text-slate-400">No budget</span>}</td>
                <td data-half data-label="Spent" className="text-right tabular-nums">{rupee(l.spentPaise)}</td>
                <td data-half data-label="Remaining" className="text-right tabular-nums">{l.budgetPaise ? rupee(l.remainingPaise) : "–"}</td>
                <td data-half data-label="Used" className="text-right">
                  {l.pctUsed !== null ? (
                    <span className="inline-flex items-center gap-2">
                      <span className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-200">
                        <span className={`block h-full ${l.over ? "bg-red-600" : l.pctUsed >= 80 ? "bg-amber-500" : "bg-emerald-600"}`} style={{ width: `${Math.min(100, l.pctUsed)}%` }} />
                      </span>
                      <span className="w-10 tabular-nums">{Math.round(l.pctUsed)}%</span>
                    </span>
                  ) : (
                    "–"
                  )}
                </td>
              </tr>
            ))}
            <tr className="font-semibold">
              <td className="py-1.5">Total</td>
              <td data-half data-label="Budget" className="text-right tabular-nums">{rupee(data.totalBudgetPaise)}</td>
              <td data-half data-label="Spent" className="text-right tabular-nums">{rupee(data.totalSpentPaise)}</td>
              <td data-half data-label="Remaining" className="text-right tabular-nums">{rupee(data.totalBudgetPaise - data.totalSpentPaise)}</td>
              <td data-half data-label="Used" className="text-right tabular-nums">{data.totalBudgetPaise ? `${Math.round((data.totalSpentPaise / data.totalBudgetPaise) * 100)}%` : "–"}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/** Project → Expenses tab. */
export function ProjectExpenses({ p }: { p: Project }) {
  const toast = useToast();
  const params = useSearchParams();
  const userName = useUserName();
  const cats = useExpenseCategories();
  const { data: access, isPending: accessPending } = useProjectExpenseAccess(p.id);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState<ExpenseStatus | "">("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [requestedBy, setRequestedBy] = useState("");
  const [stage, setStage] = useState<StageKey | "">("");
  const [showDeleted, setShowDeleted] = useState(false);
  const [open, setOpen] = useState<string | null>(() => params.get("open"));
  const [dialog, setDialog] = useState<{ mode: "request" | "add" | "edit"; expense?: Expense; fill?: CasualFill } | null>(null);
  const q = useDebounced(search, 200);
  const canView = !!access?.canView;
  const filters: ExpenseFilters = { projectId: p.id, search: q, category, status, from, to, requestedBy, stage, showDeleted };
  const { data, isPending } = useExpenses(filters, canView);
  const { data: all } = useExpenses({ projectId: p.id }, canView);
  const { data: uncovered = [] } = useUncoveredCasualDays(p.id, canView);
  const requesters = useMemo(() => [...new Set((all?.items ?? []).map((e) => e.requestedBy))], [all]);

  useEffect(() => {
    const id = params.get("open");
    if (!id || !data) return;
    document.getElementById(`exp-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [params, data]);

  if (accessPending) return <LoadingRows />;
  if (!canView) return <EmptyState title="Only the project's site managers and admins can see its expenses." />;
  const rights = { isAdmin: access.isAdmin, canPay: access.canPay };
  const openCasual = (date: string) =>
    expenseRepo
      .casualFill(p.id, date)
      .then((fill) => setDialog({ mode: access.isAdmin ? "add" : "request", fill }))
      .catch((e) => toast(issuesOf(e).join(" "), "error"));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <TotalsBar t={data?.totals} />
        {access.canRequest ? (
          <Button variant="primary" onClick={() => setDialog({ mode: access.isAdmin ? "add" : "request" })}>
            {access.isAdmin ? "+ Add expense" : "+ Request expense"}
          </Button>
        ) : null}
      </div>

      {uncovered.length && access.canRequest ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900" data-testid="casual-check">
          <b><Icon icon={HardHat} size={14} className="mr-1 inline-block align-[-2px]" />Casual labour not requested yet:</b>
          {uncovered.slice(0, 8).map((d) => (
            <button key={d.date} type="button" onClick={() => void openCasual(d.date)} className="rounded-lg bg-white px-2.5 py-0.5 font-medium ring-1 ring-amber-300 hover:bg-amber-100">
              {dayLabel(d.date)} · {d.workers} workers · {rupee(d.amountPaise)}
            </button>
          ))}
          {uncovered.length > 8 ? <span>+{uncovered.length - 8} more</span> : null}
        </div>
      ) : null}

      <div className="filter-bar flex flex-wrap items-center gap-2">
        <input type="search" aria-label="Search expenses" placeholder="Search description, paid to, bill no., requested by…" value={search} onChange={(e) => setSearch(e.target.value)} className="min-w-[220px] flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
        <select aria-label="Filter by work stage" value={category} onChange={(e) => setCategory(e.target.value)} className={sel}>
          <option value="">All work stages</option>
          {cats.items.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        <select aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value as ExpenseStatus | "")} className={sel}>
          <option value="">All statuses</option>
          {EXPENSE_STATUSES.filter((s) => s.value !== "deleted" || access.isAdmin).map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <select aria-label="Filter by requested by" value={requestedBy} onChange={(e) => setRequestedBy(e.target.value)} className={sel}>
          <option value="">Anyone</option>
          {requesters.map((id) => (
            <option key={id} value={id}>
              {userName(id)}
            </option>
          ))}
        </select>
        <select aria-label="Filter by project stage" value={stage} onChange={(e) => setStage(e.target.value as StageKey | "")} className={sel}>
          <option value="">All stages</option>
          {STAGES.map((s) => (
            <option key={s.key} value={s.key}>
              {s.short}
            </option>
          ))}
        </select>
        <input type="date" aria-label="From date" value={from} onChange={(e) => setFrom(e.target.value)} className={sel} />
        <input type="date" aria-label="To date" value={to} onChange={(e) => setTo(e.target.value)} className={sel} />
        {access.isAdmin ? (
          <label className="flex items-center gap-1.5 text-sm text-slate-600">
            <input type="checkbox" className="accent-red-700" checked={showDeleted} onChange={(e) => setShowDeleted(e.target.checked)} /> Show deleted
          </label>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="hidden grid-cols-[6.5rem_1fr_11rem_8rem_6rem] gap-3 bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-500 md:grid">
          <span>Date</span>
          <span>Description</span>
          <span>Work stage</span>
          <span className="text-right">Amount</span>
          <span className="text-right">Status</span>
        </div>
        {isPending ? (
          <LoadingRows />
        ) : !data?.items.length ? (
          <EmptyState title="No expenses match." />
        ) : (
          <ul className="divide-y divide-slate-100" data-testid="expense-list">
            {data.items.map((e) => (
              <ExpenseRow key={e.id} e={e} open={open === e.id} onToggle={() => setOpen(open === e.id ? null : e.id)} rights={rights} onEdit={() => setDialog({ mode: "edit", expense: e })} />
            ))}
          </ul>
        )}
      </div>

      {access.isAdmin ? <BudgetCard projectId={p.id} /> : null}
      {!access.isAdmin ? <p className="text-xs text-slate-500">Site managers request expenses; an admin accepts, pays, rejects or corrects them. Every step shows in the project timeline.</p> : null}

      {dialog ? <ExpenseDialog project={p} mode={dialog.mode} expense={dialog.expense} initialFill={dialog.fill} onClose={() => setDialog(null)} /> : null}
    </div>
  );
}
