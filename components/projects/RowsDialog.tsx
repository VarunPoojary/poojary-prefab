"use client";

import { useState } from "react";
import { ErrorList } from "@/components/crm/ui";
import { Button } from "@/components/ui/fields";
import { Modal } from "@/components/ui/overlays";
import { X } from "lucide-react";
import { Icon } from "@/components/ui/icons";

export interface Column<T> {
  key: keyof T & string;
  label: string;
  type: "text" | "date" | "number" | "select";
  options?: { value: string; label: string }[];
  width?: string;
  placeholder?: string;
  readOnly?: boolean;
}

const cell = "w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-red-600 focus:ring-2 focus:ring-red-100";

/** Dialog to edit a list of rows (team, contacts, parties, milestones…). Rows stack as cards on phones. */
export function RowsDialog<T extends { id: string }>({
  title,
  description,
  rows: initial,
  columns,
  blank,
  onSave,
  onClose,
  saving,
  addLabel = "+ Add row",
  onRowChange,
}: {
  title: string;
  description?: string;
  rows: T[];
  columns: Column<T>[];
  /** Omit to hide "Add row" and row removal (fixed list). */
  blank?: () => T;
  onSave: (rows: T[]) => Promise<unknown>;
  onClose: () => void;
  saving?: boolean;
  addLabel?: string;
  /** Lets the caller derive fields (e.g. amount from %) when a cell changes. */
  onRowChange?: (row: T, key: keyof T) => T;
}) {
  const [rows, setRows] = useState<T[]>(initial);
  const [issues, setIssues] = useState<string[]>([]);
  const update = (i: number, key: keyof T, raw: string) =>
    setRows((rs) =>
      rs.map((r, j) => {
        if (j !== i) return r;
        const col = columns.find((c) => c.key === key)!;
        const value = col.type === "number" ? (raw === "" ? null : Number(raw)) : raw;
        const next = { ...r, [key]: value } as T;
        return onRowChange ? onRowChange(next, key) : next;
      }),
    );
  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={saving}
            onClick={() =>
              onSave(rows)
                .then(onClose)
                .catch((e: unknown) => setIssues(e && typeof e === "object" && "issues" in e ? (e as { issues: string[] }).issues : [String(e)]))
            }
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      {description ? <p className="mb-3 text-sm text-slate-600">{description}</p> : null}
      <div className="space-y-2">
        <div className="hidden gap-2 px-1 text-[11px] font-semibold text-slate-500 sm:flex">
          {columns.map((c) => (
            <span key={c.key} className={c.width ?? "flex-1"}>
              {c.label}
            </span>
          ))}
          {blank ? <span className="w-8" /> : null}
        </div>
        {rows.map((r, i) => (
          <div key={r.id || i} className="flex flex-col gap-2 rounded-lg border border-slate-200 p-2 sm:flex-row sm:items-center sm:border-0 sm:p-0">
            {columns.map((c) => {
              const v = r[c.key] as unknown;
              const common = { "aria-label": `${c.label} ${i + 1}`, className: cell };
              return (
                <label key={c.key} className={`${c.width ?? "flex-1"} min-w-0`}>
                  <span className="mb-0.5 block text-[11px] font-semibold text-slate-500 sm:hidden">{c.label}</span>
                  {c.readOnly ? (
                    <span className="block py-1.5 text-sm text-slate-800">{String(v ?? "")}</span>
                  ) : c.type === "select" ? (
                    <select {...common} value={String(v ?? "")} onChange={(e) => update(i, c.key, e.target.value)}>
                      <option value="">Choose…</option>
                      {c.options!.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      {...common}
                      type={c.type === "number" ? "number" : c.type}
                      step="any"
                      placeholder={c.placeholder}
                      value={v === null || v === undefined ? "" : String(v)}
                      onChange={(e) => update(i, c.key, e.target.value)}
                    />
                  )}
                </label>
              );
            })}
            {blank ? <button type="button" aria-label={`Remove row ${i + 1}`} onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} className="w-8 self-end rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-700 sm:self-auto">
              <Icon icon={X} size={16} />
            </button> : null}
          </div>
        ))}
        {!rows.length ? <p className="text-sm text-slate-500">Nothing here yet.</p> : null}
      </div>
      {blank ? (
        <div className="mt-3">
          <Button size="sm" onClick={() => setRows((rs) => [...rs, blank()])}>
            {addLabel}
          </Button>
        </div>
      ) : null}
      <div className="mt-3">
        <ErrorList issues={issues} />
      </div>
    </Modal>
  );
}
