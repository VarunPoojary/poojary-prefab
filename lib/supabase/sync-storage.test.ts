import { describe, expect, it } from "vitest";
import { VALUE_ROW_ID, toRows, type RecordRow } from "./collections";
import { CloudSaveError, CloudSyncStorage, NotLoadedError, withCloudSync, type RemoteChange, type SyncBackend } from "./sync-storage";

/** In-memory stand-in for the app_records table (with realtime). */
class FakeDb implements SyncBackend {
  rows = new Map<string, RecordRow & { clientId: string | null }>();
  listeners = new Set<(c: RemoteChange) => void>();
  upserted: RecordRow[] = [];
  deleted: { collection: string; id: string }[] = [];
  failNext = false;

  private k = (c: string, id: string) => `${c}|${id}`;

  seed(key: string, value: unknown) {
    for (const r of toRows(key, value)) this.rows.set(this.k(r.collection, r.id), { ...r, clientId: null });
  }
  async loadAll() {
    return [...this.rows.values()].map(({ clientId: _c, ...r }) => structuredClone(r)); // eslint-disable-line @typescript-eslint/no-unused-vars
  }
  async loadCollections(cs: string[]) {
    return (await this.loadAll()).filter((r) => cs.includes(r.collection));
  }
  async upsert(rows: RecordRow[], clientId: string) {
    if (this.failNext) {
      this.failNext = false;
      throw new Error("permission denied");
    }
    for (const r of rows) {
      this.upserted.push(r);
      this.rows.set(this.k(r.collection, r.id), { ...structuredClone(r), clientId });
      for (const l of this.listeners) l({ type: "upsert", row: structuredClone(r), clientId });
    }
  }
  async remove(items: { collection: string; id: string }[]) {
    for (const i of items) {
      this.deleted.push(i);
      this.rows.delete(this.k(i.collection, i.id));
    }
  }
  subscribe(cb: (c: RemoteChange) => void) {
    this.listeners.add(cb);
    return () => void this.listeners.delete(cb);
  }
  /** Another user's change. */
  remote(c: RemoteChange) {
    for (const l of this.listeners) l(c);
  }
}

const KEY = "pppl.expenses.v1";
const list = (s: CloudSyncStorage, key = KEY) => JSON.parse(s.getItem(key)!) as { id: string; v?: number }[];

async function setup(initial: { id: string; v?: number }[] = [{ id: "a" }, { id: "b" }, { id: "c" }]) {
  const db = new FakeDb();
  db.seed(KEY, initial);
  const s = new CloudSyncStorage(db);
  await s.hydrate();
  return { db, s };
}

describe("CloudSyncStorage", () => {
  it("refuses to read before the data is loaded", () => {
    const s = new CloudSyncStorage(new FakeDb());
    expect(() => s.getItem(KEY)).toThrow(NotLoadedError);
  });

  it("loads lists in order, reads missing lists as empty and missing values as null", async () => {
    const { s } = await setup();
    expect(list(s).map((x) => x.id)).toEqual(["a", "b", "c"]);
    expect(s.getItem("pppl.attendance.v1")).toBe("[]");
    expect(s.getItem("pppl.settings.v1")).toBeNull();
  });

  it("writes only the records that changed", async () => {
    const { db, s } = await setup();
    s.setItem(KEY, JSON.stringify([{ id: "a" }, { id: "b", v: 2 }, { id: "c" }, { id: "d" }]));
    await s.flush();
    expect(db.upserted.map((r) => r.id)).toEqual(["b", "d"]);
    s.setItem(KEY, JSON.stringify([{ id: "a" }, { id: "c" }, { id: "d" }]));
    await s.flush();
    expect(db.deleted).toEqual([{ collection: KEY, id: "b" }]);
    expect(db.upserted).toHaveLength(2); // removing a record doesn't rewrite the others
  });

  it("keeps the list order across a reload, including records inserted in the middle", async () => {
    const { db, s } = await setup();
    s.setItem(KEY, JSON.stringify([{ id: "x" }, { id: "a" }, { id: "y" }, { id: "b" }, { id: "c" }, { id: "z" }]));
    await s.flush();
    expect(db.upserted.map((r) => r.id)).toEqual(["x", "y", "z"]);
    const again = new CloudSyncStorage(db);
    await again.hydrate();
    expect(list(again).map((x) => x.id)).toEqual(["x", "a", "y", "b", "c", "z"]);
  });

  it("stores single values as one row", async () => {
    const { db, s } = await setup();
    s.setItem("pppl.expense-counter.v1", JSON.stringify({ 2026: 5 }));
    await s.flush();
    expect(db.upserted).toEqual([{ collection: "pppl.expense-counter.v1", id: VALUE_ROW_ID, data: { 2026: 5 }, pos: 0 }]);
    expect(JSON.parse(s.getItem("pppl.expense-counter.v1")!)).toEqual({ 2026: 5 });
  });

  it("applies other users' changes and ignores the echo of its own", async () => {
    const { db, s } = await setup();
    const changed: string[][] = [];
    s.onChange((k) => changed.push(k));
    s.setItem(KEY, JSON.stringify([{ id: "a", v: 1 }, { id: "b" }, { id: "c" }]));
    await s.flush();
    expect(changed).toEqual([]); // own echo
    db.remote({ type: "upsert", row: { collection: KEY, id: "e", data: { id: "e" }, pos: 10 }, clientId: "other" });
    db.remote({ type: "delete", collection: KEY, id: "b", clientId: "other" });
    expect(list(s).map((x) => x.id)).toEqual(["a", "c", "e"]);
    expect(changed).toEqual([[KEY], [KEY]]);
  });

  it("reloads the list and reports the error when the database refuses a write", async () => {
    const { db, s } = await setup();
    db.failNext = true;
    s.setItem(KEY, JSON.stringify([{ id: "a", v: 9 }]));
    await expect(s.flush()).rejects.toBeInstanceOf(CloudSaveError);
    expect(list(s)).toEqual([{ id: "a" }, { id: "b" }, { id: "c" }]);
  });

  it("ignores a load that finishes after sign-out", async () => {
    const db = new FakeDb();
    db.seed(KEY, [{ id: "a" }]);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const slow: SyncBackend = { ...db, subscribe: db.subscribe.bind(db), loadCollections: db.loadCollections.bind(db), upsert: db.upsert.bind(db), remove: db.remove.bind(db), loadAll: async () => (await gate, db.loadAll()) };
    const s = new CloudSyncStorage(slow);
    const first = s.hydrate();
    s.clear();
    const second = s.hydrate(); // new sign-in: must not reuse the dropped load
    release();
    await first;
    await second;
    expect(s.isHydrated).toBe(true);
    expect(list(s)).toEqual([{ id: "a" }]);
    s.clear();
    expect(() => s.getItem(KEY)).toThrow(NotLoadedError);
  });

  it("a call made before the data is loaded waits for the load and runs again", async () => {
    const db = new FakeDb();
    db.seed(KEY, [{ id: "a" }, { id: "b" }]);
    const s = new CloudSyncStorage(db);
    const repo = withCloudSync({ count: async () => list(s).length }, s, async () => (await s.hydrate(), true));
    await expect(repo.count()).resolves.toBe(2);
  });

  it("wrapped repositories wait for their writes and surface failures", async () => {
    const { db, s } = await setup();
    const repo = withCloudSync(
      {
        async save(v: number) {
          s.setItem(KEY, JSON.stringify([{ id: "a", v }]));
          return v;
        },
        async read() {
          return list(s).length;
        },
        sync: () => 42,
      },
      s,
    );
    expect(repo.sync()).toBe(42);
    await expect(repo.save(1)).resolves.toBe(1);
    expect(db.rows.get(`${KEY}|a`)?.data).toEqual({ id: "a", v: 1 });
    db.failNext = true;
    await expect(repo.save(2)).rejects.toBeInstanceOf(CloudSaveError);
    await expect(repo.read()).resolves.toBe(1);
  });
});
