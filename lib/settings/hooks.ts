"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ListKey } from "@/lib/projects/config";
import type { ListItem, StageKey, TemplateTask } from "@/lib/projects/types";
import { roleDefs, type RoleDef } from "@/lib/auth/roles";
import { settingsRepo } from "./index";
import type { AttendanceSettings, PayrollSettings } from "./types";

export const settingsKey = ["settings"] as const;

export const useSettings = () => useQuery({ queryKey: settingsKey, queryFn: () => settingsRepo.get(), staleTime: 60_000 });

/** Active (not archived) items of a list, plus a label lookup that also knows archived values. */
export function useList(key: ListKey) {
  const { data } = useSettings();
  const all = data?.lists[key] ?? [];
  return {
    items: all.filter((i) => !i.archived),
    label: (v: string) => all.find((i) => i.value === v)?.label ?? v,
  };
}

export function useSaveTemplates() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ stage, tasks }: { stage: StageKey; tasks: TemplateTask[] }) => settingsRepo.saveTemplates(stage, tasks),
    onSuccess: (s) => qc.setQueryData(settingsKey, s),
  });
}

export function useSaveAttendanceSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (a: AttendanceSettings) => settingsRepo.saveAttendance(a),
    onSuccess: (s) => {
      qc.setQueryData(settingsKey, s);
      void qc.invalidateQueries({ queryKey: ["attendance"] });
    },
  });
}

export function useSavePayrollSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: PayrollSettings) => settingsRepo.savePayroll(p),
    onSuccess: (s) => {
      qc.setQueryData(settingsKey, s);
      void qc.invalidateQueries({ queryKey: ["payroll"] });
    },
  });
}

/** The roles from Settings, plus a name lookup (re-renders when roles are saved). */
export function useRoles() {
  const { data } = useSettings();
  const roles = data?.roles ?? roleDefs();
  return { roles, name: (id: string | null | undefined) => (id ? (roles.find((r) => r.id === id)?.name ?? id) : "") };
}

export function useSaveRoles() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (roles: RoleDef[]) => settingsRepo.saveRoles(roles),
    onSuccess: (s) => {
      qc.setQueryData(settingsKey, s);
      // Page access changed: let every module re-check what the user may see.
      void qc.invalidateQueries();
    },
  });
}

export function useSaveList() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ key, items }: { key: ListKey; items: ListItem[] }) => settingsRepo.saveList(key, items),
    onSuccess: (s) => qc.setQueryData(settingsKey, s),
  });
}
