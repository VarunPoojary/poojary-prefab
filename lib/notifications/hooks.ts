"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { attendanceRepo } from "@/lib/attendance";
import { payrollRepo } from "@/lib/payroll";
import { projectRepo } from "@/lib/projects";
import { notificationRepo } from "./index";

export const notificationKeys = { list: (userId: string) => ["notifications", userId] as const };

export function useAppNotifications(userId: string | null | undefined) {
  return useQuery({
    queryKey: notificationKeys.list(userId ?? ""),
    queryFn: async () => {
      // Creates projects for newly Finalised enquiries and overdue-payment alerts (a server job in the cloud version).
      await projectRepo.reconcile().catch(() => undefined);
      // Site attendance reminders (6 PM, and 10 AM next morning to admins too).
      await attendanceRepo.reconcileReminders().catch(() => undefined);
      // Unpaid salaries for last month, from the 3rd (Admins and the Accountant).
      await payrollRepo.reconcileReminders().catch(() => undefined);
      return notificationRepo.list(userId!);
    },
    enabled: !!userId,
    refetchInterval: 60_000,
  });
}

export function useMarkRead(userId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[] | "all") => notificationRepo.markRead(userId!, ids),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
}
