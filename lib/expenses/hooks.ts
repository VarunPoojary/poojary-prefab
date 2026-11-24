"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { EXPENSE_CATEGORIES, categoryLabel, isCategory } from "./config";
import { expenseRepo } from "./index";
import type { ExpenseFilters } from "./types";

export const expenseKeys = {
  all: ["expenses"] as const,
  access: (projectId: string) => ["expenses", "access", projectId] as const,
  pageAccess: ["expenses", "page-access"] as const,
  list: (f: ExpenseFilters) => ["expenses", "list", f] as const,
  one: (id: string) => ["expenses", "one", id] as const,
  budget: (projectId: string) => ["expenses", "budget", projectId] as const,
  spend: ["expenses", "spend"] as const,
  casual: (projectId: string, date: string) => ["expenses", "casual", projectId, date] as const,
  uncovered: (projectId: string) => ["expenses", "uncovered", projectId] as const,
};

export const useProjectExpenseAccess = (projectId: string) => useQuery({ queryKey: expenseKeys.access(projectId), queryFn: () => expenseRepo.projectAccess(projectId) });
export const useExpensePageAccess = () => useQuery({ queryKey: expenseKeys.pageAccess, queryFn: () => expenseRepo.pageAccess() });
export const useExpenses = (f: ExpenseFilters, enabled = true) =>
  useQuery({ queryKey: expenseKeys.list(f), queryFn: () => expenseRepo.list(f), placeholderData: keepPreviousData, enabled });
export const useExpense = (id: string | null) => useQuery({ queryKey: expenseKeys.one(id ?? ""), queryFn: () => expenseRepo.get(id!), enabled: !!id });
export const useExpenseBudget = (projectId: string, enabled = true) => useQuery({ queryKey: expenseKeys.budget(projectId), queryFn: () => expenseRepo.budget(projectId), enabled });
export const useSpendByProject = (enabled = true) => useQuery({ queryKey: expenseKeys.spend, queryFn: () => expenseRepo.spendByProject(), enabled });
export const useCasualFill = (projectId: string, date: string, enabled = true) =>
  useQuery({ queryKey: expenseKeys.casual(projectId, date), queryFn: () => expenseRepo.casualFill(projectId, date), enabled: enabled && !!date });
export const useExpenseProjects = (enabled = true) => useQuery({ queryKey: ["expenses", "projects"], queryFn: () => expenseRepo.projectNames(), enabled });
export const useUncoveredCasualDays = (projectId: string, enabled = true) =>
  useQuery({ queryKey: expenseKeys.uncovered(projectId), queryFn: () => expenseRepo.uncoveredCasualDays(projectId), enabled });

/** The expense categories are the budget work stages. */
export function useExpenseCategories() {
  return { items: EXPENSE_CATEGORIES, label: categoryLabel, groupOf: (v: string) => (isCategory(v) ? v : "site") };
}

/** Expense changes also show in project timelines and notifications. */
export function useExpenseMutation<A, R>(fn: (args: A) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: expenseKeys.all });
      void qc.invalidateQueries({ queryKey: ["projects"] });
      void qc.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}
