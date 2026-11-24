"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { LinkEnquiryCard } from "@/components/crm/LinkEnquiryCard";
import { Button, Card, TextField } from "@/components/ui/fields";
import { grandTotal } from "@/lib/calc";
import { formatRupee, amountInWords } from "@/lib/money";
import { STEPS, useQuotation, useQuotationStore } from "@/lib/store";
import { defaultFileName, formatLongDate } from "@/lib/template";
import { validateQuotation } from "@/lib/validate";

const PdfPreview = dynamic(() => import("@/components/pdf/PdfPreview"), { ssr: false });

export function ReviewStep() {
  const { q, update } = useQuotation();
  const goTo = useQuotationStore((s) => s.goTo);
  const status = useQuotationStore((s) => s.status);
  const setStatus = useQuotationStore((s) => s.setStatus);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");
  const issues = validateQuotation(q);
  const errors = issues.filter((i) => i.level === "error");
  const fileName = q.fileName || defaultFileName(q);
  const total = grandTotal(q);

  return (
    <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
      <div className="space-y-5">
        <Card title="Summary">
          <dl className="space-y-1.5 text-sm">
            <Row k="Client" v={q.client.company} />
            <Row k="Offer / Rev" v={`${q.meta.offerNo || "–"} / ${q.meta.revision || "–"}`} />
            <Row k="Date" v={formatLongDate(q.meta.date)} />
            <Row k="Site" v={q.meta.siteLocation} />
            <Row k="Format" v={q.pricing.mode === "boq" ? "BOQ – Supply + Installation" : "Area-based"} />
          </dl>
          <div className="mt-4 rounded-lg bg-slate-900 p-3 text-white">
            <div className="text-xs text-slate-300">Grand total incl. GST</div>
            <div className="text-lg font-bold tabular-nums">{formatRupee(total)}</div>
            <div className="text-[11px] text-slate-300">{amountInWords(total)}</div>
          </div>
        </Card>

        <Card title="Checks" description={issues.length ? undefined : "Everything looks good."}>
          {issues.length ? (
            <ul className="space-y-2">
              {issues.map((i, k) => {
                const stepIdx = STEPS.findIndex((s) => s.key === i.step);
                return (
                  <li key={k} className="flex items-start gap-2 text-sm">
                    <span className={i.level === "error" ? "text-red-600" : "text-amber-600"}>
                      {i.level === "error" ? "●" : "▲"}
                    </span>
                    <span className="flex-1">{i.message}</span>
                    <button className="text-xs font-medium text-red-700 hover:underline" onClick={() => goTo(stepIdx)}>
                      {STEPS[stepIdx].label} →
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-emerald-700">✓ No problems found.</p>
          )}
        </Card>

        <LinkEnquiryCard />

        <Card title="Download">
          <TextField
            label="File name"
            value={fileName}
            onChange={(v) => update((d) => void (d.fileName = v))}
          />
          <div className="mt-4">
            <Button
              variant="primary"
              disabled={errors.length > 0 || downloading}
              onClick={async () => {
                setError("");
                setDownloading(true);
                try {
                  const { downloadQuotation } = await import("@/components/pdf/PdfPreview");
                  await downloadQuotation(q, fileName);
                } catch (e) {
                  setError(e instanceof Error ? e.message : String(e));
                } finally {
                  setDownloading(false);
                }
              }}
            >
              {downloading ? "Preparing PDF…" : "⬇ Download PDF"}
            </Button>
            {status === "draft" ? (
              <div className="mt-3">
                <Button size="sm" variant="ghost" onClick={() => setStatus("final")}>
                  ✓ Mark as final
                </Button>
              </div>
            ) : (
              <p className="mt-3 text-xs text-emerald-700">This quotation is marked Final.</p>
            )}
            {errors.length ? (
              <p className="mt-2 text-xs text-red-700">Fix {errors.length} error(s) above to enable download.</p>
            ) : null}
            {error ? <p className="mt-2 text-xs text-red-700">{error}</p> : null}
          </div>
        </Card>
      </div>
      <div className="h-[calc(100vh-240px)] min-h-[600px] overflow-hidden rounded-xl border border-slate-200 shadow-sm">
        <PdfPreview q={q} delay={200} />
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-slate-500">{k}</dt>
      <dd className="text-right font-medium text-slate-900">{v || "–"}</dd>
    </div>
  );
}
