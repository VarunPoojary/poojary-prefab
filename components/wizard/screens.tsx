"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { crmRepo } from "@/lib/crm";
import { CONTACT_ROLES, isClosed, labelOf } from "@/lib/crm/config";
import { padRevision } from "@/lib/crm/rules";
import { PRESETS } from "@/lib/defaults";
import type { Quotation } from "@/lib/types";
import { quotationRepo } from "@/lib/data";
import { useQuotationRecord } from "@/lib/data/hooks";
import { useQuotationStore } from "@/lib/store";
import { todayIso } from "@/lib/template";
import { Wizard } from "./Wizard";

function FullPageMessage({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-slate-50 p-6 text-center">
      <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
      {children}
      <Link href="/quotations" className="rounded-md bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-800">
        Back to quotations
      </Link>
    </div>
  );
}

function Loading() {
  return <div className="p-6 text-sm text-slate-500">Loading quotation…</div>;
}

const SUBJECT_BY_SCOPE: Record<string, string> = {
  supply: "Supply of Prefab Buildings structures",
  supply_erection: "Supply and installation of Prefab Buildings structures",
};

/** Fills client, project and revision from an enquiry; the first save links the quotation to it. */
async function prefillFromEnquiry(q: Quotation, enquiryId: string) {
  const e = await crmRepo.getEnquiry(enquiryId);
  const client = await crmRepo.getClient(e.clientId);
  const contact = client.contacts.find((c) => c.id === e.contactId);
  q.client = {
    company: client.name,
    city: client.city,
    attentionName: contact?.name ?? "",
    attentionDesignation: contact ? labelOf(CONTACT_ROLES, contact.role) : "",
    clientId: client.id,
  };
  q.meta.projectName = e.projectName;
  q.meta.siteLocation = e.siteLocation;
  q.meta.subject = SUBJECT_BY_SCOPE[e.scope] ?? q.meta.subject;
  q.meta.revision = padRevision(e.nextRevision);
  // Revisions of the same enquiry keep the offer number of its earlier quotations.
  const earlier = await quotationRepo.list({ enquiryId, pageSize: 1, sort: "updated", dir: "desc" });
  if (earlier.items[0]?.offerNo) q.meta.offerNo = earlier.items[0].offerNo;
  return e;
}

/**
 * /quotations/new?from=<preset>[&enquiry=<id>]: starts an unsaved quotation; the first save creates
 * the record (and links it to the enquiry when started from one).
 */
export function NewQuotationScreen() {
  const params = useSearchParams();
  const from = params.get("from") ?? "blank-boq";
  const enquiryId = params.get("enquiry");
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const preset = PRESETS.find((p) => p.key === from) ?? PRESETS[0];
    void (async () => {
      try {
        const q = preset.create();
        // Presets based on earlier quotations are templates: give the copy its own offer number.
        q.meta.offerNo = await quotationRepo.suggestNextOfferNo();
        q.meta.revision = "00";
        q.meta.date = todayIso();
        if (enquiryId) {
          const e = await prefillFromEnquiry(q, enquiryId);
          if (isClosed(e.status)) throw new Error(`${e.number} is closed and can't take new quotations.`);
        }
        useQuotationStore.getState().start(q, { pendingEnquiryId: enquiryId });
        setReady(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, [from, enquiryId]);

  if (error) return <FullPageMessage title="Could not start the quotation"><p className="text-sm text-slate-600">{error}</p></FullPageMessage>;
  return ready ? <Wizard /> : <Loading />;
}

/** /quotations/[id]: loads the stored record into the wizard. */
export function EditQuotationScreen() {
  const { id } = useParams<{ id: string }>();
  const currentId = useQuotationStore((s) => s.recordId);
  const quotation = useQuotationStore((s) => s.quotation);
  const { data, error, isPending, refetch } = useQuotationRecord(id);

  useEffect(() => {
    if (data && useQuotationStore.getState().recordId !== data.id) {
      useQuotationStore.getState().start(data.data, { recordId: data.id, status: data.status, savedAt: data.updatedAt });
    }
  }, [data]);

  if (error) {
    return error.name === "NotFoundError" ? (
      <FullPageMessage title="Quotation not found">
        <p className="max-w-md text-sm text-slate-600">
          It may have been deleted, or it was saved in a different browser.
        </p>
      </FullPageMessage>
    ) : (
      <FullPageMessage title="Could not load the quotation">
        <p className="max-w-md text-sm text-slate-600">{error.message}</p>
        <button className="text-sm font-medium text-red-700 underline" onClick={() => void refetch()}>
          Try again
        </button>
      </FullPageMessage>
    );
  }
  if (isPending || !quotation || currentId !== id) return <Loading />;
  return <Wizard />;
}
