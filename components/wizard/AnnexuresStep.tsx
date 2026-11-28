"use client";

import { Plus } from "lucide-react";
import { Icon } from "@/components/ui/icons";
import { useRef, useState } from "react";
import { Button, Card, NumberField, RowActions, TextArea, TextField, Toggle, move } from "@/components/ui/fields";
import { COMPANY } from "@/config/company";
import { shedArea, shedSize } from "@/lib/calc";
import { emptyShedRow, uid } from "@/lib/defaults";
import { formatINR } from "@/lib/money";
import { useQuotation } from "@/lib/store";

/** Downscales an uploaded image so the PDF stays small. */
async function fileToDataUrl(file: File, maxWidth = 1400): Promise<string> {
  const src = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error("Could not read image"));
    i.src = src;
  });
  const scale = Math.min(1, maxWidth / img.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.85);
}

export function AnnexuresStep() {
  const { q, update } = useQuotation();
  const a = q.annexures;
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState("");

  return (
    <div className="space-y-5">
      <Card
        title={
          <Toggle
            checked={a.shedEnabled}
            onChange={(v) =>
              update((d) => {
                d.annexures.shedEnabled = v;
                if (v && d.annexures.shedRows.length === 0) d.annexures.shedRows.push(emptyShedRow());
              })
            }
            label="Structure / shed details table"
            hint="Lists the structures from the client's drawings."
          />
        }
        actions={
          a.shedEnabled ? (
            <Button variant="primary" onClick={() => update((d) => void d.annexures.shedRows.push(emptyShedRow()))}>
              <Icon icon={Plus} size={14} className="inline-block align-[-2px]" /> Add row
            </Button>
          ) : null
        }
      >
        {a.shedEnabled ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <TextField label="Intro line" value={a.shedIntro} onChange={(v) => update((d) => void (d.annexures.shedIntro = v))} />
              <TextField label="Table title" value={a.shedTitle} onChange={(v) => update((d) => void (d.annexures.shedTitle = v))} />
            </div>
            <div className="overflow-x-auto">
              <table className="stack-table stack-flush w-full min-w-[820px] text-sm max-md:divide-y max-md:divide-slate-100">
                <thead>
                  <tr className="text-left text-xs text-slate-500">
                    <th className="w-8 py-2">#</th>
                    <th className="py-2">Item / description</th>
                    <th className="w-20 py-2">Qty</th>
                    <th className="w-24 py-2">Unit</th>
                    <th className="w-20 py-2">L (m)</th>
                    <th className="w-20 py-2">W (m)</th>
                    <th className="w-28 py-2">Area SQM</th>
                    <th className="w-24" />
                  </tr>
                </thead>
                <tbody>
                  {a.shedRows.map((r, i) => {
                    const set = (fn: (x: typeof r) => void) => update((d) => fn(d.annexures.shedRows[i]));
                    return (
                      <tr key={r.id} className="border-t border-slate-100 align-top">
                        <td data-index className="py-2 text-slate-500">{i + 1}</td>
                        <td data-label="Item / description" className="py-2 pr-2">
                          <TextField value={r.description} onChange={(v) => set((x) => void (x.description = v))} />
                        </td>
                        <td data-half data-label="Qty" className="py-2 pr-2">
                          <NumberField value={r.qty} onChange={(v) => set((x) => void (x.qty = v))} />
                        </td>
                        <td data-half data-label="Unit" className="py-2 pr-2">
                          <TextField value={r.qtyUnit} onChange={(v) => set((x) => void (x.qtyUnit = v))} />
                        </td>
                        <td data-half data-label="L (m)" className="py-2 pr-2">
                          <NumberField value={r.length} onChange={(v) => set((x) => void (x.length = v))} />
                        </td>
                        <td data-half data-label="W (m)" className="py-2 pr-2">
                          <NumberField value={r.width} onChange={(v) => set((x) => void (x.width = v))} />
                        </td>
                        <td data-label="Area SQM" className="py-2 pr-2">
                          <NumberField
                            value={r.areaOverride}
                            placeholder={formatINR(shedArea({ ...r, areaOverride: null })) || "auto"}
                            onChange={(v) => set((x) => void (x.areaOverride = v))}
                          />
                          <div className="mt-1 text-xs text-slate-500">
                            {r.areaOverride === null ? "auto: qty × L × W" : "manual"} {shedSize(r) && `· ${shedSize(r)}`}
                          </div>
                        </td>
                        <td data-menu className="py-2 pl-1">
                          <RowActions
                            index={i}
                            count={a.shedRows.length}
                            onMove={(x, y) => update((d) => move(d.annexures.shedRows, x, y))}
                            onRemove={() => update((d) => void d.annexures.shedRows.splice(i, 1))}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <p className="text-xs text-slate-500">Not included.</p>
        )}
      </Card>

      <Card
        title={
          <Toggle
            checked={a.photosEnabled}
            onChange={(v) => update((d) => void (d.annexures.photosEnabled = v))}
            label="Photos of similar buildings"
            hint="Printed on a separate last page."
          />
        }
        actions={
          a.photosEnabled ? (
            <>
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg"
                multiple
                className="hidden"
                onChange={async (e) => {
                  setUploadError("");
                  const files = Array.from(e.target.files ?? []);
                  e.target.value = "";
                  try {
                    const urls = await Promise.all(files.map((f) => fileToDataUrl(f)));
                    update((d) => {
                      for (const src of urls) d.annexures.photos.push({ id: uid("ph"), src, caption: "" });
                    });
                  } catch (err) {
                    setUploadError(err instanceof Error ? err.message : "Upload failed");
                  }
                }}
              />
              <Button size="sm" variant="ghost" onClick={() => update((d) => {
                const have = new Set(d.annexures.photos.map((p) => p.src));
                for (const src of COMPANY.assets.samplePhotos) if (!have.has(src)) d.annexures.photos.push({ id: uid("ph"), src, caption: "" });
              })}>
                Add standard photos
              </Button>
              <Button variant="primary" onClick={() => fileRef.current?.click()}>
                <Icon icon={Plus} size={14} className="inline-block align-[-2px]" /> Upload photos
              </Button>
            </>
          ) : null
        }
      >
        {a.photosEnabled ? (
          <div className="space-y-4">
            <TextField label="Title" value={a.photosTitle} onChange={(v) => update((d) => void (d.annexures.photosTitle = v))} />
            {uploadError ? <p className="text-sm text-red-700">{uploadError}</p> : null}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {a.photos.map((p, i) => (
                <div key={p.id} className="rounded-lg border border-slate-200 p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.src} alt={p.caption || `Photo ${i + 1}`} className="h-36 w-full rounded object-cover" />
                  <div className="mt-2 flex items-center gap-2">
                    <TextField
                      className="flex-1"
                      value={p.caption}
                      placeholder="Caption (optional)"
                      onChange={(v) => update((d) => void (d.annexures.photos[i].caption = v))}
                    />
                    <RowActions
                      index={i}
                      count={a.photos.length}
                      onMove={(x, y) => update((d) => move(d.annexures.photos, x, y))}
                      onRemove={() => update((d) => void d.annexures.photos.splice(i, 1))}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-xs text-slate-500">Not included.</p>
        )}
      </Card>

      <Card
        title={
          <Toggle
            checked={a.notesEnabled}
            onChange={(v) => update((d) => void (d.annexures.notesEnabled = v))}
            label="Additional notes"
            hint="Free text printed after the scope matrix / shed table."
          />
        }
      >
        {a.notesEnabled ? (
          <TextArea rows={5} value={a.notes} onChange={(v) => update((d) => void (d.annexures.notes = v))} />
        ) : (
          <p className="text-xs text-slate-500">Not included.</p>
        )}
      </Card>
    </div>
  );
}
