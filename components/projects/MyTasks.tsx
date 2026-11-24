"use client";

import Link from "next/link";
import { useState } from "react";
import { EmptyState, LoadingRows, PageContainer, PageHeader } from "@/components/crm/ui";
import { Button } from "@/components/ui/fields";
import { formatDate } from "@/lib/format";
import { stageMeta } from "@/lib/projects/config";
import { useMyTasks } from "@/lib/projects/hooks";
import { taskPct, todayIso } from "@/lib/projects/rules";
import type { MyTask } from "@/lib/projects/types";
import { BehindFlag, ProgressBar, pctText } from "./bits";
import { UpdateDialog } from "./Progress";

/** Open tasks assigned to me across my projects, with a quick update (for site engineers on phones). */
export function MyTasks() {
  const { data, isPending } = useMyTasks();
  const [updating, setUpdating] = useState<MyTask | null>(null);
  const [[today, soonLimit]] = useState(() => [todayIso(), todayIso(Date.now() + 3 * 86_400_000)]);
  const groups = new Map<string, MyTask[]>();
  for (const t of data ?? []) groups.set(t.projectId, [...(groups.get(t.projectId) ?? []), t]);

  return (
    <PageContainer>
      <PageHeader title="My tasks" subtitle="Open tasks assigned to you on active projects. Behind-schedule tasks come first." />
      {isPending ? (
        <LoadingRows />
      ) : !data?.length ? (
        <div className="rounded-xl border border-slate-200 bg-white">
          <EmptyState title="No open tasks assigned to you." />
        </div>
      ) : (
        <div className="space-y-4">
          {[...groups.entries()].map(([projectId, tasks]) => (
            <section key={projectId} className="rounded-xl border border-slate-200 bg-white shadow-sm">
              <Link href={`/projects/${projectId}/progress`} className="block border-b border-slate-100 px-4 py-3 hover:bg-slate-50">
                <span className="text-xs font-semibold text-slate-500">{tasks[0].projectCode}</span>
                <span className="block font-semibold text-slate-900">{tasks[0].projectName}</span>
              </Link>
              <ul className="divide-y divide-slate-100">
                {tasks.map((t) => {
                  const pct = taskPct(t.task);
                  const soon = !!t.task.plannedEnd && !t.behind && t.task.plannedEnd <= soonLimit;
                  return (
                    <li key={t.task.id} className="px-4 py-3" data-testid="my-task">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <Link href={`/projects/${t.projectId}/progress?stage=${t.stageKey}&task=${t.task.id}`} className="min-w-0 flex-1">
                          <span className="block font-medium text-slate-900">{t.task.name}</span>
                          <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                            {stageMeta(t.stageKey).label}
                            <BehindFlag behind={t.behind} />
                            {soon ? <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-800">Due soon</span> : null}
                            {t.task.plannedEnd ? <span>· due {formatDate(t.task.plannedEnd)}</span> : null}
                            {t.task.measure === "quantity" ? (
                              <span>
                                · {t.task.completed} / {t.task.total ?? "?"} {t.task.unit}
                              </span>
                            ) : null}
                          </span>
                        </Link>
                        <Button variant="primary" onClick={() => setUpdating(t)}>
                          + Update
                        </Button>
                      </div>
                      {pct !== null ? (
                        <div className="mt-2 flex items-center gap-2">
                          <ProgressBar pct={pct} tone={t.behind ? "red" : undefined} />
                          <span className="w-10 text-right text-xs font-semibold">{pctText(pct)}</span>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
      {updating ? <UpdateDialog projectId={updating.projectId} task={updating.task} onClose={() => setUpdating(null)} /> : null}
      <p className="mt-4 text-xs text-slate-400">Today: {formatDate(today)}</p>
    </PageContainer>
  );
}
