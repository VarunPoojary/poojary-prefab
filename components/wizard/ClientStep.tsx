"use client";

import { ClientPicker } from "@/components/crm/ClientPicker";
import { Card, TextField } from "@/components/ui/fields";
import { CONTACT_ROLES, labelOf } from "@/lib/crm/config";
import { useQuotation } from "@/lib/store";
import { SUBJECT_SUGGESTIONS } from "@/lib/templates";

export function ClientStep() {
  const { q, update } = useQuotation();
  return (
    <div className="space-y-5">
      <Card title="Client" description="Printed in the header box on the cover page.">
        <ClientPicker
          clientId={q.client.clientId}
          onPick={(c, contact) =>
            update((d) => {
              d.client.company = c.name;
              d.client.city = c.city || d.client.city;
              d.client.attentionName = contact?.name ?? "";
              d.client.attentionDesignation = contact ? labelOf(CONTACT_ROLES, contact.role) : "";
              d.client.clientId = c.id;
            })
          }
          onClear={() => update((d) => void delete d.client.clientId)}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Client company name"
            required
            value={q.client.company}
            placeholder="e.g. Thermax Ltd."
            onChange={(v) => update((d) => void (d.client.company = v))}
          />
          <TextField
            label="Client city / address line"
            required
            value={q.client.city}
            placeholder="e.g. Pune"
            onChange={(v) => update((d) => void (d.client.city = v))}
          />
          <TextField
            label="Kind attention – name"
            value={q.client.attentionName}
            placeholder="e.g. Mr. Mukesh Shukla"
            onChange={(v) => update((d) => void (d.client.attentionName = v))}
          />
          <TextField
            label="Kind attention – designation / department"
            value={q.client.attentionDesignation}
            placeholder="e.g. Contract & Const, Management"
            onChange={(v) => update((d) => void (d.client.attentionDesignation = v))}
          />
        </div>
      </Card>

      <Card title="Offer">
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField
            label="Offer No"
            required
            value={q.meta.offerNo}
            placeholder="e.g. 72"
            onChange={(v) => update((d) => void (d.meta.offerNo = v))}
          />
          <TextField
            label="Date"
            type="date"
            required
            value={q.meta.date}
            onChange={(v) => update((d) => void (d.meta.date = v))}
          />
          <TextField
            label="Revision"
            required
            value={q.meta.revision}
            onChange={(v) => update((d) => void (d.meta.revision = v))}
          />
        </div>
      </Card>

      <Card title="Project">
        <div className="grid gap-4">
          <TextField
            label="Subject"
            required
            list="subject-suggestions"
            value={q.meta.subject}
            placeholder="Start typing or pick a suggestion"
            onChange={(v) => update((d) => void (d.meta.subject = v))}
          />
          <datalist id="subject-suggestions">
            {SUBJECT_SUGGESTIONS.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Site location"
              value={q.meta.siteLocation}
              placeholder="e.g. Nagpur"
              onChange={(v) => update((d) => void (d.meta.siteLocation = v))}
            />
            <TextField
              label="Project / site name (optional)"
              value={q.meta.projectName}
              placeholder="e.g. TR Agartala Bypass Project"
              hint="Used in the title of the area-based pricing table."
              onChange={(v) => update((d) => void (d.meta.projectName = v))}
            />
          </div>
        </div>
      </Card>
    </div>
  );
}
