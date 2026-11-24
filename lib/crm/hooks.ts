"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { employeeRepo } from "@/lib/employees";
import { quotationRepo } from "@/lib/data";
import { projectRepo } from "@/lib/projects";
import { crmRepo } from "./index";
import type { Attachment, ClientInput, ClientListParams, EnquiryInput, EnquiryListParams, StatusChange } from "./types";

export const crmKeys = {
  all: ["crm"] as const,
  clients: (p: ClientListParams) => ["crm", "clients", p] as const,
  clientSearch: (q: string) => ["crm", "client-search", q] as const,
  client: (id: string) => ["crm", "client", id] as const,
  enquiries: (p: EnquiryListParams) => ["crm", "enquiries", p] as const,
  counts: (p: EnquiryListParams) => ["crm", "counts", p] as const,
  enquiry: (id: string) => ["crm", "enquiry", id] as const,
  notifications: (userId: string) => ["crm", "notifications", userId] as const,
  users: ["users"] as const,
};

/** CRM changes affect quotation lists (link columns) and vice versa, so refresh both. */
export function invalidateCrmAndQuotes(qc: QueryClient, quotationId?: string) {
  void qc.invalidateQueries({ queryKey: crmKeys.all });
  void qc.invalidateQueries({ queryKey: ["quotations"], predicate: (q) => q.queryKey[1] !== "detail" });
  if (quotationId) void qc.invalidateQueries({ queryKey: ["quotations", "detail", quotationId] });
  void qc.invalidateQueries({ queryKey: ["projects"] });
  void qc.invalidateQueries({ queryKey: ["notifications"] });
}

/** Finalising or reopening an enquiry creates its project / sets its warning (the server does this in one transaction). */
async function withProjects<R>(run: Promise<R>): Promise<R> {
  const r = await run;
  await projectRepo.reconcile().catch(() => undefined);
  return r;
}

function useCrmMutation<A, R>(fn: (args: A) => Promise<R>, quotationIdOf?: (args: A) => string | undefined) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: (_r, args) => invalidateCrmAndQuotes(qc, quotationIdOf?.(args)) });
}

/* ---------- users ---------- */

/** Everyone (incl. inactive) for names; filter `assignable` for "Assigned to" pickers. */
export function useUsers() {
  return useQuery({ queryKey: crmKeys.users, queryFn: () => employeeRepo.directory(), staleTime: 30_000 });
}

/* ---------- clients ---------- */

export function useClients(params: ClientListParams) {
  return useQuery({ queryKey: crmKeys.clients(params), queryFn: () => crmRepo.listClients(params), placeholderData: keepPreviousData });
}

export function useClientSearch(query: string, enabled = true) {
  return useQuery({
    queryKey: crmKeys.clientSearch(query),
    queryFn: () => crmRepo.searchClients(query),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useClient(id: string | null | undefined) {
  return useQuery({
    queryKey: crmKeys.client(id ?? ""),
    queryFn: () => crmRepo.getClient(id!),
    enabled: !!id,
    retry: (n, e) => e.name !== "NotFoundError" && n < 2,
  });
}

export const useCreateClient = () => useCrmMutation((input: ClientInput) => crmRepo.createClient(input));
export const useUpdateClient = () =>
  useCrmMutation(({ id, input }: { id: string; input: ClientInput }) => crmRepo.updateClient(id, input));
export const useSetClientActive = () =>
  useCrmMutation(({ id, active }: { id: string; active: boolean }) => crmRepo.setClientActive(id, active));
export const useDeleteClient = () => useCrmMutation((id: string) => crmRepo.deleteClient(id));

/* ---------- enquiries ---------- */

export function useEnquiries(params: EnquiryListParams) {
  return useQuery({ queryKey: crmKeys.enquiries(params), queryFn: () => crmRepo.listEnquiries(params), placeholderData: keepPreviousData });
}

export function useStatusCounts(params: EnquiryListParams) {
  return useQuery({ queryKey: crmKeys.counts(params), queryFn: () => crmRepo.statusCounts(params), placeholderData: keepPreviousData });
}

export function useEnquiry(id: string | null | undefined) {
  return useQuery({
    queryKey: crmKeys.enquiry(id ?? ""),
    queryFn: () => crmRepo.getEnquiry(id!),
    enabled: !!id,
    retry: (n, e) => e.name !== "NotFoundError" && n < 2,
  });
}

/** Quotations linked to an enquiry (or made for a client), newest revision first. */
export function useLinkedQuotations(filter: { enquiryId?: string; clientId?: string }, enabled = true) {
  return useQuery({
    queryKey: ["quotations", "list", { ...filter, pageSize: 200, sort: "updated" }],
    queryFn: () => quotationRepo.list({ ...filter, pageSize: 200, sort: "updated", dir: "desc" }),
    enabled,
  });
}

export const useCreateEnquiry = () => useCrmMutation((input: EnquiryInput) => crmRepo.createEnquiry(input));
export const useUpdateEnquiry = () =>
  useCrmMutation(({ id, input }: { id: string; input: EnquiryInput }) => crmRepo.updateEnquiry(id, input));
export const useAddNote = () => useCrmMutation(({ id, text }: { id: string; text: string }) => crmRepo.addNote(id, text));
export const useAddAttachment = () =>
  useCrmMutation(({ id, file }: { id: string; file: Pick<Attachment, "name" | "type" | "size" | "url" | "fileId"> }) =>
    crmRepo.addAttachment(id, file),
  );
export const useRemoveAttachment = () =>
  useCrmMutation(({ id, attachmentId }: { id: string; attachmentId: string }) => crmRepo.removeAttachment(id, attachmentId));
export const useChangeStatus = () =>
  useCrmMutation(({ id, change }: { id: string; change: StatusChange }) => withProjects(crmRepo.changeStatus(id, change)));
export const useReopen = () => useCrmMutation(({ id, comment }: { id: string; comment: string }) => withProjects(crmRepo.reopen(id, comment)));
export const useLinkQuotation = () =>
  useCrmMutation(
    ({ quotationId, enquiryId }: { quotationId: string; enquiryId: string }) => crmRepo.linkQuotation(quotationId, enquiryId),
    (a) => a.quotationId,
  );
export const useUnlinkQuotation = () =>
  useCrmMutation(
    (quotationId: string) => crmRepo.unlinkQuotation(quotationId),
    (id) => id,
  );

/* ---------- reminders ---------- */

export function useNotifications(userId: string | null | undefined) {
  return useQuery({
    queryKey: crmKeys.notifications(userId ?? ""),
    queryFn: () => crmRepo.notifications(userId!),
    enabled: !!userId,
    refetchInterval: 60_000,
  });
}
