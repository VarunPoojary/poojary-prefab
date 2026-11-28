import { addDays, stagePct } from "@/lib/projects/rules";
import type { ListItem, Project, ProjectDocument, ProjectStatus } from "@/lib/projects/types";

/* Design screen: every open project with its documents, what is missing, and the latest upload. Pure, for tests. */

export interface DesignRow {
  project: Project;
  projectId: string;
  code: string;
  name: string;
  clientName: string;
  status: ProjectStatus;
  projectManagerId: string;
  /** Progress of the Design stage, null when the stage is not used on this project. */
  designPct: number | null;
  /** Required document types (Settings → Lists) with no current document. */
  missing: ListItem[];
  /** Current (not superseded) uploaded files. */
  currentFiles: number;
  lastUpload: ProjectDocument | null;
}

export interface DesignBoard {
  rows: DesignRow[];
  summary: { open: number; onHold: number; missingRequired: number; uploadsThisWeek: number };
  today: string;
}

export function buildDesignBoard(input: { projects: Project[]; clientNames: Record<string, string>; types: ListItem[]; today: string }): DesignBoard {
  const required = input.types.filter((t) => t.required && !t.archived);
  const weekAgo = addDays(input.today, -6);
  let uploadsThisWeek = 0;
  const rows = input.projects
    .filter((p) => p.status === "active" || p.status === "on_hold")
    .map((p): DesignRow => {
      const docs = p.documents ?? [];
      const current = docs.filter((d) => !d.supersededBy);
      const uploads = docs.filter((d) => d.kind !== "quotation" && d.source !== "enquiry").sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
      uploadsThisWeek += uploads.filter((d) => d.uploadedAt.slice(0, 10) >= weekAgo).length;
      const design = p.stages.find((s) => s.key === "design");
      return {
        project: p,
        projectId: p.id,
        code: p.code,
        name: p.name,
        clientName: input.clientNames[p.clientId] ?? "",
        status: p.status,
        projectManagerId: p.projectManagerId,
        designPct: design && !design.notApplicable && design.tasks.length ? stagePct(design) : null,
        missing: required.filter((t) => !current.some((d) => d.slot === t.value)),
        currentFiles: current.filter((d) => d.kind !== "quotation").length,
        lastUpload: uploads[0] ?? null,
      };
    })
    // Most missing first, then the project that has gone longest without an upload.
    .sort((a, b) => b.missing.length - a.missing.length || (a.lastUpload?.uploadedAt ?? "").localeCompare(b.lastUpload?.uploadedAt ?? "") || a.code.localeCompare(b.code));
  return {
    rows,
    summary: {
      open: rows.filter((r) => r.status === "active").length,
      onHold: rows.filter((r) => r.status === "on_hold").length,
      missingRequired: rows.filter((r) => r.missing.length).length,
      uploadsThisWeek,
    },
    today: input.today,
  };
}
