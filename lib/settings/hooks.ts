"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ListKey } from "@/lib/projects/config";
import type { ListItem, StageKey, TemplateTask } from "@/lib/projects/types";
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

export function useSaveList() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ key, items }: { key: ListKey; items: ListItem[] }) => settingsRepo.saveList(key, items),
    onSuccess: (s) => qc.setQueryData(settingsKey, s),
  });
}
