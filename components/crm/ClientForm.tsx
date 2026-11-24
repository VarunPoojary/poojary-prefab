"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button, Card, Select, TextArea, TextField } from "@/components/ui/fields";
import { crmRepo } from "@/lib/crm";
import { CONTACT_ROLES, INDIAN_STATES, LEAD_SOURCES } from "@/lib/crm/config";
import { useCreateClient, useUpdateClient } from "@/lib/crm/hooks";
import { isValidEmail, isValidGstin, isValidPhone, validateClient } from "@/lib/crm/rules";
import type { Client, ClientInput, Contact, DuplicateMatch } from "@/lib/crm/types";
import { ErrorList, useDebounced } from "./ui";

let tmp = 0;
const newContact = (primary: boolean): Contact => ({
  id: `new_${Date.now()}_${tmp++}`,
  name: "",
  role: "owner",
  phone: "",
  email: "",
  primary,
});

export function emptyClientInput(): ClientInput {
  return {
    name: "",
    contacts: [newContact(true)],
    leadSource: "" as ClientInput["leadSource"],
    leadSourceOther: "",
    referredBy: "",
    address: "",
    city: "",
    state: "",
    gstin: "",
    notes: "",
    active: true,
  };
}

function toInput(c: Client): ClientInput {
  const { name, contacts, leadSource, leadSourceOther, referredBy, address, city, state, gstin, notes, active } = c;
  return { name, contacts, leadSource, leadSourceOther, referredBy, address, city, state, gstin, notes, active };
}

/** New contacts get temporary ids in the form; the repository assigns real ones. */
const stripTempIds = (input: ClientInput): ClientInput => ({
  ...input,
  contacts: input.contacts.map((c) => (c.id.startsWith("new_") ? { ...c, id: "" } : c)),
});

export function ClientForm({
  initial,
  onSaved,
  onCancel,
  onUseExisting,
  compact,
}: {
  initial?: Client;
  onSaved: (client: Client) => void;
  onCancel?: () => void;
  /** Offered in the duplicate warning, e.g. to select the existing client for an enquiry. */
  onUseExisting?: (clientId: string) => void;
  compact?: boolean;
}) {
  const [form, setForm] = useState<ClientInput>(() => (initial ? toInput(initial) : emptyClientInput()));
  const [issues, setIssues] = useState<string[]>([]);
  const [dupAcknowledged, setDupAcknowledged] = useState(false);
  const create = useCreateClient();
  const update = useUpdateClient();
  const saving = create.isPending || update.isPending;

  const set = (patch: Partial<ClientInput>) => setForm((f) => ({ ...f, ...patch }));
  const setContact = (i: number, patch: Partial<Contact>) =>
    setForm((f) => ({ ...f, contacts: f.contacts.map((c, j) => (j === i ? { ...c, ...patch } : c)) }));

  const dupInput = useDebounced(
    {
      name: form.name.trim(),
      phones: form.contacts.map((c) => c.phone).filter(isValidPhone),
      emails: form.contacts.map((c) => c.email).filter(isValidEmail),
    },
    400,
  );
  const { data: duplicates = [] } = useQuery({
    queryKey: ["crm", "duplicates", dupInput, initial?.id],
    queryFn: () => crmRepo.checkDuplicates(dupInput, initial?.id),
    enabled: !!(dupInput.name || dupInput.phones.length || dupInput.emails.length),
  });
  const hardDuplicates = duplicates.filter((d) => d.field !== "name");

  const submit = async () => {
    const problems = validateClient(form);
    setIssues(problems);
    if (problems.length) return;
    if (hardDuplicates.length && !dupAcknowledged) {
      setIssues(["This phone number or email already belongs to another client. Use the existing client or choose Save anyway."]);
      return;
    }
    try {
      const input = stripTempIds(form);
      const saved = initial ? await update.mutateAsync({ id: initial.id, input }) : await create.mutateAsync(input);
      onSaved(saved);
    } catch (e) {
      setIssues(e && typeof e === "object" && "issues" in e ? (e as { issues: string[] }).issues : [String(e)]);
    }
  };

  const contactsCard = (
    <Card
      title="Contact persons"
      description="At least one. The primary contact needs a phone number."
      actions={
        <Button size="sm" onClick={() => set({ contacts: [...form.contacts, newContact(form.contacts.length === 0)] })}>
          + Add contact
        </Button>
      }
    >
      <div className="space-y-3">
        {form.contacts.map((c, i) => (
          <div key={c.id} className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <TextField label="Name" required value={c.name} onChange={(v) => setContact(i, { name: v })} placeholder="e.g. Mr. Ravi Patil" />
              <Select
                label="Role"
                value={c.role}
                options={CONTACT_ROLES}
                onChange={(v) => setContact(i, { role: v })}
              />
              <TextField
                label="Phone"
                required={c.primary}
                value={c.phone}
                placeholder="10-digit mobile"
                hint={c.phone && !isValidPhone(c.phone) ? "Enter a valid 10-digit Indian mobile number." : undefined}
                onChange={(v) => setContact(i, { phone: v })}
              />
              <TextField
                label="Email"
                value={c.email}
                placeholder="name@company.com"
                hint={c.email && !isValidEmail(c.email) ? "Check the email format." : undefined}
                onChange={(v) => setContact(i, { email: v })}
              />
            </div>
            <div className="mt-2 flex items-center justify-between">
              <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                <input
                  type="radio"
                  name="primary-contact"
                  className="accent-red-700"
                  checked={c.primary}
                  onChange={() => set({ contacts: form.contacts.map((x, j) => ({ ...x, primary: j === i })) })}
                />
                Primary contact
              </label>
              <Button
                size="sm"
                variant="danger"
                disabled={form.contacts.length === 1}
                onClick={() => {
                  const rest = form.contacts.filter((_, j) => j !== i);
                  if (c.primary && rest.length) rest[0] = { ...rest[0], primary: true };
                  set({ contacts: rest });
                }}
              >
                Remove
              </Button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );

  return (
    <div className="space-y-5">
      <Card title="Company">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            className="sm:col-span-2"
            label="Client / company name"
            required
            value={form.name}
            placeholder="e.g. Kalyani Steels Ltd."
            onChange={(v) => set({ name: v })}
          />
          <Select
            label="Lead source (how they found us)"
            value={form.leadSource}
            options={[{ value: "" as ClientInput["leadSource"], label: "Select…" }, ...LEAD_SOURCES]}
            onChange={(v) => set({ leadSource: v })}
          />
          {form.leadSource === "referral" ? (
            <TextField label="Referred by" required value={form.referredBy} onChange={(v) => set({ referredBy: v })} />
          ) : form.leadSource === "other" ? (
            <TextField label="Other lead source" required value={form.leadSourceOther} onChange={(v) => set({ leadSourceOther: v })} />
          ) : (
            <span />
          )}
        </div>
      </Card>

      {contactsCard}

      {!compact || form.name ? (
        <Card title="Address & tax">
          <div className="grid gap-4 sm:grid-cols-3">
            <TextField className="sm:col-span-3" label="Company address" value={form.address} onChange={(v) => set({ address: v })} />
            <TextField label="City" value={form.city} onChange={(v) => set({ city: v })} />
            <Select
              label="State"
              value={form.state}
              options={[{ value: "", label: "Select…" }, ...INDIAN_STATES.map((s) => ({ value: s, label: s }))]}
              onChange={(v) => set({ state: v })}
            />
            <TextField
              label="GSTIN"
              value={form.gstin}
              placeholder="27AAAAA0000A1Z5"
              hint={form.gstin && !isValidGstin(form.gstin) ? "GSTIN must be 15 characters." : undefined}
              onChange={(v) => set({ gstin: v.toUpperCase() })}
            />
            <TextArea className="sm:col-span-3" label="Notes" rows={2} value={form.notes} onChange={(v) => set({ notes: v })} />
          </div>
        </Card>
      ) : null}

      <DuplicateWarning duplicates={duplicates} onUseExisting={onUseExisting} />
      <ErrorList issues={issues} />

      <div className="flex items-center justify-end gap-2">
        {onCancel ? <Button onClick={onCancel}>Cancel</Button> : null}
        {hardDuplicates.length && !dupAcknowledged ? (
          <Button
            onClick={() => {
              setDupAcknowledged(true);
              setIssues([]);
            }}
          >
            Save anyway…
          </Button>
        ) : null}
        <Button variant="primary" disabled={saving || (hardDuplicates.length > 0 && !dupAcknowledged)} onClick={() => void submit()}>
          {saving ? "Saving…" : initial ? "Save client" : "Create client"}
        </Button>
      </div>
    </div>
  );
}

function DuplicateWarning({ duplicates, onUseExisting }: { duplicates: DuplicateMatch[]; onUseExisting?: (id: string) => void }) {
  if (!duplicates.length) return null;
  const byClient = new Map<string, DuplicateMatch[]>();
  for (const d of duplicates) byClient.set(d.clientId, [...(byClient.get(d.clientId) ?? []), d]);
  return (
    <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <div className="font-semibold">Possible duplicate</div>
      <ul className="mt-1 space-y-1.5">
        {[...byClient.entries()].map(([id, matches]) => (
          <li key={id} className="flex flex-wrap items-center justify-between gap-2">
            <span>
              <b>{matches[0].clientName}</b> –{" "}
              {matches
                .map((m) => (m.field === "name" ? "similar name" : `same ${m.field} ${m.value}`))
                .filter((v, i, a) => a.indexOf(v) === i)
                .join(", ")}
            </span>
            <span className="flex gap-2">
              {onUseExisting ? (
                <Button size="sm" variant="secondary" onClick={() => onUseExisting(id)}>
                  Use existing client
                </Button>
              ) : null}
              <Link href={`/clients/${id}`} target="_blank" className="text-xs font-medium text-amber-900 underline">
                Open
              </Link>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
