import type { FileStore, StoredFileMeta } from "./types";

/**
 * Cloud file storage – NOT USED YET.
 *
 * Expected endpoints:
 *   POST   /files            multipart { file }       -> StoredFileMeta
 *   GET    /files/:id                                 -> the file (or a redirect to a signed URL)
 *   GET    /files/:id/meta                            -> StoredFileMeta
 *   DELETE /files/:id                                 -> 204
 * The server checks that the user may see the record the file belongs to.
 */
export class ApiFileStore implements FileStore {
  readonly label = "Cloud storage";
  constructor(private readonly baseUrl: string) {}

  async put(blob: Blob, name: string): Promise<StoredFileMeta> {
    const form = new FormData();
    form.append("file", blob, name);
    const res = await fetch(`${this.baseUrl}/files`, { method: "POST", body: form, credentials: "include" });
    if (!res.ok) throw new Error(`Upload failed (${res.status})`);
    return (await res.json()) as StoredFileMeta;
  }

  async get(id: string) {
    const [metaRes, fileRes] = await Promise.all([
      fetch(`${this.baseUrl}/files/${id}/meta`, { credentials: "include" }),
      fetch(`${this.baseUrl}/files/${id}`, { credentials: "include" }),
    ]);
    if (!metaRes.ok || !fileRes.ok) return null;
    return { meta: (await metaRes.json()) as StoredFileMeta, blob: await fileRes.blob() };
  }

  async remove(id: string) {
    await fetch(`${this.baseUrl}/files/${id}`, { method: "DELETE", credentials: "include" });
  }
}
