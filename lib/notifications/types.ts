export type NotificationKind =
  | "project_created"
  | "mention"
  | "task_assigned"
  | "milestone_overdue"
  | "enquiry_reopened"
  | "attendance_due"
  | "expense_requested"
  | "expense_decided"
  | "budget_alert"
  | "payroll_due";

/** A stored notification for one user. CRM follow-ups are computed separately and merged in the bell. */
export interface AppNotification {
  id: string;
  userId: string;
  kind: NotificationKind;
  title: string;
  body: string;
  href: string;
  createdAt: string;
  readAt: string | null;
  /** Same key = same notification; prevents duplicates (e.g. one overdue alert per milestone). */
  key: string;
}

export type NewNotification = Omit<AppNotification, "id" | "createdAt" | "readAt">;

export interface NotificationRepository {
  list(userId: string): Promise<AppNotification[]>;
  markRead(userId: string, ids: string[] | "all"): Promise<void>;
}
