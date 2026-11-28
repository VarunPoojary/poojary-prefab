"use client";

import { CheckCircle2, ChevronDown, ChevronUp, CircleAlert, Download, ExternalLink, FileText, Image as ImageIcon, PencilRuler, Plus, Upload } from "lucide-react";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { ErrorList, useUserName } from "@/components/crm/ui";
import { FileLink } from "@/components/files/Files";
import { useToast } from "@/components/Providers";
import { Button, Card, Select, TextField } from "@/components/ui/fields";
import { Icon, type LucideIcon } from "@/components/ui/icons";
import { Modal } from "@/components/ui/overlays";
import { useAuth } from "@/lib/auth/AuthProvider";
import { quotationRepo } from "@/lib/data";
import { fileStore, uploadFile } from "@/lib/files";
import { formatBytes, formatDate } from "@/lib/format";
import { projectRepo } from "@/lib/projects";
import { PROJECT_DOC_ACCEPT, PROJECT_DOC_EXTENSIONS } from "@/lib/projects/config";
import { useProjectMutation } from "@/lib/projects/hooks";
import { isSiteManager, todayIso } from "@/lib/projects/rules";
import type { ListItem, Project, ProjectDocument } from "@/lib/projects/types";
import { useSettings } from "@/lib/settings/hooks";
import { defaultFileName } from "@/lib/template";

const extOf = (name: string) => name.split(".").pop()?.toLowerCase() ?? "";
const isAllowed = (name: string) => PROJECT_DOC_EXTENSIONS.includes(extOf(name));
const iconFor = (d: ProjectDocument): LucideIcon => (d.type.startsWith("image/") ? ImageIcon : ["dwg", "dxf"].includes(extOf(d.name)) ? PencilRuler : FileText);
const baseName = (n: string) => n.replace(/\.[^.]+$/, "").toLowerCase();

/** Who may upload: Admin always; the PM and site engineers on the team while the project is active or on hold. */
export function useCanUploadDocuments(p: Project) {
  const { user } = useAuth();
  const [today] = useState(() => todayIso());
  if (!user) return false;
  if (user.role === "admin") return true;
  return (p.status === "active" || p.status === "on_hold") && isSiteManager(p, user.id, today);
}

/* ---------- upload dialog ---------- */

function UploadDialog({ p, types, initialType, onClose }: { p: Project; types: ListItem[]; initialType: string; onClose: () => void }) {
  const toast = useToast();
  const add = useProjectMutation(({ doc, replaces }: { doc: Parameters<typeof projectRepo.addDocument>[1]; replaces?: string }) => projectRepo.addDocument(p.id, doc, { replaces }));
  const [slot, setSlot] = useState(initialType);
  const [files, setFiles] = useState<File[]>([]);
  const [revision, setRevision] = useState("");
  const [replaces, setReplaces] = useState("");
  const [issues, setIssues] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const current = p.documents.filter((d) => d.slot === slot && !d.supersededBy && d.kind !== "quotation");
  const pick = (list: File[]) => {
    const bad = list.filter((f) => !isAllowed(f.name));
    setIssues(bad.length ? [`Not added (only PDF, photos and DWG/DXF): ${bad.map((f) => f.name).join(", ")}`] : []);
    const ok = list.filter((f) => isAllowed(f.name));
    setFiles(ok);
    // A single file with the same name as a current document of this type is most likely its new version.
    const same = ok.length === 1 ? current.find((d) => baseName(d.name) === baseName(ok[0].name)) : undefined;
    setReplaces(same?.id ?? "");
  };

  const submit = async () => {
    if (!files.length) return setIssues(["Choose at least one file."]);
    setBusy(true);
    const errors: string[] = [];
    let done = 0;
    for (const f of files) {
      try {
        const m = await uploadFile(f);
        await add.mutateAsync({ doc: { slot, fileId: m.id, name: m.name, type: m.type, size: m.size, revision }, replaces: files.length === 1 && replaces ? replaces : undefined });
        done += 1;
      } catch (e) {
        errors.push(`${f.name}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    setBusy(false);
    if (done) toast(`${done} document${done === 1 ? "" : "s"} added`);
    if (errors.length) setIssues(errors);
    else onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Add documents"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={busy || !files.length} onClick={() => void submit()}>
            <Icon icon={Upload} />
            {busy ? "Uploading…" : `Upload${files.length > 1 ? ` ${files.length} files` : ""}`}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Select
          label="Document type"
          value={slot}
          onChange={(v) => {
            setSlot(v);
            setReplaces("");
          }}
          options={types.map((t) => ({ value: t.value, label: t.label }))}
        />
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            pick(Array.from(e.dataTransfer.files));
          }}
          className={`rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors ${over ? "border-red-700 bg-red-50" : "border-slate-300 bg-slate-50"}`}
        >
          <input ref={input} type="file" multiple accept={PROJECT_DOC_ACCEPT} className="hidden" aria-label="Choose documents" onChange={(e) => (pick(Array.from(e.target.files ?? [])), (e.target.value = ""))} />
          <Button onClick={() => input.current?.click()}>
            <Icon icon={Plus} />
            Choose files
          </Button>
          <p className="mt-2 hidden text-xs text-slate-500 sm:block">or drop them here</p>
          <p className="mt-1 text-xs text-slate-500">PDF, photos (JPG, PNG, WebP, HEIC) or CAD drawings (DWG, DXF), up to 10 MB each</p>
        </div>
        {files.length ? (
          <ul className="space-y-1 text-sm" data-testid="chosen-files">
            {files.map((f) => (
              <li key={f.name} className="flex items-center justify-between gap-3">
                <span className="min-w-0 truncate text-slate-900">{f.name}</span>
                <span className="shrink-0 text-xs text-slate-500">{formatBytes(f.size)}</span>
              </li>
            ))}
          </ul>
        ) : null}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <TextField label="Revision (optional)" value={revision} onChange={setRevision} placeholder="e.g. R2" />
          {current.length ? (
            <div>
              <Select
                label="Replaces (older version)"
                value={files.length > 1 ? "" : replaces}
                onChange={setReplaces}
                options={[{ value: "", label: "Nothing – new document" }, ...current.map((d) => ({ value: d.id, label: `${d.name}${d.revision ? ` (${d.revision})` : ""}` }))]}
              />
              {files.length > 1 ? <p className="mt-1 text-xs text-slate-500">Upload one file at a time to replace a document.</p> : null}
            </div>
          ) : null}
        </div>
        <ErrorList issues={issues} />
      </div>
    </Modal>
  );
}

/* ---------- rows ---------- */

function QuotationRow({ d }: { d: ProjectDocument }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const download = async () => {
    setBusy(true);
    try {
      const record = await quotationRepo.get(d.quotationId!);
      const { downloadQuotation } = await import("@/components/pdf/PdfPreview");
      await downloadQuotation(record.data, record.data.fileName || defaultFileName(record.data));
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <span className="min-w-0">
        <span className="flex items-center gap-2 font-medium text-slate-900">
          <Icon icon={FileText} size={14} className="text-slate-500" />
          {d.name}
        </span>
        <span className="block text-xs text-slate-500">Linked quotation · PDF made when you download it</span>
      </span>
      <span className="flex shrink-0 flex-wrap gap-1">
        <Link href={`/quotations/${d.quotationId}`} className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100">
          <Icon icon={ExternalLink} size={14} />
          Open
        </Link>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => void download()}>
          <Icon icon={Download} size={14} />
          {busy ? "Preparing…" : "PDF"}
        </Button>
      </span>
    </>
  );
}

function DocRow({ d, p, isAdmin, older }: { d: ProjectDocument; p: Project; isAdmin: boolean; older?: boolean }) {
  const userName = useUserName();
  const remove = useProjectMutation((docId: string) => projectRepo.removeDocument(p.id, docId));
  return (
    <li className={`flex flex-wrap items-start justify-between gap-2 py-2.5 ${older ? "opacity-60" : ""}`} data-testid="doc-row">
      {d.kind === "quotation" ? (
        <QuotationRow d={d} />
      ) : (
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-2 font-medium">
            <Icon icon={iconFor(d)} size={14} className="text-slate-500" />
            <FileLink file={d} className="min-w-0" />
            {d.revision ? <span className="ref-code shrink-0 rounded-md bg-slate-100 px-1.5 text-xs text-slate-700">{d.revision}</span> : null}
            {older ? <span className="shrink-0 text-xs text-slate-500">older version</span> : null}
          </span>
          <span className="block text-xs text-slate-500">
            {formatBytes(d.size)} · {formatDate(d.uploadedAt.slice(0, 10))} · {d.source === "enquiry" ? "from the enquiry" : userName(d.uploadedBy)}
          </span>
        </span>
      )}
      {isAdmin ? (
        <Button
          size="sm"
          variant="danger"
          onClick={() => {
            if (!window.confirm(`Remove ${d.name}?`)) return;
            remove.mutate(d.id, {
              onSuccess: () => {
                // Keep the stored file when it isn't ours alone: quotation links have none, enquiry files belong to the enquiry.
                const shared = d.kind === "quotation" || d.source === "enquiry" || p.documents.some((x) => x.id !== d.id && x.fileId === d.fileId);
                if (!shared && d.fileId) void fileStore.remove(d.fileId).catch(() => undefined);
              },
            });
          }}
        >
          Remove
        </Button>
      ) : null}
    </li>
  );
}

function Group({ label, docs, p, isAdmin, canUpload, required, onAdd }: { label: string; docs: ProjectDocument[]; p: Project; isAdmin: boolean; canUpload: boolean; required: boolean; onAdd: () => void }) {
  const [showOld, setShowOld] = useState(false);
  const current = docs.filter((d) => !d.supersededBy).sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
  const older = docs.filter((d) => d.supersededBy).sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
  return (
    <section className="py-3 first:pt-0 last:pb-0" data-testid="doc-group">
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-sm font-medium text-slate-900">
          {label}
          <span className="ml-1.5 font-normal text-slate-500">
            · {current.length ? `${current.length} file${current.length === 1 ? "" : "s"}` : required ? <span className="text-red-700">missing</span> : "none"}
          </span>
        </h4>
        {canUpload ? (
          <Button size="sm" variant="ghost" onClick={onAdd}>
            <Icon icon={Plus} size={14} />
            Add
          </Button>
        ) : null}
      </div>
      {current.length ? (
        <ul className="divide-y divide-slate-100 text-sm">
          {current.map((d) => (
            <DocRow key={d.id} d={d} p={p} isAdmin={isAdmin} />
          ))}
        </ul>
      ) : null}
      {older.length ? (
        <>
          <button type="button" onClick={() => setShowOld((v) => !v)} className="mt-1 inline-flex h-8 items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900">
            <Icon icon={showOld ? ChevronUp : ChevronDown} size={14} />
            {showOld ? "Hide" : "Show"} {older.length} older version{older.length === 1 ? "" : "s"}
          </button>
          {showOld ? (
            <ul className="divide-y divide-slate-100 text-sm">
              {older.map((d) => (
                <DocRow key={d.id} d={d} p={p} isAdmin={isAdmin} older />
              ))}
            </ul>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

/* ---------- section ---------- */

/** Details tab → E. Documents: required-documents checklist, documents grouped by type (Settings → Lists), uploads. */
export function ProjectDocuments({ p, isAdmin }: { p: Project; isAdmin: boolean }) {
  const { data: settings } = useSettings();
  const canUpload = useCanUploadDocuments(p);
  const [uploadType, setUploadType] = useState<string | null>(null);
  const all = useMemo(() => settings?.lists.documentTypes ?? [], [settings]);
  const active = all.filter((t) => !t.archived);
  const hasCurrent = (slot: string) => p.documents.some((d) => d.slot === slot && !d.supersededBy);
  const required = active.filter((t) => t.required);
  const missing = required.filter((t) => !hasCurrent(t.value));

  // Groups in Settings order: types with documents, plus required ones that are missing. Unknown types go last.
  const known = new Set(all.map((t) => t.value));
  const groups = [
    ...all.filter((t) => p.documents.some((d) => d.slot === t.value) || (t.required && !t.archived)).map((t) => ({ value: t.value, label: t.label, required: !!t.required && !t.archived })),
    ...[...new Set(p.documents.filter((d) => !known.has(d.slot)).map((d) => d.slot))].map((v) => ({ value: v, label: v, required: false })),
  ];

  return (
    <Card
      title="E. Documents"
      description="Grouped by type. Types and which are required are set by Admin in Settings → Lists → Document types."
      actions={
        canUpload && active.length ? (
          <Button onClick={() => setUploadType(active.find((t) => !hasCurrent(t.value) && t.required)?.value ?? active[0].value)}>
            <Icon icon={Upload} />
            Upload
          </Button>
        ) : null
      }
    >
      <div id="documents" className="space-y-4">
        {required.length ? (
          <div className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg px-3 py-2 text-xs ${missing.length ? "bg-red-50" : "bg-emerald-50"}`} data-testid="doc-checklist">
            <span className="font-medium text-slate-700">Required:</span>
            {required.map((t) => {
              const ok = hasCurrent(t.value);
              return (
                <span key={t.value} className={`inline-flex items-center gap-1 ${ok ? "text-emerald-800" : "text-red-800"}`}>
                  <Icon icon={ok ? CheckCircle2 : CircleAlert} size={14} />
                  {t.label}
                </span>
              );
            })}
          </div>
        ) : null}

        {groups.length ? (
          <div className="divide-y divide-slate-100">
            {groups.map((g) => (
              <Group
                key={g.value}
                label={g.label}
                required={g.required}
                docs={p.documents.filter((d) => d.slot === g.value)}
                p={p}
                isAdmin={isAdmin}
                canUpload={canUpload && active.some((t) => t.value === g.value)}
                onAdd={() => setUploadType(g.value)}
              />
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-500">No documents yet.</p>
        )}
      </div>
      {uploadType ? <UploadDialog p={p} types={active} initialType={uploadType} onClose={() => setUploadType(null)} /> : null}
    </Card>
  );
}
