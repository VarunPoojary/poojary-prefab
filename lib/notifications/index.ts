import { NotificationStore } from "./store";
import type { NotificationRepository } from "./types";

/*
 * Where notifications are kept. Cloud version: GET /notifications, POST /notifications/read { ids | "all" }.
 * The project repository writes to the same store when it creates notifications.
 */
export const notificationStore = new NotificationStore();
export const notificationRepo: NotificationRepository = notificationStore;

export type { AppNotification, NotificationKind, NewNotification } from "./types";
