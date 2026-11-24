import type { KeyValueStorage } from "@/lib/storage";
import type { FileStore } from "./types";

const MARKER = "pppl.files-migrated.v1";

/** Lists whose items carry a data: URL in `url` that should move to the file store. */
const TARGETS: { key: string; field: "attachments" | "documents" }[] = [
  { key: "pppl.enquiries.v1", field: "attachments" },
  { key: "pppl.employees.v1", field: "documents" },
];

interface FileItem {
  id: string;
  name: string;
  type?: string;
  url?: string;
  fileId?: string;
}

/**
 * Moves files saved by earlier versions as data: URLs inside localStorage into the file store (IndexedDB), once.
 * Records keep their metadata and get a fileId instead of the inline data. Returns the number of files moved.
 */
export async function migrateInlineFiles(storage: KeyValueStorage, files: FileStore): Promise<number> {
  if (storage.getItem(MARKER)) return 0;
  let moved = 0;
  for (const { key, field } of TARGETS) {
    const raw = storage.getItem(key);
    if (!raw) continue;
    let list: Record<string, unknown>[];
    try {
      list = JSON.parse(raw);
    } catch {
      continue;
    }
    if (!Array.isArray(list)) continue;
    let changed = false;
    for (const rec of list) {
      const items = rec[field] as FileItem[] | undefined;
      if (!Array.isArray(items)) continue;
      for (const it of items) {
        if (it.fileId || !it.url?.startsWith("data:")) continue;
        const blob = await (await fetch(it.url)).blob();
        const meta = await files.put(blob, it.name, { id: `file_${it.id}` });
        it.fileId = meta.id;
        it.url = "";
        changed = true;
        moved++;
      }
    }
    if (changed) storage.setItem(key, JSON.stringify(list));
  }
  storage.setItem(MARKER, new Date().toISOString());
  return moved;
}
