"use client";

import { useQuotationStore, selectDirty } from "@/lib/store";

function time(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

export function SaveIndicator({ onRetry }: { onRetry: () => void }) {
  const saveState = useQuotationStore((s) => s.saveState);
  const saveError = useQuotationStore((s) => s.saveError);
  const lastSavedAt = useQuotationStore((s) => s.lastSavedAt);
  const dirty = useQuotationStore(selectDirty);
  const recordId = useQuotationStore((s) => s.recordId);

  if (saveState === "saving") return <span className="text-xs text-slate-500">Saving…</span>;
  if (saveState === "error")
    return (
      <span className="flex items-center gap-1 text-xs text-red-700" title={saveError ?? undefined}>
        Save failed
        <button type="button" className="font-semibold underline" onClick={onRetry}>
          Retry
        </button>
      </span>
    );
  if (dirty) return <span className="text-xs text-slate-500">Unsaved changes</span>;
  if (recordId && lastSavedAt) return <span className="text-xs text-emerald-700">✓ Saved {time(lastSavedAt)}</span>;
  return <span className="text-xs text-slate-400">Not saved yet</span>;
}
