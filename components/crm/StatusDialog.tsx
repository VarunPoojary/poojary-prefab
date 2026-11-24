"use client";

import { useState } from "react";
import { useToast } from "@/components/Providers";
import { Button, Select, TextArea, TextField } from "@/components/ui/fields";
import { Modal } from "@/components/ui/overlays";
import { DECLINE_REASONS, STATUSES, isClosed, statusMeta } from "@/lib/crm/config";
import { useChangeStatus, useEnquiry, useLinkedQuotations, useReopen } from "@/lib/crm/hooks";
import { validateStatusChange } from "@/lib/crm/rules";
import type { DeclineReason, EnquiryStatus, StatusChange } from "@/lib/crm/types";
import { todayLocalIso } from "@/lib/format";
import { formatRupee } from "@/lib/money";
import { ErrorList, StatusBadge } from "./ui";

const issuesOf = (e: unknown) => (e && typeof e === "object" && "issues" in e ? (e as { issues: string[] }).issues : [String(e)]);

/** Change an enquiry's status by hand, asking for whatever the target status requires. */
export function StatusDialog({
  enquiryId,
  open,
  onClose,
  initialTo,
}: {
  enquiryId: string;
  open: boolean;
  onClose: () => void;
  initialTo?: EnquiryStatus;
}) {
  if (!open) return null;
  return <StatusDialogBody enquiryId={enquiryId} onClose={onClose} initialTo={initialTo} />;
}

function StatusDialogBody({ enquiryId, onClose, initialTo }: { enquiryId: string; onClose: () => void; initialTo?: EnquiryStatus }) {
  const toast = useToast();
  const { data: e } = useEnquiry(enquiryId);
  const quotes = useLinkedQuotations({ enquiryId });
  const change = useChangeStatus();
  const [to, setTo] = useState<EnquiryStatus | "">(initialTo ?? "");
  const [comment, setComment] = useState("");
  const [followUpDate, setFollowUpDate] = useState("");
  const [quotationId, setQuotationId] = useState("");
  const [poNumber, setPoNumber] = useState("");
  const [poDate, setPoDate] = useState(todayLocalIso());
  const [reason, setReason] = useState<DeclineReason | "">("");
  const [competitor, setCompetitor] = useState("");
  const [other, setOther] = useState("");
  const [note, setNote] = useState("");
  const [issues, setIssues] = useState<string[]>([]);

  const linked = quotes.data?.items ?? [];
  const defaultQuote = linked.reduce<(typeof linked)[number] | null>(
    (best, q) => (!best || (q.enquiryRevision ?? 0) > (best.enquiryRevision ?? 0) ? q : best),
    null,
  );

  const build = (): StatusChange | null => {
    if (!to) return null;
    return {
      to,
      comment,
      followUpDate: to === "on_hold" ? followUpDate : undefined,
      finalised: to === "finalised" ? { quotationId: quotationId || defaultQuote?.id || "", poNumber, poDate } : undefined,
      declined: to === "declined" ? { reason: reason as DeclineReason, competitor, other, note } : undefined,
    };
  };

  const submit = () => {
    if (!e) return;
    const c = build();
    if (!c) return setIssues(["Choose the new status."]);
    const problems = validateStatusChange(
      e,
      c,
      linked.map((q) => q.id),
    );
    setIssues(problems);
    if (problems.length) return;
    change.mutate(
      { id: enquiryId, change: c },
      {
        onSuccess: (updated) => {
          toast(`${updated.number} → ${statusMeta(updated.status).label}`);
          onClose();
        },
        onError: (err) => setIssues(issuesOf(err)),
      },
    );
  };

  const commentLabel = to === "revision_requested" ? "What did the client ask to change? (optional)" : "Comment (optional)";

  return (
    <Modal
      open
      onClose={onClose}
      title={e ? `Change status – ${e.number}` : "Change status"}
      footer={
        e && !isClosed(e.status) ? (
          <>
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="primary" disabled={change.isPending} onClick={submit}>
              {change.isPending ? "Saving…" : "Save status"}
            </Button>
          </>
        ) : (
          <Button onClick={onClose}>Close</Button>
        )
      }
    >
      {!e ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : isClosed(e.status) ? (
        <p className="text-sm text-slate-700">
          This enquiry is <b>{statusMeta(e.status).label}</b>.{" "}
          {e.status === "declined" ? "Reopen it first to change its status." : "Finalised enquiries can't change status; an admin can reopen it."}
        </p>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm text-slate-600">
            Current: <StatusBadge status={e.status} />
          </div>
          <Select
            label="New status"
            value={to}
            options={[
              { value: "" as EnquiryStatus | "", label: "Select…" },
              ...STATUSES.filter((s) => s.value !== e.status).map((s) => ({ value: s.value as EnquiryStatus | "", label: s.label })),
            ]}
            onChange={(v) => {
              setTo(v);
              setIssues([]);
            }}
          />
          {to ? <p className="-mt-2 text-xs text-slate-500">{statusMeta(to).description}</p> : null}

          {to === "on_hold" ? (
            <TextField label="Follow-up date (optional)" type="date" value={followUpDate} onChange={setFollowUpDate} />
          ) : null}

          {to === "finalised" ? (
            <div className="space-y-3 rounded-lg border border-emerald-200 bg-emerald-50/50 p-3">
              {linked.length ? (
                <Select
                  label="Accepted quotation"
                  value={quotationId || defaultQuote?.id || ""}
                  options={linked
                    .slice()
                    .sort((a, b) => (b.enquiryRevision ?? 0) - (a.enquiryRevision ?? 0))
                    .map((q) => ({
                      value: q.id,
                      label: `R${q.enquiryRevision} – Offer ${q.offerNo}/${q.revision} – ${formatRupee(q.grandTotal)} (${q.status})`,
                    }))}
                  onChange={setQuotationId}
                />
              ) : (
                <p className="text-sm text-red-800">Link the accepted quotation to this enquiry before finalising it.</p>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <TextField label="PO / LOI number" required value={poNumber} onChange={setPoNumber} />
                <TextField label="PO / LOI date" type="date" required value={poDate} onChange={setPoDate} />
              </div>
            </div>
          ) : null}

          {to === "declined" ? (
            <div className="space-y-3 rounded-lg border border-red-200 bg-red-50/50 p-3">
              <Select
                label="Reason"
                value={reason}
                options={[{ value: "" as DeclineReason | "", label: "Select…" }, ...DECLINE_REASONS]}
                onChange={setReason}
              />
              {reason === "competitor" ? <TextField label="Competitor name" required value={competitor} onChange={setCompetitor} /> : null}
              {reason === "other" ? <TextField label="Describe the reason" required value={other} onChange={setOther} /> : null}
              <TextArea label="Note (optional)" rows={2} value={note} onChange={setNote} />
            </div>
          ) : null}

          {to ? <TextArea label={commentLabel} rows={2} value={comment} onChange={setComment} /> : null}
          <ErrorList issues={issues} />
        </div>
      )}
    </Modal>
  );
}

export function ReopenDialog({
  enquiryId,
  open,
  onClose,
  finalised = false,
}: {
  enquiryId: string;
  open: boolean;
  onClose: () => void;
  finalised?: boolean;
}) {
  const toast = useToast();
  const reopen = useReopen();
  const [comment, setComment] = useState("");
  const [issues, setIssues] = useState<string[]>([]);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={finalised ? "Reopen finalised enquiry" : "Reopen enquiry"}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={reopen.isPending}
            onClick={() => {
              if (!comment.trim()) return setIssues(["Add a comment explaining why the enquiry is reopened."]);
              reopen.mutate(
                { id: enquiryId, comment },
                {
                  onSuccess: (e) => {
                    toast(`${e.number} reopened as ${statusMeta(e.status).label}`);
                    onClose();
                  },
                  onError: (err) => setIssues(issuesOf(err)),
                },
              );
            }}
          >
            Reopen
          </Button>
        </>
      }
    >
      <p className="mb-3 text-sm text-slate-600">
        {finalised
          ? "The enquiry goes back to the status it had before it was finalised and the PO / LOI details are cleared. Its project is kept but shows a warning until an admin keeps or cancels it."
          : "The enquiry goes back to the status it had before it was declined."}
      </p>
      <TextArea label="Comment" required rows={3} value={comment} onChange={setComment} />
      <div className="mt-3">
        <ErrorList issues={issues} />
      </div>
    </Modal>
  );
}
