"use client";

import { ChevronLeft, CircleAlert, CheckCircle2, ExternalLink, Search, Upload } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { EmptyState, LoadingRows, PageContainer, PageHeader, useUserName } from "@/components/crm/ui";
import { PlanBar, StatTile } from "@/components/dashboards/parts";
import { ProjectDocuments, UploadDialog, useUploadTypes } from "@/components/projects/Documents";
import { ProjectStatusBadge } from "@/components/projects/bits";
import { Button } from "@/components/ui/fields";
import { Icon } from "@/components/ui/icons";
import { useAuth } from "@/lib/auth/AuthProvider";
import { roleHasPage } from "@/lib/auth/roles";
import { buildDesignBoard, type DesignRow } from "@/lib/dashboards/design";
import { useDesignData } from "@/lib/dashboards/hooks";
import { relativeTime } from "@/lib/format";
import { onTeam, todayIso } from "@/lib/projects/rules";
import type { Project } from "@/lib/projects/types";
import { useList, useSettings } from "@/lib/settings/hooks";

type StatusFilter = "" | "active" | "on_hold";

/** Opens the upload dialog straight from a project card, with the type already chosen. */
function QuickUpload({ p, slot, onClose }: { p: Project; slot: string; onClose: () => void }) {
  const types = useUploadTypes(p);
  if (!types.length) return null;
  return <UploadDialog p={p} types={types} initialType={types.some((t) => t.value === slot) ? slot : types[0].value} suggestFirst onClose={onClose} />;
}

function ProjectCard({ r, selected, onOpen, onUpload }: { r: DesignRow; selected: boolean; onOpen: () => void; onUpload: (slot: string) => void }) {
  const userName = useUserName();
  const types = useList("documentTypes");
  const last = r.lastUpload;
  return (
    <li
      className={`rounded-xl border bg-white p-4 transition-colors ${selected ? "border-red-700 ring-1 ring-red-700" : "border-slate-200 hover:border-slate-300"}`}
      data-testid="design-project"
    >
      <button type="button" onClick={onOpen} className="block w-full text-left">
        <span className="flex items-center justify-between gap-2">
          <span className="ref-code text-xs text-slate-500">{r.code}</span>
          {r.status !== "active" ? <ProjectStatusBadge status={r.status} /> : null}
        </span>
        <span className="mt-0.5 block font-medium text-slate-900">{r.name}</span>
        <span className="block text-xs text-slate-500">
          {[r.clientName, r.projectManagerId ? `PM ${userName(r.projectManagerId)}` : ""].filter(Boolean).join(" · ")}
        </span>
      </button>

      {r.designPct !== null ? (
        <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
          <span className="shrink-0">Design</span>
          <PlanBar pct={r.designPct} planned={null} />
          <span className="w-9 shrink-0 text-right tabular-nums text-slate-700">{Math.round(r.designPct)}%</span>
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
        {r.missing.length ? (
          <>
            <span className="inline-flex items-center gap-1 font-medium text-red-800">
              <Icon icon={CircleAlert} size={14} />
              Missing:
            </span>
            {r.missing.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => onUpload(t.value)}
                title={`Upload ${t.label}`}
                className="inline-flex h-7 items-center gap-1 rounded-lg bg-red-50 px-2 font-medium text-red-800 transition-colors hover:bg-red-100"
              >
                <Icon icon={Upload} size={12} />
                {t.label}
              </button>
            ))}
          </>
        ) : (
          <span className="inline-flex items-center gap-1 text-emerald-800">
            <Icon icon={CheckCircle2} size={14} />
            All required documents are in
          </span>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
        <span className="min-w-0 text-xs text-slate-500">
          {last ? (
            <>
              Last: {types.label(last.slot)}
              {last.revision ? ` ${last.revision}` : ""} · {relativeTime(last.uploadedAt)}
              {last.uploadedBy ? ` · ${userName(last.uploadedBy)}` : ""}
            </>
          ) : (
            "Nothing uploaded yet"
          )}
        </span>
        <span className="flex shrink-0 gap-1.5">
          <Button size="sm" variant="ghost" onClick={onOpen}>
            Documents ({r.currentFiles})
          </Button>
          <Button size="sm" variant="primary" onClick={() => onUpload(r.missing[0]?.value ?? last?.slot ?? "")}>
            <Icon icon={Upload} size={14} />
            Upload
          </Button>
        </span>
      </div>
    </li>
  );
}

/** Design: every open project, the documents it has and is missing, and uploads for the drawing team. */
export function DesignScreen() {
  const { data, isPending, error, refetch } = useDesignData();
  const { data: settings } = useSettings();
  const { user } = useAuth();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<StatusFilter>("");
  const [missingOnly, setMissingOnly] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [upload, setUpload] = useState<{ projectId: string; slot: string } | null>(null);

  const board = useMemo(
    () => (data ? buildDesignBoard({ projects: data.projects, clientNames: data.clientNames, types: settings?.lists.documentTypes ?? [], today: todayIso() }) : null),
    [data, settings],
  );
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (board?.rows ?? []).filter(
      (r) => (!status || r.status === status) && (!missingOnly || r.missing.length) && (!needle || `${r.code} ${r.name} ${r.clientName}`.toLowerCase().includes(needle)),
    );
  }, [board, q, status, missingOnly]);

  const open = board?.rows.find((r) => r.projectId === openId) ?? null;
  const uploadRow = upload ? board?.rows.find((r) => r.projectId === upload.projectId) : undefined;

  return (
    <PageContainer wide>
      <PageHeader title="Design" subtitle="Shop drawings, structural drawings and other documents for every open project. Uploads go straight to the project's documents." />
      {error ? (
        <EmptyState title="Could not load the projects">
          <p className="mb-3">{error.message}</p>
          <Button onClick={() => void refetch()}>Retry</Button>
        </EmptyState>
      ) : isPending || !board ? (
        <LoadingRows rows={6} />
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <StatTile label="Open projects" value={board.summary.open + board.summary.onHold} note={board.summary.onHold ? `${board.summary.onHold} on hold` : undefined} />
            <StatTile label="Missing required documents" value={board.summary.missingRequired} tone={board.summary.missingRequired ? "bad" : undefined} note="projects" />
            <StatTile label="Uploads in the last 7 days" value={board.summary.uploadsThisWeek} note="files" />
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
            <section className={open ? "hidden lg:block" : undefined} aria-label="Projects">
              <div className="mb-3 flex flex-wrap items-center gap-2 text-sm" data-testid="design-filters">
                <label className="flex h-10 w-full min-w-0 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3">
                  <Icon icon={Search} size={14} className="text-slate-500" />
                  <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search code, project or client" aria-label="Search projects" className="h-full min-w-0 flex-1 bg-transparent outline-none" />
                </label>
                <select aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)} className="h-10 min-w-0 flex-1 rounded-lg border border-slate-300 bg-white pl-2.5 text-sm">
                  <option value="">Active and on hold</option>
                  <option value="active">Active only</option>
                  <option value="on_hold">On hold only</option>
                </select>
                <label className="flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-slate-700">
                  <input type="checkbox" className="h-4 w-4 accent-red-700" checked={missingOnly} onChange={(e) => setMissingOnly(e.target.checked)} />
                  Missing only
                </label>
              </div>
              <p className="mb-2 text-xs text-slate-500">
                {rows.length} of {board.rows.length} projects · most missing first
              </p>
              {rows.length ? (
                <ul className="space-y-3">
                  {rows.map((r) => (
                    <ProjectCard key={r.projectId} r={r} selected={r.projectId === openId} onOpen={() => setOpenId(r.projectId)} onUpload={(slot) => setUpload({ projectId: r.projectId, slot })} />
                  ))}
                </ul>
              ) : (
                <EmptyState title={board.rows.length ? "No projects match these filters." : "There are no open projects."} />
              )}
            </section>

            <section aria-label="Project documents" className={open ? undefined : "hidden lg:block"}>
              {open ? (
                <div className="space-y-3 lg:sticky lg:top-20">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setOpenId(null)}>
                      <Icon icon={ChevronLeft} size={14} />
                      <span className="lg:hidden">All projects</span>
                      <span className="hidden lg:inline">Close</span>
                    </Button>
                    {user && (user.role === "admin" || (roleHasPage(user.role, "projects") && onTeam(open.project, user.id, board.today))) ? (
                      <Link href={`/projects/${open.projectId}/details#documents`} className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100">
                        <Icon icon={ExternalLink} size={14} />
                        Open project
                      </Link>
                    ) : null}
                  </div>
                  <div>
                    <p className="ref-code text-xs text-slate-500">{open.code}</p>
                    <h2 className="text-base font-medium text-slate-900">{open.name}</h2>
                    {open.clientName ? <p className="text-xs text-slate-500">{open.clientName}</p> : null}
                  </div>
                  <ProjectDocuments p={open.project} isAdmin={user?.role === "admin"} suggestFirst title="Documents" />
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-slate-300 px-6 py-16 text-center text-sm text-slate-500">Choose a project to see its documents and upload.</div>
              )}
            </section>
          </div>
        </div>
      )}
      {upload && uploadRow ? <QuickUpload p={uploadRow.project} slot={upload.slot} onClose={() => setUpload(null)} /> : null}
    </PageContainer>
  );
}
