"use client";

import { useEffect, useRef, useState } from "react";
import { pdf } from "@react-pdf/renderer";
import type { Quotation } from "@/lib/types";
import { QuotationDocument } from "./QuotationDocument";

export async function renderQuotationBlob(q: Quotation): Promise<Blob> {
  return pdf(<QuotationDocument q={q} assetBase={window.location.origin} />).toBlob();
}

export async function downloadQuotation(q: Quotation, fileName: string) {
  const blob = await renderQuotationBlob(q);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName.toLowerCase().endsWith(".pdf") ? fileName : `${fileName}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Re-renders the PDF shortly after edits stop and shows it in the browser's PDF viewer. */
export default function PdfPreview({ q, delay = 600 }: { q: Quotation; delay?: number }) {
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    const id = ++seq.current;
    const timer = setTimeout(async () => {
      setBusy(true);
      try {
        const blob = await renderQuotationBlob(q);
        if (id !== seq.current) return;
        const next = URL.createObjectURL(blob);
        setUrl((prev) => {
          if (prev) setTimeout(() => URL.revokeObjectURL(prev), 2000);
          return next;
        });
        setError(null);
      } catch (e) {
        if (id === seq.current) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (id === seq.current) setBusy(false);
      }
    }, delay);
    return () => clearTimeout(timer);
  }, [q, delay]);

  return (
    <div className="relative h-full w-full bg-slate-200">
      {url ? (
        <iframe title="Quotation preview" src={`${url}#toolbar=1&navpanes=0&view=FitH`} className="h-full w-full border-0" />
      ) : null}
      {busy ? (
        <div className="absolute right-3 top-3 rounded-full bg-slate-900/80 px-3 py-1 text-xs text-white">Updating preview…</div>
      ) : null}
      {error ? (
        <div className="absolute inset-x-3 bottom-3 rounded-md bg-red-700 p-3 text-xs text-white">Preview error: {error}</div>
      ) : null}
    </div>
  );
}
