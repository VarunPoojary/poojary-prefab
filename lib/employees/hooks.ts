"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Role } from "@/lib/auth/types";
import { useAuth } from "@/lib/auth/AuthProvider";
import { employeeRepo } from "./index";
import type { NewDocument } from "./repository";
import type { EmployeeInput, EmployeeListParams, Leaving, NewSalary } from "./types";

export const employeeKeys = {
  all: ["employees"] as const,
  list: (p: EmployeeListParams) => ["employees", "list", p] as const,
  detail: (id: string) => ["employees", "detail", id] as const,
  login: (id: string) => ["employees", "login", id] as const,
  links: (id: string) => ["employees", "links", id] as const,
  lookups: ["employees", "lookups"] as const,
};

/** Employee changes affect names and "Assigned to" lists elsewhere, and the current user's session. */
function useInvalidate() {
  const qc = useQueryClient();
  const { refresh } = useAuth();
  return () => {
    void qc.invalidateQueries({ queryKey: employeeKeys.all });
    void qc.invalidateQueries({ queryKey: ["users"] });
    void qc.invalidateQueries({ queryKey: ["crm"] });
    void refresh();
  };
}

function useEmpMutation<A, R>(fn: (args: A) => Promise<R>) {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: fn, onSuccess: () => invalidate() });
}

export const useEmployees = (p: EmployeeListParams) =>
  useQuery({ queryKey: employeeKeys.list(p), queryFn: () => employeeRepo.list(p), placeholderData: (prev) => prev });

export const useEmployee = (id: string | null | undefined) =>
  useQuery({
    queryKey: employeeKeys.detail(id ?? ""),
    queryFn: () => employeeRepo.get(id!),
    enabled: !!id,
    retry: (n, e) => e.name !== "NotFoundError" && e.name !== "ForbiddenError" && n < 2,
  });

export const useEmployeeLogin = (id: string | null | undefined) =>
  useQuery({ queryKey: employeeKeys.login(id ?? ""), queryFn: () => employeeRepo.getLogin(id!), enabled: !!id });

export const useLinkedRecords = (id: string | null | undefined, enabled = true) =>
  useQuery({ queryKey: employeeKeys.links(id ?? ""), queryFn: () => employeeRepo.linkedRecords(id!), enabled: !!id && enabled });

export const useLookups = () => useQuery({ queryKey: employeeKeys.lookups, queryFn: () => employeeRepo.lookups() });

export const useCreateEmployee = () =>
  useEmpMutation(({ input, salary, documents }: { input: EmployeeInput; salary: NewSalary; documents: NewDocument[] }) =>
    employeeRepo.create(input, salary, documents),
  );
export const useUpdateEmployee = () =>
  useEmpMutation(({ id, input }: { id: string; input: EmployeeInput }) => employeeRepo.update(id, input));
export const useAddSalary = () => useEmpMutation(({ id, salary }: { id: string; salary: NewSalary }) => employeeRepo.addSalary(id, salary));
export const useAddDocument = () => useEmpMutation(({ id, doc }: { id: string; doc: NewDocument }) => employeeRepo.addDocument(id, doc));
export const useRemoveDocument = () =>
  useEmpMutation(({ id, documentId }: { id: string; documentId: string }) => employeeRepo.removeDocument(id, documentId));
export const useDeactivate = () => useEmpMutation(({ id, leaving }: { id: string; leaving: Leaving }) => employeeRepo.deactivate(id, leaving));
export const useReactivate = () => useEmpMutation((id: string) => employeeRepo.reactivate(id));
export const useDeleteEmployee = () =>
  useEmpMutation(({ id, confirmName }: { id: string; confirmName: string }) => employeeRepo.deletePermanently(id, confirmName));
export const useAddLookup = () =>
  useEmpMutation(({ kind, value }: { kind: "designations" | "departments"; value: string }) => employeeRepo.addLookup(kind, value));

export const useCreateLogin = () =>
  useEmpMutation(({ id, username, role, mustChangePassword }: { id: string; username: string; role: Role; mustChangePassword: boolean }) =>
    employeeRepo.createLogin(id, { username, role, mustChangePassword }),
  );
export const useResetPassword = () => useEmpMutation((id: string) => employeeRepo.resetPassword(id));
export const useSetRole = () => useEmpMutation(({ id, role }: { id: string; role: Role }) => employeeRepo.setRole(id, role));
export const useSetLoginEnabled = () =>
  useEmpMutation(({ id, enabled }: { id: string; enabled: boolean }) => employeeRepo.setLoginEnabled(id, enabled));
