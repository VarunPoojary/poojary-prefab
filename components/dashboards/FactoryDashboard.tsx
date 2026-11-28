"use client";

import { ChevronDown, ChevronUp, ExternalLink, Pin, PinOff } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { EmptyState, ErrorList, LoadingRows, PageContainer, PageHeader, useUserName } from "@/components/crm/ui";
import { ProjectStatusBadge } from "@/components/projects/bits";
import { useToast } from "@/components/Providers";
import { Button, Card, TextArea } from "@/components/ui/fields";
import { Icon } from "@/components/ui/icons";
import { Modal } from "@/components/ui/overlays";
import { PROCESS_LABELS } from "@/lib/dashboards/factory";
import { useFactoryBoard, useSetFactoryPin } from "@/lib/dashboards/hooks";
import type { FactoryHealth, FactoryProjectRow } from "@/lib/dashboards/types";
import { formatDate } from "@/lib/format";
import { useList } from "@/lib/settings/hooks";
import { DelayList, HBars, LookaheadList, PlanBar, PlanLegend, StatTile, WeekBars, sinceLabel } from "./parts";

const HEALTH: Record<FactoryHealth, { label: string; cls: string }> = {
  blocked: { label: "Blocked", cls: "bg-red-100 text-red-800" },
  behind: { label: "Behind", cls: "bg-red-100 text-red-800" },
  at_risk: { label: "At risk", cls: "bg-amber-100 text-amber-900" },
  on_track: { label: "On track", cls: "bg-emerald-100 text-emerald-800" },
  not_started: { label: "Not started", cls: "bg-slate-100 text-slate-700" },
};

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
const shortDate = (iso: string) => {
  const [, m, d] = iso.split("-").map(Number);
  return `${d}/${m}`;
};

function HealthChip({ health }: { health: FactoryHealth }) {
  return <span className={`inline-flex h-6 shrink-0 items-center rounded-md px-2 text-xs font-medium ${HEALTH[health].cls}`}>{HEALTH[health].label}</span>;
}

function Fact({ label, children, tone }: { label: string; children: React.ReactNode; tone?: "bad" | "warn" }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`text-sm tabular-nums ${tone === "bad" ? "text-red-700" : tone === "warn" ? "text-amber-700" : "text-slate-900"}`}>{children}</div>
    </div>
  );
}

function PinDialog({ row, onClose }: { row: FactoryProjectRow; onClose: () => void }) {
  const toast = useToast();
  const pin = useSetFactoryPin();
  const [reason, setReason] = useState("");
  const [issues, setIssues] = useState<string[]>([]);
  return (
    <Modal
      open
      onClose={onClose}
      title={`Put ${row.code} first`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={pin.isPending}
            onClick={() =>
              pin.mutate(
                { projectId: row.projectId, reason },
                {
                  onSuccess: () => {
                    toast(`${row.code} pinned to the top`);
                    onClose();
                  },
                  onError: (e) => setIssues([e.message]),
                },
              )
            }
          >
            Pin to top
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-slate-600">Pinned projects stay above the automatic order until someone unpins them. Everyone with this dashboard sees the reason.</p>
        <TextArea label="Reason" required rows={2} value={reason} onChange={setReason} placeholder="e.g. Client escalation, crane booked for 5 Dec" />
        <ErrorList issues={issues} />
      </div>
    </Modal>
  );
}

function ProjectCard({ row, rank, today }: { row: FactoryProjectRow; rank: number; today: string }) {
  const userName = useUserName();
  const reasons = useList("delayReasons");
  const toast = useToast();
  const unpin = useSetFactoryPin();
  const [open, setOpen] = useState(false);
  const [pinning, setPinning] = useState(false);
  const tone = row.health === "behind" || row.health === "blocked" ? "bad" : row.health === "at_risk" ? "warn" : undefined;
  const dispatchTone = row.daysToDispatch !== null && row.daysToDispatch < 0 ? "bad" : row.daysToDispatch !== null && row.daysToDispatch <= 7 ? "warn" : undefined;
  const openTasks = row.tasks.filter((t) => (t.pct ?? 0) < 99.999);

  return (
    <li className="py-4 first:pt-0 last:pb-0" data-testid="factory-row">
      <div className="flex items-start gap-3">
        <span className="ref-code mt-0.5 w-6 shrink-0 text-slate-400">{String(rank).padStart(2, "0")}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
            <div className="min-w-0">
              <div className="ref-code text-slate-500">{row.code}</div>
              <Link href={`/projects/${row.projectId}/progress?stage=factory`} className="block text-base font-medium leading-snug text-slate-900 hover:underline">
                {row.name}
              </Link>
              <div className="text-xs text-slate-500">
                {row.clientName}
                {row.projectManagerId ? ` · PM ${userName(row.projectManagerId)}` : ""}
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              {row.status === "on_hold" ? <ProjectStatusBadge status="on_hold" /> : null}
              <HealthChip health={row.health} />
            </div>
          </div>

          {row.pin ? (
            <div className="mt-2 flex items-start gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs text-slate-700">
              <Icon icon={Pin} size={14} className="mt-px text-red-700" />
              <span>
                <span className="font-medium">Pinned:</span> {row.pin.reason} <span className="text-slate-500">· {userName(row.pin.by)}, {formatDate(row.pin.at.slice(0, 10))}</span>
              </span>
            </div>
          ) : null}

          <div className="mt-3">
            <PlanBar pct={row.pct} planned={row.expectedPct} tone={tone} />
            <div className="mt-1 flex justify-between text-xs text-slate-500">
              <span className="tabular-nums">
                <span className="font-medium text-slate-900">{Math.round(row.pct)}%</span> done
                {row.expectedPct !== null ? ` · ${Math.round(row.expectedPct)}% planned by today` : ""}
              </span>
              {row.daysLate > 0 ? <span className="text-red-700">{row.daysLate} days past factory end</span> : null}
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
            <Fact label="Dispatch by" tone={dispatchTone}>
              {row.dispatchBy ? (
                <>
                  {formatDate(row.dispatchBy)}
                  <span className="block text-xs">
                    {row.daysToDispatch === null ? "" : row.daysToDispatch < 0 ? `${-row.daysToDispatch} days ago` : row.daysToDispatch === 0 ? "today" : `in ${row.daysToDispatch} days`}
                  </span>
                </>
              ) : (
                "Not planned"
              )}
            </Fact>
            <Fact label="Steel to finish">
              {row.totalMt > 0 ? (
                <>
                  {fmt(row.remainingMt)} MT
                  <span className="block text-xs text-slate-500">of {fmt(row.totalMt)} MT</span>
                </>
              ) : (
                <span className="text-slate-500">{row.tasks.some((t) => t.unit.toLowerCase() === "mt") ? "Totals not set" : "No MT tasks"}</span>
              )}
            </Fact>
            <Fact label="Rate (MT / week)" tone={row.requiredMtPerWeek !== null && row.requiredMtPerWeek > row.actualMtPerWeek ? "warn" : undefined}>
              {fmt(row.actualMtPerWeek)}
              {row.requiredMtPerWeek !== null ? <span className="block text-xs">needs {fmt(row.requiredMtPerWeek)}</span> : null}
            </Fact>
            <Fact label="Spare time" tone={row.slackDays !== null && row.slackDays < 0 ? "bad" : row.slackDays !== null && row.slackDays <= 7 ? "warn" : undefined}>
              {row.slackDays === null ? <span className="text-slate-500">No rate yet</span> : row.slackDays < 0 ? `Short by ${-row.slackDays} days` : `${row.slackDays} days`}
              <span className="block text-xs text-slate-500">updated {sinceLabel(row.lastUpdate, today)}</span>
            </Fact>
          </div>

          {row.latestDelay ? (
            <p className="mt-2 text-xs text-slate-600">
              Last delay: <span className="font-medium text-slate-800">{reasons.label(row.latestDelay.reason)}</span> · {formatDate(row.latestDelay.recordedAt.slice(0, 10))}
            </p>
          ) : null}

          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
              <Icon icon={open ? ChevronUp : ChevronDown} size={14} />
              {openTasks.length} open task{openTasks.length === 1 ? "" : "s"}
            </Button>
            {row.pin ? (
              <Button
                size="sm"
                variant="ghost"
                disabled={unpin.isPending}
                onClick={() => unpin.mutate({ projectId: row.projectId, reason: null }, { onSuccess: () => toast(`${row.code} unpinned`), onError: (e) => toast(e.message, "error") })}
              >
                <Icon icon={PinOff} size={14} />
                Unpin
              </Button>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => setPinning(true)}>
                <Icon icon={Pin} size={14} />
                Pin to top
              </Button>
            )}
            <Link href={`/projects/${row.projectId}/progress?stage=factory`} className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900">
              <Icon icon={ExternalLink} size={14} />
              Progress
            </Link>
          </div>

          {open ? (
            <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200">
              <table className="stack-table w-full text-sm" data-testid="factory-tasks">
                <thead className="bg-slate-50 text-left text-xs font-medium text-slate-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">Task</th>
                    <th className="px-3 py-2 text-right font-medium">Done</th>
                    <th className="px-3 py-2 font-medium">Planned end</th>
                    <th className="px-3 py-2 font-medium">Assigned to</th>
                    <th className="px-3 py-2 font-medium">State</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {row.tasks.map((t) => (
                    <tr key={t.id}>
                      <td className="px-3 py-2">
                        <div className="text-slate-900">{t.name}</div>
                        <div className="text-xs text-slate-500">{PROCESS_LABELS[t.process]}</div>
                      </td>
                      <td data-half data-label="Done" className="px-3 py-2 text-right tabular-nums">
                        {t.total === null ? "–" : `${fmt(t.completed)} / ${fmt(t.total)} ${t.unit === "%" ? "" : t.unit}`}
                        <span className="block text-xs text-slate-500">{t.pct === null ? "no total" : `${Math.round(t.pct)}%`}</span>
                      </td>
                      <td data-half data-label="Planned end" className={`px-3 py-2 ${t.daysLate ? "text-red-700" : "text-slate-700"}`}>
                        {t.plannedEnd ? formatDate(t.plannedEnd) : "–"}
                        {t.daysLate ? <span className="block text-xs">{t.daysLate} days late</span> : null}
                      </td>
                      <td data-half data-label="Assigned to" className="px-3 py-2 text-slate-700">
                        {userName(t.assignedTo) || <span className="text-slate-400">–</span>}
                      </td>
                      <td data-half data-label="State" className="px-3 py-2">
                        {t.blockedReason ? (
                          <span className="text-red-700">Blocked: {t.blockedReason}</span>
                        ) : t.status === "completed" ? (
                          <span className="text-emerald-700">Done</span>
                        ) : t.behind ? (
                          <span className="text-red-700">Behind</span>
                        ) : t.status === "in_progress" ? (
                          <span className="text-slate-700">In progress</span>
                        ) : (
                          <span className="text-slate-500">Not started</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      </div>
      {pinning ? <PinDialog row={row} onClose={() => setPinning(false)} /> : null}
    </li>
  );
}

/** Factory dashboard: every project's pending factory work, most urgent first. */
export function FactoryDashboard() {
  const { data, isPending, error, refetch } = useFactoryBoard();

  return (
    <PageContainer wide>
      <PageHeader title="Factory dashboard" subtitle="Pending factory work of every project, most urgent first. No money is shown here." />
      {error ? (
        <EmptyState title="Could not load the factory dashboard">
          <p className="mb-3">{error.message}</p>
          <Button onClick={() => void refetch()}>Retry</Button>
        </EmptyState>
      ) : isPending ? (
        <LoadingRows rows={6} />
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="Projects in the factory" value={data.summary.projects} note={data.rows.length > data.summary.projects ? `+ ${data.rows.length - data.summary.projects} on hold` : "active"} />
            <StatTile label="Behind or blocked" value={data.summary.behind} tone={data.summary.behind ? "bad" : undefined} note={`of ${data.summary.projects}`} />
            <StatTile label="Steel to finish" value={`${fmt(data.summary.pendingMt)} MT`} note={`needs ${fmt(data.requiredMtPerWeek)} MT / week`} />
            <StatTile label="Factory workers today" value={data.summary.workersToday} note="present or half day" />
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)] xl:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
            <Card title="Priority queue" description="Pinned first, then blocked and behind, then least spare time before dispatch." actions={<PlanLegend />}>
              {data.rows.length ? (
                <ol className="divide-y divide-slate-100">
                  {data.rows.map((r, i) => (
                    <ProjectCard key={r.projectId} row={r} rank={i + 1} today={data.today} />
                  ))}
                </ol>
              ) : (
                <EmptyState title="No factory work pending">Projects appear here while their factory stage is below 100%.</EmptyState>
              )}
            </Card>

            <div className="space-y-6">
              <Card title="Where work is piling up" description="Pending quantity per process across active projects.">
                {data.processes.length ? (
                  <HBars
                    items={data.processes.map((p) => ({
                      key: `${p.key}-${p.unit}`,
                      label: PROCESS_LABELS[p.key],
                      // Units differ (MT, sq ft): scale each against the largest pending of its own unit.
                      value: p.pending / Math.max(1e-9, ...data.processes.filter((x) => x.unit === p.unit).map((x) => x.pending)),
                      display: `${fmt(p.pending)} ${p.unit}`,
                      note: `${p.projects} project${p.projects === 1 ? "" : "s"}${p.behind ? ` · ${p.behind} behind` : ""}`,
                    }))}
                  />
                ) : (
                  <p className="text-sm text-slate-500">Nothing pending.</p>
                )}
              </Card>

              <Card title="Steel finished per week" description="MT through all factory processes (averaged over them). Dashed line = needed to meet every dispatch date.">
                <WeekBars
                  weeks={data.weekly.map((w, i) => ({ label: shortDate(w.weekStart), value: w.mt, current: i === data.weekly.length - 1 }))}
                  required={data.requiredMtPerWeek || null}
                  unit="MT"
                />
              </Card>

              <Card title="Due in the next 14 days">
                <LookaheadList items={data.lookahead} emptyText="No factory tasks due in the next two weeks." />
              </Card>

              <Card title="Why factory work was delayed" description="Last 90 days, by days lost.">
                <DelayList items={data.delays} emptyText="No factory delays recorded in the last 90 days." />
              </Card>
            </div>
          </div>
        </div>
      )}
    </PageContainer>
  );
}
