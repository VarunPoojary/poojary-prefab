"use client";

import { Button, Card, Checkbox, RowActions, Select, TextField, Toggle, move } from "@/components/ui/fields";
import { uid } from "@/lib/defaults";
import { useQuotation } from "@/lib/store";
import { MATRIX_DEFAULTS } from "@/lib/templates";

export function MatrixStep() {
  const { q, update } = useQuotation();
  const m = q.matrix;
  return (
    <div className="space-y-5">
      <Card
        title={<Toggle checked={m.enabled} onChange={(v) => update((d) => void (d.matrix.enabled = v))} label="Include scope matrix" />}
        actions={
          m.enabled ? (
            <>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  if (!confirm("Replace all rows with the 15 standard rows?")) return;
                  update((d) => void (d.matrix.rows = MATRIX_DEFAULTS.map((r) => ({ ...r, id: uid("mx") }))));
                }}
              >
                Reset rows
              </Button>
              <Button
                variant="primary"
                onClick={() =>
                  update((d) => void d.matrix.rows.push({ id: uid("mx"), description: "", client: false, pppl: false }))
                }
              >
                + Add row
              </Button>
            </>
          ) : null
        }
      >
        {m.enabled ? (
          <>
            <Select
              className="mb-4 max-w-xs"
              label="Mark style"
              value={m.style}
              options={[
                { value: "tick", label: "Tick marks (√)" },
                { value: "text", label: "Text (Client / PPPL)" },
              ]}
              onChange={(v) => update((d) => void (d.matrix.style = v))}
            />
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-slate-500">
                  <th className="w-8 py-2">#</th>
                  <th className="py-2">Description</th>
                  <th className="w-20 py-2 text-center">Client</th>
                  <th className="w-20 py-2 text-center">PPPL</th>
                  <th className="w-24" />
                </tr>
              </thead>
              <tbody>
                {m.rows.map((r, i) => (
                  <tr key={r.id} className="border-t border-slate-100">
                    <td className="py-1.5 text-slate-500">{i + 1}</td>
                    <td className="py-1.5 pr-2">
                      <TextField
                        value={r.description}
                        onChange={(v) => update((d) => void (d.matrix.rows[i].description = v))}
                      />
                    </td>
                    <td className="text-center">
                      <Checkbox
                        label=""
                        checked={r.client}
                        onChange={(v) => update((d) => void (d.matrix.rows[i].client = v))}
                      />
                    </td>
                    <td className="text-center">
                      <Checkbox label="" checked={r.pppl} onChange={(v) => update((d) => void (d.matrix.rows[i].pppl = v))} />
                    </td>
                    <td>
                      <RowActions
                        index={i}
                        count={m.rows.length}
                        onMove={(a, b) => update((d) => move(d.matrix.rows, a, b))}
                        onRemove={() => update((d) => void d.matrix.rows.splice(i, 1))}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : (
          <p className="text-xs text-slate-500">The scope matrix will not be printed.</p>
        )}
      </Card>
    </div>
  );
}
