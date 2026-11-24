"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useToast } from "@/components/Providers";
import { Button } from "@/components/ui/fields";
import { useNewRevision } from "@/lib/data/hooks";
import { selectDirty, STEPS, useQuotationStore } from "@/lib/store";
import { previewAnchor } from "@/lib/previewAnchor";
import { validateQuotation } from "@/lib/validate";
import { AnnexuresStep } from "./AnnexuresStep";
import { ClientStep } from "./ClientStep";
import { LetterStep } from "./LetterStep";
import { MatrixStep } from "./MatrixStep";
import { PricingStep } from "./PricingStep";
import { ReviewStep } from "./ReviewStep";
import { ScopeStep } from "./ScopeStep";
import { TermsStep } from "./TermsStep";
import { SaveIndicator } from "./SaveIndicator";
import { useAutosave, useQuotationSaver } from "./useQuotationSaver";

const LivePreview = dynamic(() => import("@/components/pdf/LivePreview"), { ssr: false });

const STEP_COMPONENTS = [ClientStep, LetterStep, PricingStep, ScopeStep, TermsStep, MatrixStep, AnnexuresStep, ReviewStep];

export function Wizard() {
  const router = useRouter();
  const q = useQuotationStore((s) => s.quotation);
  const step = useQuotationStore((s) => s.step);
  const visited = useQuotationStore((s) => s.visited);
  const dirty = useQuotationStore(selectDirty);
  const status = useQuotationStore((s) => s.status);
  const recordId = useQuotationStore((s) => s.recordId);
  const setStatus = useQuotationStore((s) => s.setStatus);
  const showPreview = useQuotationStore((s) => s.showPreview);
  const goTo = useQuotationStore((s) => s.goTo);
  const togglePreview = useQuotationStore((s) => s.togglePreview);
  const clear = useQuotationStore((s) => s.clear);
  const saveNow = useQuotationSaver();
  useAutosave(saveNow);
  const toast = useToast();
  const newRevision = useNewRevision();
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    document.getElementById("wizard-scroll")?.scrollTo({ top: 0 });
  }, [step]);

  if (!q) return null;

  const issues = validateQuotation(q);
  const StepComponent = STEP_COMPONENTS[step];
  const isReview = STEPS[step].key === "review";
  const sidePreview = showPreview && !isReview;

  const exit = async () => {
    setExiting(true);
    if (dirty && !(await saveNow()) && !confirm("Saving failed. Leave anyway and lose the latest changes?")) {
      setExiting(false);
      return;
    }
    clear();
    router.push("/quotations");
  };

  const createRevision = async () => {
    if (!recordId) return;
    if (dirty) await saveNow();
    try {
      const { record: r, linkError } = await newRevision.mutateAsync(recordId);
      toast(`Revision ${r.data.meta.revision} created${r.enquiryNumber ? ` as R${r.enquiryRevision} of ${r.enquiryNumber}` : ""}`);
      if (linkError) toast(`Not linked to the enquiry: ${linkError}`, "error");
      router.push(`/quotations/${r.id}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not create revision", "error");
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-slate-50">
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-5 py-2.5">
        <div className="flex items-center gap-3">
          <div>
            <div className="text-sm font-semibold text-slate-900">
              Quotation {q.meta.offerNo ? `#${q.meta.offerNo}` : "(new)"} {q.client.company ? `· ${q.client.company}` : ""}
            </div>
            <div className="text-xs text-slate-500">
              Step {step + 1} of {STEPS.length}: {STEPS[step].label}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <SaveIndicator onRetry={() => void saveNow()} />
          <select
            aria-label="Quotation status"
            value={status}
            onChange={(e) => setStatus(e.target.value as typeof status)}
            className={`rounded-md border px-2 py-1.5 text-xs font-semibold ${
              status === "final" ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-amber-300 bg-amber-50 text-amber-800"
            }`}
          >
            <option value="draft">Draft</option>
            <option value="final">Final</option>
          </select>
          <Button variant="secondary" onClick={() => void saveNow().then((ok) => ok && toast("Quotation saved"))}>
            Save
          </Button>
          {!isReview ? (
            <Button variant="ghost" onClick={togglePreview}>
              {showPreview ? "Hide preview" : "Show preview"}
            </Button>
          ) : null}
          <Button variant="secondary" disabled={exiting} onClick={() => void exit()}>
            {exiting ? "Saving…" : "Exit"}
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <nav className="hidden w-56 shrink-0 border-r border-slate-200 bg-white p-3 lg:block">
          <ol className="space-y-1">
            {STEPS.map((s, i) => {
              const errs = issues.filter((x) => x.step === s.key && x.level === "error").length;
              const seen = visited.includes(i);
              const active = i === step;
              return (
                <li key={s.key}>
                  <button
                    type="button"
                    onClick={() => goTo(i)}
                    className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition ${
                      active ? "bg-red-50 font-semibold text-red-800" : "text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <span
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                        active
                          ? "bg-red-700 text-white"
                          : seen && errs
                            ? "bg-amber-100 text-amber-800"
                            : seen
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {seen && !active && !errs && s.key !== "review" ? "✓" : i + 1}
                    </span>
                    <span className="flex-1">{s.label}</span>
                    {seen && errs && s.key !== "review" ? (
                      <span className="rounded bg-amber-100 px-1.5 text-[10px] font-semibold text-amber-800">{errs}</span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ol>
          <p className="mt-6 px-3 text-[11px] leading-snug text-slate-400">
            Changes are saved automatically in this browser until the database is connected.
          </p>
        </nav>

        <main className="flex min-w-0 flex-1 flex-col">
          <div id="wizard-scroll" className="flex-1 overflow-y-auto p-5 lg:p-6">
            <div className={isReview ? "" : "mx-auto max-w-4xl"}>
              {status === "final" && recordId ? (
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                  <span>
                    This quotation is marked <b>Final</b>. If it has already been sent, consider creating a new revision
                    instead of editing it.
                  </span>
                  <Button size="sm" disabled={newRevision.isPending} onClick={() => void createRevision()}>
                    Create new revision
                  </Button>
                </div>
              ) : null}
              <h2 className="mb-4 text-lg font-semibold text-slate-900">{STEPS[step].label}</h2>
              <StepComponent />
            </div>
          </div>
          <div className="flex items-center justify-between border-t border-slate-200 bg-white px-5 py-3">
            <Button variant="secondary" disabled={step === 0} onClick={() => goTo(step - 1)}>
              ← Back
            </Button>
            <div className="flex gap-1 lg:hidden">
              {STEPS.map((s, i) => (
                <span key={s.key} className={`h-1.5 w-5 rounded ${i <= step ? "bg-red-700" : "bg-slate-200"}`} />
              ))}
            </div>
            {step < STEPS.length - 1 ? (
              <Button variant="primary" onClick={() => goTo(step + 1)}>
                {step === STEPS.length - 2 ? "Review →" : "Next →"}
              </Button>
            ) : (
              <span />
            )}
          </div>
        </main>

        {sidePreview ? (
          <aside className="hidden w-[44%] max-w-[760px] shrink-0 border-l border-slate-200 xl:block">
            <LivePreview q={q} anchor={previewAnchor(STEPS[step].key, q)} anchorKey={STEPS[step].key} />
          </aside>
        ) : null}
      </div>
    </div>
  );
}
