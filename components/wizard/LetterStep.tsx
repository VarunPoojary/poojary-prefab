"use client";

import { Card, Select, TextArea, TextField, Toggle } from "@/components/ui/fields";
import { useQuotation } from "@/lib/store";
import { COVER_LETTER_CLOSING, COVER_LETTER_BODY, SALUTATIONS } from "@/lib/templates";

const CUSTOM = "__custom__";

export function LetterStep() {
  const { q, update } = useQuotation();
  const isPreset = SALUTATIONS.includes(q.letter.salutation);
  return (
    <div className="space-y-5">
      <Card title="Salutation" description="Used on the cover letter and at the top of the pricing page.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select
            label="Salutation"
            value={isPreset ? q.letter.salutation : CUSTOM}
            options={[...SALUTATIONS.map((s) => ({ value: s, label: s })), { value: CUSTOM, label: "Custom…" }]}
            onChange={(v) => update((d) => void (d.letter.salutation = v === CUSTOM ? "Dear " : v))}
          />
          {!isPreset ? (
            <TextField
              label="Custom salutation"
              value={q.letter.salutation}
              onChange={(v) => update((d) => void (d.letter.salutation = v))}
            />
          ) : null}
        </div>
      </Card>

      <Card
        title="Letter body"
        description="Standard wording. Edit for this quotation if needed. Leave a blank line between paragraphs."
      >
        <div className="space-y-4">
          <TextArea
            label="Body"
            rows={18}
            value={q.letter.body}
            onChange={(v) => update((d) => void (d.letter.body = v))}
            onReset={
              q.letter.body !== COVER_LETTER_BODY ? () => update((d) => void (d.letter.body = COVER_LETTER_BODY)) : undefined
            }
          />
          <TextField
            label="Closing"
            value={q.letter.closing}
            onChange={(v) => update((d) => void (d.letter.closing = v))}
            hint={q.letter.closing !== COVER_LETTER_CLOSING ? `Default: ${COVER_LETTER_CLOSING}` : undefined}
          />
        </div>
      </Card>

      <Card title="Signatory">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField
            label="Name"
            value={q.letter.signatoryName}
            onChange={(v) => update((d) => void (d.letter.signatoryName = v))}
          />
          <TextField
            label="Designation"
            value={q.letter.signatoryDesignation}
            onChange={(v) => update((d) => void (d.letter.signatoryDesignation = v))}
          />
          <Toggle
            className="sm:col-span-2"
            checked={q.letter.showSignature}
            onChange={(v) => update((d) => void (d.letter.showSignature = v))}
            label="Show signature image"
            hint="Applies to the cover letter and the closing on the last page."
          />
        </div>
      </Card>
    </div>
  );
}
