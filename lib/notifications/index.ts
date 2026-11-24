import { withCloudSync } from "@/lib/supabase";
import { NotificationStore } from "./store";
import type { NotificationRepository } from "./types";

/*
 * Where notifications are kept: lib/storage (Supabase when configured, otherwise this browser).
 * The other repositories write to the same store when they create notifications.
 */
export const notificationStore = new NotificationStore();
export const notificationRepo: NotificationRepository = withCloudSync(notificationStore);

export type { AppNotification, NotificationKind, NewNotification } from "./types";
