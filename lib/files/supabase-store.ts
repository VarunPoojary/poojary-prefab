import type { SupabaseClient } from "@supabase/supabase-js";
import { FILE_META_TABLE, FILES_BUCKET } from "@/lib/supabase/config";
import type { FileStore, StoredFileMeta } from "./types";

const newId = () => `file_${typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2)}`;

interface MetaRow {
  id: string;
  name: string;
  type: string;
  size: number;
  created_at: string;
}

const toMeta = (r: MetaRow): StoredFileMeta => ({ id: r.id, name: r.name, type: r.type, size: Number(r.size), createdAt: r.created_at });

/**
 * Uploaded files in the private Supabase Storage bucket "files" (object name = file id); name, type and size in
 * the file_meta table. Records keep only the file id, as before.
 */
export class SupabaseFileStore implements FileStore {
  readonly label = "Supabase Storage";
  constructor(private readonly db: () => SupabaseClient) {}

  async put(blob: Blob, name: string, opts: { id?: string } = {}): Promise<StoredFileMeta> {
    const meta: StoredFileMeta = {
      id: opts.id ?? newId(),
      name,
      type: blob.type || "application/octet-stream",
      size: blob.size,
      createdAt: new Date().toISOString(),
    };
    // Plain inserts: every upload gets a new id, and signed-in users may add files but not overwrite them.
    const up = await this.db().storage.from(FILES_BUCKET).upload(meta.id, blob, { contentType: meta.type, upsert: false });
    if (up.error) throw new Error(`Upload failed: ${up.error.message}`);
    const { error } = await this.db()
      .from(FILE_META_TABLE)
      .insert({ id: meta.id, name: meta.name, type: meta.type, size: meta.size, created_at: meta.createdAt });
    if (error) {
      await this.db().storage.from(FILES_BUCKET).remove([meta.id]);
      throw new Error(`Upload failed: ${error.message}`);
    }
    return meta;
  }

  async get(id: string) {
    const [metaRes, fileRes] = await Promise.all([
      this.db().from(FILE_META_TABLE).select("id,name,type,size,created_at").eq("id", id).maybeSingle(),
      this.db().storage.from(FILES_BUCKET).download(id),
    ]);
    if (fileRes.error || !fileRes.data) return null;
    const row = metaRes.data as MetaRow | null;
    const blob = fileRes.data;
    const meta = row ? toMeta(row) : { id, name: id, type: blob.type, size: blob.size, createdAt: new Date(0).toISOString() };
    return { meta, blob: meta.type && blob.type !== meta.type ? new Blob([blob], { type: meta.type }) : blob };
  }

  async remove(id: string) {
    await this.db().storage.from(FILES_BUCKET).remove([id]);
    await this.db().from(FILE_META_TABLE).delete().eq("id", id);
  }

  // No clear(): emptying the bucket is done by the server when the demo data is reset.
}
