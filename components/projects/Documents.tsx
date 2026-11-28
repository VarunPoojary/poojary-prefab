"use client";

import { CheckCircle2, ChevronDown, ChevronUp, CircleAlert, Download, ExternalLink, FileText, Image as ImageIcon, PencilRuler, Plus, Upload, X } from "lucide-react";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { ErrorList, useUserName } from "@/components/crm/ui";
import { FileLink } from "@/components/files/Files";
import { useToast } from "@/components/Providers";
import { Button, Card, Select, TextField } from "@/components/ui/fields";
import { Icon, type LucideIcon } from "@/components/ui/icons";
import { Modal } from "@/components/ui/overlays";
import { useAuth } from "@/lib/auth/AuthProvider";
import { roleHasPage } from "@/lib/auth/roles";
import { quotationRepo } from "@/lib/data";
import { fileStore, uploadFile } from "@/lib/files";
import { formatBytes, formatDate } from "@/lib/format";
import { projectRepo } from "@/lib/projects";
import { MAX_PROJECT_DOC_BYTES, PROJECT_DOC_ACCEPT, PROJECT_DOC_EXTENSIONS, QUOTATION_DOC_TYPE } from "@/lib/projects/config";
import { useProjectMutation } from "@/lib/projects/hooks";
import { isSiteManager, nextRevision, todayIso } from "@/lib/projects/rules";
import type { ListItem, NewProjectDocument, Project, ProjectDocument } from "@/lib/projects/types";
import { useSettings } from "@/lib/settings/hooks";
import { defaultFileName } from "@/lib/template";

const extOf = (name: string) => name.split(".").pop()?.toLowerCase() ?? "";
const isAllowed = (name: string) => PROJECT_DOC_EXTENSIONS.includes(extOf(name));
const iconFor = (d: ProjectDocument): LucideIcon => (d.type.startsWith("image/") ? ImageIcon : ["dwg", "dxf"].includes(extOf(d.name)) ? PencilRuler : FileText);
const baseName = (n: string) => n.replace(/\.[^.]+$/, "").toLowerCase();

/** Who may upload: Admin always; the PM and site engineers on the team, and roles with the Design page, while the project is active or on hold. */
export function useCanUploadDocuments(p: Project) {
  const { user } = useAuth();
  const [today] = useState(() => todayIso());
  if (!user) return false;
  if (user.role === "admin") return true;
  return (p.status === "active" || p.status === "on_hold") && (isSiteManager(p, user.id, today) || roleHasPage(user.role, "design"));
}

/** Types a user may upload to: all active ones; the Quotation type only for Admin and the project's site managers. */
export function useUploadTypes(p: Project): ListItem[] {
  const { user } = useAuth();
  const { data: settings } = useSettings();
  const [today] = useState(() => todayIso());
  const active = (settings?.lists.documentTypes ?? []).filter((t) => !t.archived);
  const manager = !!user && (user.role === "admin" || isSiteManager(p, user.id, today));
  return manager ? active : active.filter((t) => t.value !== QUOTATION_DOC_TYPE);
}

/* ---------- upload dialog ---------- */

type Chosen = { key: string; file: File; status: "ready" | "uploading" | "stored" | "failed"; error?: string; meta?: { id: string; name: string; type: string; size: number } };

const MAX_MB = MAX_PROJECT_DOC_BYTES / 1024 / 1024;
/** Files stored at the same time. */
const PARALLEL = 3;

/**
 * Add one or more documents of one type. Files are stored first (several at a time), then added to the project in one
 * change, so the team gets one notice. Files that fail stay listed for another try; stored ones are not sent again.
 * `suggestFirst`: offer R0 when the type has no document yet (the Design screen, where most uploads are drawings).
 */
export function UploadDialog({ p, types, initialType, onClose, suggestFirst = false }: { p: Project; types: ListItem[]; initialType: string; onClose: () => void; suggestFirst?: boolean }) {
  const toast = useToast();
  const add = useProjectMutation((items: { doc: NewProjectDocument; replaces?: string }[]) => projectRepo.addDocuments(p.id, items));
  const [slot, setSlot] = useState(initialType);
  const [chosen, setChosen] = useState<Chosen[]>([]);
  const [revision, setRevision] = useState<string | null>(null);
  const [replaces, setReplaces] = useState("");
  const [issues, setIssues] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const current = p.documents.filter((d) => d.slot === slot && !d.supersededBy && d.kind !== "quotation").sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
  const single = chosen.length === 1;
  const replacing = single && replaces ? current.find((d) => d.id === replaces) : undefined;
  // The next revision after the document being replaced, or the latest of this type. The user's own entry wins.
  const base = replacing ?? current[0];
  const suggested = base ? (base.revision ? nextRevision(base.revision) : "") : suggestFirst ? nextRevision("") : "";
  const rev = revision ?? suggested;

  const pick = (list: File[]) => {
    const bad = list.filter((f) => !isAllowed(f.name));
    const big = list.filter((f) => isAllowed(f.name) && f.size > MAX_PROJECT_DOC_BYTES);
    setIssues([
      ...(bad.length ? [`Not added (only PDF, photos and DWG/DXF): ${bad.map((f) => f.name).join(", ")}`] : []),
      ...(big.length ? [`Larger than ${MAX_MB} MB: ${big.map((f) => `${f.name} (${formatBytes(f.size)})`).join(", ")}`] : []),
    ]);
    const ok = list.filter((f) => isAllowed(f.name) && f.size <= MAX_PROJECT_DOC_BYTES);
    const next = [...chosen];
    for (const f of ok) if (!next.some((c) => c.file.name === f.name && c.file.size === f.size)) next.push({ key: `${f.name}:${f.size}:${f.lastModified}`, file: f, status: "ready" });
    setChosen(next);
    // A single file with the same name as a current document of this type is most likely its new version.
    const same = next.length === 1 ? current.find((d) => baseName(d.name) === baseName(next[0].file.name)) : undefined;
    setReplaces(same?.id ?? "");
  };

  const patch = (key: string, v: Partial<Chosen>) => setChosen((list) => list.map((c) => (c.key === key ? { ...c, ...v } : c)));

  const submit = async () => {
    if (!chosen.length) return setIssues(["Choose at least one file."]);
    setBusy(true);
    setIssues([]);
    // 1. Store the files not stored yet, a few at a time.
    const stored = new Map(chosen.filter((c) => c.meta).map((c) => [c.key, c.meta!]));
    const queue = chosen.filter((c) => !c.meta);
    const worker = async () => {
      for (let c = queue.shift(); c; c = queue.shift()) {
        patch(c.key, { status: "uploading", error: undefined });
        try {
          const m = await uploadFile(c.file, { maxBytes: MAX_PROJECT_DOC_BYTES });
          const meta = { id: m.id, name: m.name, type: m.type, size: m.size };
          stored.set(c.key, meta);
          patch(c.key, { status: "stored", meta });
        } catch (e) {
          patch(c.key, { status: "failed", error: e instanceof Error ? e.message : String(e) });
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(PARALLEL, queue.length) }, worker));
    const ready = chosen.filter((c) => stored.has(c.key));
    // 2. Add every stored file to the project in one change.
    if (ready.length) {
      try {
        await add.mutateAsync(
          ready.map((c) => {
            const m = stored.get(c.key)!;
            return { doc: { slot, fileId: m.id, name: m.name, type: m.type, size: m.size, revision: rev }, replaces: single && replaces ? replaces : undefined };
          }),
        );
        const left = chosen.filter((c) => !stored.has(c.key));
        setChosen((list) => list.filter((c) => !stored.has(c.key)));
        toast(`${ready.length} document${ready.length === 1 ? "" : "s"} added to ${p.code}`);
        if (!left.length) {
          setBusy(false);
          return onClose();
        }
        setIssues([`${left.length} file${left.length === 1 ? "" : "s"} could not be uploaded. Try again, or remove ${left.length === 1 ? "it" : "them"}.`]);
      } catch (e) {
        // The files are stored; trying again only adds them to the project.
        setIssues([e instanceof Error ? e.message : String(e)]);
      }
    }
    setBusy(false);
  };

  const failed = chosen.some((c) => c.status === "failed");

  return (
    <Modal
      open
      onClose={busy ? () => undefined : onClose}
      title={`Add documents · ${p.code}`}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" disabled={busy || !chosen.length} onClick={() => void submit()}>
            <Icon icon={Upload} />
            {busy ? "Uploading…" : failed ? "Try again" : `Upload${chosen.length > 1 ? ` ${chosen.length} files` : ""}`}
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
            setRevision(null);
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
            if (!busy) pick(Array.from(e.dataTransfer.files));
          }}
          className={`rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors ${over ? "border-red-700 bg-red-50" : "border-slate-300 bg-slate-50"}`}
          data-testid="drop-zone"
        >
          <input ref={input} type="file" multiple accept={PROJECT_DOC_ACCEPT} className="hidden" aria-label="Choose documents" onChange={(e) => (pick(Array.from(e.target.files ?? [])), (e.target.value = ""))} />
          <Button onClick={() => input.current?.click()} disabled={busy}>
            <Icon icon={Plus} />
            {chosen.length ? "Add more files" : "Choose files"}
          </Button>
          <p className="mt-2 hidden text-xs text-slate-500 sm:block">or drop them here</p>
          <p className="mt-1 text-xs text-slate-500">PDF, photos (JPG, PNG, WebP, HEIC) or CAD drawings (DWG, DXF), up to {MAX_MB} MB each</p>
        </div>
        {chosen.length ? (
          <ul className="divide-y divide-slate-100 text-sm" data-testid="chosen-files">
            {chosen.map((c) => (
              <li key={c.key} className="flex items-center justify-between gap-3 py-1.5">
                <span className="min-w-0">
                  <span className="block truncate text-slate-900">{c.file.name}</span>
                  {c.error ? <span className="block text-xs text-red-700">{c.error}</span> : null}
                </span>
                <span className="flex shrink-0 items-center gap-2 text-xs text-slate-500">
                  {c.status === "uploading" ? <span className="text-slate-700">Uploading…</span> : c.status === "stored" ? <Icon icon={CheckCircle2} size={14} className="text-emerald-700" /> : c.status === "failed" ? <Icon icon={CircleAlert} size={14} className="text-red-700" /> : null}
                  {formatBytes(c.file.size)}
                  {!busy ? (
                    <button
                      type="button"
                      aria-label={`Remove ${c.file.name}`}
                      onClick={() => setChosen((list) => list.filter((x) => x.key !== c.key))}
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                    >
                      <Icon icon={X} size={14} />
                    </button>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <TextField
            label="Revision (optional)"
            value={rev}
            onChange={setRevision}
            placeholder="e.g. R2"
            hint={base?.revision && revision === null && rev ? `Latest is ${base.revision}` : undefined}
          />
          {current.length ? (
            <div>
              <Select
                label="Replaces (older version)"
                value={single ? replaces : ""}
                onChange={(v) => {
                  setReplaces(v);
                  setRevision(null);
                }}
                options={[{ value: "", label: "Nothing – new document" }, ...current.map((d) => ({ value: d.id, label: `${d.name}${d.revision ? ` (${d.revision})` : ""}` }))]}
              />
              {chosen.length > 1 ? <p className="mt-1 text-xs text-slate-500">Upload one file at a time to replace a document.</p> : null}
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
export function ProjectDocuments({ p, isAdmin, suggestFirst = false, title = "E. Documents" }: { p: Project; isAdmin: boolean; suggestFirst?: boolean; title?: string }) {
  const { data: settings } = useSettings();
  const canUpload = useCanUploadDocuments(p);
  const uploadTypes = useUploadTypes(p);
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
      title={title}
      description="Grouped by type. Types and which are required are set by Admin in Settings → Lists → Document types."
      actions={
        canUpload && uploadTypes.length ? (
          <Button onClick={() => setUploadType(uploadTypes.find((t) => !hasCurrent(t.value) && t.required)?.value ?? uploadTypes[0].value)}>
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
                canUpload={canUpload && uploadTypes.some((t) => t.value === g.value)}
                onAdd={() => setUploadType(g.value)}
              />
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-500">No documents yet.</p>
        )}
      </div>
      {uploadType ? <UploadDialog p={p} types={uploadTypes} initialType={uploadType} suggestFirst={suggestFirst} onClose={() => setUploadType(null)} /> : null}
    </Card>
  );
}
