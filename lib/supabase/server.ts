/*
 * Server-only Supabase helpers (Route Handlers and scripts). They use the service-role key, which bypasses row
 * level security, so this file must never be imported by browser code.
 */
import { createClient, type SupabaseClient, type User as AuthUser } from "@supabase/supabase-js";
import type { Employee, Login } from "@/lib/employees/types";
import { toRows, type RecordRow } from "./collections";
import { FILE_META_TABLE, FILES_BUCKET, RECORDS_TABLE, SUPABASE_ANON_KEY, SUPABASE_URL, authEmailFor } from "./config";

if (typeof window !== "undefined") throw new Error("lib/supabase/server.ts must only run on the server.");

export const LOGINS = "pppl.logins.v1";
export const EMPLOYEES = "pppl.employees.v1";
const SERVER_CLIENT_ID = "server";

const serviceKey = () => {
  const k = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !k) throw new Error("Supabase is not configured on the server (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).");
  return k;
};

const noSession = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };

let admin: SupabaseClient | null = null;
/** Service-role client: full access, server only. */
export function adminDb(): SupabaseClient {
  if (!admin) admin = createClient(SUPABASE_URL, serviceKey(), noSession);
  return admin;
}

/** A fresh client with the public key, used to check a password (signInWithPassword). */
export function publicDb(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, noSession);
}

function fail(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

/* ------------------------------- records ------------------------------- */

export async function readCollection<T>(collection: string): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await adminDb()
      .from(RECORDS_TABLE)
      .select("data")
      .eq("collection", collection)
      .order("pos")
      .range(from, from + 999);
    fail(error);
    out.push(...(data ?? []).map((r) => r.data as T));
    if (!data || data.length < 1000) return out;
  }
}

export async function readRecord<T>(collection: string, id: string): Promise<T | null> {
  const { data, error } = await adminDb().from(RECORDS_TABLE).select("data").eq("collection", collection).eq("id", id).maybeSingle();
  fail(error);
  return (data?.data as T) ?? null;
}

/** Changes an existing record (keeps its position in the list). */
export async function updateRecord(collection: string, id: string, value: unknown) {
  const { error } = await adminDb()
    .from(RECORDS_TABLE)
    .update({ data: value, updated_at: new Date().toISOString(), client_id: SERVER_CLIENT_ID })
    .eq("collection", collection)
    .eq("id", id);
  fail(error);
}

/** Replaces every record with the given storage values (key → JSON string), as written by the browser repositories. */
export async function replaceAllRecords(values: Map<string, string>) {
  const { error } = await adminDb().from(RECORDS_TABLE).delete().neq("collection", "");
  fail(error);
  const rows: RecordRow[] = [...values].flatMap(([key, raw]) => toRows(key, JSON.parse(raw)));
  let batch: object[] = [];
  let bytes = 0;
  const send = async () => {
    if (!batch.length) return;
    const { error: e } = await adminDb().from(RECORDS_TABLE).insert(batch);
    fail(e);
    batch = [];
    bytes = 0;
  };
  for (const r of rows) {
    const row = { ...r, client_id: SERVER_CLIENT_ID };
    const size = JSON.stringify(row).length;
    if (batch.length && (bytes + size > 1_500_000 || batch.length >= 500)) await send();
    batch.push(row);
    bytes += size;
  }
  await send();
}

export async function countRecords(): Promise<number> {
  const { count, error } = await adminDb().from(RECORDS_TABLE).select("id", { count: "exact", head: true });
  fail(error);
  return count ?? 0;
}

/** Empties the files bucket and its metadata table. */
export async function clearFiles() {
  const bucket = adminDb().storage.from(FILES_BUCKET);
  for (;;) {
    const { data, error } = await bucket.list("", { limit: 1000 });
    fail(error);
    const names = (data ?? []).map((f) => f.name).filter(Boolean);
    if (!names.length) break;
    const { error: e } = await bucket.remove(names);
    fail(e);
  }
  const { error } = await adminDb().from(FILE_META_TABLE).delete().neq("id", "");
  fail(error);
}

/* ------------------------------- auth users ------------------------------- */

export async function findAuthUser(employeeId: string): Promise<AuthUser | null> {
  const email = authEmailFor(employeeId);
  for (let page = 1; ; page++) {
    const { data, error } = await adminDb().auth.admin.listUsers({ page, perPage: 1000 });
    fail(error);
    const hit = data.users.find((u) => u.email?.toLowerCase() === email || u.app_metadata?.employee_id === employeeId);
    if (hit) return hit;
    if (data.users.length < 1000) return null;
  }
}

/** Creates the Supabase Auth user of a login, or sets its password if it exists. */
export async function setAuthPassword(employeeId: string, password: string) {
  const existing = await findAuthUser(employeeId);
  if (existing) {
    const { error } = await adminDb().auth.admin.updateUserById(existing.id, { password, app_metadata: { employee_id: employeeId } });
    fail(error);
    return existing.id;
  }
  const { data, error } = await adminDb().auth.admin.createUser({
    email: authEmailFor(employeeId),
    password,
    email_confirm: true,
    app_metadata: { employee_id: employeeId },
  });
  fail(error);
  return data.user!.id;
}

export async function removeAuthUser(employeeId: string) {
  const existing = await findAuthUser(employeeId);
  if (!existing) return;
  const { error } = await adminDb().auth.admin.deleteUser(existing.id);
  fail(error);
}

/** Removes the app's Supabase Auth users whose employee is not in `keep` (used when re-seeding). */
export async function removeAuthUsersExcept(keep: Set<string>) {
  const doomed: string[] = [];
  for (let page = 1; ; page++) {
    const { data, error } = await adminDb().auth.admin.listUsers({ page, perPage: 1000 });
    fail(error);
    for (const u of data.users) {
      const emp = u.app_metadata?.employee_id;
      if (typeof emp === "string" && !keep.has(emp)) doomed.push(u.id);
    }
    if (data.users.length < 1000) break;
  }
  for (const id of doomed) fail((await adminDb().auth.admin.deleteUser(id)).error);
}

/**
 * Replaces everything in Supabase (records, the app's auth users, files) with the given starting data.
 * Used by `npm run db:seed` and the admin "Reset demo data" action.
 */
export async function writeStartingData(start: { values: Map<string, string>; logins: { employeeId: string; password: string }[] }) {
  await replaceAllRecords(start.values);
  await removeAuthUsersExcept(new Set(start.logins.map((l) => l.employeeId)));
  for (const l of start.logins) await setAuthPassword(l.employeeId, l.password);
  await clearFiles();
}

/* ------------------------------- callers ------------------------------- */

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

export interface Caller {
  authUser: AuthUser;
  employeeId: string;
  login: Login;
  employee: Employee | null;
}

/** The signed-in caller of a Route Handler (Authorization: Bearer <access token>), with an enabled login. */
export async function requireCaller(req: Request): Promise<Caller> {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw new HttpError(401, "unauthenticated", "Please sign in again.");
  const { data, error } = await adminDb().auth.getUser(token);
  const employeeId = data.user?.app_metadata?.employee_id as string | undefined;
  if (error || !data.user || !employeeId) throw new HttpError(401, "unauthenticated", "Please sign in again.");
  const login = await readRecord<Login>(LOGINS, employeeId);
  if (!login || !login.enabled) throw new HttpError(403, "disabled", "This login is disabled. Please contact your administrator.");
  const employee = await readRecord<Employee>(EMPLOYEES, employeeId);
  return { authUser: data.user, employeeId, login, employee };
}

export async function requireAdmin(req: Request): Promise<Caller> {
  const c = await requireCaller(req);
  if (c.login.role !== "admin") throw new HttpError(403, "forbidden", "Only admins can do this.");
  return c;
}

/** Turns thrown errors into JSON responses for Route Handlers. */
export async function handle(run: () => Promise<Response>): Promise<Response> {
  try {
    return await run();
  } catch (e) {
    if (e instanceof HttpError) return Response.json({ error: e.code, message: e.message, ...e.extra }, { status: e.status });
    console.error(e);
    return Response.json({ error: "server", message: e instanceof Error ? e.message : "Server error" }, { status: 500 });
  }
}
