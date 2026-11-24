"use client";

import { create } from "zustand";
import { produce } from "immer";
import type { QuotationStatus } from "./data/types";
import type { Quotation } from "./types";

export const STEPS = [
  { key: "client", label: "Client & Offer" },
  { key: "letter", label: "Cover Letter" },
  { key: "pricing", label: "Pricing" },
  { key: "scope", label: "Scope & Specs" },
  { key: "terms", label: "Terms & Conditions" },
  { key: "matrix", label: "Scope Matrix" },
  { key: "annexures", label: "Annexures" },
  { key: "review", label: "Review & Download" },
] as const;

export type StepKey = (typeof STEPS)[number]["key"];

export type SaveState = "idle" | "saving" | "saved" | "error";

interface QuotationState {
  quotation: Quotation | null;
  /** Id of the stored record; null until a new quotation is saved for the first time. */
  recordId: string | null;
  status: QuotationStatus;
  /** Incremented on every edit, so a save can tell whether newer edits arrived meanwhile. */
  version: number;
  savedVersion: number;
  saveState: SaveState;
  saveError: string | null;
  lastSavedAt: string | null;
  /** Status as last written to storage; used to detect Draft → Final for the enquiry. */
  savedStatus: QuotationStatus | null;
  /** Enquiry to link this new quotation to on its first save (started from an enquiry). */
  pendingEnquiryId: string | null;
  step: number;
  visited: number[];
  showPreview: boolean;
  start: (
    q: Quotation,
    opts?: { recordId?: string | null; status?: QuotationStatus; savedAt?: string | null; pendingEnquiryId?: string | null },
  ) => void;
  clear: () => void;
  update: (recipe: (draft: Quotation) => void) => void;
  setStatus: (s: QuotationStatus) => void;
  savingStarted: () => void;
  savingSucceeded: (recordId: string, version: number, savedAt: string, status: QuotationStatus) => void;
  clearPendingEnquiry: () => void;
  savingFailed: (message: string) => void;
  goTo: (step: number) => void;
  togglePreview: () => void;
}

const initial = {
  quotation: null,
  recordId: null,
  status: "draft" as QuotationStatus,
  version: 0,
  savedVersion: 0,
  saveState: "idle" as SaveState,
  saveError: null,
  lastSavedAt: null,
  savedStatus: null as QuotationStatus | null,
  pendingEnquiryId: null as string | null,
  step: 0,
  visited: [0],
};

export const useQuotationStore = create<QuotationState>((set) => ({
  ...initial,
  showPreview: true,
  start: (q, opts = {}) =>
    set({
      ...initial,
      quotation: q,
      recordId: opts.recordId ?? null,
      status: opts.status ?? "draft",
      lastSavedAt: opts.savedAt ?? null,
      saveState: opts.recordId ? "saved" : "idle",
      savedStatus: opts.recordId ? (opts.status ?? "draft") : null,
      pendingEnquiryId: opts.pendingEnquiryId ?? null,
    }),
  clear: () => set({ ...initial }),
  update: (recipe) =>
    set((s) => (s.quotation ? { quotation: produce(s.quotation, recipe), version: s.version + 1 } : s)),
  setStatus: (status) => set((s) => ({ status, version: s.version + 1 })),
  savingStarted: () => set({ saveState: "saving", saveError: null }),
  savingSucceeded: (recordId, version, savedAt, status) =>
    set((s) => ({
      recordId,
      savedVersion: Math.max(s.savedVersion, version),
      saveState: "saved",
      lastSavedAt: savedAt,
      savedStatus: status,
    })),
  clearPendingEnquiry: () => set({ pendingEnquiryId: null }),
  savingFailed: (message) => set({ saveState: "error", saveError: message }),
  goTo: (step) =>
    set((s) => ({ step, visited: s.visited.includes(step) ? s.visited : [...s.visited, step] })),
  togglePreview: () => set((s) => ({ showPreview: !s.showPreview })),
}));

/** True when there are edits not yet written to storage. */
export const selectDirty = (s: QuotationState) => s.version !== s.savedVersion;

/** Convenience hook: returns the current quotation (non-null inside the wizard) and the updater. */
export function useQuotation() {
  const quotation = useQuotationStore((s) => s.quotation) as Quotation;
  const update = useQuotationStore((s) => s.update);
  return { q: quotation, update };
}

/** The open wizard registers its save function here so app-level actions (e.g. logout) can flush edits. */
let pendingSaver: (() => Promise<boolean>) | null = null;

export function registerPendingSaver(fn: (() => Promise<boolean>) | null) {
  pendingSaver = fn;
}

export async function flushPendingSave() {
  if (pendingSaver && selectDirty(useQuotationStore.getState())) await pendingSaver();
}
