"use client";

import { Flag, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { EmptyState, LoadingRows, PageContainer, PageHeader, useDebounced, useUserName } from "@/components/crm/ui";
import { Button } from "@/components/ui/fields";
import { useAuth } from "@/lib/auth/AuthProvider";
import { STAGES } from "@/lib/projects/config";
import { useProjects } from "@/lib/projects/hooks";
import { compactRupees, todayIso } from "@/lib/projects/rules";
import type { ProjectListParams, ProjectStatus, ProjectSummary, StageKey } from "@/lib/projects/types";
import { formatDate } from "@/lib/format";
import { BehindFlag, ProgressBar, ProjectStatusBadge, pctText, stageLabel } from "./bits";
import { Icon } from "@/components/ui/icons";

type SortKey = NonNullable<ProjectListParams["sort"]>;

const STATUS_FILTERS: { value: string; label: string; statuses: ProjectStatus[] }[] = [
  { value: "open", label: "Active & On hold", statuses: ["active", "on_hold"] },
  { value: "active", label: "Active", statuses: ["active"] },
  { value: "on_hold", label: "On hold", statuses: ["on_hold"] },
  { value: "completed", label: "Completed", statuses: ["completed"] },
  { value: "cancelled", label: "Cancelled", statuses: ["cancelled"] },
  { value: "all", label: "All statuses", statuses: [] },
];

export function ProjectsList() {
  const router = useRouter();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const userName = useUserName();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("open");
  const [stage, setStage] = useState<StageKey | "">("");
  const [pm, setPm] = useState("");
  const [clientId, setClientId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [behindOnly, setBehindOnly] = useState(false);
  const [sort, setSort] = useState<SortKey>("planned");
  const [dir, setDir] = useState<"asc" | "desc">("asc");
  const [today] = useState(() => todayIso());
  const q = useDebounced(search, 200);
  const statuses = STATUS_FILTERS.find((s) => s.value === statusFilter)!.statuses;
  const { data, isPending, error, refetch } = useProjects({ search: q, statuses, stage, projectManagerId: pm, clientId, from, to, behindOnly, sort, dir });
  const { data: everything } = useProjects({ statuses: [] });
  const clients = useMemo(
    () => [...new Map((everything ?? []).map((p) => [p.clientId, p.clientName])).entries()].sort((a, b) => a[1].localeCompare(b[1])),
    [everything],
  );
  const managers = useMemo(() => [...new Set((everything ?? []).map((p) => p.projectManagerId))], [everything]);
  const filtered = !!(q || statusFilter !== "open" || stage || pm || clientId || from || to || behindOnly);

  const sortBy = (k: SortKey) => {
    if (k === sort) setDir(dir === "asc" ? "desc" : "asc");
    else {
      setSort(k);
      setDir(k === "progress" ? "desc" : "asc");
    }
  };
  const sel = (label: string, value: string, onChange: (v: string) => void, options: [string, string][]) => (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className="h-10 rounded-lg border border-slate-300 bg-white px-2.5 text-sm">
      {options.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  );
  const th = (children: React.ReactNode, k?: SortKey, className = "") => (
    <th key={String(children)} className={`px-3 py-2 ${className}`} aria-sort={k && sort === k ? (dir === "asc" ? "ascending" : "descending") : undefined}>
      {k ? (
        <button type="button" className="flex items-center gap-1 hover:text-slate-800" onClick={() => sortBy(k)}>
          {children}
          <span className="text-[11px]">{sort === k ? (dir === "asc" ? "▲" : "▼") : ""}</span>
        </button>
      ) : (
        children
      )}
    </th>
  );
  const open = (p: ProjectSummary) => router.push(`/projects/${p.id}/details`);
  const late = (p: ProjectSummary) => !!p.plannedCompletion && p.plannedCompletion < today && p.status !== "completed" && p.status !== "cancelled";

  return (
    <PageContainer wide>
      <PageHeader
        title="Projects"
        subtitle={isAdmin ? "Every won order, from design to handover." : "Projects whose team you are on."}
        actions={
          isAdmin ? (
            <Button variant="primary" onClick={() => router.push("/projects/new")}>
              <Icon icon={Plus} size={14} className="inline-block align-[-2px]" /> New project
            </Button>
          ) : null
        }
      />
      <div className="filter-bar mb-4 flex flex-wrap items-center gap-2">
        <input
          type="search"
          aria-label="Search projects"
          placeholder="Search code, name, client, site…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-10 min-w-[220px] flex-1 rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none transition-[border-color,box-shadow] placeholder:text-slate-400 focus:border-red-700 focus:ring-3 focus:ring-red-700/10"
        />
        {sel("Filter by status", statusFilter, setStatusFilter, STATUS_FILTERS.map((s) => [s.value, s.label]))}
        {sel("Filter by current stage", stage, (v) => setStage(v as StageKey | ""), [["", "Any stage"], ...STAGES.map((s): [string, string] => [s.key, s.label])])}
        {sel("Filter by project manager", pm, setPm, [["", "Any manager"], ...managers.map((id): [string, string] => [id, userName(id)])])}
        {sel("Filter by client", clientId, setClientId, [["", "All clients"], ...clients])}
        <label className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-600" data-span>
          <span className="w-full text-xs text-slate-500 sm:w-auto sm:text-sm">Start date</span>
          <input type="date" aria-label="Start date from" value={from} onChange={(e) => setFrom(e.target.value)} className="h-10 min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-2 text-sm" />
          <span aria-hidden className="hidden sm:inline">–</span>
          <input type="date" aria-label="Start date to" value={to} onChange={(e) => setTo(e.target.value)} className="h-10 min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-2 text-sm" />
        </label>
        <label className="flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700">
          <input type="checkbox" className="h-4 w-4 accent-red-700" checked={behindOnly} onChange={(e) => setBehindOnly(e.target.checked)} />
          <Icon icon={Flag} size={14} className="text-slate-500" />
          Behind schedule
        </label>
        {filtered ? (
          <button
            type="button"
            className="text-xs font-medium text-red-700 hover:underline"
            onClick={() => {
              setSearch("");
              setStatusFilter("open");
              setStage("");
              setPm("");
              setClientId("");
              setFrom("");
              setTo("");
              setBehindOnly(false);
            }}
          >
            Clear filters
          </button>
        ) : null}
        <span className="ml-auto text-xs text-slate-500">{data ? `${data.length} project${data.length === 1 ? "" : "s"}` : ""}</span>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {error ? (
          <EmptyState title="Could not load projects">
            <Button onClick={() => void refetch()}>Retry</Button>
          </EmptyState>
        ) : isPending ? (
          <LoadingRows />
        ) : !data.length ? (
          <EmptyState title={filtered ? "No projects match these filters." : isAdmin ? "No projects yet. They are created when an enquiry is Finalised." : "You are not on any project team yet."} />
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[1100px] text-sm">
                <thead className="bg-slate-50 text-left text-xs text-slate-500">
                  <tr>
                    {th("Code", "code")}
                    {th("Project", "name")}
                    {th("Client", "client")}
                    {th("Site")}
                    {th("Project manager")}
                    {th("Current stage")}
                    {th("Progress", "progress")}
                    {th("Planned completion", "planned")}
                    {th("Status", "status")}
                    {isAdmin ? th("Value / Received", undefined, "text-right") : null}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.map((p) => (
                    <tr key={p.id} data-testid="project-row" onClick={() => open(p)} className="cursor-pointer transition-colors hover:bg-slate-50">
                      <td className="ref-code whitespace-nowrap px-3 py-3 font-medium text-slate-900">{p.code}</td>
                      <td className="min-w-44 px-3 py-3">
                        <div className="font-medium text-slate-900">{p.name}</div>
                        <BehindFlag behind={p.behind} />
                      </td>
                      <td className="px-3 py-3 text-slate-700">{p.clientName}</td>
                      <td className="px-3 py-3 text-slate-700">{p.siteLocation}</td>
                      <td className="px-3 py-3 text-slate-700">{userName(p.projectManagerId)}</td>
                      <td className="px-3 py-3 text-slate-700">{stageLabel(p.currentStage)}</td>
                      <td className="w-40 px-3 py-3">
                        <div className="flex items-center gap-2">
                          <ProgressBar pct={p.progress} tone={p.behind ? "red" : undefined} />
                          <span className="w-10 text-right text-xs font-medium tabular-nums text-slate-700">{pctText(p.progress)}</span>
                        </div>
                      </td>
                      <td className={`whitespace-nowrap px-3 py-3 ${late(p) ? "font-semibold text-red-700" : "text-slate-700"}`}>
                        {p.plannedCompletion ? formatDate(p.plannedCompletion) : <span className="text-slate-400">Not set</span>}
                      </td>
                      <td className="px-3 py-3">
                        <ProjectStatusBadge status={p.status} />
                      </td>
                      {isAdmin ? (
                        <td className="whitespace-nowrap px-3 py-3 text-right text-slate-700" data-testid="money-cell">
                          {p.value !== null ? `${compactRupees(p.value)} / ${compactRupees(p.received ?? 0)}` : ""}
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="divide-y divide-slate-100 md:hidden">
              {data.map((p) => (
                <li key={p.id}>
                  <button type="button" data-testid="project-card" onClick={() => open(p)} className="block w-full px-4 py-3 text-left">
                    <div className="flex items-center justify-between gap-2">
                      <span className="ref-code text-xs text-slate-500">{p.code}</span>
                      <span className="flex gap-1">
                        <BehindFlag behind={p.behind} />
                        <ProjectStatusBadge status={p.status} />
                      </span>
                    </div>
                    <div className="mt-0.5 font-semibold text-slate-900">{p.name}</div>
                    <div className="text-xs text-slate-500">
                      {p.clientName} · {p.siteLocation}
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <ProgressBar pct={p.progress} tone={p.behind ? "red" : undefined} />
                      <span className="text-xs font-semibold">{pctText(p.progress)}</span>
                    </div>
                    <div className="mt-1 flex justify-between text-xs text-slate-500">
                      <span>{stageLabel(p.currentStage)}</span>
                      <span className={late(p) ? "font-semibold text-red-700" : ""}>{p.plannedCompletion ? `Due ${formatDate(p.plannedCompletion)}` : ""}</span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </PageContainer>
  );
}
