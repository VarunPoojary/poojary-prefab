"use client";

import { Download } from "lucide-react";
import { Icon } from "@/components/ui/icons";
import { useMemo, useState } from "react";
import Link from "next/link";
import { EmptyState, LoadingRows, PageContainer, PageHeader, useDebounced, useUserName } from "@/components/crm/ui";
import { useToast } from "@/components/Providers";
import { Button } from "@/components/ui/fields";
import { expenseRepo } from "@/lib/expenses";
import { EXPENSE_STATUSES, expenseStatusMeta, paymentModeLabel } from "@/lib/expenses/config";
import { useExpenseCategories, useExpenseMutation, useExpensePageAccess, useExpenseProjects, useExpenses } from "@/lib/expenses/hooks";
import type { ExpenseFilters, ExpenseStatus } from "@/lib/expenses/types";
import { todayIso } from "@/lib/projects/rules";
import { PayDialog, csvAmount, downloadCsv, issuesOf, rupee } from "./bits";
import { ExpenseRow } from "./ExpenseList";
import { TotalsBar } from "./ProjectExpenses";

type Tab = "approve" | "pay" | "all";
const sel = "rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm";

/** Expenses page: every project's expenses for Admins (approve, pay) and the Accountant (pay). */
export function ExpensesPage() {
  const toast = useToast();
  const userName = useUserName();
  const cats = useExpenseCategories();
  const { data: access, isPending: accessPending } = useExpensePageAccess();
  const isAdmin = !!access?.isAdmin;
  const [tab, setTab] = useState<Tab | null>(null);
  const current: Tab = tab ?? (isAdmin ? "approve" : "pay");
  const [search, setSearch] = useState("");
  const [projectId, setProjectId] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState<ExpenseStatus | "">("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [paying, setPaying] = useState(false);
  const q = useDebounced(search, 200);
  const tabStatus: ExpenseStatus | "" = current === "approve" ? "requested" : current === "pay" ? "accepted" : status;
  const filters: ExpenseFilters = { search: q, projectId, category, status: tabStatus, from, to };
  const enabled = !!access?.canView;
  const { data, isPending } = useExpenses(filters, enabled);
  const { data: counts } = useExpenses({}, enabled);
  const { data: projects = [] } = useExpenseProjects(enabled);
  const names = useMemo(() => new Map(projects.map((p) => [p.id, `${p.code} ${p.name}`])), [projects]);
  const accept = useExpenseMutation((ids: string[]) => expenseRepo.accept(ids));
  const pay = useExpenseMutation(({ ids, p }: { ids: string[]; p: Parameters<typeof expenseRepo.pay>[1] }) => expenseRepo.pay(ids, p));

  if (accessPending) return <div className="p-6 text-sm text-slate-500">Loading…</div>;
  if (!access?.canView)
    return (
      <PageContainer>
        <EmptyState title="Only admins and the accountant can open the Expenses page." />
      </PageContainer>
    );

  const items = data?.items ?? [];
  const selectable = current === "approve" || current === "pay";
  const chosen = items.filter((e) => selected.includes(e.id));
  const setTabAnd = (t: Tab) => {
    setTab(t);
    setSelected([]);
    setOpen(null);
  };
  const exportCsv = () => {
    const rows: (string | number)[][] = [
      ["Expense ID", "Date", "Project", "Work stage", "Description", "Paid to", "Quantity", "Unit", "Amount (₹)", "GST (₹)", "Bill no.", "Status", "Requested by", "Payment mode", "Payment ref.", "Payment date"],
      ...items.map((e) => [
        e.code,
        e.date,
        names.get(e.projectId) ?? e.projectId,
        cats.label(e.category),
        e.description,
        e.paidTo,
        e.quantity ?? "",
        e.unit,
        csvAmount(e.amountPaise),
        e.gstPaise !== null ? csvAmount(e.gstPaise) : "",
        e.billNumber,
        expenseStatusMeta(e.status).label,
        userName(e.requestedBy),
        e.payment ? paymentModeLabel(e.payment.mode) : "",
        e.payment?.reference ?? "",
        e.payment?.date ?? "",
      ]),
    ];
    downloadCsv(`expenses-${todayIso()}.csv`, rows);
  };
  const count = (s: ExpenseStatus) => (counts?.items ?? []).filter((e) => e.status === s).length;
  const tabs: [Tab, string, boolean][] = [
    ["approve", `To approve (${count("requested")})`, isAdmin],
    ["pay", `To pay (${count("accepted")})`, true],
    ["all", "All", true],
  ];

  return (
    <PageContainer wide>
      <PageHeader title="Expenses" subtitle={isAdmin ? "Every project's expenses: approve requests, record payments, export." : "Record payments for accepted expenses."} actions={<Button onClick={exportCsv}><Icon icon={Download} size={16} />Export CSV</Button>} />
      <div className="mb-4 flex flex-wrap gap-2" role="tablist">
        {tabs
          .filter(([, , show]) => show)
          .map(([k, l]) => (
            <button key={k} type="button" role="tab" aria-selected={current === k} onClick={() => setTabAnd(k)} className={`rounded-lg px-4 py-1.5 text-sm font-medium ${current === k ? "bg-red-700 text-white" : "bg-white text-slate-700 ring-1 ring-slate-300"}`}>
              {l}
            </button>
          ))}
      </div>
      <div className="filter-bar mb-3 flex flex-wrap items-center gap-2">
        <input type="search" aria-label="Search expenses" placeholder="Search description, paid to, bill no., requested by…" value={search} onChange={(e) => setSearch(e.target.value)} className="min-w-[220px] flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
        <select aria-label="Filter by project" value={projectId} onChange={(e) => setProjectId(e.target.value)} className={sel}>
          <option value="">All projects</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.code} – {p.name}
            </option>
          ))}
        </select>
        <select aria-label="Filter by work stage" value={category} onChange={(e) => setCategory(e.target.value)} className={sel}>
          <option value="">All work stages</option>
          {cats.items.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        {current === "all" ? (
          <select aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value as ExpenseStatus | "")} className={sel}>
            <option value="">All statuses</option>
            {EXPENSE_STATUSES.filter((s) => s.value !== "deleted" || isAdmin).map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        ) : null}
        <input type="date" aria-label="From date" value={from} onChange={(e) => setFrom(e.target.value)} className={sel} />
        <input type="date" aria-label="To date" value={to} onChange={(e) => setTo(e.target.value)} className={sel} />
      </div>
      <div className="mb-3">
        <TotalsBar t={data?.totals} />
      </div>
      {selectable && chosen.length ? (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-red-200 bg-red-50/60 px-3 py-2 text-sm" data-testid="expense-bulk">
          <b>
            {chosen.length} selected · {rupee(chosen.reduce((s, e) => s + e.amountPaise, 0))}
          </b>
          {current === "approve" ? (
            <Button
              size="sm"
              variant="primary"
              disabled={accept.isPending}
              onClick={() =>
                accept.mutate(
                  chosen.map((e) => e.id),
                  { onSuccess: (n) => (toast(`${n} accepted`), setSelected([])), onError: (e) => toast(issuesOf(e).join(" "), "error") },
                )
              }
            >
              Accept selected
            </Button>
          ) : null}
          {current === "pay" ? (
            <Button size="sm" variant="primary" onClick={() => setPaying(true)}>
              Mark selected paid
            </Button>
          ) : null}
          <Button size="sm" variant="ghost" onClick={() => setSelected([])}>
            Clear
          </Button>
        </div>
      ) : null}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {selectable && items.length ? (
          <label className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-500">
            <input type="checkbox" aria-label="Select all" className="h-4 w-4 accent-red-700" checked={items.every((e) => selected.includes(e.id))} onChange={(ev) => setSelected(ev.target.checked ? items.map((e) => e.id) : [])} />
            Select all
          </label>
        ) : null}
        {isPending ? (
          <LoadingRows />
        ) : !items.length ? (
          <EmptyState title={current === "approve" ? "No requests waiting for approval." : current === "pay" ? "Nothing waiting for payment." : "No expenses match."} />
        ) : (
          <ul className="divide-y divide-slate-100" data-testid="expense-list">
            {items.map((e) => (
              <ExpenseRow
                key={e.id}
                e={e}
                open={open === e.id}
                onToggle={() => setOpen(open === e.id ? null : e.id)}
                rights={{ isAdmin, canPay: access.canPay }}
                projectLabel={names.get(e.projectId)}
                select={selectable ? { checked: selected.includes(e.id), onChange: (v) => setSelected((x) => (v ? [...x, e.id] : x.filter((y) => y !== e.id))) } : undefined}
              />
            ))}
          </ul>
        )}
      </div>
      {isAdmin ? (
        <p className="mt-2 text-xs text-slate-500">
          To edit or add an expense, open the project&apos;s Expenses tab (
          {projects
            .filter((p) => p.status === "active")
            .slice(0, 3)
            .map((p, i) => (
              <span key={p.id}>
                {i ? ", " : ""}
                <Link className="text-red-700 hover:underline" href={`/projects/${p.id}/expenses`}>
                  {p.code}
                </Link>
              </span>
            ))}
          …).
        </p>
      ) : null}
      {paying ? (
        <PayDialog
          count={chosen.length}
          totalPaise={chosen.reduce((s, e) => s + e.amountPaise, 0)}
          onPay={(p) => pay.mutateAsync({ ids: chosen.map((e) => e.id), p }).then((n) => (toast(`${n} marked paid`), setSelected([])))}
          onClose={() => setPaying(false)}
        />
      ) : null}
    </PageContainer>
  );
}
