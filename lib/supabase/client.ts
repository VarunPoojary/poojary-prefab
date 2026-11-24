import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./config";

let client: SupabaseClient | null = null;

/**
 * The browser's Supabase client. The Supabase session is kept in sessionStorage, so – like before – every tab
 * signs in separately and closing the tab signs out.
 */
export function supabase(): SupabaseClient {
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        storage: typeof window !== "undefined" ? window.sessionStorage : undefined,
        storageKey: "pppl.supabase-auth",
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    });
  }
  return client;
}

/** The signed-in user's access token, for calls to this app's own /api routes. */
export async function accessToken(): Promise<string | null> {
  const { data } = await supabase().auth.getSession();
  return data.session?.access_token ?? null;
}

/** POSTs JSON to one of this app's /api routes with the user's token; throws the route's error message. */
export async function callApi<T>(path: string, body: unknown, opts: { auth?: boolean } = {}): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.auth !== false) {
    const token = await accessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(path, { method: "POST", headers, body: JSON.stringify(body) });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string; message?: string };
  if (!res.ok) {
    const e = new Error(json.message || json.error || `Request failed (${res.status})`) as Error & { code?: string; details?: unknown };
    e.code = json.error;
    e.details = json;
    throw e;
  }
  return json;
}
