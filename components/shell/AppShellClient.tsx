"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { COMPANY } from "@/config/company";
import { useAuth } from "@/lib/auth/AuthProvider";
import { ROLE_LABELS } from "@/lib/auth";
import { DEFAULT_ROUTE, activeNavItem, canAccessPath, homeFor, visibleNavItems } from "@/lib/navigation";
import { flushPendingSave, useQuotationStore } from "@/lib/store";
import { fileStore } from "@/lib/files";
import { migrateInlineFiles } from "@/lib/files/migrate";
import { appStorage } from "@/lib/storage";
import { useSettings } from "@/lib/settings/hooks";
import { NotificationBell } from "./NotificationBell";

/** Staff assigned as factory / office attendance supervisors also get the Attendance page. */
function useIsSupervisor() {
  const { user } = useAuth();
  const { data } = useSettings();
  const s = data?.attendance.supervisors;
  return !!user && !!s && (s.factory.includes(user.id) || s.office.includes(user.id));
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");

/** Signed-in layout: redirects to /login when needed, then renders the top bar, ☰ drawer and page. */
export function AppShellClient({ children }: { children: React.ReactNode }) {
  const { status, user, session, logout, refresh } = useAuth();
  const wasSignedIn = useRef(false);
  const explicitLogout = useRef(false);
  const router = useRouter();
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const active = activeNavItem(pathname);
  const supervisor = useIsSupervisor();

  const qc = useQueryClient();
  // Files saved inline by earlier versions move to the browser file store once.
  useEffect(() => {
    void migrateInlineFiles(appStorage(), fileStore)
      .then((n) => {
        if (n) void qc.invalidateQueries();
      })
      .catch(() => undefined);
  }, [qc]);

  // Re-check on every navigation so admin changes (disabled login, new role) apply at once.
  useEffect(() => {
    void refresh();
  }, [pathname, refresh]);

  useEffect(() => {
    if (status === "authenticated") wasSignedIn.current = true;
    if (status === "anonymous") {
      const next = pathname + window.location.search;
      const revoked = wasSignedIn.current && !explicitLogout.current;
      router.replace(`/login?next=${encodeURIComponent(next)}${revoked ? "&signedOut=1" : ""}`);
    }
  }, [status, pathname, router]);

  // Users who can't open the default page (Accountant) land on their first menu page instead.
  const home = homeFor(user, { supervisor });
  useEffect(() => {
    if (status === "authenticated" && pathname === DEFAULT_ROUTE && home !== DEFAULT_ROUTE) router.replace(home);
  }, [status, pathname, home, router]);

  useEffect(() => {
    if (session?.mustChangePassword) router.replace(`/change-password?next=${encodeURIComponent(pathname)}`);
  }, [session?.mustChangePassword, pathname, router]);

  if (status !== "authenticated" || !user || session?.mustChangePassword) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">Loading…</div>;
  }

  const signOut = async () => {
    setDrawerOpen(false);
    // Let an open quotation save its pending edits before the session ends.
    await flushPendingSave();
    useQuotationStore.getState().clear();
    explicitLogout.current = true;
    await logout();
    router.replace("/login");
  };

  return (
    <div className="flex h-screen flex-col bg-slate-50">
      <header className="z-30 flex h-14 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-3 sm:px-4">
        <button
          type="button"
          aria-label="Open menu"
          aria-expanded={drawerOpen}
          aria-controls="app-drawer"
          onClick={() => setDrawerOpen(true)}
          className="flex h-9 w-9 items-center justify-center rounded-md text-xl text-slate-700 hover:bg-slate-100"
        >
          ☰
        </button>
        <Link href={home} className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={COMPANY.assets.logoMark} alt="" className="h-8 w-auto" />
          <span className="hidden text-sm font-bold tracking-wide text-[#71090D] sm:inline">POOJARY PREFAB</span>
        </Link>
        {active ? (
          <>
            <span className="hidden text-slate-300 sm:inline">/</span>
            <span className="truncate text-sm font-medium text-slate-700">{active.label}</span>
          </>
        ) : null}
        <div className="ml-auto flex items-center gap-1">
          <NotificationBell />
          <UserMenu name={user.name} username={user.username} role={ROLE_LABELS[user.role]} onLogout={() => void signOut()} />
        </div>
      </header>

      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} pathname={pathname} onLogout={() => void signOut()} />

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {!canAccessPath(user, pathname, { supervisor }) ? <NoAccess home={home} /> : children}
      </div>
    </div>
  );
}

function UserMenu({ name, username, role, onLogout }: { name: string; username: string; role: string; onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
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
        aria-label="Account menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 hover:bg-slate-100"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#71090D] text-xs font-semibold text-white">
          {initials(name)}
        </span>
        <span className="hidden text-sm font-medium text-slate-700 md:inline">{name}</span>
      </button>
      {open ? (
        <div role="menu" className="absolute right-0 mt-2 w-60 rounded-xl border border-slate-200 bg-white py-2 shadow-lg">
          <div className="px-4 pb-2">
            <div className="text-sm font-semibold text-slate-900">{name}</div>
            <div className="truncate text-xs text-slate-500">{username}</div>
            <span className="mt-1 inline-block rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
              {role}
            </span>
          </div>
          <Link
            role="menuitem"
            href="/account"
            onClick={() => setOpen(false)}
            className="block border-t border-slate-100 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            My account
          </Link>
          <button
            role="menuitem"
            type="button"
            onClick={onLogout}
            className="block w-full border-t border-slate-100 px-4 py-2 text-left text-sm text-red-700 hover:bg-red-50"
          >
            Log out
          </button>
        </div>
      ) : null}
    </div>
  );
}

function Drawer({
  open,
  onClose,
  pathname,
  onLogout,
}: {
  open: boolean;
  onClose: () => void;
  pathname: string;
  onLogout: () => void;
}) {
  const { user } = useAuth();
  const panelRef = useRef<HTMLDivElement>(null);
  const supervisor = useIsSupervisor();
  const items = visibleNavItems(user, { supervisor });

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    panel?.querySelector<HTMLElement>("a,button")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") return onClose();
      if (e.key !== "Tab" || !panel) return;
      const f = [...panel.querySelectorAll<HTMLElement>("a,button:not([disabled])")];
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) {
        e.preventDefault();
        f[f.length - 1].focus();
      } else if (!e.shiftKey && document.activeElement === f[f.length - 1]) {
        e.preventDefault();
        f[0].focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <div className={`fixed inset-0 z-40 ${open ? "" : "pointer-events-none"}`} aria-hidden={!open}>
      <div
        className={`absolute inset-0 bg-slate-900/40 transition-opacity ${open ? "opacity-100" : "opacity-0"}`}
        onClick={onClose}
      />
      <aside
        id="app-drawer"
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Main menu"
        inert={!open}
        className={`absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-white shadow-xl transition-transform duration-200 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <div className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={COMPANY.assets.logoMark} alt="" className="h-8 w-auto" />
            <div>
              <div className="text-sm font-bold tracking-wide text-[#71090D]">POOJARY PREFAB</div>
              <div className="text-[10px] uppercase tracking-wider text-slate-400">Business suite</div>
            </div>
          </div>
          <button type="button" aria-label="Close menu" onClick={onClose} className="rounded p-1 text-slate-400 hover:text-slate-700">
            ✕
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto p-2">
          <ul className="space-y-1">
            {items.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
              const body = (
                <>
                  <span className="text-lg" aria-hidden>
                    {item.icon}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 text-sm font-medium">
                      {item.label}
                      {item.status === "soon" ? (
                        <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-500">
                          Soon
                        </span>
                      ) : null}
                    </span>
                    <span className="block truncate text-xs text-slate-500">{item.description}</span>
                  </span>
                </>
              );
              return (
                <li key={item.key}>
                  {item.status === "ready" ? (
                    <Link
                      href={item.href}
                      onClick={onClose}
                      aria-current={isActive ? "page" : undefined}
                      className={`flex items-center gap-3 rounded-lg px-3 py-2.5 ${
                        isActive ? "bg-red-50 text-[#71090D]" : "text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      {body}
                    </Link>
                  ) : (
                    <button
                      type="button"
                      disabled
                      className="flex w-full cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2.5 text-left text-slate-400"
                    >
                      {body}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="border-t border-slate-100 p-4">
          <div className="text-sm font-medium text-slate-900">{user?.name}</div>
          <div className="text-xs text-slate-500">{user ? ROLE_LABELS[user.role] : ""}</div>
          <button
            type="button"
            onClick={onLogout}
            className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
          >
            Log out
          </button>
        </div>
      </aside>
    </div>
  );
}

function NoAccess({ home }: { home: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
      <h1 className="text-lg font-semibold text-slate-900">No access</h1>
      <p className="max-w-sm text-sm text-slate-600">Your account doesn&apos;t have permission to open this section.</p>
      <Link href={home} className="text-sm font-medium text-red-700 hover:underline">
        Go to {activeNavItem(home)?.label ?? "the start page"}
      </Link>
    </div>
  );
}
