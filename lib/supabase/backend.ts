import type { SupabaseClient } from "@supabase/supabase-js";
import type { RecordRow } from "./collections";
import { RECORDS_TABLE } from "./config";
import type { RemoteChange, SyncBackend } from "./sync-storage";

const PAGE = 1000;
/** Keep each upsert request well under the API's body limit (quotations carry their photos). */
const MAX_BATCH_BYTES = 1_500_000;
const MAX_BATCH_ROWS = 500;
const DELETE_CHUNK = 100;

type DbRow = RecordRow & { client_id?: string | null };

function fail(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

/** Reads and writes app_records through supabase-js; used by CloudSyncStorage in the browser. */
export class SupabaseSyncBackend implements SyncBackend {
  constructor(private readonly db: () => SupabaseClient) {}

  private async page(collections: string[] | null): Promise<RecordRow[]> {
    const out: RecordRow[] = [];
    for (let from = 0; ; from += PAGE) {
      let q = this.db().from(RECORDS_TABLE).select("collection,id,data,pos");
      if (collections) q = q.in("collection", collections);
      const { data, error } = await q.order("collection").order("pos").order("id").range(from, from + PAGE - 1);
      fail(error);
      out.push(...((data ?? []) as RecordRow[]));
      if (!data || data.length < PAGE) return out;
    }
  }

  loadAll() {
    return this.page(null);
  }

  loadCollections(collections: string[]) {
    return collections.length ? this.page(collections) : Promise.resolve([]);
  }

  async upsert(rows: RecordRow[], clientId: string) {
    const now = new Date().toISOString();
    let batch: object[] = [];
    let bytes = 0;
    const send = async () => {
      if (!batch.length) return;
      const { error } = await this.db().from(RECORDS_TABLE).upsert(batch, { onConflict: "collection,id" });
      fail(error);
      batch = [];
      bytes = 0;
    };
    for (const r of rows) {
      const row = { collection: r.collection, id: r.id, data: r.data, pos: r.pos, updated_at: now, client_id: clientId };
      const size = JSON.stringify(row).length;
      if (batch.length && (bytes + size > MAX_BATCH_BYTES || batch.length >= MAX_BATCH_ROWS)) await send();
      batch.push(row);
      bytes += size;
    }
    await send();
  }

  async remove(items: { collection: string; id: string }[]) {
    const byCollection = new Map<string, string[]>();
    for (const { collection, id } of items) byCollection.set(collection, [...(byCollection.get(collection) ?? []), id]);
    for (const [collection, ids] of byCollection) {
      for (let i = 0; i < ids.length; i += DELETE_CHUNK) {
        const { error } = await this.db().from(RECORDS_TABLE).delete().eq("collection", collection).in("id", ids.slice(i, i + DELETE_CHUNK));
        fail(error);
      }
    }
  }

  subscribe(onChange: (c: RemoteChange) => void) {
    const channel = this.db()
      .channel(`app-records-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: RECORDS_TABLE }, (payload) => {
        if (payload.eventType === "DELETE") {
          const old = payload.old as Partial<DbRow>;
          if (old.collection && old.id) onChange({ type: "delete", collection: old.collection, id: old.id, clientId: old.client_id ?? null });
          return;
        }
        const row = payload.new as Partial<DbRow>;
        if (!row.collection || !row.id) return;
        if (row.data === undefined) {
          // Very large rows can arrive without their data; fetch the row instead.
          void this.db()
            .from(RECORDS_TABLE)
            .select("collection,id,data,pos,client_id")
            .eq("collection", row.collection)
            .eq("id", row.id)
            .maybeSingle()
            .then(({ data }) => {
              const r = data as DbRow | null;
              if (r) onChange({ type: "upsert", row: r, clientId: r.client_id ?? null });
            });
          return;
        }
        onChange({ type: "upsert", row: { collection: row.collection, id: row.id, data: row.data, pos: row.pos ?? 0 }, clientId: row.client_id ?? null });
      })
      .subscribe();
    return () => void this.db().removeChannel(channel);
  }
}
