import type { FileStore, StoredFileMeta } from "./types";

const DB_NAME = "pppl-files";
const STORE = "files";

interface Row {
  meta: StoredFileMeta;
  blob: Blob;
}

const newId = () => `file_${typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2)}`;

/** TEMPORARY file storage in the browser's IndexedDB. Replace with ApiFileStore when the cloud storage is ready. */
export class IndexedDbFileStore implements FileStore {
  readonly label = "This browser (temporary)";
  private db: Promise<IDBDatabase> | null = null;

  private open(): Promise<IDBDatabase> {
    if (!this.db) {
      this.db = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    return this.db;
  }

  private async tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const req = run(t.objectStore(STORE));
      t.oncomplete = () => resolve(req.result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error ?? new Error("Could not save the file (browser storage full?)."));
    });
  }

  async put(blob: Blob, name: string, opts: { id?: string } = {}): Promise<StoredFileMeta> {
    const meta: StoredFileMeta = {
      id: opts.id ?? newId(),
      name,
      type: blob.type || "application/octet-stream",
      size: blob.size,
      createdAt: new Date().toISOString(),
    };
    await this.tx("readwrite", (s) => s.put({ meta, blob } satisfies Row, meta.id));
    return meta;
  }

  async get(id: string) {
    const row = (await this.tx("readonly", (s) => s.get(id))) as Row | undefined;
    return row ?? null;
  }

  async remove(id: string) {
    await this.tx("readwrite", (s) => s.delete(id));
  }

  async clear() {
    await this.tx("readwrite", (s) => s.clear());
  }
}

/** In-memory store for tests. */
export class MemoryFileStore implements FileStore {
  readonly label = "Memory";
  readonly rows = new Map<string, Row>();
  async put(blob: Blob, name: string, opts: { id?: string } = {}) {
    const meta = { id: opts.id ?? newId(), name, type: blob.type, size: blob.size, createdAt: new Date().toISOString() };
    this.rows.set(meta.id, { meta, blob });
    return meta;
  }
  async get(id: string) {
    return this.rows.get(id) ?? null;
  }
  async remove(id: string) {
    this.rows.delete(id);
  }
}
