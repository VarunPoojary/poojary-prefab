"use client";

import { useCallback, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/components/Providers";
import { crmRepo } from "@/lib/crm";
import { statusMeta } from "@/lib/crm/config";
import { invalidateCrmAndQuotes } from "@/lib/crm/hooks";
import { quotationRepo } from "@/lib/data";
import { quotationKeys } from "@/lib/data/hooks";
import { registerPendingSaver, selectDirty, useQuotationStore } from "@/lib/store";

const AUTOSAVE_DELAY_MS = 1500;

/**
 * Saves the wizard's working copy through the repository: creates the record on the first save,
 * updates it afterwards. Only one save runs at a time; edits made during a save trigger another one.
 */
export function useQuotationSaver() {
  const qc = useQueryClient();
  const toast = useToast();
  const inFlight = useRef<Promise<boolean> | null>(null);

  const saveNow = useCallback(async (): Promise<boolean> => {
    if (inFlight.current) {
      await inFlight.current;
      if (!selectDirty(useQuotationStore.getState())) return true;
    }
    const run = (async () => {
      const s = useQuotationStore.getState();
      if (!s.quotation) return false;
      const version = s.version;
      const previousStatus = s.savedStatus;
      s.savingStarted();
      try {
        let record = s.recordId
          ? await quotationRepo.update(s.recordId, { data: s.quotation, status: s.status })
          : await quotationRepo.create(s.quotation, s.status);
        // Keep the address bar in sync without remounting the wizard.
        if (!s.recordId) window.history.replaceState(null, "", `/quotations/${record.id}`);
        useQuotationStore.getState().savingSucceeded(record.id, version, record.updatedAt, record.status);

        let enquiryNote: string | null = null;
        if (s.pendingEnquiryId && !record.enquiryId) {
          useQuotationStore.getState().clearPendingEnquiry();
          try {
            const r = await crmRepo.linkQuotation(record.id, s.pendingEnquiryId);
            record = await quotationRepo.get(record.id);
            enquiryNote = `Linked to ${r.enquiry.number} as R${r.revision}${
              r.statusChanged ? ` · status → ${statusMeta(r.statusChanged).label}` : ""
            }`;
          } catch (err) {
            toast(`Not linked to the enquiry: ${err instanceof Error ? err.message : String(err)}`, "error");
          }
        } else if (record.enquiryId) {
          const r = await crmRepo.onQuotationSaved(record.id, previousStatus);
          if (r?.statusChanged) enquiryNote = `${r.enquiry.number} → ${statusMeta(r.statusChanged).label}`;
        }
        if (enquiryNote) toast(enquiryNote);

        qc.setQueryData(quotationKeys.detail(record.id), record);
        invalidateCrmAndQuotes(qc);
        return true;
      } catch (e) {
        useQuotationStore.getState().savingFailed(e instanceof Error ? e.message : String(e));
        return false;
      }
    })();
    inFlight.current = run;
    try {
      return await run;
    } finally {
      if (inFlight.current === run) inFlight.current = null;
    }
  }, [qc, toast]);

  return saveNow;
}

/** Debounced autosave whenever the working copy changes. */
export function useAutosave(saveNow: () => Promise<boolean>) {
  const version = useQuotationStore((s) => s.version);
  const dirty = useQuotationStore(selectDirty);
  const failed = useQuotationStore((s) => s.saveState === "error");

  useEffect(() => {
    registerPendingSaver(saveNow);
    return () => registerPendingSaver(null);
  }, [saveNow]);

  useEffect(() => {
    if (!dirty || failed) return;
    const t = setTimeout(() => void saveNow(), AUTOSAVE_DELAY_MS);
    return () => clearTimeout(t);
  }, [version, dirty, failed, saveNow]);

  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
}
