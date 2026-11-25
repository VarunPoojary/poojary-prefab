"use client";

import { ChevronLeft, Lock, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { EmptyState, ErrorList, PageContainer, useUserName } from "@/components/crm/ui";
import { useToast } from "@/components/Providers";
import { Button, Select, TextArea } from "@/components/ui/fields";
import { Modal } from "@/components/ui/overlays";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useClient } from "@/lib/crm/hooks";
import { useExpenseBudget } from "@/lib/expenses/hooks";
import { formatPaise } from "@/lib/paise";
import { formatDate } from "@/lib/format";
import { projectRepo } from "@/lib/projects";
import { PROJECT_STATUSES } from "@/lib/projects/config";
import { useProject, useProjectMutation } from "@/lib/projects/hooks";
import { currentStage, forecastCompletion, moneyTotals, projectBehind, projectPct, stagePct, todayIso } from "@/lib/projects/rules";
import { PROJECT_TABS, projectTabHref, type ProjectTab } from "@/lib/projects/tabs";
import type { Project, ProjectStatus } from "@/lib/projects/types";
import { BehindFlag, ProgressBar, ProjectStatusBadge, pctText, stageLabel } from "./bits";
import { Icon } from "@/components/ui/icons";

const issuesOf = (e: unknown) => (e && typeof e === "object" && "issues" in e ? (e as { issues: string[] }).issues : [e instanceof Error ? e.message : String(e)]);

export function StatusDialog({ project, initial, onClose }: { project: Project; initial?: ProjectStatus; onClose: () => void }) {
  const toast = useToast();
  const [status, setStatus] = useState<ProjectStatus>(initial ?? project.status);
  const [reason, setReason] = useState("");
  const [issues, setIssues] = useState<string[]>([]);
  const m = useProjectMutation(() => projectRepo.setStatus(project.id, status, reason));
  const needsReason = status === "on_hold" || status === "cancelled";
  return (
    <Modal
      open
      onClose={onClose}
      title="Change project status"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={m.isPending}
            onClick={() =>
              m.mutate(undefined, {
                onSuccess: () => {
                  toast(`Status changed to ${PROJECT_STATUSES.find((s) => s.value === status)!.label}`);
                  onClose();
                },
                onError: (e) => setIssues(issuesOf(e)),
              })
            }
          >
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Select label="Status" value={status} onChange={setStatus} options={PROJECT_STATUSES.map((s) => ({ value: s.value, label: s.label }))} />
        {status === "completed" ? <p className="text-xs text-slate-500">Allowed once Handover has reached 100%. Sets the actual completion date to today.</p> : null}
        <TextArea label={needsReason ? "Reason" : "Comment (optional)"} required={needsReason} rows={3} value={reason} onChange={setReason} />
        <ErrorList issues={issues} />
      </div>
    </Modal>
  );
}

function WarningBanner({ project, isAdmin }: { project: Project; isAdmin: boolean }) {
  const toast = useToast();
  const [reason, setReason] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const resolve = useProjectMutation(({ keep, reason }: { keep: boolean; reason: string }) => projectRepo.resolveEnquiryWarning(project.id, keep, reason));
  if (project.enquiryWarning !== "open") return null;
  return (
    <div role="alert" data-testid="enquiry-warning" className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>
          <Icon icon={TriangleAlert} size={14} className="mr-1 inline-block align-[-2px]" /><b>Linked enquiry is no longer Finalised.</b> {isAdmin ? "Keep the project or cancel it." : "An admin will decide whether to keep this project."}
        </span>
        {isAdmin ? (
          <span className="flex gap-2">
            <Button size="sm" onClick={() => resolve.mutate({ keep: true, reason: "" }, { onSuccess: () => toast("Project kept"), onError: (e) => toast(e.message, "error") })}>
              Keep project
            </Button>
            <Button size="sm" variant="danger" onClick={() => setCancelling(true)}>
              Cancel project
            </Button>
          </span>
        ) : null}
      </div>
      {cancelling ? (
        <Modal
          open
          onClose={() => setCancelling(false)}
          title="Cancel project"
          footer={
            <>
              <Button onClick={() => setCancelling(false)}>Back</Button>
              <Button
                variant="primary"
                disabled={resolve.isPending}
                onClick={() =>
                  resolve.mutate(
                    { keep: false, reason: reason || "Linked enquiry is no longer Finalised" },
                    { onSuccess: () => (toast("Project cancelled"), setCancelling(false)), onError: (e) => toast(e.message, "error") },
                  )
                }
              >
                Cancel project
              </Button>
            </>
          }
        >
          <TextArea label="Reason" rows={3} value={reason} onChange={setReason} placeholder="Linked enquiry is no longer Finalised" />
        </Modal>
      ) : null}
    </div>
  );
}

function SummaryTile({ label, children, testId }: { label: string; children: React.ReactNode; testId?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2" data-testid={testId}>
      <div className="text-[11px] font-semibold text-slate-500">{label}</div>
      <div className="mt-0.5 text-sm font-semibold text-slate-900">{children}</div>
    </div>
  );
}

/** Accepted + paid expenses against the total budget (admins). */
function BudgetUsedTile({ projectId }: { projectId: string }) {
  const { data } = useExpenseBudget(projectId);
  const pct = data && data.totalBudgetPaise ? (data.totalSpentPaise / data.totalBudgetPaise) * 100 : null;
  return (
    <SummaryTile label="Budget used" testId="budget-used">
      {data ? (
        <>
          <span className={pct !== null && pct > 100 ? "text-red-700" : ""}>{pct !== null ? pctText(pct) : "No budget"}</span>{" "}
          <span className="text-xs font-normal text-slate-500">{formatPaise(data.totalSpentPaise)}</span>
        </>
      ) : (
        "…"
      )}
    </SummaryTile>
  );
}

/** Summary header, banners and the tab bar shared by every project tab route. */
export function ProjectFrame({ active, children }: { active: ProjectTab["key"]; children: (p: Project) => React.ReactNode }) {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const userName = useUserName();
  const { data: p, isPending, error } = useProject(id);
  const { data: client } = useClient(p?.clientId);
  const [statusOpen, setStatusOpen] = useState<ProjectStatus | null>(null);
  const [today] = useState(() => todayIso());

  if (error)
    return (
      <PageContainer>
        <EmptyState title={error.name === "ForbiddenError" ? "You are not on this project's team." : "Project not found."}>
          <Link href="/projects" className="text-sm font-medium text-red-700 hover:underline">
            ← Back to projects
          </Link>
        </EmptyState>
      </PageContainer>
    );
  if (isPending) return <div className="p-6 text-sm text-slate-500">Loading…</div>;

  const pct = projectPct(p.stages);
  const behind = projectBehind(p, today);
  const forecast = p.status === "active" ? forecastCompletion(p.startDate, pct, today) : null;
  const late = forecast && p.plannedCompletion && forecast > p.plannedCompletion;
  const totals = p.money ? moneyTotals(p.money, today) : null;
  const handover = p.stages.find((s) => s.key === "handover")!;
  const readyToComplete = p.status === "active" && (handover.notApplicable || stagePct(handover) >= 99.999);

  return (
    <PageContainer wide>
      <Link
        href="/projects"
        className="-ml-1 mb-2 inline-flex h-8 items-center gap-1 rounded-lg pl-1 pr-2 text-sm text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
      >
        <Icon icon={ChevronLeft} size={14} />
        Projects
      </Link>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="ref-code text-slate-500">{p.code}</div>
          <h1 className="mt-0.5 flex flex-wrap items-center gap-2 text-[22px] font-medium leading-tight text-slate-900 sm:text-[28px]">
            <span>{p.name}</span> <ProjectStatusBadge status={p.status} /> <BehindFlag behind={behind} />
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {client ? (
              <Link href={`/clients/${client.id}`} className="hover:underline">
                {client.name}
              </Link>
            ) : null}
            {p.siteLocation ? ` · ${p.siteLocation}` : ""} · PM {userName(p.projectManagerId)}
          </p>
        </div>
        {isAdmin ? <Button onClick={() => setStatusOpen(p.status)}>Change status</Button> : null}
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <SummaryTile label="Overall progress" testId="overall-progress">
          <div className="flex items-center gap-2">
            <ProgressBar pct={pct} tone={behind ? "red" : undefined} />
            <span>{pctText(pct)}</span>
          </div>
        </SummaryTile>
        <SummaryTile label="Current stage">{stageLabel(currentStage(p.stages))}</SummaryTile>
        <SummaryTile label="Planned / expected completion">
          <span className={p.plannedCompletion && p.plannedCompletion < today && p.status === "active" ? "text-red-700" : ""}>
            {p.plannedCompletion ? formatDate(p.plannedCompletion) : "Not set"}
          </span>
          <span className="block text-xs font-normal text-slate-500" data-testid="forecast">
            {p.status === "completed" ? `Completed ${formatDate(p.actualCompletion)}` : forecast ? <span className={late ? "text-red-700" : ""}>Expected {formatDate(forecast)}</span> : "Expected: after 10% progress"}
          </span>
        </SummaryTile>
        {totals ? (
          <>
            <SummaryTile label="Value (with GST)" testId="header-value">
              ₹{totals.revisedWithGst.toLocaleString("en-IN")}
            </SummaryTile>
            <SummaryTile label="Received">
              {pctText(totals.pctCollected)} <span className="text-xs font-normal text-slate-500">₹{totals.received.toLocaleString("en-IN")}</span>
            </SummaryTile>
            <BudgetUsedTile projectId={p.id} />
          </>
        ) : null}
      </div>

      <WarningBanner project={p} isAdmin={isAdmin} />
      {p.statusReason && (p.status === "on_hold" || p.status === "cancelled") ? (
        <div className="mb-4 rounded-lg border border-slate-200 bg-slate-100 px-4 py-3 text-sm text-slate-700">
          <b>{p.status === "on_hold" ? "On hold" : "Cancelled"}:</b> {p.statusReason.reason}{" "}
          <span className="text-xs text-slate-500">
            ({userName(p.statusReason.by)}, {formatDate(p.statusReason.at)})
          </span>
        </div>
      ) : null}
      {readyToComplete && isAdmin ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <span>Handover has reached 100%. Mark the project Completed?</span>
          <Button size="sm" variant="primary" onClick={() => setStatusOpen("completed")}>
            Mark completed
          </Button>
        </div>
      ) : null}

      <nav className="mb-5 grid grid-cols-4 border-b border-slate-200 sm:flex sm:gap-1" aria-label="Project sections">
        {PROJECT_TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            aria-current={t.key === active ? "page" : undefined}
            onClick={() => (t.locked ? toast(`${t.label} — coming soon`) : router.push(projectTabHref(p.id, t.key)))}
            className={`-mb-px flex h-11 min-w-0 items-center justify-center gap-1 border-b-2 px-1 text-[13px] font-medium transition-colors sm:shrink-0 sm:px-4 sm:text-sm ${
              t.key === active ? "border-red-700 text-red-800" : "border-transparent text-slate-500 hover:text-slate-800"
            } ${t.locked ? "cursor-not-allowed opacity-60" : ""}`}
          >
            {t.label}
            {t.locked ? <span aria-label="coming soon"><Icon icon={Lock} size={14} className="mr-1 inline-block align-[-2px]" /></span> : null}
          </button>
        ))}
      </nav>

      {children(p)}

      {statusOpen ? <StatusDialog project={p} initial={statusOpen} onClose={() => setStatusOpen(null)} /> : null}
    </PageContainer>
  );
}

/** Expenses / Attendance routes: not released yet, so explain and go back to Details. */
export function ProjectLockedTab() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const shown = useRef(false);
  useEffect(() => {
    if (shown.current) return;
    shown.current = true;
    const tab = PROJECT_TABS.find((t) => window.location.pathname.endsWith(`/${t.key}`));
    toast(`${tab?.label ?? "This section"} — coming soon`);
    router.replace(projectTabHref(id, "details"));
  }, [id, router, toast]);
  return <div className="p-6 text-sm text-slate-500">Coming soon…</div>;
}
