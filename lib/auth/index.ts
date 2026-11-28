import { cloudEnabled } from "@/lib/supabase/config";
import { MockAuthService } from "./mock-service";
import type { AuthService } from "./service";
import { SupabaseAuthService } from "./supabase-service";

/*
 * The one place that decides how users sign in:
 *  - Supabase configured (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY): Supabase Auth via /api/auth/*.
 *  - Otherwise: logins kept in this browser (demo / offline development).
 */
export const authService: AuthService = cloudEnabled ? new SupabaseAuthService() : new MockAuthService();

export * from "./types";
export * from "./roles";
export type { AuthService } from "./service";
