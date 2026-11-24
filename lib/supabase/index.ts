import { SupabaseSyncBackend } from "./backend";
import { supabase } from "./client";
import { cloudEnabled } from "./config";
import { CloudSyncStorage, withCloudSync as wrap } from "./sync-storage";

let store: CloudSyncStorage | null = null;

/** The app's data store in Supabase mode (browser only); null when the app runs on browser storage. */
export function cloudStorage(): CloudSyncStorage | null {
  if (!cloudEnabled || typeof window === "undefined") return null;
  if (!store) store = new CloudSyncStorage(new SupabaseSyncBackend(supabase));
  return store;
}

/** Loads the data when a user is signed in to Supabase (used when a screen asks before sign-in finished). */
async function ensureLoaded(): Promise<boolean> {
  const s = cloudStorage();
  if (!s) return false;
  if (s.isHydrated) return true;
  const { data } = await supabase().auth.getSession();
  if (!data.session) return false;
  await s.hydrate();
  return s.isHydrated;
}

/** In Supabase mode, makes the repository's changes wait until they are saved in the database. */
export function withCloudSync<T extends object>(repo: T): T {
  return wrap(repo, cloudStorage(), ensureLoaded);
}

export { cloudEnabled } from "./config";
