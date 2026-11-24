"use client";

import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { projectRepo } from "./index";
import type { EventListParams, ProjectListParams } from "./types";

export const projectKeys = {
  all: ["projects"] as const,
  list: (p: ProjectListParams) => ["projects", "list", p] as const,
  detail: (id: string) => ["projects", "detail", id] as const,
  updates: (id: string, taskId?: string) => ["projects", "updates", id, taskId ?? ""] as const,
  delays: (id: string) => ["projects", "delays", id] as const,
  events: (id: string, p: EventListParams) => ["projects", "events", id, p] as const,
  available: ["projects", "available"] as const,
  mine: ["projects", "my-tasks"] as const,
};

export function useProjects(p: ProjectListParams, enabled = true) {
  return useQuery({
    queryKey: projectKeys.list(p),
    // Catch up on any Finalised enquiry without a project before listing.
    queryFn: async () => {
      await projectRepo.reconcile();
      return projectRepo.list(p);
    },
    placeholderData: keepPreviousData,
    enabled,
  });
}

export const useProject = (id: string | null | undefined) =>
  useQuery({
    queryKey: projectKeys.detail(id ?? ""),
    queryFn: () => projectRepo.get(id!),
    enabled: !!id,
    retry: (n, e) => e.name !== "NotFoundError" && e.name !== "ForbiddenError" && n < 2,
  });

export const useUpdates = (id: string, taskId?: string, enabled = true) =>
  useQuery({ queryKey: projectKeys.updates(id, taskId), queryFn: () => projectRepo.listUpdates(id, taskId), enabled });

export const useDelays = (id: string) => useQuery({ queryKey: projectKeys.delays(id), queryFn: () => projectRepo.listDelays(id) });

export const useAvailableEnquiries = (enabled = true) =>
  useQuery({ queryKey: projectKeys.available, queryFn: () => projectRepo.availableEnquiries(), enabled });

export const useMyTasks = () => useQuery({ queryKey: projectKeys.mine, queryFn: () => projectRepo.myTasks() });

/** Timeline, newest first, loading older entries page by page. */
export function useEvents(id: string, params: EventListParams) {
  return useInfiniteQuery({
    queryKey: projectKeys.events(id, params),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => projectRepo.events(id, { ...params, before: pageParam, limit: 25 }),
    getNextPageParam: (last) => (last.hasMore ? last.items[last.items.length - 1]?.at : undefined),
  });
}

/** Every project change can affect lists, timeline, my tasks and notifications. */
export function useProjectMutation<A, R>(fn: (args: A) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: projectKeys.all });
      void qc.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}
