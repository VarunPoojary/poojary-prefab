import { authService } from "@/lib/auth";
import { cloudEnabled, withCloudSync } from "@/lib/supabase";
import type { QuotationRepository } from "./repository";
import { SessionStorageRepository } from "./session-repo";

/*
 * The one place that decides where quotations are stored. The repository works on lib/storage, which is the
 * Supabase database when it is configured (no demo seeding there) and this browser's localStorage otherwise.
 */
export const quotationRepo: QuotationRepository = withCloudSync(
  new SessionStorageRepository(undefined, cloudEnabled ? 0 : 150, !cloudEnabled, async () => (await authService.getSession())?.user.id ?? null),
);

export * from "./types";
export type { QuotationRepository } from "./repository";
