"use client";

import { useState } from "react";
import { useUserName } from "@/components/crm/ui";
import { FileLink } from "@/components/files/Files";
import { useToast } from "@/components/Providers";
import { Button } from "@/components/ui/fields";
import { expenseRepo } from "@/lib/expenses";
import { paymentModeLabel } from "@/lib/expenses/config";
import { useExpenseCategories, useExpenseMutation } from "@/lib/expenses/hooks";
import type { Expense } from "@/lib/expenses/types";
import { formatDate, formatDateTime } from "@/lib/format";
import { stageMeta } from "@/lib/projects/config";
import { ExpenseBadge, PayDialog, ReasonDialog, rupee } from "./bits";

export interface ExpenseRights {
  isAdmin: boolean;
  canPay: boolean;
}

const ACTION_LABEL: Record<string, string> = {
  requested: "Requested",
  added: "Added",
  accepted: "Accepted",
  paid: "Paid",
  rejected: "Rejected",
  edited: "Edited",
  deleted: "Deleted",
};

/** Everything about one expense, its history and the actions the user may take. */
export function ExpenseDetail({ e, rights, onEdit }: { e: Expense; rights: ExpenseRights; onEdit?: () => void }) {
  const toast = useToast();
  const userName = useUserName();
  const cats = useExpenseCategories();
  const [dialog, setDialog] = useState<"pay" | "reject" | "delete" | null>(null);
  const accept = useExpenseMutation(() => expenseRepo.accept([e.id]));
  const pay = useExpenseMutation((p: Parameters<typeof expenseRepo.pay>[1]) => expenseRepo.pay([e.id], p));
  const reject = useExpenseMutation((r: string) => expenseRepo.reject(e.id, r));
  const remove = useExpenseMutation((r: string) => expenseRepo.remove(e.id, r));
  const canPay = (rights.isAdmin && (e.status === "requested" || e.status === "accepted")) || (rights.canPay && e.status === "accepted");
  const row = (label: string, value: React.ReactNode) =>
    value ? (
      <div className="flex gap-2 py-0.5">
        <dt className="w-36 shrink-0 text-slate-500">{label}</dt>
        <dd className="min-w-0 text-slate-900">{value}</dd>
      </div>
    ) : null;

  return (
    <div className="space-y-3 border-t border-slate-100 bg-slate-50/50 px-4 pb-4 pt-3 text-sm" data-testid="expense-detail">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <dl>
          {row("Expense ID", e.code)}
          {row("Date", formatDate(e.date))}
          {row("Work stage", cats.label(e.category))}
          {row("Project stage", e.stage ? stageMeta(e.stage).label : "")}
          {row("Paid to", e.paidTo)}
          {row("Quantity", e.quantity !== null ? `${e.quantity} ${e.unit}` : "")}
          {row("Amount", <b>{rupee(e.amountPaise)}</b>)}
          {row("GST included", e.gstPaise !== null ? rupee(e.gstPaise) : "")}
          {row("Bill number", e.billNumber)}
          {row("Bill", e.bill ? <FileLink file={{ fileId: e.bill.fileId, name: e.bill.name }} /> : "")}
          {row("Payment", e.payment ? `${paymentModeLabel(e.payment.mode)}${e.payment.reference ? `, ref. ${e.payment.reference}` : ""} · ${formatDate(e.payment.date)}` : "")}
          {row("Requested by", `${userName(e.requestedBy)} · ${formatDateTime(e.requestedAt)}`)}
          {e.rejectReason ? row("Rejection reason", <span className="text-red-700">{e.rejectReason}</span>) : null}
          {e.deleteReason ? row("Delete reason", <span className="text-red-700">{e.deleteReason}</span>) : null}
        </dl>
        <div>
          <h5 className="mb-1 text-xs font-semibold text-slate-500">History</h5>
          <ul className="space-y-1.5 text-xs" data-testid="expense-history">
            {e.history.map((h, i) => (
              <li key={i}>
                <span className="text-slate-500">{formatDateTime(h.at)}</span> · <b>{ACTION_LABEL[h.action]}</b> by {userName(h.by)}
                {h.changes ? (
                  <span className="block text-slate-700">
                    {Object.entries(h.changes)
                      .map(([k, [o, n]]) => (o ? `${k}: ${o} → ${n}` : `${k}: ${n}`))
                      .join(" · ")}
                  </span>
                ) : null}
                {h.reason ? <span className="block text-slate-600">Reason: {h.reason}</span> : null}
              </li>
            ))}
          </ul>
          {e.casual ? (
            <div className="mt-3">
              <h5 className="mb-1 text-xs font-semibold text-slate-500">Casual workers ({e.casual.lines.length})</h5>
              <ul className="text-xs text-slate-700">
                {e.casual.lines.map((l) => (
                  <li key={l.workerId}>
                    {l.name} · {l.status === "present" ? "Present" : "Half day"} · {rupee(l.amountPaise)}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        {rights.isAdmin && e.status === "requested" ? (
          <Button
            size="sm"
            variant="primary"
            disabled={accept.isPending}
            onClick={() => accept.mutate(undefined, { onSuccess: () => toast(`${e.code} accepted`), onError: (err) => toast(err.message, "error") })}
          >
            Accept
          </Button>
        ) : null}
        {canPay ? (
          <Button size="sm" variant={rights.isAdmin && e.status === "requested" ? "secondary" : "primary"} onClick={() => setDialog("pay")}>
            Mark paid
          </Button>
        ) : null}
        {rights.isAdmin && e.status === "requested" ? (
          <Button size="sm" onClick={() => setDialog("reject")}>
            Reject
          </Button>
        ) : null}
        {rights.isAdmin && onEdit && e.status !== "deleted" && e.status !== "rejected" ? (
          <Button size="sm" onClick={onEdit}>
            Edit
          </Button>
        ) : null}
        {rights.isAdmin && e.status !== "deleted" ? (
          <Button size="sm" variant="danger" onClick={() => setDialog("delete")}>
            Delete
          </Button>
        ) : null}
      </div>
      {dialog === "pay" ? <PayDialog count={1} totalPaise={e.amountPaise} onPay={(p) => pay.mutateAsync(p).then(() => toast(`${e.code} marked paid`))} onClose={() => setDialog(null)} /> : null}
      {dialog === "reject" ? (
        <ReasonDialog title={`Reject ${e.code}`} message="The requester is notified with the reason." confirm="Reject" onConfirm={(r) => reject.mutateAsync(r).then(() => toast(`${e.code} rejected`))} onClose={() => setDialog(null)} />
      ) : null}
      {dialog === "delete" ? (
        <ReasonDialog
          title={`Delete ${e.code}`}
          message="It is hidden from the list (visible with “Show deleted”) and no longer counts as spend. The timeline keeps the record."
          confirm="Delete"
          onConfirm={(r) => remove.mutateAsync(r).then(() => toast(`${e.code} deleted`))}
          onClose={() => setDialog(null)}
        />
      ) : null}
    </div>
  );
}

/** One expense row (tap to expand). */
export function ExpenseRow({
  e,
  open,
  onToggle,
  rights,
  onEdit,
  projectLabel,
  select,
}: {
  e: Expense;
  open: boolean;
  onToggle: () => void;
  rights: ExpenseRights;
  onEdit?: () => void;
  projectLabel?: string;
  select?: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean };
}) {
  const userName = useUserName();
  const cats = useExpenseCategories();
  return (
    <li data-testid="expense-row" data-status={e.status} id={`exp-${e.id}`} className={e.status === "deleted" ? "opacity-60" : ""}>
      <div className="flex items-start gap-2 px-4 py-3 hover:bg-slate-50">
        {select ? (
          <input
            type="checkbox"
            aria-label={`Select ${e.code}`}
            className="mt-1 h-4 w-4 accent-red-700"
            checked={select.checked}
            disabled={select.disabled}
            onChange={(ev) => select.onChange(ev.target.checked)}
          />
        ) : null}
        <button type="button" aria-expanded={open} onClick={onToggle} className="grid min-w-0 flex-1 grid-cols-[1fr_auto] items-start gap-x-3 gap-y-1 text-left text-sm md:grid-cols-[6.5rem_1fr_11rem_8rem_6rem]">
          <span className="text-xs text-slate-500 md:text-sm md:text-slate-700">
            {formatDate(e.date)}
            <span className="ref-code block text-xs text-slate-500">{e.code}</span>
          </span>
          <span className="col-span-2 min-w-0 md:col-span-1">
            <span className="block truncate font-medium text-slate-900">{e.description}</span>
            <span className="block truncate text-xs text-slate-500">
              {projectLabel ? `${projectLabel} · ` : ""}
              {e.paidTo} · by {userName(e.requestedBy)}
              {e.bill ? " · bill attached" : ""}
            </span>
          </span>
          <span className="text-xs text-slate-600">{cats.label(e.category)}</span>
          <span className="text-right font-semibold tabular-nums text-slate-900">{rupee(e.amountPaise)}</span>
          <span className="text-right">
            <ExpenseBadge status={e.status} />
          </span>
        </button>
      </div>
      {open ? <ExpenseDetail e={e} rights={rights} onEdit={onEdit} /> : null}
    </li>
  );
}
