/*
 * Supabase settings. The app uses Supabase when both public values are set (in .env.local);
 * without them it keeps running on browser storage (localStorage + IndexedDB), as before.
 */

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
/** The project's publishable ("anon") key – safe in the browser; row level security protects the data. */
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/** True when the app stores its data in Supabase. */
export const cloudEnabled = !!SUPABASE_URL && !!SUPABASE_ANON_KEY;

/** Shows the demo accounts on the login page in Supabase mode (only for a demo project). */
export const showDemoAccounts = process.env.NEXT_PUBLIC_SHOW_DEMO_ACCOUNTS === "true";

export const RECORDS_TABLE = "app_records";
export const FILE_META_TABLE = "file_meta";
export const FILES_BUCKET = "files";

/**
 * Each app login is a Supabase Auth user with this internal e-mail address (people still sign in with their
 * username or mobile number; the address is never shown or mailed).
 */
export const authEmailFor = (employeeId: string) =>
  `${employeeId.toLowerCase().replace(/[^a-z0-9._-]/g, "-")}@${process.env.NEXT_PUBLIC_SUPABASE_LOGIN_DOMAIN || "users.poojary-prefab.app"}`;

/** Stored instead of a password hash: in Supabase mode the password lives only in Supabase Auth. */
export const SUPABASE_PASSWORD_MARKER = "supabase-auth";
