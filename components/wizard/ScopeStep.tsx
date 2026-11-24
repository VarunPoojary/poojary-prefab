"use client";

import { useState } from "react";
import { Button, Card, NumberField, RowActions, TextArea, TextField, Toggle, move } from "@/components/ui/fields";
import { libraryWorkScope, uid } from "@/lib/defaults";
import { useQuotation } from "@/lib/store";
import { BOQ_LIBRARY, SCOPE_BLOCK_DEFAULTS, WORK_SCOPE_LIBRARY, WORK_SCOPE_TITLE } from "@/lib/templates";
import type { ScopeBlock } from "@/lib/types";

const MARKUP_HINT = 'Start a line with "- " for a bullet or "1. " for a numbered point. Leave a blank line between paragraphs.';

export function ScopeStep() {
  const { q, update } = useQuotation();
  const blocks = q.scope.blocks;
  return (
    <div className="space-y-5">
      <p className="text-sm text-slate-600">
        These blocks print after the pricing table, in the order shown. Turn off the ones you don&apos;t need and edit
        the text for this quotation.
      </p>
      {blocks.map((b, i) => (
        <BlockCard key={b.id} block={b} index={i} count={blocks.length} />
      ))}
      <Button
        variant="secondary"
        onClick={() =>
          update((d) =>
            void d.scope.blocks.push({
              id: uid("blk"),
              kind: "custom",
              label: "Custom block",
              title: "",
              text: "",
              enabled: true,
            }),
          )
        }
      >
        + Add custom text block
      </Button>
    </div>
  );
}

function BlockCard({ block: b, index, count }: { block: ScopeBlock; index: number; count: number }) {
  const { q, update } = useQuotation();
  const set = (fn: (x: ScopeBlock) => void) => update((d) => fn(d.scope.blocks[index]));
  const def = b.kind !== "custom" ? SCOPE_BLOCK_DEFAULTS[b.kind] : null;
  return (
    <Card
      className={b.enabled ? "" : "opacity-70"}
      title={
        <Toggle
          checked={b.enabled}
          onChange={(v) => set((x) => void (x.enabled = v))}
          label={b.kind === "custom" ? b.title || "Custom block" : b.label}
        />
      }
      actions={
        <RowActions
          index={index}
          count={count}
          onMove={(a, c) => update((d) => move(d.scope.blocks, a, c))}
          onRemove={() => {
            if (b.kind !== "custom" && !confirm(`Remove "${b.label}"? You can turn it off instead.`)) return;
            update((d) => void d.scope.blocks.splice(index, 1));
          }}
        />
      }
    >
      {b.enabled ? (
        <div className="space-y-4">
          {b.kind === "workScope" ? (
            <>
              <TextField
                label="Heading"
                value={b.title}
                onChange={(v) => set((x) => void (x.title = v))}
                hint={b.title !== WORK_SCOPE_TITLE ? `Default: ${WORK_SCOPE_TITLE}` : undefined}
              />
              <WorkScopeEditor />
            </>
          ) : (
            <>
              {b.kind === "custom" ? (
                <TextField label="Heading (optional)" value={b.title} onChange={(v) => set((x) => void (x.title = v))} />
              ) : null}
              {b.kind === "designScope" ? (
                <NumberField
                  className="max-w-48"
                  label="Site visits included"
                  value={q.scope.siteVisits}
                  onChange={(v) => update((d) => void (d.scope.siteVisits = v))}
                />
              ) : null}
              {b.kind === "steelSpec" ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <NumberField
                    label="Minimum coating thickness"
                    suffix="µm"
                    value={q.scope.coatingMicrons}
                    onChange={(v) => update((d) => void (d.scope.coatingMicrons = v))}
                  />
                  <TextField
                    label="Warranty period"
                    value={q.terms.params.warrantyPeriod}
                    hint="Also used in the Warranty clause of the T&C."
                    onChange={(v) => update((d) => void (d.terms.params.warrantyPeriod = v))}
                  />
                </div>
              ) : null}
              {b.kind === "volatility" ? (
                <NumberField
                  className="max-w-48"
                  label="Price adjustment threshold"
                  suffix="%"
                  value={q.scope.volatilityPct}
                  onChange={(v) => update((d) => void (d.scope.volatilityPct = v))}
                />
              ) : null}
              <TextArea
                label="Text"
                rows={b.text.length > 600 ? 12 : 4}
                value={b.text}
                hint={MARKUP_HINT}
                onChange={(v) => set((x) => void (x.text = v))}
                onReset={def && b.text !== def.text ? () => set((x) => void (x.text = def.text)) : undefined}
              />
            </>
          )}
        </div>
      ) : (
        <p className="text-xs text-slate-500">Not included in this quotation.</p>
      )}
    </Card>
  );
}

function WorkScopeEditor() {
  const { q, update } = useQuotation();
  const [libKey, setLibKey] = useState(WORK_SCOPE_LIBRARY[0].key);
  const items = q.scope.workScopeItems;
  const headings = new Set(items.map((w) => w.heading.trim().toLowerCase()));
  const suggestions = [
    ...new Set(
      q.pricing.boq.items
        .map((it) => BOQ_LIBRARY.find((l) => l.item.title === it.title)?.workScopeKey)
        .filter((k): k is string => !!k),
    ),
  ]
    .map((k) => WORK_SCOPE_LIBRARY.find((w) => w.key === k)!)
    .filter((w) => !headings.has(w.item.heading.trim().toLowerCase()));

  return (
    <div className="space-y-3">
      {suggestions.map((s) => (
        <div key={s.key} className="flex items-center justify-between rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <span>
            Your BOQ includes items for <b>{s.label}</b>, but the work scope doesn&apos;t mention them yet.
          </span>
          <Button size="sm" onClick={() => update((d) => void d.scope.workScopeItems.push(libraryWorkScope(s.key)))}>
            Add
          </Button>
        </div>
      ))}
      {items.map((w, i) => (
        <div key={w.id} className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
          <div className="flex items-start gap-3">
            <span className="mt-8 text-sm font-semibold text-slate-500">{i + 1}.</span>
            <div className="flex-1 space-y-2">
              <TextField
                label="Sub-heading"
                value={w.heading}
                onChange={(v) => update((d) => void (d.scope.workScopeItems[i].heading = v))}
              />
              <TextArea
                label="Bullet points (one per line)"
                rows={Math.max(2, w.bullets.split("\n").length + 1)}
                value={w.bullets}
                onChange={(v) => update((d) => void (d.scope.workScopeItems[i].bullets = v))}
              />
            </div>
            <RowActions
              index={i}
              count={items.length}
              onMove={(a, b) => update((d) => move(d.scope.workScopeItems, a, b))}
              onRemove={() => update((d) => void d.scope.workScopeItems.splice(i, 1))}
            />
          </div>
        </div>
      ))}
      <div className="flex items-center gap-2">
        <select
          aria-label="Work scope from library"
          className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          value={libKey}
          onChange={(e) => setLibKey(e.target.value)}
        >
          {WORK_SCOPE_LIBRARY.map((l) => (
            <option key={l.key} value={l.key}>
              {l.label}
            </option>
          ))}
        </select>
        <Button size="sm" onClick={() => update((d) => void d.scope.workScopeItems.push(libraryWorkScope(libKey)))}>
          + Add sub-heading
        </Button>
      </div>
    </div>
  );
}
