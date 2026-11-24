/** Metadata kept for every stored file. The bytes live in the FileStore, records only keep the id. */
export interface StoredFileMeta {
  id: string;
  name: string;
  type: string;
  size: number;
  createdAt: string;
}

/**
 * Where uploaded files (photos, documents, attachments) are kept.
 * Browser version: IndexedDB (far larger than localStorage). Cloud version: object storage behind an upload API.
 */
export interface FileStore {
  readonly label: string;
  put(blob: Blob, name: string, opts?: { id?: string }): Promise<StoredFileMeta>;
  get(id: string): Promise<{ meta: StoredFileMeta; blob: Blob } | null>;
  remove(id: string): Promise<void>;
  clear?(): Promise<void>;
}

/** Reference to a stored photo as kept on progress updates and notes. */
export interface PhotoRef {
  fileId: string;
  name: string;
  type: string;
  size: number;
  /** When the photo was taken (from the photo's EXIF data), if known. */
  takenAt: string | null;
  uploadedAt: string;
  width?: number;
  height?: number;
}
