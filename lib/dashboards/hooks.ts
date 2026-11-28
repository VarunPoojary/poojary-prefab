"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { attendanceRepo } from "@/lib/attendance";
import { useAuth } from "@/lib/auth/AuthProvider";
import { projectRepo } from "@/lib/projects";
import { addDays, todayIso } from "@/lib/projects/rules";
import { buildFactoryBoard } from "./factory";
import { buildSiteBoard } from "./site";

/* Under ["projects", …] so every project and attendance change (they invalidate "projects") refreshes the boards. */
export const boardKeys = {
  factory: ["projects", "board", "factory"] as const,
  site: ["projects", "board", "site"] as const,
  design: ["projects", "board", "design"] as const,
};

const clockNow = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

export function useFactoryBoard() {
  return useQuery({
    queryKey: boardKeys.factory,
    queryFn: async () => {
      const today = todayIso();
      const [data, att] = await Promise.all([projectRepo.dashboardData("factory-dashboard"), attendanceRepo.dashboardAttendance(today, today)]);
      const factoryWorkersToday = att.records.filter((r) => r.date === today && r.location === "factory" && (r.status === "present" || r.status === "half")).length;
      return buildFactoryBoard({ ...data, factoryWorkersToday, today });
    },
    refetchInterval: 60_000,
  });
}

export function useSiteBoard() {
  const { user } = useAuth();
  return useQuery({
    queryKey: [...boardKeys.site, user?.id ?? ""],
    queryFn: async () => {
      const today = todayIso();
      const [data, attendance] = await Promise.all([projectRepo.dashboardData("site-dashboard"), attendanceRepo.dashboardAttendance(addDays(today, -7), today)]);
      return buildSiteBoard({ ...data, attendance, today, clock: clockNow(), me: user?.id ?? "" });
    },
    refetchInterval: 60_000,
  });
}

/** Raw cross-project data for the Design screen; the screen builds its rows with the document types it has. */
export function useDesignData() {
  return useQuery({ queryKey: boardKeys.design, queryFn: () => projectRepo.dashboardData("design"), refetchInterval: 60_000 });
}

export function useSetFactoryPin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, reason }: { projectId: string; reason: string | null }) => projectRepo.setFactoryPin(projectId, reason),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["projects"] }),
  });
}
