import { supabase } from "@/lib/supabase/client";
import { cloudEnabled } from "@/lib/supabase/config";
import { IndexedDbFileStore } from "./indexeddb-store";
import { prepareImage } from "./image";
import { SupabaseFileStore } from "./supabase-store";
import type { FileStore, PhotoRef, StoredFileMeta } from "./types";

/*
 * The one place that decides where uploaded files are kept:
 * Supabase Storage when Supabase is configured, otherwise this browser's IndexedDB.
 */
export const fileStore: FileStore = cloudEnabled ? new SupabaseFileStore(supabase) : new IndexedDbFileStore();

/** Largest file accepted for upload (photos are shrunk first). */
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

export class FileTooLargeError extends Error {
  constructor(name: string, size: number) {
    super(`${name} is ${(size / 1024 / 1024).toFixed(1)} MB; the limit is ${MAX_FILE_BYTES / 1024 / 1024} MB.`);
    this.name = "FileTooLargeError";
  }
}

/** Stores any file (photos are shrunk first) and returns its metadata. */
export async function uploadFile(file: File): Promise<StoredFileMeta & { takenAt: string | null; width: number; height: number }> {
  const img = await prepareImage(file);
  if (img.blob.size > MAX_FILE_BYTES) throw new FileTooLargeError(file.name, img.blob.size);
  const meta = await fileStore.put(img.blob, img.name);
  return { ...meta, takenAt: img.takenAt, width: img.width, height: img.height };
}

export async function uploadPhoto(file: File): Promise<PhotoRef> {
  const m = await uploadFile(file);
  return { fileId: m.id, name: m.name, type: m.type, size: m.size, takenAt: m.takenAt, uploadedAt: m.createdAt, width: m.width, height: m.height };
}

/** Something that points at file bytes: a stored file id, or (older records) a data: URL. */
export interface FileSource {
  fileId?: string | null;
  url?: string | null;
  name: string;
}

export async function fileBlob(src: FileSource): Promise<Blob | null> {
  if (src.fileId) return (await fileStore.get(src.fileId))?.blob ?? null;
  if (src.url) return (await fetch(src.url)).blob();
  return null;
}

/** Opens a file in a new tab (view = true) or downloads it. */
export async function openFile(src: FileSource, view = true) {
  // Open the tab synchronously so pop-up blockers allow it, then point it at the file.
  const win = view ? window.open("", "_blank") : null;
  const blob = await fileBlob(src);
  if (!blob) {
    win?.close();
    throw new Error(cloudEnabled ? `${src.name} could not be found in the file storage.` : `${src.name} could not be found in this browser.`);
  }
  const url = URL.createObjectURL(blob);
  if (win) win.location.href = url;
  else {
    const a = document.createElement("a");
    a.href = url;
    a.download = src.name;
    a.click();
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export type { FileStore, PhotoRef, StoredFileMeta } from "./types";
