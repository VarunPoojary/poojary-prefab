"use client";

import Link from "next/link";
import { useState } from "react";
import { useToast } from "@/components/Providers";
import { Button, Card } from "@/components/ui/fields";
import { Modal } from "@/components/ui/overlays";
import { useQuotationSaver } from "@/components/wizard/useQuotationSaver";
import { OPEN_STATUSES, isClosed, statusMeta } from "@/lib/crm/config";
import { useClient, useEnquiries, useEnquiry, useLinkQuotation, useUnlinkQuotation } from "@/lib/crm/hooks";
import { isNearMatch, padRevision } from "@/lib/crm/rules";
import type { EnquirySummary } from "@/lib/crm/types";
import { useQuotationRecord } from "@/lib/data/hooks";
import { useQuotationStore } from "@/lib/store";
import { SearchSelect, StatusBadge, useDebounced } from "./ui";
import { TriangleAlert } from "lucide-react";
import { Icon } from "@/components/ui/icons";

/** Searchable list of open enquiries (by number, client or project). */
export function OpenEnquirySearch({ onSelect, autoFocus }: { onSelect: (e: EnquirySummary) => void; autoFocus?: boolean }) {
  const [query, setQuery] = useState("");
  const q = useDebounced(query, 200);
  const { data, isFetching } = useEnquiries({ search: q, statuses: OPEN_STATUSES, pageSize: 12, sort: "updated" });
  const items = data?.items ?? [];
  return (
    <SearchSelect
      label="Link to enquiry"
      placeholder="Search open enquiries by number, client or project…"
      autoFocus={autoFocus}
      query={query}
      onQuery={setQuery}
      loading={isFetching}
      emptyText="No open enquiries match"
      options={items.map((e) => ({
        value: e.id,
        label: `${e.number} · ${e.clientName}`,
        sub: e.projectName,
        badge: <StatusBadge status={e.status} />,
      }))}
      onSelect={(id) => onSelect(items.find((e) => e.id === id)!)}
    />
  );
}

/** Warns when a quotation's client differs from the enquiry's client. */
export function clientMismatch(
  quote: { clientId?: string | null; clientName: string },
  enquiry: { clientId: string; clientName: string },
) {
  return quote.clientId ? quote.clientId !== enquiry.clientId : !isNearMatch(quote.clientName, enquiry.clientName);
}

/** Review-step card: shows the quotation's enquiry link and lets the user link, change or unlink it. */
export function LinkEnquiryCard() {
  const toast = useToast();
  const saveNow = useQuotationSaver();
  const recordId = useQuotationStore((s) => s.recordId);
  const pendingEnquiryId = useQuotationStore((s) => s.pendingEnquiryId);
  const q = useQuotationStore((s) => s.quotation)!;
  const update = useQuotationStore((s) => s.update);
  const { data: record } = useQuotationRecord(recordId);
  const enquiryId = record?.enquiryId ?? pendingEnquiryId;
  const { data: enquiry } = useEnquiry(enquiryId);
  const { data: enquiryClient } = useClient(enquiry?.clientId);
  const link = useLinkQuotation();
  const unlink = useUnlinkQuotation();
  const [changing, setChanging] = useState(false);
  const [busy, setBusy] = useState(false);

  const doLink = async (e: EnquirySummary) => {
    if (
      clientMismatch({ clientId: q.client.clientId, clientName: q.client.company }, e) &&
      !confirm(`This quotation is for “${q.client.company || "no client"}”, but ${e.number} is for “${e.clientName}”. Link anyway?`)
    )
      return;
    setBusy(true);
    try {
      let id = useQuotationStore.getState().recordId;
      if (!id) {
        await saveNow();
        id = useQuotationStore.getState().recordId;
      }
      if (!id) throw new Error("Save the quotation first.");
      const r = await link.mutateAsync({ quotationId: id, enquiryId: e.id });
      const rev = padRevision(r.revision);
      if (useQuotationStore.getState().quotation?.meta.revision !== rev) update((d) => void (d.meta.revision = rev));
      toast(`Linked to ${r.enquiry.number} as R${r.revision}${r.statusChanged ? ` · status → ${statusMeta(r.statusChanged).label}` : ""}`);
      setChanging(false);
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), "error");
    } finally {
      setBusy(false);
    }
  };

  const mismatch =
    enquiry && enquiryClient
      ? clientMismatch({ clientId: q.client.clientId, clientName: q.client.company }, { clientId: enquiry.clientId, clientName: enquiryClient.name })
      : false;
  const closed = enquiry ? isClosed(enquiry.status) : false;

  return (
    <Card title="Enquiry">
      {enquiry && !changing ? (
        <div className="space-y-2 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/enquiries/${enquiry.id}`} target="_blank" className="font-semibold text-slate-900 hover:underline">
              {enquiry.number}
            </Link>
            <StatusBadge status={enquiry.status} />
            {record?.enquiryId ? (
              <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[11px] font-semibold text-white">R{record.enquiryRevision}</span>
            ) : null}
          </div>
          <div className="text-slate-600">{enquiry.projectName}</div>
          {!record?.enquiryId ? (
            <p className="text-xs text-slate-500">Will be linked as R{enquiry.nextRevision} when the quotation is saved.</p>
          ) : null}
          {mismatch ? (
            <p className="rounded-lg bg-amber-50 px-2 py-1.5 text-xs text-amber-900">
              <Icon icon={TriangleAlert} size={14} className="mr-1 inline-block align-[-2px]" />The client on this quotation (“{q.client.company || "none"}”) doesn&apos;t match the enquiry&apos;s client (“{enquiryClient?.name}”).
            </p>
          ) : null}
          {record?.enquiryId && !closed ? (
            <div className="flex gap-2 pt-1">
              <Button size="sm" onClick={() => setChanging(true)}>
                Change
              </Button>
              <Button
                size="sm"
                variant="danger"
                disabled={unlink.isPending}
                onClick={() => {
                  if (!confirm(`Unlink this quotation from ${enquiry.number}?`)) return;
                  unlink.mutate(record.id, { onSuccess: () => toast("Unlinked from the enquiry"), onError: (err) => toast(err.message, "error") });
                }}
              >
                Unlink
              </Button>
            </div>
          ) : closed ? (
            <p className="text-xs text-slate-500">The enquiry is closed, so the link can&apos;t be changed.</p>
          ) : null}
        </div>
      ) : (
        <div className="space-y-2">
          {!changing ? (
            <p className="rounded-lg bg-amber-50 px-2 py-1.5 text-xs text-amber-900">
              Not linked to an enquiry – it will show as <b>Unlinked</b> in the quotations list.
            </p>
          ) : null}
          <OpenEnquirySearch onSelect={(e) => void doLink(e)} autoFocus={changing} />
          {busy ? <p className="text-xs text-slate-500">Linking…</p> : null}
          {changing ? (
            <Button size="sm" variant="ghost" onClick={() => setChanging(false)}>
              Cancel
            </Button>
          ) : null}
        </div>
      )}
    </Card>
  );
}

/** Dialog version used from the quotations list ("Link to enquiry…"). */
export function LinkToEnquiryDialog({
  quotation,
  onClose,
}: {
  quotation: { id: string; offerNo: string; revision: string; client: string; clientId: string | null };
  onClose: () => void;
}) {
  const toast = useToast();
  const link = useLinkQuotation();
  return (
    <Modal open onClose={onClose} title={`Link offer ${quotation.offerNo}/${quotation.revision} to an enquiry`}>
      <OpenEnquirySearch
        autoFocus
        onSelect={(e) => {
          if (
            clientMismatch({ clientId: quotation.clientId, clientName: quotation.client }, e) &&
            !confirm(`This quotation is for “${quotation.client || "no client"}”, but ${e.number} is for “${e.clientName}”. Link anyway?`)
          )
            return;
          link.mutate(
            { quotationId: quotation.id, enquiryId: e.id },
            {
              onSuccess: (r) => {
                toast(`Linked to ${r.enquiry.number} as R${r.revision}${r.statusChanged ? ` · status → ${statusMeta(r.statusChanged).label}` : ""}`);
                onClose();
              },
              onError: (err) => toast(err.message, "error"),
            },
          );
        }}
      />
      <p className="mt-3 text-xs text-slate-500">
        The quotation gets the enquiry&apos;s next revision number (R0, R1 …) and its Revision field is updated to match.
      </p>
    </Modal>
  );
}
