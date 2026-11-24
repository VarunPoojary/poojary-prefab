"use client";

import { FileLink } from "@/components/files/Files";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useProjects } from "@/lib/projects/hooks";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { useToast } from "@/components/Providers";
import { Button, Card, TextArea } from "@/components/ui/fields";
import { Modal } from "@/components/ui/overlays";
import {
  BUILDING_TYPES,
  CONTACT_ROLES,
  DECLINE_REASONS,
  LEAD_SOURCES,
  SCOPES,
  STATUSES,
  isClosed,
  labelOf,
  statusMeta,
} from "@/lib/crm/config";
import {
  useAddAttachment,
  useAddNote,
  useClient,
  useEnquiry,
  useLinkQuotation,
  useLinkedQuotations,
  useRemoveAttachment,
  useUnlinkQuotation,
  useUpdateEnquiry,
} from "@/lib/crm/hooks";
import { followUpState, formatPhone, isNearMatch } from "@/lib/crm/rules";
import type { Enquiry, EnquiryEvent, EnquiryStatus } from "@/lib/crm/types";
import { useNewRevision, useQuotationList } from "@/lib/data/hooks";
import type { QuotationSummary } from "@/lib/data/types";
import { PRESETS } from "@/lib/defaults";
import { formatBytes, formatDate, formatDateTime } from "@/lib/format";
import { formatRupee } from "@/lib/money";
import { NotFound, QuoteStatus } from "./ClientDetail";
import { AttachButton } from "./EnquiryForm";
import { ReopenDialog, StatusDialog } from "./StatusDialog";
import { InfoRow, LoadingRows, PageContainer, PageHeader, StatusBadge, useDebounced, useUserName } from "./ui";

export function EnquiryDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const userName = useUserName();
  const { data: e, error, isPending } = useEnquiry(id);
  const { data: client } = useClient(e?.clientId);
  const quotes = useLinkedQuotations({ enquiryId: id });
  const addNote = useAddNote();
  const addAtt = useAddAttachment();
  const removeAtt = useRemoveAttachment();
  const unlink = useUnlinkQuotation();
  const updateEnquiry = useUpdateEnquiry();
  const [statusTo, setStatusTo] = useState<EnquiryStatus | null>(null);
  const [reopenOpen, setReopenOpen] = useState(false);
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [note, setNote] = useState("");
  const [editingNotes, setEditingNotes] = useState<string | null>(null);
  const [now] = useState(() => Date.now());
  const { user } = useAuth();
  const { data: projects } = useProjects({ enquiryId: id, statuses: [] });
  const project = projects?.[0];

  if (error) return <NotFound what="Enquiry" />;
  if (isPending || !client) return <PageContainer wide><LoadingRows /></PageContainer>;

  const closed = isClosed(e.status);
  const contact = client.contacts.find((c) => c.id === e.contactId);
  const linked = [...(quotes.data?.items ?? [])].sort((a, b) => (b.enquiryRevision ?? 0) - (a.enquiryRevision ?? 0));
  const latest = linked[0];
  const fu = followUpState(e, now);
  const quoteLabel = (qid?: string) => {
    const q = linked.find((x) => x.id === qid);
    return q ? `Offer ${q.offerNo}/${q.revision}` : "a quotation";
  };

  const saveNotes = () =>
    updateEnquiry.mutate(
      { id: e.id, input: { ...toInput(e), notes: editingNotes ?? "" } },
      { onSuccess: () => (setEditingNotes(null), toast("Notes saved")), onError: (err) => toast(err.message, "error") },
    );

  return (
    <PageContainer wide>
      <PageHeader
        back={{ href: "/enquiries", label: "Enquiries" }}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {e.number}
            <StatusBadge status={e.status} className="text-xs" />
          </span>
        }
        subtitle={`${e.projectName} · ${e.siteLocation}`}
        actions={
          <>
            {!closed ? (
              <select
                aria-label="Enquiry status"
                value={e.status}
                onChange={(ev) => setStatusTo(ev.target.value as EnquiryStatus)}
                className="rounded-md border border-slate-300 bg-white px-2.5 py-2 text-sm font-medium"
              >
                {STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            ) : null}
            {e.status === "declined" || (e.status === "finalised" && user?.role === "admin") ? (
              <Button variant={e.status === "declined" ? "primary" : "secondary"} onClick={() => setReopenOpen(true)}>
                Reopen
              </Button>
            ) : null}
            {!closed ? <Button onClick={() => router.push(`/enquiries/${e.id}/edit`)}>Edit</Button> : null}
            {!closed ? (
              <Button variant="primary" onClick={() => setQuoteOpen(true)}>
                {latest ? "+ Quotation / revision" : "+ Create quotation"}
              </Button>
            ) : null}
          </>
        }
      />

      {project ? (
        <Link
          href={`/projects/${project.id}/details`}
          data-testid="enquiry-project-link"
          className="mb-3 flex items-center justify-between rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900 hover:bg-sky-100"
        >
          <span>
            🏗️ Project <b>{project.code}</b> · {project.name} · {Math.round(project.progress)}% complete
          </span>
          <span className="font-medium">Open project →</span>
        </Link>
      ) : null}

      {closed ? (
        <div
          className={`mb-5 rounded-lg border px-4 py-3 text-sm ${
            e.status === "finalised" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-red-200 bg-red-50 text-red-900"
          }`}
        >
          {e.status === "finalised" && e.finalised ? (
            <>
              <b>Order won.</b> Accepted {quoteLabel(e.finalised.quotationId)} · PO / LOI <b>{e.finalised.poNumber}</b> dated{" "}
              {formatDate(e.finalised.poDate)}.
            </>
          ) : e.declined ? (
            <>
              <b>Declined:</b> {labelOf(DECLINE_REASONS, e.declined.reason)}
              {e.declined.reason === "competitor" && e.declined.competitor ? ` – ${e.declined.competitor}` : ""}
              {e.declined.reason === "other" && e.declined.other ? ` – ${e.declined.other}` : ""}
              {e.declined.note ? `. ${e.declined.note}` : ""}
            </>
          ) : null}
          <div className="mt-1 text-xs opacity-80">This enquiry is closed; only notes can be changed.</div>
        </div>
      ) : fu.due ? (
        <div className="mb-5 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
          <b>Needs follow-up:</b> {fu.reason}.
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5">
          <Card title="Client & contact">
            <Link href={`/clients/${client.id}`} className="font-semibold text-slate-900 hover:underline">
              {client.name}
            </Link>
            <div className="text-xs text-slate-500">{[client.city, client.state].filter(Boolean).join(", ")}</div>
            {contact ? (
              <div className="mt-3 text-sm">
                <div className="font-medium text-slate-900">{contact.name}</div>
                <div className="text-xs text-slate-500">{labelOf(CONTACT_ROLES, contact.role)}</div>
                {contact.phone ? <a className="block text-slate-700 hover:underline" href={`tel:${contact.phone}`}>{formatPhone(contact.phone)}</a> : null}
                {contact.email ? <a className="block text-slate-700 hover:underline" href={`mailto:${contact.email}`}>{contact.email}</a> : null}
              </div>
            ) : null}
          </Card>

          <Card title="Enquiry details">
            <dl>
              <InfoRow label="Enquiry date">{formatDate(e.enquiryDate)}</InfoRow>
              <InfoRow label="Building type">
                {e.buildingType === "other" ? e.buildingTypeOther : labelOf(BUILDING_TYPES, e.buildingType)}
              </InfoRow>
              <InfoRow label="Scope">{e.scope === "other" ? e.scopeOther : labelOf(SCOPES, e.scope)}</InfoRow>
              <InfoRow label="Approx. size">{sizeText(e)}</InfoRow>
              <InfoRow label="Lead source">
                {e.leadSource
                  ? e.leadSource === "other"
                    ? e.leadSourceOther
                    : labelOf(LEAD_SOURCES, e.leadSource)
                  : `${labelOf(LEAD_SOURCES, client.leadSource)} (client)`}
              </InfoRow>
              <InfoRow label="Assigned to">{userName(e.assignedTo)}</InfoRow>
              <InfoRow label="Expected decision">{formatDate(e.expectedDecisionDate)}</InfoRow>
              {e.status === "on_hold" ? <InfoRow label="Follow-up date">{formatDate(e.followUpDate)}</InfoRow> : null}
              <InfoRow label="Created">
                {formatDate(e.createdAt)} by {userName(e.createdBy)}
              </InfoRow>
            </dl>
            {e.description ? <p className="mt-3 whitespace-pre-line text-sm text-slate-700">{e.description}</p> : null}
            <div className="mt-4 border-t border-slate-100 pt-3">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Notes</span>
                {editingNotes === null ? (
                  <button type="button" className="text-xs font-medium text-red-700 hover:underline" onClick={() => setEditingNotes(e.notes)}>
                    Edit
                  </button>
                ) : null}
              </div>
              {editingNotes !== null ? (
                <div className="space-y-2">
                  <TextArea rows={3} value={editingNotes} onChange={setEditingNotes} />
                  <div className="flex justify-end gap-2">
                    <Button size="sm" onClick={() => setEditingNotes(null)}>
                      Cancel
                    </Button>
                    <Button size="sm" variant="primary" disabled={updateEnquiry.isPending} onClick={saveNotes}>
                      Save notes
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="whitespace-pre-line text-sm text-slate-700">{e.notes || <span className="text-slate-400">–</span>}</p>
              )}
            </div>
          </Card>

          <Card
            title={`Attachments (${e.attachments.length})`}
            actions={
              !closed ? (
                <AttachButton
                  disabled={addAtt.isPending}
                  onFiles={(files) =>
                    files.forEach((file) =>
                      addAtt.mutate({ id: e.id, file }, { onSuccess: () => toast(`${file.name} attached`), onError: (err) => toast(err.message, "error") }),
                    )
                  }
                  onError={(m) => toast(m, "error")}
                />
              ) : null
            }
          >
            {e.attachments.length ? (
              <ul className="space-y-1.5 text-sm">
                {e.attachments.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-1">
                      📎 <FileLink file={a} /> <span className="shrink-0 text-xs text-slate-500">({formatBytes(a.size)})</span>
                    </span>
                    {!closed ? (
                      <Button size="sm" variant="danger" onClick={() => removeAtt.mutate({ id: e.id, attachmentId: a.id })}>
                        ✕
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-slate-500">Client drawings, site photos, BOQ… (up to 10 MB each)</p>
            )}
          </Card>
        </div>

        <div className="space-y-5 lg:col-span-2">
          <Card
            title={
              <span>
                Quotations ({linked.length})
                {latest ? (
                  <span className="ml-3 text-sm font-normal text-slate-500">
                    Current value <b className="text-slate-900">{formatRupee(latest.grandTotal)}</b>
                  </span>
                ) : null}
              </span>
            }
            actions={
              !closed ? (
                <Button size="sm" onClick={() => setLinkOpen(true)}>
                  Link existing quotation…
                </Button>
              ) : null
            }
          >
            {quotes.isPending ? (
              <LoadingRows rows={2} />
            ) : linked.length ? (
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-slate-500">
                  <tr>
                    <th className="py-1.5">Rev</th>
                    <th className="py-1.5">Offer</th>
                    <th className="py-1.5">Date</th>
                    <th className="py-1.5 text-right">Total</th>
                    <th className="py-1.5">Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {linked.map((q) => (
                    <tr key={q.id} data-testid="linked-quote">
                      <td className="py-2 font-semibold text-slate-900">R{q.enquiryRevision}</td>
                      <td className="py-2">
                        <Link href={`/quotations/${q.id}`} className="text-slate-800 hover:underline">
                          {q.offerNo} / {q.revision}
                        </Link>
                        {e.finalised?.quotationId === q.id ? (
                          <span className="ml-2 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-emerald-800">
                            Accepted
                          </span>
                        ) : null}
                      </td>
                      <td className="py-2 text-slate-600">{formatDate(q.date)}</td>
                      <td className="py-2 text-right tabular-nums text-slate-900">{formatRupee(q.grandTotal)}</td>
                      <td className="py-2">
                        <QuoteStatus status={q.status} sentAt={q.sentAt} />
                      </td>
                      <td className="py-2 text-right">
                        {!closed ? (
                          <button
                            type="button"
                            className="text-xs text-slate-500 hover:text-red-700"
                            onClick={() => {
                              if (!confirm(`Unlink offer ${q.offerNo}/${q.revision} (R${q.enquiryRevision}) from ${e.number}?`)) return;
                              unlink.mutate(q.id, { onSuccess: () => toast("Quotation unlinked"), onError: (err) => toast(err.message, "error") });
                            }}
                          >
                            Unlink
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-sm text-slate-500">
                No quotation yet. Use <b>Create quotation</b>, or link one from the Quotation Maker&apos;s review page.
              </p>
            )}
            {latest && !closed && (e.status === "quotation_created" || e.status === "revision_created") ? (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-violet-50 px-3 py-2 text-sm text-violet-900">
                <span>Sent R{latest.enquiryRevision} to the client?</span>
                <Button size="sm" onClick={() => setStatusTo(latest.enquiryRevision ? "revision_sent" : "quotation_sent")}>
                  Mark as {latest.enquiryRevision ? "Revision" : "Quotation"} Sent
                </Button>
              </div>
            ) : null}
          </Card>

          <Card title="Activity">
            <div className="mb-4">
              <TextArea label="Add a note" rows={2} value={note} onChange={setNote} placeholder="Call summary, client feedback, next step…" />
              <div className="mt-2 flex justify-end">
                <Button
                  size="sm"
                  variant="primary"
                  disabled={!note.trim() || addNote.isPending}
                  onClick={() => addNote.mutate({ id: e.id, text: note }, { onSuccess: () => (setNote(""), toast("Note added")) })}
                >
                  Add note
                </Button>
              </div>
            </div>
            <Timeline events={e.history} userName={userName} quoteLabel={quoteLabel} />
          </Card>
        </div>
      </div>

      <StatusDialog
        key={statusTo ?? "none"}
        enquiryId={e.id}
        open={!!statusTo}
        initialTo={statusTo ?? undefined}
        onClose={() => setStatusTo(null)}
      />
      <ReopenDialog enquiryId={e.id} open={reopenOpen} finalised={e.status === "finalised"} onClose={() => setReopenOpen(false)} />
      <CreateQuotationMenu enquiryId={e.id} open={quoteOpen} onClose={() => setQuoteOpen(false)} />
      <LinkQuotationDialog enquiry={e} clientName={client.name} open={linkOpen} onClose={() => setLinkOpen(false)} />
    </PageContainer>
  );
}

function toInput(e: Enquiry) {
  const { clientId, contactId, enquiryDate, projectName, siteLocation, buildingType, buildingTypeOther, scope, scopeOther, size, description, leadSource, leadSourceOther, assignedTo, expectedDecisionDate, notes } = e;
  return { clientId, contactId, enquiryDate, projectName, siteLocation, buildingType, buildingTypeOther, scope, scopeOther, size, description, leadSource, leadSourceOther, assignedTo, expectedDecisionDate, notes };
}

function sizeText(e: Enquiry) {
  const { length, width, height, areaSqft } = e.size;
  const dims = [length, width, height].filter((v) => v !== null);
  const parts = [];
  if (dims.length) parts.push(`${dims.join(" × ")} m`);
  if (areaSqft) parts.push(`${areaSqft.toLocaleString("en-IN")} ft²`);
  return parts.join(" · ");
}

function Timeline({
  events,
  userName,
  quoteLabel,
}: {
  events: EnquiryEvent[];
  userName: (id: string) => string;
  quoteLabel: (id?: string) => string;
}) {
  const sorted = [...events].sort((a, b) => b.at.localeCompare(a.at));
  const text = (ev: EnquiryEvent): React.ReactNode => {
    switch (ev.type) {
      case "created":
        return "Enquiry created";
      case "status":
        return (
          <>
            Status {ev.from ? <StatusBadge status={ev.from} /> : null} → {ev.to ? <StatusBadge status={ev.to} /> : null}
            {ev.automatic ? <span className="ml-1 text-xs text-slate-500">(automatic)</span> : null}
          </>
        );
      case "reopened":
        return (
          <>
            Reopened → {ev.to ? <StatusBadge status={ev.to} /> : null}
          </>
        );
      case "note":
        return "Note";
      case "quotation_linked":
        return `Quotation linked as R${ev.revision} (${quoteLabel(ev.quotationId)})`;
      case "quotation_unlinked":
        return `Quotation R${ev.revision ?? "?"} unlinked`;
      case "edited":
        return ev.comment ?? "Details updated";
      case "attachment_added":
        return `Attached ${ev.comment}`;
      case "attachment_removed":
        return `Removed attachment ${ev.comment}`;
    }
  };
  return (
    <ol className="relative space-y-4 border-l border-slate-200 pl-5" data-testid="timeline">
      {sorted.map((ev) => (
        <li key={ev.id} className="relative">
          <span
            className={`absolute -left-[26px] top-1 h-3 w-3 rounded-full border-2 border-white ${
              ev.type === "status" || ev.type === "reopened" ? "bg-red-700" : ev.type === "note" ? "bg-amber-500" : "bg-slate-400"
            }`}
          />
          <div className="flex flex-wrap items-center gap-1.5 text-sm text-slate-900">{text(ev)}</div>
          {ev.comment && ev.type !== "edited" && !ev.type.startsWith("attachment") ? (
            <p className="mt-1 whitespace-pre-line rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">{ev.comment}</p>
          ) : null}
          <div className="mt-0.5 text-xs text-slate-500">
            {userName(ev.userId)} · {formatDateTime(ev.at)}
          </div>
        </li>
      ))}
    </ol>
  );
}

/** Dialog to start a quotation for an enquiry: a revision of the latest one, or a new one from a template. */
export function CreateQuotationMenu({ enquiryId, open, onClose }: { enquiryId: string; open: boolean; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const quotes = useLinkedQuotations({ enquiryId }, open);
  const newRevision = useNewRevision();
  const { data: e } = useEnquiry(open ? enquiryId : null);
  if (!open) return null;
  const latest = [...(quotes.data?.items ?? [])].sort((a, b) => (b.enquiryRevision ?? 0) - (a.enquiryRevision ?? 0))[0];
  const nextR = e?.nextRevision ?? 0;
  const presetsFor = PRESETS.filter((p) => p.key.startsWith("blank"));
  return (
    <Modal open onClose={onClose} title={`New quotation for ${e?.number ?? "enquiry"}`} wide>
      {latest ? (
        <button
          type="button"
          disabled={newRevision.isPending}
          onClick={async () => {
            try {
              const { record, linkError } = await newRevision.mutateAsync(latest.id);
              if (linkError) toast(linkError, "error");
              else toast(`R${record.enquiryRevision} created from offer ${latest.offerNo}/${latest.revision}`);
              router.push(`/quotations/${record.id}`);
            } catch (err) {
              toast(err instanceof Error ? err.message : String(err), "error");
            }
          }}
          className="mb-4 w-full rounded-xl border border-red-200 bg-red-50/50 p-4 text-left hover:border-red-400"
        >
          <div className="text-sm font-semibold text-slate-900">
            Revision from latest – R{latest.enquiryRevision} → R{nextR}
          </div>
          <div className="mt-1 text-xs text-slate-600">
            Copies offer {latest.offerNo}/{latest.revision} ({formatRupee(latest.grandTotal)}) so you only change what the client asked for.
          </div>
        </button>
      ) : null}
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        {latest ? "Or start fresh" : "Start from"} (linked as R{nextR})
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {presetsFor.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => router.push(`/quotations/new?from=${p.key}&enquiry=${enquiryId}`)}
            className="rounded-xl border border-slate-200 p-4 text-left transition hover:border-red-400 hover:bg-red-50/40"
          >
            <div className="text-sm font-semibold text-slate-900">{p.label}</div>
            <div className="mt-1 text-xs text-slate-500">{p.description}</div>
          </button>
        ))}
      </div>
      <p className="mt-3 text-xs text-slate-500">Client, contact, project and site are filled in from the enquiry.</p>
    </Modal>
  );
}

/** Pick an unlinked quotation and link it to the enquiry. */
function LinkQuotationDialog({
  enquiry,
  clientName,
  open,
  onClose,
}: {
  enquiry: Enquiry;
  clientName: string;
  open: boolean;
  onClose: () => void;
}) {
  const toast = useToast();
  const [search, setSearch] = useState("");
  const q = useDebounced(search, 250);
  const { data, isPending } = useQuotationList({ search: q, linked: "unlinked", pageSize: 20 });
  const link = useLinkQuotation();
  if (!open) return null;
  const doLink = (s: QuotationSummary) => {
    const mismatch = s.clientId ? s.clientId !== enquiry.clientId : !isNearMatch(s.client, clientName);
    if (mismatch && !confirm(`Offer ${s.offerNo} is for “${s.client || "no client"}”, but this enquiry is for “${clientName}”. Link anyway?`))
      return;
    link.mutate(
      { quotationId: s.id, enquiryId: enquiry.id },
      {
        onSuccess: (r) => {
          toast(
            `Linked as R${r.revision}${r.statusChanged ? ` · status → ${statusMeta(r.statusChanged).label}` : ""}`,
          );
          onClose();
        },
        onError: (err) => toast(err.message, "error"),
      },
    );
  };
  return (
    <Modal open onClose={onClose} title={`Link a quotation to ${enquiry.number}`} wide>
      <input
        type="search"
        autoFocus
        aria-label="Search unlinked quotations"
        placeholder="Search unlinked quotations by offer no., client, subject…"
        value={search}
        onChange={(ev) => setSearch(ev.target.value)}
        className="mb-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-red-600"
      />
      {isPending ? (
        <LoadingRows rows={3} />
      ) : !data?.items.length ? (
        <p className="py-6 text-center text-sm text-slate-500">No unlinked quotations{q ? " match your search" : ""}.</p>
      ) : (
        <ul className="max-h-96 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
          {data.items.map((s) => {
            const sameClient = s.clientId ? s.clientId === enquiry.clientId : isNearMatch(s.client, clientName);
            return (
              <li key={s.id}>
                <button
                  type="button"
                  disabled={link.isPending}
                  onClick={() => doLink(s)}
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-red-50/40"
                >
                  <span className="w-16 font-semibold text-slate-900">
                    {s.offerNo}/{s.revision}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-slate-900">{s.client || <i>No client</i>}</span>
                    <span className="block truncate text-xs text-slate-500">{s.subject}</span>
                  </span>
                  {!sameClient ? <span className="text-[10px] font-semibold uppercase text-amber-700">Other client</span> : null}
                  <QuoteStatus status={s.status} sentAt={s.sentAt} />
                  <span className="w-28 text-right tabular-nums">{formatRupee(s.grandTotal)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-3 text-xs text-slate-500">
        The quotation becomes R{enquiry.nextRevision}. If it is already Final, the status moves to{" "}
        {enquiry.nextRevision === 0 ? "Quotation Created" : "Revision Created"}.
      </p>
    </Modal>
  );
}
