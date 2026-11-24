"use client";

import { useEffect, useRef, useState } from "react";
import type { PreviewAnchor } from "@/lib/previewAnchor";
import type { Quotation } from "@/lib/types";
import { renderQuotationBlob } from "./PdfPreview";

// Legacy build includes polyfills for features not yet in all browsers (e.g. Map.getOrInsertComputed).
type PdfJs = typeof import("pdfjs-dist/legacy/build/pdf.mjs");
let pdfjsPromise: Promise<PdfJs> | null = null;

function loadPdfJs() {
  pdfjsPromise ??= import("pdfjs-dist/legacy/build/pdf.mjs").then((lib) => {
    lib.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
      import.meta.url,
    ).toString();
    return lib;
  });
  return pdfjsPromise;
}

/** Text found on a rendered page, with whitespace stripped and each char's source item recorded. */
interface PageText {
  canvas: HTMLCanvasElement;
  scale: number;
  pageHeight: number;
  stripped: string;
  charItem: number[];
  itemTop: number[];
}

const strip = (s: string) => s.replace(/\s+/g, "").toLowerCase();

/** Returns the scroll offset (px inside the pages container) for an anchor, or null if not found. */
function locate(pages: PageText[], anchor: PreviewAnchor): number | null {
  for (const text of anchor.texts) {
    const needle = strip(text);
    if (!needle) continue;
    for (const p of pages) {
      const at = p.stripped.indexOf(needle);
      if (at < 0) continue;
      if (anchor.align === "page") return p.canvas.offsetTop;
      return p.canvas.offsetTop + p.itemTop[p.charItem[at]] * p.scale;
    }
  }
  if (!pages.length) return null;
  if (anchor.fallback === "top") return 0;
  if (anchor.fallback === "end") return pages[pages.length - 1].canvas.offsetTop;
  return null;
}

/**
 * Side-panel preview: renders PDF pages to canvases with pdf.js so the scroll position
 * is kept between updates (the native viewer jumps back to page 1 on every reload).
 */
export default function LivePreview({
  q,
  delay = 600,
  anchor,
  anchorKey,
}: {
  q: Quotation;
  delay?: number;
  /** Section to bring into view; the preview scrolls when `anchorKey` changes (e.g. the wizard step). */
  anchor?: PreviewAnchor;
  anchorKey?: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pagesRef = useRef<HTMLDivElement>(null);
  const seq = useRef(0);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const pagesText = useRef<PageText[]>([]);
  const anchorRef = useRef(anchor);
  useEffect(() => {
    anchorRef.current = anchor;
  });
  // Set when the step changes; consumed after the next render (or immediately if pages are ready).
  const pendingScroll = useRef(true);

  const scrollToAnchor = () => {
    const a = anchorRef.current;
    const scroller = scrollRef.current;
    if (!a || !scroller || !pagesText.current.length) return;
    const y = locate(pagesText.current, a);
    pendingScroll.current = false;
    if (y === null) return;
    // Pages container sits inside the scroller's padding; leave a little room above the target.
    scroller.scrollTo({ top: Math.max(0, y - (a.align === "page" ? 8 : 48)), behavior: "smooth" });
  };

  useEffect(() => {
    pendingScroll.current = true;
    if (!busy) scrollToAnchor();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchorKey]);

  useEffect(() => {
    const id = ++seq.current;
    const timer = setTimeout(async () => {
      setBusy(true);
      try {
        const [pdfjs, blob] = await Promise.all([loadPdfJs(), renderQuotationBlob(q)]);
        if (id !== seq.current) return;
        const task = pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) });
        try {
          const doc = await task.promise;
          const host = pagesRef.current;
          if (!host || id !== seq.current) return;
          const cssWidth = Math.max(300, host.clientWidth - 24);
          const dpr = Math.min(window.devicePixelRatio || 1, 2);
          const canvases: HTMLCanvasElement[] = [];
          const texts: PageText[] = [];
          for (let n = 1; n <= doc.numPages; n++) {
            const page = await doc.getPage(n);
            const base = page.getViewport({ scale: 1 });
            const viewport = page.getViewport({ scale: (cssWidth / base.width) * dpr });
            const canvas = document.createElement("canvas");
            canvas.width = Math.floor(viewport.width);
            canvas.height = Math.floor(viewport.height);
            canvas.style.width = `${cssWidth}px`;
            canvas.className = "mx-auto mb-3 block bg-white shadow-md";
            await page.render({ canvas, viewport }).promise;
            const content = await page.getTextContent();
            if (id !== seq.current) return;
            canvases.push(canvas);
            let stripped = "";
            const charItem: number[] = [];
            const itemTop: number[] = [];
            content.items.forEach((item, i) => {
              if (!("str" in item)) return itemTop.push(0);
              // transform[5] is the baseline measured from the page bottom.
              itemTop.push(base.height - item.transform[5] - (item.height || 10));
              const s = strip(item.str);
              stripped += s;
              for (let c = 0; c < s.length; c++) charItem.push(i);
            });
            texts.push({ canvas, scale: cssWidth / base.width, pageHeight: base.height, stripped, charItem, itemTop });
          }
          const scroller = scrollRef.current;
          const top = scroller?.scrollTop ?? 0;
          host.replaceChildren(...canvases);
          pagesText.current = texts;
          if (scroller) scroller.scrollTop = top;
          if (pendingScroll.current) scrollToAnchor();
          setPageCount(doc.numPages);
          setError(null);
        } finally {
          void task.destroy();
        }
      } catch (e) {
        if (id === seq.current) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (id === seq.current) setBusy(false);
      }
    }, delay);
    return () => clearTimeout(timer);
  }, [q, delay]);

  return (
    <div className="relative flex h-full flex-col bg-slate-200">
      <div className="flex items-center justify-between border-b border-slate-300 bg-slate-100 px-3 py-1.5 text-xs text-slate-600">
        <span className="font-semibold">Live preview</span>
        <span>{busy ? "Updating…" : `${pageCount} page${pageCount === 1 ? "" : "s"}`}</span>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3">
        <div ref={pagesRef} />
      </div>
      {error ? (
        <div className="absolute inset-x-3 bottom-3 rounded-md bg-red-700 p-3 text-xs text-white">
          Preview error: {error}
        </div>
      ) : null}
    </div>
  );
}
