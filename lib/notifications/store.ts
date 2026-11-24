import { appStorage, type KeyValueStorage } from "@/lib/storage";
import type { AppNotification, NewNotification, NotificationRepository } from "./types";

export const NOTIFICATIONS_KEY = "pppl.notifications.v1";
const KEEP = 300;

const newId = () => `n_${typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2)}`;

/**
 * TEMPORARY notification store in localStorage. In the cloud version the server creates notifications
 * (and can also send push / email); the app only lists them and marks them read.
 */
export class NotificationStore implements NotificationRepository {
  constructor(
    private readonly storage: () => KeyValueStorage = appStorage,
    private readonly now: () => number = () => Date.now(),
  ) {}

  private read(): AppNotification[] {
    try {
      const v = JSON.parse(this.storage().getItem(NOTIFICATIONS_KEY) ?? "[]");
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  }

  private write(list: AppNotification[]) {
    this.storage().setItem(NOTIFICATIONS_KEY, JSON.stringify(list.slice(-KEEP)));
  }

  /** Adds notifications, skipping any whose user + key already exists. Returns the ones added. */
  push(items: NewNotification[], at?: string): AppNotification[] {
    if (!items.length) return [];
    const list = this.read();
    const seen = new Set(list.map((n) => `${n.userId}|${n.key}`));
    const createdAt = at ?? new Date(this.now()).toISOString();
    const added: AppNotification[] = [];
    for (const it of items) {
      const k = `${it.userId}|${it.key}`;
      if (seen.has(k)) continue;
      seen.add(k);
      const n = { ...it, id: newId(), createdAt, readAt: null };
      list.push(n);
      added.push(n);
    }
    if (added.length) this.write(list);
    return added;
  }

  async list(userId: string): Promise<AppNotification[]> {
    return this.read()
      .filter((n) => n.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async markRead(userId: string, ids: string[] | "all"): Promise<void> {
    const at = new Date(this.now()).toISOString();
    const want = ids === "all" ? null : new Set(ids);
    this.write(this.read().map((n) => (n.userId === userId && !n.readAt && (!want || want.has(n.id)) ? { ...n, readAt: at } : n)));
  }

  reset() {
    this.storage().removeItem(NOTIFICATIONS_KEY);
  }
}
