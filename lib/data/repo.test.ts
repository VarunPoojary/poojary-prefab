import { describe, expect, it } from "vitest";
import { createQuotation } from "@/lib/defaults";
import { SessionStorageRepository, STORAGE_KEY, type KeyValueStorage } from "./session-repo";
import { nextRevision, normalize } from "./summary";
import { NotFoundError, StorageFullError } from "./types";

function memoryStorage(limit = Infinity): KeyValueStorage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      if (v.length > limit) {
        const e = new Error("exceeded the quota");
        e.name = "QuotaExceededError";
        throw e;
      }
      map.set(k, v);
    },
    removeItem: (k) => void map.delete(k),
  };
}

const repo = (seed = true, store = memoryStorage()) => ({ store, r: new SessionStorageRepository(() => store, 0, seed) });

describe("SessionStorageRepository", () => {
  it("seeds demo data only when storage is empty", async () => {
    const { r, store } = repo();
    const first = await r.list({ pageSize: 100 });
    expect(first.total).toBe(10);
    await r.remove(first.items[0].id);
    expect((await r.list()).total).toBe(9);
    expect(JSON.parse(store.map.get(STORAGE_KEY)!)).toHaveLength(9);
  });

  it("creates, reads, updates and deletes", async () => {
    const { r } = repo(false);
    const q = createQuotation("boq");
    q.client.company = "Acme";
    const created = await r.create(q);
    expect(created.status).toBe("draft");
    const got = await r.get(created.id);
    expect(got.data.client.company).toBe("Acme");

    got.data.client.company = "Mutated locally";
    expect((await r.get(created.id)).data.client.company).toBe("Acme");

    const updated = await r.update(created.id, { data: { ...got.data, client: { ...got.data.client, company: "Acme 2" } }, status: "final" });
    expect(updated.status).toBe("final");
    expect(updated.updatedAt >= created.updatedAt).toBe(true);
    expect((await r.list()).items[0].client).toBe("Acme 2");

    await r.remove(created.id);
    await expect(r.get(created.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("searches, filters, sorts and pages", async () => {
    const { r } = repo();
    expect((await r.list({ search: "thermax" })).total).toBe(2);
    expect((await r.list({ search: "kalyani chakan" })).total).toBe(2);
    expect((await r.list({ mode: "area" })).total).toBe(3);
    expect((await r.list({ status: "draft" })).items.every((i) => i.status === "draft")).toBe(true);
    const byAmount = (await r.list({ sort: "amount", dir: "desc", pageSize: 100 })).items.map((i) => i.grandTotal);
    expect(byAmount).toEqual([...byAmount].sort((a, b) => b - a));
    const page2 = await r.list({ sort: "offerNo", dir: "asc", page: 2, pageSize: 3 });
    expect(page2.items).toHaveLength(3);
    expect(page2.items[0].offerNo).toBe("15");
  });

  it("duplicates with the next offer number and creates revisions", async () => {
    const { r } = repo();
    const all = (await r.list({ pageSize: 100 })).items;
    const offer15 = all.find((i) => i.offerNo === "15" && i.revision === "00")!;
    const rev = await r.newRevision(offer15.id);
    expect(rev.data.meta.offerNo).toBe("15");
    expect(rev.data.meta.revision).toBe("02"); // Rev 01 already exists
    expect(rev.status).toBe("draft");

    const dup = await r.duplicate(offer15.id);
    expect(dup.data.meta.offerNo).toBe("72"); // highest seeded offer is 71
    expect(dup.data.meta.revision).toBe("00");
    expect(await r.suggestNextOfferNo()).toBe("73");
  });

  it("reports a full storage clearly", async () => {
    const store = memoryStorage(10);
    const r = new SessionStorageRepository(() => store, 0, false);
    await expect(r.create(createQuotation("boq"))).rejects.toBeInstanceOf(StorageFullError);
  });
});

describe("data helpers", () => {
  it("increments revisions", () => {
    expect(nextRevision("00")).toBe("01");
    expect(nextRevision("0")).toBe("01");
    expect(nextRevision("09")).toBe("10");
  });

  it("fills fields missing from older records", () => {
    const old = createQuotation("boq") as unknown as Record<string, Record<string, unknown>>;
    delete old.letter.body;
    const q = normalize(old as never);
    expect(q.letter.body.length).toBeGreaterThan(100);
  });
});
