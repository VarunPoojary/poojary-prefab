"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Banknote, Bell, BellRing, CalendarDays, ChartColumn, ClipboardCheck, Layers, MessageSquare, Receipt, ReceiptText, Wallet } from "lucide-react";
import { Icon, type LucideIcon } from "@/components/ui/icons";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useNotifications } from "@/lib/crm/hooks";
import { relativeTime } from "@/lib/format";
import { useAppNotifications, useMarkRead } from "@/lib/notifications/hooks";
import type { NotificationKind } from "@/lib/notifications/types";

const ICONS: Record<NotificationKind, LucideIcon> = {
  project_created: Layers,
  mention: MessageSquare,
  task_assigned: ClipboardCheck,
  milestone_overdue: Banknote,
  enquiry_reopened: AlertTriangle,
  attendance_due: CalendarDays,
  progress_due: ClipboardCheck,
  expense_requested: Receipt,
  expense_decided: ReceiptText,
  budget_alert: ChartColumn,
  payroll_due: Wallet,
};

const POPUPS_KEY = "pppl.popups-shown.v1";

/** Bell: stored notifications (project created, @mentions, tasks, overdue payments) plus enquiry follow-ups. */
export function NotificationBell() {
  const { user } = useAuth();
  const router = useRouter();
  const { data: followUps = [] } = useNotifications(user?.id);
  const { data: items = [] } = useAppNotifications(user?.id);
  const markRead = useMarkRead(user?.id);
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const ref = useRef<HTMLDivElement>(null);
  const unread = items.filter((n) => !n.readAt).length;
  const [permission, setPermission] = useState(() => (typeof Notification !== "undefined" ? Notification.permission : "denied"));

  // Attendance reminders also pop up as browser notifications when allowed (once per reminder).
  useEffect(() => {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    let shown: string[] = [];
    try {
      shown = JSON.parse(localStorage.getItem(POPUPS_KEY) ?? "[]");
    } catch {
      /* start again */
    }
    const fresh = items.filter((n) => n.kind === "attendance_due" && !n.readAt && !shown.includes(n.id) && Date.now() - new Date(n.createdAt).getTime() < 15 * 60_000);
    for (const n of fresh) {
      const pop = new Notification(n.title, { body: n.body, tag: n.key });
      pop.onclick = () => {
        window.focus();
        router.push(n.href);
      };
    }
    if (fresh.length) localStorage.setItem(POPUPS_KEY, JSON.stringify([...shown, ...fresh.map((n) => n.id)].slice(-200)));
  }, [items, router]);
  const count = unread + followUps.length;

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={`Notifications${count ? ` (${count})` : ""}`}
        aria-expanded={open}
        onClick={() => {
          setNow(Date.now());
          setOpen((v) => !v);
        }}
        className="relative flex h-10 w-10 items-center justify-center rounded-lg text-white/90 transition-colors hover:bg-white/10 hover:text-white"
      >
        <Icon icon={Bell} size={18} />
        {count ? (
          <span
            data-testid="bell-count"
            className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-lg bg-white px-1 font-mono text-[11px] font-semibold leading-none text-red-900 ring-2 ring-red-900"
          >
            {count}
          </span>
        ) : null}
      </button>
      {open ? (
        <div className="fixed inset-x-3 top-14 mt-1 rounded-xl border border-slate-200 bg-white shadow-[0_8px_24px_rgba(0,0,0,0.08)] sm:absolute sm:inset-x-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-[22rem]">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
            <span className="text-sm font-semibold text-slate-900">Notifications</span>
            {unread ? (
              <button type="button" className="text-xs font-medium text-red-700 hover:underline" onClick={() => markRead.mutate("all")}>
                Mark all read
              </button>
            ) : null}
          </div>
          {permission === "default" ? (
            <button
              type="button"
              className="flex w-full items-center gap-2 border-b border-slate-100 bg-slate-50 px-4 py-2 text-left text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100"
              onClick={() => void Notification.requestPermission().then(setPermission)}
            >
              <Icon icon={BellRing} size={14} className="text-slate-500" />
              Turn on pop-up reminders for site attendance
            </button>
          ) : null}
          <div className="max-h-[28rem] overflow-y-auto">
            {items.length ? (
              <ul className="divide-y divide-slate-100" data-testid="notification-list">
                {items.slice(0, 30).map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => {
                        if (!n.readAt) markRead.mutate([n.id]);
                        setOpen(false);
                        router.push(n.href);
                      }}
                      className="flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50"
                    >
                      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500">
                        <Icon icon={ICONS[n.kind]} size={14} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={`block text-sm ${n.readAt ? "text-slate-600" : "font-medium text-slate-900"}`}>{n.title}</span>
                        <span className="block truncate text-xs text-slate-500">{n.body}</span>
                        <span className="mt-0.5 block text-xs text-slate-500">{relativeTime(n.createdAt, now)}</span>
                      </span>
                      {!n.readAt ? <span aria-label="unread" className="mt-2 h-2 w-2 shrink-0 rounded-full bg-red-700" /> : null}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="border-t border-slate-100 bg-slate-50 px-4 py-2 text-xs font-medium text-slate-500">
              Enquiry follow-ups
            </div>
            {followUps.length ? (
              <ul className="divide-y divide-slate-100">
                {followUps.map((n) => (
                  <li key={n.enquiryId}>
                    <Link href={`/enquiries/${n.enquiryId}`} onClick={() => setOpen(false)} className="block px-4 py-2.5 hover:bg-slate-50">
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <span className="ref-code font-medium text-slate-900">{n.number}</span>
                        <span className="text-xs font-medium text-red-700">{n.reason}</span>
                      </div>
                      <div className="truncate text-xs text-slate-600">
                        {n.clientName} · {n.projectName}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 py-3 text-center text-xs text-slate-500">No follow-ups due</p>
            )}
          </div>
          <Link
            href="/enquiries?followUp=1"
            onClick={() => setOpen(false)}
            className="block rounded-b-xl border-t border-slate-100 px-4 py-2.5 text-center text-xs font-medium text-red-700 transition-colors hover:bg-slate-50"
          >
            View all enquiries needing follow-up
          </Link>
        </div>
      ) : null}
    </div>
  );
}
