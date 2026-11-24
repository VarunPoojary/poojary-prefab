import type { KeyValueStorage } from "@/lib/storage";
import { VALUE_ROW_ID, collectionKind, type RecordRow } from "./collections";

/** A change made by someone else, delivered by realtime. */
export type RemoteChange =
  | { type: "upsert"; row: RecordRow; clientId: string | null }
  | { type: "delete"; collection: string; id: string; clientId: string | null };

/** What the synced storage needs from the database (Supabase in the app, a fake in tests). */
export interface SyncBackend {
  /** Every row the user may read (all pages). */
  loadAll(): Promise<RecordRow[]>;
  /** Every row of the given collections. */
  loadCollections(collections: string[]): Promise<RecordRow[]>;
  upsert(rows: RecordRow[], clientId: string): Promise<void>;
  remove(items: { collection: string; id: string }[]): Promise<void>;
  /** Starts listening for changes; returns the function that stops it. */
  subscribe(onChange: (c: RemoteChange) => void): () => void;
}

export class NotLoadedError extends Error {
  constructor() {
    super("Your data has not been loaded from the cloud yet. Please sign in again.");
    this.name = "NotLoadedError";
  }
}

export class CloudSaveError extends Error {
  constructor(cause: unknown) {
    const msg = cause instanceof Error ? cause.message : String(cause);
    super(`Could not save to the cloud database (${msg}). The change was not saved – please try again.`);
    this.name = "CloudSaveError";
  }
}

interface Row {
  json: string;
  pos: number;
}

interface Entry {
  /** Row ids in list order. */
  ids: string[];
  rows: Map<string, Row>;
  /** The assembled value (as the browser repositories expect it), until the next change. */
  cached: string | null;
}

type Op = { type: "upsert"; row: RecordRow } | { type: "delete"; collection: string; id: string };

const opKey = (collection: string, id: string) => `${collection}\u0000${id}`;

const newClientId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36);

/**
 * KeyValueStorage backed by the cloud database.
 *
 * The browser repositories read and write whole lists synchronously, so the data is kept in memory:
 *  - hydrate() loads every row once after sign-in and starts listening for other users' changes;
 *  - setItem() compares the new list with the cached one and queues only the rows that changed;
 *  - flush() writes the queued rows (the repositories are wrapped so every change is flushed before the
 *    screen hears "saved"). If a write fails, the affected lists are reloaded from the database and the
 *    error is passed on, so the cache never keeps changes the database refused.
 */
export class CloudSyncStorage implements KeyValueStorage {
  readonly clientId = newClientId();
  private entries = new Map<string, Entry>();
  private pending = new Map<string, Op>();
  private hydrated = false;
  private hydrating: Promise<void> | null = null;
  /** Bumped by clear() and every load, so a load that finishes after sign-out is ignored. */
  private generation = 0;
  private unsubscribe: (() => void) | null = null;
  private chain: Promise<void> = Promise.resolve();
  private inflight: Promise<void> | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private changeListeners = new Set<(keys: string[]) => void>();
  private errorListeners = new Set<(e: Error) => void>();
  /** Bumped on every local change; lets callers tell whether an operation wrote anything. */
  writeCount = 0;

  constructor(private readonly backend: SyncBackend) {}

  /* ---------------- loading ---------------- */

  get isHydrated() {
    return this.hydrated;
  }

  /** Loads all data (once per sign-in) and subscribes to changes. */
  hydrate(): Promise<void> {
    if (this.hydrated) return Promise.resolve();
    if (!this.hydrating) {
      const run: Promise<void> = this.load().finally(() => {
        if (this.hydrating === run) this.hydrating = null;
      });
      this.hydrating = run;
    }
    return this.hydrating;
  }

  private async load() {
    const generation = ++this.generation;
    const buffered: RemoteChange[] = [];
    let ready = false;
    this.unsubscribe?.();
    const unsubscribe = this.backend.subscribe((c) => (ready ? this.applyRemote(c) : buffered.push(c)));
    this.unsubscribe = unsubscribe;
    let entries: Map<string, Entry>;
    try {
      entries = this.build(await this.backend.loadAll());
    } catch (e) {
      if (this.unsubscribe === unsubscribe) this.unsubscribe = null;
      unsubscribe();
      throw e;
    }
    if (generation !== this.generation) {
      // Signed out (or reloaded again) while loading: drop this result.
      if (this.unsubscribe === unsubscribe) this.unsubscribe = null;
      unsubscribe();
      return;
    }
    this.entries = entries;
    this.hydrated = true;
    ready = true;
    for (const c of buffered) this.applyRemote(c);
  }

  private build(rows: RecordRow[]) {
    const entries = new Map<string, Entry>();
    for (const r of [...rows].sort((a, b) => a.collection.localeCompare(b.collection) || a.pos - b.pos || a.id.localeCompare(b.id))) {
      let e = entries.get(r.collection);
      if (!e) entries.set(r.collection, (e = { ids: [], rows: new Map(), cached: null }));
      e.ids.push(r.id);
      e.rows.set(r.id, { json: JSON.stringify(r.data), pos: r.pos });
    }
    return entries;
  }

  /** Reloads everything from the database (e.g. after the server reset the demo data). */
  async reload() {
    // Keeps serving the current data until the fresh copy is in.
    this.pending.clear();
    await this.load();
    this.emitChange([...this.entries.keys()]);
  }

  /** Forgets all data (sign-out). */
  clear() {
    this.generation++;
    this.hydrating = null;
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.entries.clear();
    this.pending.clear();
    this.hydrated = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  /* ---------------- KeyValueStorage ---------------- */

  getItem(key: string): string | null {
    if (!this.hydrated) throw new NotLoadedError();
    const kind = collectionKind(key);
    const e = this.entries.get(key);
    if (kind.kind === "value") return e?.rows.get(VALUE_ROW_ID)?.json ?? null;
    // A list with no rows reads as empty (never as "missing"), so the repositories don't seed demo data.
    if (!e) return "[]";
    if (e.cached === null) e.cached = `[${e.ids.map((id) => e.rows.get(id)!.json).join(",")}]`;
    return e.cached;
  }

  setItem(key: string, value: string): void {
    if (!this.hydrated) throw new NotLoadedError();
    const kind = collectionKind(key);
    const parsed = JSON.parse(value) as unknown;
    if (kind.kind === "value") {
      const prev = this.entries.get(key)?.rows.get(VALUE_ROW_ID);
      const json = JSON.stringify(parsed);
      if (prev?.json === json) return;
      this.entries.set(key, { ids: [VALUE_ROW_ID], rows: new Map([[VALUE_ROW_ID, { json, pos: 0 }]]), cached: null });
      this.queue({ type: "upsert", row: { collection: key, id: VALUE_ROW_ID, data: parsed, pos: 0 } });
      return;
    }
    if (!Array.isArray(parsed)) throw new Error(`${key} must be a list.`);
    this.writeList(key, parsed, kind.idField);
  }

  removeItem(key: string): void {
    if (!this.hydrated) throw new NotLoadedError();
    const e = this.entries.get(key);
    if (!e) return;
    for (const id of e.ids) this.queue({ type: "delete", collection: key, id });
    this.entries.delete(key);
  }

  private writeList(key: string, items: unknown[], idField: string) {
    const prev = this.entries.get(key) ?? { ids: [], rows: new Map<string, Row>(), cached: null };
    const ids: string[] = [];
    const seen = new Set<string>();
    const list: { id: string; item: unknown; json: string }[] = [];
    for (const item of items) {
      const raw = (item as Record<string, unknown> | null)?.[idField];
      if (typeof raw !== "string" && typeof raw !== "number") throw new Error(`A record in ${key} has no ${idField}.`);
      const id = String(raw);
      if (seen.has(id)) continue; // keep the first copy of a duplicated id
      seen.add(id);
      ids.push(id);
      list.push({ id, item, json: JSON.stringify(item) });
    }

    let positions = this.positions(list.map((x) => prev.rows.get(x.id)?.pos));
    if (!positions) positions = list.map((_, i) => i + 1); // ran out of room between two rows: renumber all

    const rows = new Map<string, Row>();
    list.forEach((x, i) => {
      const pos = positions![i]!;
      rows.set(x.id, { json: x.json, pos });
      const old = prev.rows.get(x.id);
      if (!old || old.json !== x.json || old.pos !== pos) this.queue({ type: "upsert", row: { collection: key, id: x.id, data: x.item, pos } });
    });
    for (const id of prev.ids) if (!seen.has(id)) this.queue({ type: "delete", collection: key, id });
    this.entries.set(key, { ids, rows, cached: null });
  }

  /**
   * Positions that keep the list order while reusing as many stored positions as possible (so appending,
   * removing or editing a record writes only that record). Returns null if two neighbours are too close.
   */
  private positions(stored: (number | undefined)[]): number[] | null {
    const n = stored.length;
    // nextStored[i] = first index ≥ i that has a stored position.
    const nextStored = new Array<number>(n + 1).fill(n);
    for (let i = n - 1; i >= 0; i--) nextStored[i] = stored[i] !== undefined ? i : nextStored[i + 1]!;
    const out: number[] = [];
    let last = -Infinity;
    for (let i = 0; i < n; i++) {
      const p = stored[i];
      if (p !== undefined && p > last) {
        out.push((last = p));
        continue;
      }
      let j = nextStored[i + 1]!;
      while (j < n && !(stored[j]! > last)) j = nextStored[j + 1]!;
      const upper = j < n ? stored[j]! : undefined;
      let pos: number;
      if (upper === undefined) pos = last === -Infinity ? 1 : Math.floor(last) + 1;
      else if (last === -Infinity) pos = upper - 1;
      else pos = (last + upper) / 2;
      if (!(pos > last) || (upper !== undefined && !(pos < upper))) return null;
      out.push((last = pos));
    }
    return out;
  }

  /* ---------------- writing ---------------- */

  private queue(op: Op) {
    const collection = op.type === "upsert" ? op.row.collection : op.collection;
    const id = op.type === "upsert" ? op.row.id : op.id;
    this.pending.set(opKey(collection, id), op);
    this.writeCount++;
    // Changes made outside a wrapped repository call still reach the database.
    if (!this.timer) {
      this.timer = setTimeout(() => {
        this.timer = null;
        if (this.pending.size) this.flush().catch((e: Error) => this.emitError(e));
      }, 0);
    }
  }

  get hasPending() {
    return this.pending.size > 0 || this.inflight !== null;
  }

  /** Writes every queued change; rejects with CloudSaveError if the database refused them. */
  flush(): Promise<void> {
    if (!this.pending.size) return this.inflight ?? Promise.resolve();
    const batch = [...this.pending.values()];
    this.pending = new Map();
    const run = this.chain.then(() => this.send(batch));
    this.chain = run.catch(() => undefined);
    const tracked = run.finally(() => {
      if (this.inflight === tracked) this.inflight = null;
    });
    this.inflight = tracked;
    return tracked;
  }

  private async send(batch: Op[]) {
    const upserts = batch.filter((o): o is Extract<Op, { type: "upsert" }> => o.type === "upsert").map((o) => o.row);
    const deletes = batch.filter((o): o is Extract<Op, { type: "delete" }> => o.type === "delete");
    try {
      if (upserts.length) await this.backend.upsert(upserts, this.clientId);
      if (deletes.length) await this.backend.remove(deletes.map(({ collection, id }) => ({ collection, id })));
    } catch (e) {
      const collections = [...new Set(batch.map((o) => (o.type === "upsert" ? o.row.collection : o.collection)))];
      await this.resync(collections).catch(() => undefined);
      throw new CloudSaveError(e);
    }
  }

  /** Re-reads the given lists from the database now (instead of waiting for realtime). */
  refresh(collections: string[]) {
    return this.resync(collections);
  }

  /** Replaces the given lists with what the database holds. */
  private async resync(collections: string[]) {
    const rows = await this.backend.loadCollections(collections);
    const fresh = this.build(rows);
    for (const c of collections) {
      const e = fresh.get(c);
      if (e) this.entries.set(c, e);
      else this.entries.delete(c);
    }
    this.emitChange(collections);
  }

  /* ---------------- other users' changes ---------------- */

  private applyRemote(c: RemoteChange) {
    if (c.clientId && c.clientId === this.clientId) return; // our own write coming back
    const collection = c.type === "upsert" ? c.row.collection : c.collection;
    const id = c.type === "upsert" ? c.row.id : c.id;
    // A local change to the same row that is not written yet wins; it is about to overwrite this one.
    if (this.pending.has(opKey(collection, id))) return;
    let e = this.entries.get(collection);
    if (c.type === "delete") {
      if (!e?.rows.has(id)) return;
      e.rows.delete(id);
      e.ids = e.ids.filter((x) => x !== id);
    } else {
      if (!e) this.entries.set(collection, (e = { ids: [], rows: new Map(), cached: null }));
      const json = JSON.stringify(c.row.data);
      const old = e.rows.get(id);
      if (old && old.json === json && old.pos === c.row.pos) return;
      e.rows.set(id, { json, pos: c.row.pos });
      if (!old || old.pos !== c.row.pos) {
        const rows = e.rows;
        e.ids = [...rows.keys()].sort((a, b) => rows.get(a)!.pos - rows.get(b)!.pos || a.localeCompare(b));
      }
    }
    e.cached = null;
    this.emitChange([collection]);
  }

  /* ---------------- listeners ---------------- */

  /** Called with the changed keys when data changed outside this tab (or was reloaded). */
  onChange(cb: (keys: string[]) => void) {
    this.changeListeners.add(cb);
    return () => void this.changeListeners.delete(cb);
  }

  /** Called when a background save failed. */
  onError(cb: (e: Error) => void) {
    this.errorListeners.add(cb);
    return () => void this.errorListeners.delete(cb);
  }

  private emitChange(keys: string[]) {
    for (const cb of this.changeListeners) cb(keys);
  }

  private emitError(e: Error) {
    for (const cb of this.errorListeners) cb(e);
  }
}

/**
 * Wraps a repository so each call that changed data waits until the change is in the database
 * (and fails if the database refused it). Calls that only read are passed through unchanged.
 */
export function withCloudSync<T extends object>(
  repo: T,
  store: CloudSyncStorage | null,
  /** Loads the data if a user is signed in; resolves false when nobody is. */
  ensureLoaded: () => Promise<boolean> = async () => false,
): T {
  if (!store) return repo;
  return new Proxy(repo, {
    get(target, prop) {
      const value = Reflect.get(target, prop, target) as unknown;
      if (typeof value !== "function") return value;
      return (...args: unknown[]) => {
        const before = store.writeCount;
        const result = (value as (...a: unknown[]) => unknown).apply(target, args);
        if (!(result instanceof Promise)) return result;
        return result.then(
          async (v) => {
            if (store.writeCount !== before) await store.flush();
            return v;
          },
          async (err) => {
            if (store.writeCount !== before) await store.flush().catch(() => undefined);
            // Called while the data was still loading after sign-in: wait for it and try once more.
            if (err instanceof NotLoadedError && (await ensureLoaded())) {
              const retryBefore = store.writeCount;
              const v = await ((value as (...a: unknown[]) => unknown).apply(target, args) as Promise<unknown>);
              if (store.writeCount !== retryBefore) await store.flush();
              return v;
            }
            throw err;
          },
        );
      };
    },
  });
}
