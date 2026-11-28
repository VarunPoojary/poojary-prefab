"use client";

import { useRef, useState } from "react";
import { FileLink } from "@/components/files/Files";
import { openFile, uploadFile } from "@/lib/files";
import { ErrorList, useUserName } from "@/components/crm/ui";
import { useToast } from "@/components/Providers";
import { Button, Card, Select } from "@/components/ui/fields";
import { labelOf } from "@/lib/crm/config";
import { DOCUMENT_ACCEPT, DOCUMENT_SLOTS, DOCUMENT_TYPES, MAX_DOCUMENT_BYTES } from "@/lib/employees/config";
import { useAddDocument, useRemoveDocument } from "@/lib/employees/hooks";
import type { NewDocument } from "@/lib/employees/repository";
import type { DocumentSlot, Employee } from "@/lib/employees/types";
import { formatBytes, formatDate } from "@/lib/format";
import { FileText, Upload } from "lucide-react";
import { Icon } from "@/components/ui/icons";

async function readDocument(file: File, slot: DocumentSlot): Promise<NewDocument> {
  if (!DOCUMENT_TYPES.includes(file.type)) throw new Error(`${file.name}: only PDF, JPG or PNG files are allowed.`);
  if (file.size > MAX_DOCUMENT_BYTES) throw new Error(`${file.name} is ${formatBytes(file.size)}; the limit is ${formatBytes(MAX_DOCUMENT_BYTES)}.`);
  const m = await uploadFile(file);
  return { slot, name: m.name, type: m.type, size: m.size, url: "", fileId: m.id };
}

/** Document type picker + "Upload" button. */
function Uploader({ onDocs, onError, disabled }: { onDocs: (d: NewDocument[]) => void; onError: (m: string) => void; disabled?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  const [slot, setSlot] = useState<DocumentSlot>("id_proof");
  return (
    <div className="flex flex-wrap items-end gap-2">
      <Select label="Document type" value={slot} onChange={setSlot} options={DOCUMENT_SLOTS} />
      <input
        ref={ref}
        type="file"
        multiple
        accept={DOCUMENT_ACCEPT}
        className="hidden"
        aria-label="Upload documents"
        onChange={async (e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          const ok: NewDocument[] = [];
          for (const f of files) {
            try {
              ok.push(await readDocument(f, slot));
            } catch (err) {
              onError(err instanceof Error ? err.message : String(err));
            }
          }
          if (ok.length) onDocs(ok);
        }}
      />
      <Button disabled={disabled} onClick={() => ref.current?.click()}>
        <Icon icon={Upload} size={14} className="mr-1 inline-block align-[-2px]" />Upload
      </Button>
    </div>
  );
}

const DESCRIPTION = "ID proof, address proof, offer letter, certificates. PDF, JPG or PNG up to 10 MB each.";

/** Documents chosen on the "Add employee" form; saved together with the employee. */
export function PendingDocuments({ docs, onChange }: { docs: NewDocument[]; onChange: (d: NewDocument[]) => void }) {
  const [issues, setIssues] = useState<string[]>([]);
  return (
    <Card title="Documents" description={DESCRIPTION}>
      <Uploader
        onDocs={(d) => {
          setIssues([]);
          onChange([...docs, ...d]);
        }}
        onError={(m) => setIssues((x) => [...x, m])}
      />
      <ul className="mt-4 divide-y divide-slate-100 text-sm">
        {docs.map((d, i) => (
          <li key={`${d.name}-${i}`} className="flex items-center justify-between py-2">
            <span>
              <Icon icon={FileText} size={14} className="mr-1 inline-block align-[-2px]" />{d.name} <span className="text-xs text-slate-500">· {labelOf(DOCUMENT_SLOTS, d.slot)} · {formatBytes(d.size)}</span>
            </span>
            <Button size="sm" variant="danger" onClick={() => onChange(docs.filter((_, j) => j !== i))}>
              Remove
            </Button>
          </li>
        ))}
      </ul>
      {!docs.length ? <p className="mt-2 text-xs text-slate-500">No documents yet.</p> : null}
      <ErrorList issues={issues} />
    </Card>
  );
}

/** Documents of a saved employee: upload and remove take effect at once. */
export function DocumentsEditor({ employee, readOnly }: { employee: Employee; readOnly?: boolean }) {
  const toast = useToast();
  const add = useAddDocument();
  const remove = useRemoveDocument();
  const userName = useUserName();
  const [issues, setIssues] = useState<string[]>([]);
  return (
    <Card
      title="Documents"
      description={readOnly ? undefined : DESCRIPTION}
      actions={
        readOnly ? undefined : (
          <Uploader
            disabled={add.isPending}
            onError={(m) => setIssues((x) => [...x, m])}
            onDocs={async (docs) => {
              setIssues([]);
              for (const doc of docs) {
                try {
                  await add.mutateAsync({ id: employee.id, doc });
                } catch (err) {
                  setIssues((x) => [...x, err instanceof Error ? err.message : String(err)]);
                }
              }
              toast(docs.length === 1 ? "Document uploaded." : `${docs.length} documents uploaded.`);
            }}
          />
        )
      }
    >
      {employee.documents.length ? (
        <ul className="divide-y divide-slate-100 text-sm">
          {employee.documents.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <div className="min-w-0">
                <span className="flex items-center gap-1 font-medium text-slate-900">
                  <Icon icon={FileText} size={14} className="mr-1 inline-block align-[-2px]" /><FileLink file={d} />
                </span>
                <div className="text-xs text-slate-500">
                  {labelOf(DOCUMENT_SLOTS, d.slot)} · {formatBytes(d.size)} · {formatDate(d.uploadedAt)} by {userName(d.uploadedBy)}
                </div>
              </div>
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" onClick={() => void openFile(d).catch((e: Error) => toast(e.message, "error"))}>
                  View
                </Button>
                {!readOnly ? (
                  <Button
                    size="sm"
                    variant="danger"
                    disabled={remove.isPending}
                    onClick={() => {
                      if (!window.confirm(`Remove ${d.name}?`)) return;
                      remove.mutate(
                        { id: employee.id, documentId: d.id },
                        { onSuccess: () => toast("Document removed."), onError: (e) => toast(e.message, "error") },
                      );
                    }}
                  >
                    Remove
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-slate-500">No documents uploaded.</p>
      )}
      <ErrorList issues={issues} />
    </Card>
  );
}
