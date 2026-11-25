"use client";

import { useRef, useState } from "react";
import { Button, Card, NumberField, Select, TextArea, TextField } from "@/components/ui/fields";
import { ATTACHMENT_ACCEPT, BUILDING_TYPES, CONTACT_ROLES, LEAD_SOURCES, MAX_ATTACHMENT_BYTES, SCOPES, labelOf } from "@/lib/crm/config";
import { useUsers } from "@/lib/crm/hooks";
import { validateEnquiry } from "@/lib/crm/rules";
import type { Attachment, Client, EnquiryInput } from "@/lib/crm/types";
import { formatBytes, todayLocalIso } from "@/lib/format";
import { FileLink } from "@/components/files/Files";
import { uploadFile } from "@/lib/files";
import { ErrorList } from "./ui";
import { Paperclip } from "lucide-react";
import { Icon } from "@/components/ui/icons";

export type PendingFile = Pick<Attachment, "name" | "type" | "size" | "url" | "fileId">;

export function emptyEnquiryInput(client: Client, assignedTo = ""): EnquiryInput {
  return {
    clientId: client.id,
    contactId: (client.contacts.find((c) => c.primary) ?? client.contacts[0])?.id ?? "",
    enquiryDate: todayLocalIso(),
    projectName: "",
    siteLocation: "",
    buildingType: "",
    buildingTypeOther: "",
    scope: "",
    scopeOther: "",
    size: { length: null, width: null, height: null, areaSqft: null },
    description: "",
    leadSource: "",
    leadSourceOther: "",
    assignedTo,
    expectedDecisionDate: "",
    notes: "",
  };
}

/** Stores the file (photos are shrunk first) and returns the reference to attach. */
async function readFile(file: File): Promise<PendingFile> {
  if (file.size > MAX_ATTACHMENT_BYTES)
    throw new Error(`${file.name} is ${formatBytes(file.size)}; the limit is ${formatBytes(MAX_ATTACHMENT_BYTES)}.`);
  const m = await uploadFile(file);
  return { name: m.name, type: m.type, size: m.size, url: "", fileId: m.id };
}

/** "Add files" button that stores files (≤ 10 MB each) and reports them or the size error. */
export function AttachButton({
  onFiles,
  onError,
  disabled,
  label = "+ Add files",
}: {
  onFiles: (files: PendingFile[]) => void;
  onError: (msg: string) => void;
  disabled?: boolean;
  label?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={ref}
        type="file"
        multiple
        accept={ATTACHMENT_ACCEPT}
        className="hidden"
        aria-label="Attach files"
        onChange={async (e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          const ok: PendingFile[] = [];
          for (const f of files) {
            try {
              ok.push(await readFile(f));
            } catch (err) {
              onError(err instanceof Error ? err.message : String(err));
            }
          }
          if (ok.length) onFiles(ok);
        }}
      />
      <Button size="sm" disabled={disabled} onClick={() => ref.current?.click()}>
        {label}
      </Button>
    </>
  );
}

export function EnquiryForm({
  client,
  initial,
  onSubmit,
  submitting,
  submitLabel,
  onCancel,
  pendingFiles,
  onPendingFiles,
  existingFiles = [],
  onRemoveExisting,
}: {
  client: Client;
  initial: EnquiryInput;
  onSubmit: (input: EnquiryInput) => Promise<string[] | void>;
  submitting?: boolean;
  submitLabel: string;
  onCancel?: () => void;
  /** When given, the form shows an attachments card for files uploaded after the enquiry is created. */
  pendingFiles?: PendingFile[];
  onPendingFiles?: (files: PendingFile[]) => void;
  /** Files already on the enquiry (edit page); removal is applied when the form is saved. */
  existingFiles?: Attachment[];
  onRemoveExisting?: (attachmentId: string) => void;
}) {
  const [f, setF] = useState<EnquiryInput>(initial);
  const [issues, setIssues] = useState<string[]>([]);
  const { data: users = [] } = useUsers();
  const set = (patch: Partial<EnquiryInput>) => setF((x) => ({ ...x, ...patch }));
  const setSize = (patch: Partial<EnquiryInput["size"]>) => setF((x) => ({ ...x, size: { ...x.size, ...patch } }));

  const submit = async () => {
    const problems = validateEnquiry(f);
    setIssues(problems);
    if (problems.length) return;
    const serverIssues = await onSubmit(f);
    if (serverIssues?.length) setIssues(serverIssues);
  };

  return (
    <div className="space-y-5">
      <Card title="Contact & dates">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Select
            label="Contact person"
            value={f.contactId}
            options={client.contacts.map((c) => ({
              value: c.id,
              label: `${c.name} – ${labelOf(CONTACT_ROLES, c.role)}${c.primary ? " (primary)" : ""}`,
            }))}
            onChange={(v) => set({ contactId: v })}
          />
          <TextField label="Enquiry date" type="date" required value={f.enquiryDate} onChange={(v) => set({ enquiryDate: v })} />
          <TextField
            label="Expected decision date"
            type="date"
            value={f.expectedDecisionDate}
            onChange={(v) => set({ expectedDecisionDate: v })}
          />
        </div>
      </Card>

      <Card title="Project">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField
            label="Project / site name"
            required
            value={f.projectName}
            placeholder="e.g. Warehouse at Chakan"
            onChange={(v) => set({ projectName: v })}
          />
          <TextField
            label="Site location"
            required
            value={f.siteLocation}
            placeholder="City / district, state"
            onChange={(v) => set({ siteLocation: v })}
          />
          <Select
            label="Building type"
            value={f.buildingType}
            options={[{ value: "" as EnquiryInput["buildingType"], label: "Not specified" }, ...BUILDING_TYPES]}
            onChange={(v) => set({ buildingType: v })}
          />
          {f.buildingType === "other" ? (
            <TextField label="Other building type" required value={f.buildingTypeOther} onChange={(v) => set({ buildingTypeOther: v })} />
          ) : (
            <span className="hidden sm:block" />
          )}
          <Select
            label="Scope"
            value={f.scope}
            options={[{ value: "" as EnquiryInput["scope"], label: "Not specified" }, ...SCOPES]}
            onChange={(v) => set({ scope: v })}
          />
          {f.scope === "other" ? (
            <TextField label="Other scope" required value={f.scopeOther} onChange={(v) => set({ scopeOther: v })} />
          ) : (
            <span className="hidden sm:block" />
          )}
        </div>
        <div className="mt-4">
          <div className="mb-1 text-xs font-semibold text-slate-600">Approx. size</div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <NumberField value={f.size.length} suffix="m" placeholder="Length" onChange={(v) => setSize({ length: v })} />
            <NumberField value={f.size.width} suffix="m" placeholder="Width" onChange={(v) => setSize({ width: v })} />
            <NumberField value={f.size.height} suffix="m" placeholder="Height" onChange={(v) => setSize({ height: v })} />
            <span className="self-center text-center text-xs text-slate-400">or</span>
            <NumberField value={f.size.areaSqft} suffix="ft²" placeholder="Area" onChange={(v) => setSize({ areaSqft: v })} />
          </div>
        </div>
        <TextArea
          className="mt-4"
          label="Requirement description"
          rows={3}
          value={f.description}
          onChange={(v) => set({ description: v })}
        />
      </Card>

      <Card title="Ownership">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select
            label="Lead source for this enquiry"
            value={f.leadSource}
            options={[
              { value: "" as EnquiryInput["leadSource"], label: `Same as client (${labelOf(LEAD_SOURCES, client.leadSource)})` },
              ...LEAD_SOURCES,
            ]}
            onChange={(v) => set({ leadSource: v })}
          />
          {f.leadSource === "other" ? (
            <TextField label="Other lead source" required value={f.leadSourceOther} onChange={(v) => set({ leadSourceOther: v })} />
          ) : (
            <span className="hidden sm:block" />
          )}
          <Select
            label="Assigned to"
            hint="Employees with an active login. They get the follow-up reminders."
            value={f.assignedTo}
            options={[
              { value: "", label: "Unassigned" },
              ...users
                .filter((u) => u.assignable || u.id === initial.assignedTo)
                .map((u) => ({ value: u.id, label: u.assignable ? u.name : `${u.name} (no longer active)` })),
            ]}
            onChange={(v) => set({ assignedTo: v })}
          />
        </div>
        <TextArea className="mt-4" label="Notes" rows={2} value={f.notes} onChange={(v) => set({ notes: v })} />
      </Card>

      {pendingFiles && onPendingFiles ? (
        <Card
          title="Attachments"
          description="Client drawings, site photos, BOQ (up to 10 MB each; photos are shrunk)."
          actions={
            <AttachButton
              onFiles={(files) => onPendingFiles([...pendingFiles, ...files])}
              onError={(m) => setIssues([m])}
            />
          }
        >
          {pendingFiles.length || existingFiles.length ? (
            <ul className="space-y-1 text-sm">
              {existingFiles.map((a) => (
                <li key={a.id} className="flex items-center justify-between">
                  <span className="flex min-w-0 items-center gap-1">
                    <Icon icon={Paperclip} size={14} className="mr-1 inline-block align-[-2px]" /><FileLink file={a} /> <span className="shrink-0 text-xs text-slate-500">({formatBytes(a.size)})</span>
                  </span>
                  {onRemoveExisting ? (
                    <Button size="sm" variant="danger" onClick={() => onRemoveExisting(a.id)}>
                      Remove
                    </Button>
                  ) : null}
                </li>
              ))}
              {pendingFiles.map((p, i) => (
                <li key={`${p.name}-${i}`} className="flex items-center justify-between">
                  <span>
                    <Icon icon={Paperclip} size={14} className="mr-1 inline-block align-[-2px]" />{p.name} <span className="text-xs text-slate-500">({formatBytes(p.size)})</span>
                    {existingFiles.length || onRemoveExisting ? <span className="ml-1 text-xs text-emerald-700">new</span> : null}
                  </span>
                  <Button size="sm" variant="danger" onClick={() => onPendingFiles(pendingFiles.filter((_, j) => j !== i))}>
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-slate-500">No files attached.</p>
          )}
        </Card>
      ) : null}

      <ErrorList issues={issues} />
      <div className="flex justify-end gap-2">
        {onCancel ? <Button onClick={onCancel}>Cancel</Button> : null}
        <Button variant="primary" disabled={submitting} onClick={() => void submit()}>
          {submitting ? "Saving…" : submitLabel}
        </Button>
      </div>
    </div>
  );
}
