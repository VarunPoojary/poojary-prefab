"use client";

import { ClipboardCheck, ExternalLink, Users } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { EmptyState, LoadingRows, PageContainer, PageHeader, useUserName } from "@/components/crm/ui";
import { BehindFlag, ProjectStatusBadge, stageLabel } from "@/components/projects/bits";
import { Button, Card } from "@/components/ui/fields";
import { Icon } from "@/components/ui/icons";
import { useAuth } from "@/lib/auth/AuthProvider";
import { ADMIN_ROLE } from "@/lib/auth/roles";
import { useSiteBoard } from "@/lib/dashboards/hooks";
import type { DailyCheckDay, SiteProjectRow } from "@/lib/dashboards/types";
import { formatDate } from "@/lib/format";
import { stageMeta } from "@/lib/projects/config";
import { useList } from "@/lib/settings/hooks";
import { DayDots, DayLegend, DelayList, LookaheadList, PlanBar, PlanLegend, StatTile, sinceLabel } from "./parts";

const fmt1 = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
const timeOf = (iso: string) => (iso ? new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }) : "");

function Fact({ label, children, tone }: { label: string; children: React.ReactNode; tone?: "bad" | "warn" }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`text-sm tabular-nums ${tone === "bad" ? "text-red-700" : tone === "warn" ? "text-amber-700" : "text-slate-900"}`}>{children}</div>
    </div>
  );
}

/** "Attendance ✓ · Progress ✗" for today, in words. */
function TodayChecks({ day }: { day: DailyCheckDay }) {
  if (day.state === "holiday") return <span className="text-xs text-slate-500">Holiday</span>;
  if (day.state === "off") return <span className="text-xs text-slate-500">Attendance not on</span>;
  const item = (ok: boolean, label: string) => (
    <span className={`inline-flex h-6 items-center rounded-md px-2 text-xs font-medium ${ok ? "bg-emerald-100 text-emerald-800" : day.state === "pending" ? "bg-slate-100 text-slate-600" : "bg-red-100 text-red-800"}`}>
      {label} {ok ? "posted" : day.state === "pending" ? "due" : "missing"}
    </span>
  );
  return (
    <span className="flex flex-wrap gap-1.5">
      {item(day.attendance, "Attendance")}
      {item(day.progress, "Progress")}
    </span>
  );
}

function DailyCheck({ rows, today }: { rows: SiteProjectRow[]; today: string }) {
  const userName = useUserName();
  const sites = rows.filter((r) => r.status === "active" && r.attendanceOn);
  return (
    <Card title="Daily updates" description="Site attendance and at least one progress update are expected every working day." actions={<DayLegend />}>
      {sites.length ? (
        <ul className="divide-y divide-slate-100" data-testid="daily-check">
          {sites.map((r) => {
            const d = r.days[r.days.length - 1];
            const needsAction = d.state === "missing" || d.state === "partial";
            return (
              <li key={r.projectId} className="grid grid-cols-1 gap-2 py-3 first:pt-0 last:pb-0 md:grid-cols-[minmax(0,1.2fr)_auto_auto_auto] md:items-center md:gap-4">
                <div className="min-w-0">
                  <span className="ref-code text-slate-500">{r.code}</span>
                  <div className="truncate text-sm font-medium text-slate-900">{r.name}</div>
                  <div className="truncate text-xs text-slate-500">
                    {r.siteManagerIds.map((id) => userName(id)).join(", ") || "No site manager"}
                  </div>
                </div>
                <TodayChecks day={d} />
                <div className="flex items-center gap-2">
                  <DayDots days={r.days} />
                  <span className="text-xs text-slate-500">{d.attendance && d.loggedBy ? `${userName(d.loggedBy)}, ${timeOf(d.loggedAt)}` : ""}</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {!d.attendance && d.state !== "holiday" ? (
                    <Link
                      href={`/projects/${r.projectId}/attendance?log=${today}`}
                      className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-colors ${needsAction ? "bg-red-900 text-white hover:bg-red-800" : "border border-slate-300 text-slate-700 hover:bg-slate-50"}`}
                    >
                      <Icon icon={Users} size={14} />
                      Log attendance
                    </Link>
                  ) : null}
                  {!d.progress && d.state !== "holiday" ? (
                    <Link href={`/projects/${r.projectId}/progress`} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50">
                      <Icon icon={ClipboardCheck} size={14} />
                      Post progress
                    </Link>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-slate-500">No active site has daily attendance switched on.</p>
      )}
    </Card>
  );
}

function SiteCard({ r, today }: { r: SiteProjectRow; today: string }) {
  const userName = useUserName();
  const reasons = useList("delayReasons");
  const [allTasks, setAllTasks] = useState(false);
  const tone = r.behind ? "bad" : undefined;
  const workers = r.workersToday.employees + r.workersToday.casual;
  const tasks = allTasks ? r.problemTasks : r.problemTasks.slice(0, 4);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5" data-testid="site-card">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <div className="min-w-0">
          <div className="ref-code text-slate-500">{r.code}</div>
          <Link href={`/projects/${r.projectId}/progress`} className="block text-base font-medium leading-snug text-slate-900 hover:underline">
            {r.name}
          </Link>
          <div className="text-xs text-slate-500">
            {[r.siteLocation, r.clientName].filter(Boolean).join(" · ")}
            {r.projectManagerId ? ` · PM ${userName(r.projectManagerId)}` : ""}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {r.status === "on_hold" ? <ProjectStatusBadge status="on_hold" /> : null}
          <BehindFlag behind={r.behind} />
          {r.currentStage ? <span className="inline-flex h-6 items-center rounded-md bg-slate-100 px-2 text-xs text-slate-700">{stageLabel(r.currentStage)}</span> : null}
        </div>
      </div>

      <div className="mt-3">
        <PlanBar pct={r.pct} planned={r.plannedPct} tone={tone} />
        <div className="mt-1 text-xs text-slate-500 tabular-nums">
          <span className="font-medium text-slate-900">{Math.round(r.pct)}%</span> done
          {r.plannedPct !== null ? ` · ${Math.round(r.plannedPct)}% planned by today` : ""}
        </div>
      </div>

      {/* Stage strip: each applicable stage's % with its planned tick. */}
      <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
        {r.stages
          .filter((s) => !s.notApplicable)
          .map((s) => (
            <div key={s.key} className="min-w-0" title={`${stageLabel(s.key)}: ${Math.round(s.pct)}%${s.expectedPct !== null ? `, planned ${Math.round(s.expectedPct)}%` : ""}`}>
              <div className={`truncate text-[11px] ${s.behind ? "text-red-700" : "text-slate-500"}`}>{stageMeta(s.key).short}</div>
              <PlanBar pct={s.pct} planned={s.expectedPct} tone={s.behind ? "bad" : undefined} />
              <div className={`mt-0.5 text-[11px] tabular-nums ${s.behind ? "text-red-700" : "text-slate-600"}`}>{Math.round(s.pct)}%</div>
            </div>
          ))}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
        <Fact label="Planned finish">{r.plannedCompletion ? formatDate(r.plannedCompletion) : "Not set"}</Fact>
        <Fact label="Expected finish" tone={r.daysLate > 0 ? "bad" : undefined}>
          {r.forecast ? formatDate(r.forecast) : "After 10% progress"}
          {r.daysLate > 0 ? <span className="block text-xs">{r.daysLate} days late</span> : null}
        </Fact>
        <Fact label="Progress per day" tone={r.requiredPctPerDay !== null && r.achievedPctPerDay < r.requiredPctPerDay ? "warn" : undefined}>
          {fmt1(r.achievedPctPerDay)}% last 7 days
          {r.requiredPctPerDay !== null ? <span className="block text-xs">needs {fmt1(r.requiredPctPerDay)}%</span> : null}
        </Fact>
        <Fact label="People on site today" tone={r.lowCrew ? "warn" : undefined}>
          {workers}
          <span className="block text-xs text-slate-500">
            {r.workersToday.employees} staff · {r.workersToday.casual} casual{r.avgWorkers7 ? ` · avg ${fmt1(r.avgWorkers7)}` : ""}
          </span>
        </Fact>
        <Fact label="Output per man-day">
          {r.productivity === null ? <span className="text-slate-500">–</span> : `${r.productivity.toFixed(2)}%`}
          <span className="block text-xs text-slate-500">{fmt1(r.manDays7)} man-days in 7 days</span>
        </Fact>
        <Fact label="Last progress update" tone={r.lastUpdate && r.lastUpdate < today && r.status === "active" ? "warn" : undefined}>
          {sinceLabel(r.lastUpdate, today)}
        </Fact>
      </div>

      {r.lowCrew ? (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">Behind schedule with fewer people than its 7-day average ({workers} today vs {fmt1(r.avgWorkers7)}).</p>
      ) : null}

      {r.problemTasks.length ? (
        <div className="mt-4">
          <div className="mb-1 text-xs font-medium text-slate-500">Late or blocked tasks ({r.problemTasks.length})</div>
          <ul className="divide-y divide-slate-100">
            {tasks.map((t) => (
              <li key={t.taskId} className="flex items-start justify-between gap-3 py-2 text-sm">
                <Link href={`/projects/${r.projectId}/progress?stage=${t.stageKey}&task=${t.taskId}`} className="min-w-0 hover:underline">
                  <span className="block truncate text-slate-900">{t.name}</span>
                  <span className="block truncate text-xs text-slate-500">
                    {stageLabel(t.stageKey)}
                    {t.assignedTo ? ` · ${userName(t.assignedTo)}` : ""}
                    {t.pct !== null ? ` · ${Math.round(t.pct)}%` : ""}
                  </span>
                </Link>
                <span className="shrink-0 text-right text-xs text-red-700">{t.blockedReason ? `Blocked: ${t.blockedReason}` : t.daysLate ? `${t.daysLate} days late` : "Behind plan"}</span>
              </li>
            ))}
          </ul>
          {r.problemTasks.length > 4 ? (
            <button type="button" className="mt-1 text-xs font-medium text-red-700 hover:underline" onClick={() => setAllTasks((v) => !v)}>
              {allTasks ? "Show fewer" : `Show all ${r.problemTasks.length}`}
            </button>
          ) : null}
        </div>
      ) : null}

      {r.openDelays.length ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {r.openDelays.map((d) => (
            <span key={d.reason} className="inline-flex h-6 items-center rounded-md bg-slate-100 px-2 text-xs text-slate-700">
              {reasons.label(d.reason)}
              {d.count > 1 ? ` ×${d.count}` : ""}
            </span>
          ))}
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <Link href={`/projects/${r.projectId}/progress`} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50">
          <Icon icon={ExternalLink} size={14} />
          Progress
        </Link>
        <Link href={`/projects/${r.projectId}/attendance`} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50">
          <Icon icon={Users} size={14} />
          Attendance
        </Link>
      </div>
    </section>
  );
}

/** Site dashboard: progress of every site, what is late and why, crews, and the daily update check. */
export function SiteDashboard() {
  const { data, isPending, error, refetch } = useSiteBoard();
  const { user } = useAuth();
  const userName = useUserName();
  const [mineOnly, setMineOnly] = useState<boolean | null>(null);
  const [pm, setPm] = useState("");
  const [behindOnly, setBehindOnly] = useState(false);

  const hasMine = !!data?.rows.some((r) => r.mine);
  // Default: on for people who are on a site's team; off for Admin, who oversees every site.
  const mine = mineOnly ?? (hasMine && user?.role !== ADMIN_ROLE);
  const rows = useMemo(
    () => (data?.rows ?? []).filter((r) => (!mine || r.mine) && (!pm || r.projectManagerId === pm) && (!behindOnly || r.behind)),
    [data, mine, pm, behindOnly],
  );
  const pms = [...new Set((data?.rows ?? []).map((r) => r.projectManagerId).filter(Boolean))];
  const crewRows = rows.filter((r) => r.status === "active" && r.attendanceOn);

  return (
    <PageContainer wide>
      <PageHeader title="Site dashboard" subtitle="Progress of every site, what is late and why, crews, and daily updates. No money is shown here." />
      {error ? (
        <EmptyState title="Could not load the site dashboard">
          <p className="mb-3">{error.message}</p>
          <Button onClick={() => void refetch()}>Retry</Button>
        </EmptyState>
      ) : isPending ? (
        <LoadingRows rows={6} />
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="Active sites" value={data.summary.active} note={data.rows.length > data.summary.active ? `+ ${data.rows.length - data.summary.active} on hold` : undefined} />
            <StatTile label="Behind schedule" value={data.summary.behind} tone={data.summary.behind ? "bad" : undefined} note={`of ${data.summary.active}`} />
            <StatTile label="Not updated today" value={data.summary.notUpdatedToday} tone={data.summary.notUpdatedToday ? "warn" : undefined} note="attendance or progress missing" />
            <StatTile label="People on site today" value={data.summary.workersToday} note="staff and casual" />
          </div>

          <div className="grid grid-cols-2 gap-2 text-sm sm:flex sm:flex-wrap sm:items-center" data-testid="site-filters">
            <label className="flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-slate-700">
              <input type="checkbox" className="h-4 w-4 accent-red-700" checked={mine} onChange={(e) => setMineOnly(e.target.checked)} />
              My sites only
            </label>
            <select aria-label="Filter by project manager" value={pm} onChange={(e) => setPm(e.target.value)} className="order-first col-span-2 h-10 min-w-0 rounded-lg border border-slate-300 bg-white pl-2.5 text-sm sm:order-none">
              <option value="">Any project manager</option>
              {pms.map((id) => (
                <option key={id} value={id}>
                  {userName(id)}
                </option>
              ))}
            </select>
            <label className="flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-slate-700">
              <input type="checkbox" className="h-4 w-4 accent-red-700" checked={behindOnly} onChange={(e) => setBehindOnly(e.target.checked)} />
              Behind only
            </label>
            <span className="col-span-2 text-right text-xs text-slate-500 sm:ml-auto">
              {rows.length} of {data.rows.length} sites
            </span>
          </div>

          <DailyCheck rows={rows} today={data.today} />

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)] xl:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
            <div className="space-y-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-base font-medium text-slate-900">Sites, most behind first</h2>
                <PlanLegend />
              </div>
              {rows.length ? rows.map((r) => <SiteCard key={r.projectId} r={r} today={data.today} />) : <EmptyState title="No sites match these filters." />}
            </div>

            <div className="space-y-6">
              <Card title="Crew today" description="People on site today against each site's 7-day average.">
                {crewRows.length ? (
                  <ul className="divide-y divide-slate-100 text-sm">
                    {crewRows.map((r) => {
                      const n = r.workersToday.employees + r.workersToday.casual;
                      return (
                        <li key={r.projectId} className="flex items-center justify-between gap-3 py-2">
                          <span className="min-w-0">
                            <span className="ref-code block text-slate-500">{r.code}</span>
                            <span className="block truncate text-slate-900">{r.name}</span>
                          </span>
                          <span className={`shrink-0 text-right tabular-nums ${r.lowCrew ? "text-amber-700" : "text-slate-900"}`}>
                            {n}
                            <span className="block text-xs text-slate-500">avg {fmt1(r.avgWorkers7)}</span>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="text-sm text-slate-500">No site attendance yet.</p>
                )}
              </Card>

              <Card title="Due in the next 14 days" description="Transport, erection, quality and handover tasks.">
                <LookaheadList items={data.lookahead} emptyText="No site tasks due in the next two weeks." />
              </Card>

              <Card title="Why sites were delayed" description="Last 90 days, by days lost.">
                <DelayList items={data.delays} emptyText="No site delays recorded in the last 90 days." />
              </Card>

              {data.unexplained.length ? (
                <Card title="Late without a reason" description="Stages past their planned end with no delay reason recorded.">
                  <ul className="divide-y divide-slate-100 text-sm">
                    {data.unexplained.map((u) => (
                      <li key={`${u.projectId}-${u.stageKey}`} className="flex items-center justify-between gap-3 py-2">
                        <Link href={`/projects/${u.projectId}/progress?stage=${u.stageKey}`} className="min-w-0 hover:underline">
                          <span className="ref-code block text-slate-500">{u.code}</span>
                          <span className="block truncate text-slate-900">{stageLabel(u.stageKey)}</span>
                        </Link>
                        <span className="shrink-0 text-xs text-red-700">{u.daysLate} days late</span>
                      </li>
                    ))}
                  </ul>
                </Card>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </PageContainer>
  );
}
