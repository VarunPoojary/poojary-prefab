"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { attendanceRepo } from "./index";
import type { SheetFilters } from "./types";

export const attendanceKeys = {
  all: ["attendance"] as const,
  access: ["attendance", "access"] as const,
  projectAccess: (id: string) => ["attendance", "project-access", id] as const,
  projectDays: (id: string, from: string, to: string) => ["attendance", "project-days", id, from, to] as const,
  projectDay: (id: string, date: string) => ["attendance", "project-day", id, date] as const,
  employeeMonth: (id: string, month: string) => ["attendance", "employee-month", id, month] as const,
  sheet: (date: string, f: SheetFilters) => ["attendance", "sheet", date, f] as const,
  casualDay: (date: string) => ["attendance", "casual-day", date] as const,
  notLogged: (date: string) => ["attendance", "not-logged", date] as const,
  register: (month: string) => ["attendance", "register", month] as const,
  casual: (search: string, inactive: boolean) => ["attendance", "casual", search, inactive] as const,
  labour: (id: string) => ["attendance", "labour", id] as const,
  manDays: (id: string) => ["attendance", "man-days", id] as const,
};

export const useAttendanceAccess = (enabled = true) =>
  useQuery({ queryKey: attendanceKeys.access, queryFn: () => attendanceRepo.access(), staleTime: 30_000, enabled });
export const useProjectAttendanceAccess = (id: string) =>
  useQuery({ queryKey: attendanceKeys.projectAccess(id), queryFn: () => attendanceRepo.projectAccess(id) });
export const useProjectDays = (id: string, from: string, to: string) =>
  useQuery({ queryKey: attendanceKeys.projectDays(id, from, to), queryFn: () => attendanceRepo.projectDays(id, from, to), placeholderData: keepPreviousData });
export const useProjectDay = (id: string, date: string | null) =>
  useQuery({ queryKey: attendanceKeys.projectDay(id, date ?? ""), queryFn: () => attendanceRepo.projectDay(id, date!), enabled: !!date });
export const useEmployeeMonth = (id: string, month: string) =>
  useQuery({ queryKey: attendanceKeys.employeeMonth(id, month), queryFn: () => attendanceRepo.employeeMonth(id, month), placeholderData: keepPreviousData });
export const useDaySheet = (date: string, f: SheetFilters) =>
  useQuery({ queryKey: attendanceKeys.sheet(date, f), queryFn: () => attendanceRepo.daySheet(date, f), placeholderData: keepPreviousData });
export const useCasualDay = (date: string, enabled = true) =>
  useQuery({ queryKey: attendanceKeys.casualDay(date), queryFn: () => attendanceRepo.casualDay(date), enabled });
export const useSitesNotLogged = (date: string, enabled = true) =>
  useQuery({ queryKey: attendanceKeys.notLogged(date), queryFn: () => attendanceRepo.sitesNotLogged(date), enabled });
export const useRegister = (month: string, enabled = true) =>
  useQuery({ queryKey: attendanceKeys.register(month), queryFn: () => attendanceRepo.register(month), enabled, placeholderData: keepPreviousData });
export const useCasualWorkers = (search: string, includeInactive = false, enabled = true) =>
  useQuery({ queryKey: attendanceKeys.casual(search, includeInactive), queryFn: () => attendanceRepo.listCasual({ search, includeInactive }), enabled, placeholderData: keepPreviousData });
export const useLabourCost = (id: string, enabled = true) => useQuery({ queryKey: attendanceKeys.labour(id), queryFn: () => attendanceRepo.labourCost(id), enabled });
export const useManDays = (id: string) => useQuery({ queryKey: attendanceKeys.manDays(id), queryFn: () => attendanceRepo.manDaysByDate(id) });

/** Attendance changes also show in project timelines and notifications. */
export function useAttendanceMutation<A, R>(fn: (args: A) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: attendanceKeys.all });
      void qc.invalidateQueries({ queryKey: ["projects"] });
      void qc.invalidateQueries({ queryKey: ["notifications"] });
      // Salaries and casual labour checks follow attendance.
      void qc.invalidateQueries({ queryKey: ["payroll"] });
      void qc.invalidateQueries({ queryKey: ["expenses"] });
    },
  });
}
