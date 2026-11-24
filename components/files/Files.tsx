"use client";

import { useEffect, useRef, useState } from "react";
import { useToast } from "@/components/Providers";
import { fileBlob, openFile, uploadPhoto, type FileSource, type PhotoRef } from "@/lib/files";
import { formatBytes, formatDateTime } from "@/lib/format";

/** Object URL for a stored file (revoked when the component unmounts). */
export function useFileUrl(src: FileSource | null) {
  const [url, setUrl] = useState<string | null>(null);
  const key = src ? src.fileId || src.url || "" : "";
  useEffect(() => {
    if (!src || !key) return;
    let alive = true;
    let made: string | null = null;
    void fileBlob(src)
      .then((b) => {
        if (!alive || !b) return;
        made = URL.createObjectURL(b);
        setUrl(made);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
      if (made) URL.revokeObjectURL(made);
    };
    // The key identifies the file; src is a new object on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return key ? url : null;
}

/** File name that opens the file, plus a download button. Works for stored files and older data: URLs. */
export function FileLink({ file, className = "", children }: { file: FileSource; className?: string; children?: React.ReactNode }) {
  const toast = useToast();
  const run = (view: boolean) => openFile(file, view).catch((e: Error) => toast(e.message, "error"));
  return (
    <span className={`inline-flex min-w-0 items-center gap-1 ${className}`}>
      <button type="button" onClick={() => void run(true)} className="min-w-0 truncate text-left text-slate-800 hover:underline">
        {children ?? file.name}
      </button>
      <button type="button" aria-label={`Download ${file.name}`} title="Download" onClick={() => void run(false)} className="shrink-0 rounded px-1 text-xs text-slate-500 hover:bg-slate-100">
        ⬇
      </button>
    </span>
  );
}

function Thumb({ photo, onOpen, onRemove }: { photo: PhotoRef; onOpen: () => void; onRemove?: () => void }) {
  const url = useFileUrl({ fileId: photo.fileId, name: photo.name });
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onOpen}
        title={`${photo.name}${photo.takenAt ? ` · taken ${formatDateTime(photo.takenAt)}` : ""}`}
        className="block h-16 w-16 overflow-hidden rounded-md border border-slate-200 bg-slate-100"
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={photo.name} className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full items-center justify-center text-lg">🖼️</span>
        )}
      </button>
      {onRemove ? (
        <button
          type="button"
          aria-label={`Remove ${photo.name}`}
          onClick={onRemove}
          className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-[10px] text-white"
        >
          ✕
        </button>
      ) : null}
    </div>
  );
}

/** Thumbnails of stored photos; tapping one opens a large view with when it was taken. */
export function PhotoThumbs({ photos, onRemove }: { photos: PhotoRef[]; onRemove?: (fileId: string) => void }) {
  const [open, setOpen] = useState<PhotoRef | null>(null);
  if (!photos.length) return null;
  return (
    <>
      <div className="flex flex-wrap gap-2">
        {photos.map((p) => (
          <Thumb key={p.fileId} photo={p} onOpen={() => setOpen(p)} onRemove={onRemove ? () => onRemove(p.fileId) : undefined} />
        ))}
      </div>
      {open ? <Lightbox photo={open} onClose={() => setOpen(null)} /> : null}
    </>
  );
}

function Lightbox({ photo, onClose }: { photo: PhotoRef; onClose: () => void }) {
  const url = useFileUrl({ fileId: photo.fileId, name: photo.name });
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);
  return (
    <div role="dialog" aria-label={photo.name} className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/85 p-4" onClick={onClose}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={photo.name} className="max-h-[80vh] max-w-full rounded-lg object-contain" />
      ) : (
        <p className="text-white">Loading…</p>
      )}
      <p className="mt-3 text-center text-sm text-white/80">
        {photo.name} · {formatBytes(photo.size)}
        {photo.takenAt ? ` · taken ${formatDateTime(photo.takenAt)}` : ""} · uploaded {formatDateTime(photo.uploadedAt)}
      </p>
      <button type="button" className="mt-3 rounded-md bg-white/15 px-4 py-2 text-sm text-white" onClick={onClose}>
        Close
      </button>
    </div>
  );
}

/** "Add photos" button (opens the camera on phones) that shrinks and stores photos, then reports them. */
export function PhotoPicker({
  photos,
  onChange,
  label = "📷 Add photos",
  max = 10,
  capture = false,
  onAdded,
}: {
  photos: PhotoRef[];
  onChange: (p: PhotoRef[]) => void;
  label?: string;
  max?: number;
  /** Open the phone's camera directly instead of the gallery. */
  capture?: boolean;
  onAdded?: (added: PhotoRef[]) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <div className="space-y-2">
      <PhotoThumbs photos={photos} onRemove={(id) => onChange(photos.filter((p) => p.fileId !== id))} />
      <input
        ref={ref}
        type="file"
        accept="image/*"
        capture={capture ? "environment" : undefined}
        multiple
        className="hidden"
        aria-label="Add photos"
        onChange={async (e) => {
          const files = Array.from(e.target.files ?? []).slice(0, Math.max(0, max - photos.length));
          e.target.value = "";
          if (!files.length) return;
          setBusy(true);
          const added: PhotoRef[] = [];
          for (const f of files) {
            try {
              added.push(await uploadPhoto(f));
            } catch (err) {
              toast(err instanceof Error ? err.message : String(err), "error");
            }
          }
          setBusy(false);
          if (added.length) {
            onChange([...photos, ...added]);
            onAdded?.(added);
          }
        }}
      />
      {photos.length < max ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => ref.current?.click()}
          className="rounded-md border border-dashed border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
        >
          {busy ? "Saving photos…" : label}
        </button>
      ) : null}
    </div>
  );
}
