"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { payrollRepo } from "./index";

export const payrollKeys = {
  all: ["payroll"] as const,
  access: ["payroll", "access"] as const,
  start: ["payroll", "start"] as const,
  employee: (id: string) => ["payroll", "employee", id] as const,
  month: (id: string, month: string) => ["payroll", "month", id, month] as const,
  year: (id: string, year: number) => ["payroll", "year", id, year] as const,
  payments: (id: string) => ["payroll", "payments", id] as const,
  company: (month: string) => ["payroll", "company", month] as const,
  settle: (month: string) => ["payroll", "settle", month] as const,
  log: ["payroll", "log"] as const,
  labour: (projectId: string) => ["payroll", "labour", projectId] as const,
};

export const usePayrollAccess = () => useQuery({ queryKey: payrollKeys.access, queryFn: () => payrollRepo.access() });
export const usePayrollStart = (enabled = true) => useQuery({ queryKey: payrollKeys.start, queryFn: () => payrollRepo.startMonth(), enabled });
export const usePayrollEmployee = (id: string, enabled = true) => useQuery({ queryKey: payrollKeys.employee(id), queryFn: () => payrollRepo.employee(id), enabled });
export const useEmployeePayMonth = (id: string, month: string, enabled = true) =>
  useQuery({ queryKey: payrollKeys.month(id, month), queryFn: () => payrollRepo.employeeMonth(id, month), placeholderData: keepPreviousData, enabled });
export const useEmployeePayYear = (id: string, year: number, enabled = true) =>
  useQuery({ queryKey: payrollKeys.year(id, year), queryFn: () => payrollRepo.employeeYear(id, year), placeholderData: keepPreviousData, enabled });
export const usePayrollPayments = (id: string, enabled = true) => useQuery({ queryKey: payrollKeys.payments(id), queryFn: () => payrollRepo.payments(id), enabled });
export const useCompanyPayMonth = (month: string, enabled = true) =>
  useQuery({ queryKey: payrollKeys.company(month), queryFn: () => payrollRepo.companyMonth(month), placeholderData: keepPreviousData, enabled });
export const useSettlePreview = (month: string, enabled = true) => useQuery({ queryKey: payrollKeys.settle(month), queryFn: () => payrollRepo.settlePreview(month), enabled, retry: false });
export const usePayrollLog = (enabled = true) => useQuery({ queryKey: payrollKeys.log, queryFn: () => payrollRepo.log(100), enabled });
export const useEmployeeLabourCost = (projectId: string, enabled = true) =>
  useQuery({ queryKey: payrollKeys.labour(projectId), queryFn: () => payrollRepo.projectLabourCost(projectId), enabled });

export function usePayrollMutation<A, R>(fn: (args: A) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: payrollKeys.all });
      void qc.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}
