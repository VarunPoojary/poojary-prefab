/**
 * Storage used by the repositories.
 *
 * With Supabase configured (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY) the data lives in the
 * Supabase database, synced through lib/supabase/sync-storage.ts. Without it, data lives in localStorage.
 * The sign-in session lives in sessionStorage either way, so every tab signs in separately.
 */
import { cloudStorage } from "@/lib/supabase";

/** Minimal subset of the Web Storage API so tests can pass an in-memory store. */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface EnumerableStorage extends KeyValueStorage {
  readonly length: number;
  key(index: number): string | null;
}

/** Prefix of every key this app stores. */
export const KEY_PREFIX = "pppl.";
export const SESSION_KEY = "pppl.session.v1";
const MIGRATION_MARKER = "pppl.migrated-from-session.v1";

/**
 * Copies data saved by older versions (which used sessionStorage) to localStorage, once.
 * Existing localStorage values win; the sign-in session is not copied.
 */
export function migrateSessionToLocal(from: EnumerableStorage, to: EnumerableStorage) {
  if (to.getItem(MIGRATION_MARKER)) return;
  for (let i = 0; i < from.length; i++) {
    const key = from.key(i);
    if (!key || !key.startsWith(KEY_PREFIX) || key === SESSION_KEY || key === MIGRATION_MARKER) continue;
    const value = from.getItem(key);
    if (value !== null && to.getItem(key) === null) to.setItem(key, value);
  }
  to.setItem(MIGRATION_MARKER, new Date().toISOString());
}

let migrated = false;

/**
 * Persistent app data store: the Supabase database when it is configured (see lib/supabase),
 * otherwise this browser's localStorage.
 */
export function appStorage(): KeyValueStorage {
  const cloud = cloudStorage();
  if (cloud) return cloud;
  if (!migrated && typeof window !== "undefined") {
    migrated = true;
    try {
      migrateSessionToLocal(window.sessionStorage, window.localStorage);
    } catch {
      // Storage can be unavailable (private mode quotas); the app still works with what it has.
    }
  }
  return window.localStorage;
}

/** Per-tab store for the sign-in session (sessionStorage). */
export function sessionStore(): KeyValueStorage {
  return window.sessionStorage;
}

/** In-memory storage for tests. */
export function memoryStorage(limit = Infinity): EnumerableStorage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    get length() {
      return map.size;
    },
    key: (i: number) => [...map.keys()][i] ?? null,
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

export function readJson<T>(storage: KeyValueStorage, key: string): T | null {
  const raw = storage.getItem(key);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
