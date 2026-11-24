"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Quotation } from "@/lib/types";
import { crmRepo } from "@/lib/crm";
import { employeeRepo } from "@/lib/employees";
import { fileStore } from "@/lib/files";
import { notificationStore } from "@/lib/notifications";
import { attendanceRepo } from "@/lib/attendance";
import { expenseRepo } from "@/lib/expenses";
import { payrollRepo } from "@/lib/payroll";
import { projectRepo } from "@/lib/projects";
import { settingsRepo } from "@/lib/settings";
import { quotationRepo } from "./index";
import type { ListParams, QuotationRecord, QuotationStatus, UpdatePatch } from "./types";

export const quotationKeys = {
  all: ["quotations"] as const,
  list: (params: ListParams) => ["quotations", "list", params] as const,
  detail: (id: string) => ["quotations", "detail", id] as const,
  nextOffer: ["quotations", "next-offer-no"] as const,
};

export function useQuotationList(params: ListParams) {
  return useQuery({
    queryKey: quotationKeys.list(params),
    queryFn: () => quotationRepo.list(params),
    placeholderData: keepPreviousData,
  });
}

export function useQuotationRecord(id: string | null) {
  return useQuery({
    queryKey: quotationKeys.detail(id ?? ""),
    queryFn: () => quotationRepo.get(id!),
    enabled: !!id,
    retry: (count, err) => err.name !== "NotFoundError" && count < 2,
    // The wizard owns the working copy; don't overwrite it while editing.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
}

export function useNextOfferNo(enabled = true) {
  return useQuery({ queryKey: quotationKeys.nextOffer, queryFn: () => quotationRepo.suggestNextOfferNo(), enabled });
}

function useInvalidateAll() {
  const qc = useQueryClient();
  return (record?: QuotationRecord) => {
    if (record) qc.setQueryData(quotationKeys.detail(record.id), record);
    void qc.invalidateQueries({ queryKey: ["crm"] });
    return qc.invalidateQueries({ queryKey: quotationKeys.all, refetchType: "active", predicate: (q) => q.queryKey[1] !== "detail" });
  };
}

export function useCreateQuotation() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({ data, status }: { data: Quotation; status?: QuotationStatus }) => quotationRepo.create(data, status),
    onSuccess: (r) => invalidate(r),
  });
}

export function useUpdateQuotation() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdatePatch }) => quotationRepo.update(id, patch),
    onSuccess: (r) => invalidate(r),
  });
}

export function useDeleteQuotation() {
  const qc = useQueryClient();
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (id: string) => quotationRepo.remove(id),
    onSuccess: (_, id) => {
      qc.removeQueries({ queryKey: quotationKeys.detail(id) });
      return invalidate();
    },
  });
}

export function useDuplicateQuotation() {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: (id: string) => quotationRepo.duplicate(id), onSuccess: (r) => invalidate(r) });
}

/** New revision of a quotation; if the source belongs to an enquiry, the copy is linked as its next R. */
export function useNewRevision() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: async (id: string) => {
      const created = await quotationRepo.newRevision(id);
      const source = await quotationRepo.get(id);
      if (!source.enquiryId) return { record: created, linkError: null as string | null };
      try {
        await crmRepo.linkQuotation(created.id, source.enquiryId);
        return { record: await quotationRepo.get(created.id), linkError: null };
      } catch (e) {
        return { record: created, linkError: e instanceof Error ? e.message : String(e) };
      }
    },
    onSuccess: (r) => invalidate(r.record),
  });
}

export function useResetDemoData() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await quotationRepo.resetDemoData?.();
      await crmRepo.resetDemoData?.();
      await employeeRepo.resetDemoData?.();
      await settingsRepo.resetDemoData?.();
      notificationStore.reset();
      await fileStore.clear?.();
      await projectRepo.resetDemoData?.();
      await attendanceRepo.resetDemoData?.();
      await expenseRepo.resetDemoData?.();
      await payrollRepo.resetDemoData?.();
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["crm"] });
      void qc.invalidateQueries({ queryKey: ["employees"] });
      void qc.invalidateQueries({ queryKey: ["users"] });
      void qc.invalidateQueries({ queryKey: ["projects"] });
      void qc.invalidateQueries({ queryKey: ["attendance"] });
      void qc.invalidateQueries({ queryKey: ["expenses"] });
      void qc.invalidateQueries({ queryKey: ["payroll"] });
      void qc.invalidateQueries({ queryKey: ["settings"] });
      void qc.invalidateQueries({ queryKey: ["notifications"] });
      return qc.invalidateQueries({ queryKey: quotationKeys.all });
    },
  });
}
