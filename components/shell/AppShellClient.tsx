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
import { cloudEnabled } from "@/lib/supabase/config";
import { useSettings } from "@/lib/settings/hooks";
import { Icon, NAV_ICONS } from "@/components/ui/icons";
import { ChevronDown, LogOut, Menu, UserRound, X } from "lucide-react";
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

/** Signed-in layout: redirects to /login when needed, then renders the top bar, menu drawer and page. */
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
  // Files saved inline by earlier versions move to the browser file store once (browser storage only).
  useEffect(() => {
    if (cloudEnabled) return;
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
      <header className="z-30 flex h-14 shrink-0 items-center gap-2 bg-red-900 px-2 text-white sm:gap-3 sm:px-4">
        <button
          type="button"
          aria-label="Open menu"
          aria-expanded={drawerOpen}
          aria-controls="app-drawer"
          onClick={() => setDrawerOpen(true)}
          className="flex h-10 w-10 items-center justify-center rounded-lg text-white/90 transition-colors hover:bg-white/10 hover:text-white"
        >
          <Icon icon={Menu} size={20} />
        </button>
        <Link href={home} className="flex shrink-0 items-center gap-2" aria-label="Poojary Prefab home">
          {/* The mark is burgundy itself, so it sits on a white tile on the burgundy bar. */}
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-white">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={COMPANY.assets.logoMark} alt="" className="h-6 w-auto" />
          </span>
          <span className="hidden text-[15px] font-semibold text-white sm:inline">Poojary Prefab</span>
        </Link>
        {active ? (
          <>
            <span className="hidden h-5 w-px bg-white/25 sm:block" aria-hidden />
            <span className="min-w-0 truncate text-sm font-medium text-white/85">{active.label}</span>
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
        className="flex h-10 items-center gap-2 rounded-lg pl-1 pr-1 transition-colors hover:bg-white/10 md:pr-2"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-xs font-semibold text-red-900">
          {initials(name)}
        </span>
        <span className="hidden text-sm font-medium text-white md:inline">{name}</span>
        <Icon icon={ChevronDown} size={14} className="hidden text-white/70 md:block" />
      </button>
      {open ? (
        <div role="menu" className="absolute right-0 mt-2 w-64 rounded-xl border border-slate-200 bg-white p-1 shadow-[0_8px_24px_rgba(0,0,0,0.08)]">
          <div className="px-3 pb-3 pt-2">
            <div className="text-sm font-medium text-slate-900">{name}</div>
            <div className="truncate text-xs text-slate-500">{username}</div>
            <div className="mt-1 text-xs text-slate-500">{role}</div>
          </div>
          <Link
            role="menuitem"
            href="/account"
            onClick={() => setOpen(false)}
            className="flex h-9 items-center gap-2.5 rounded-lg px-3 text-sm text-slate-700 transition-colors hover:bg-slate-100"
          >
            <Icon icon={UserRound} className="text-slate-500" />
            My account
          </Link>
          <button
            role="menuitem"
            type="button"
            onClick={onLogout}
            className="flex h-9 w-full items-center gap-2.5 rounded-lg px-3 text-left text-sm text-slate-700 transition-colors hover:bg-slate-100"
          >
            <Icon icon={LogOut} className="text-slate-500" />
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
        className={`absolute inset-0 bg-slate-950/40 transition-opacity duration-200 ${open ? "opacity-100" : "opacity-0"}`}
        onClick={onClose}
      />
      <aside
        id="app-drawer"
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Main menu"
        inert={!open}
        className={`absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col border-r border-slate-200 bg-white transition-transform duration-300 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 pl-4 pr-2">
          <div className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={COMPANY.assets.logoMark} alt="" className="h-7 w-auto" />
            <div className="leading-tight">
              <div className="text-[15px] font-semibold text-red-900">Poojary Prefab</div>
              <div className="text-xs text-slate-500">Business suite</div>
            </div>
          </div>
          <button type="button" aria-label="Close menu" onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900">
            <Icon icon={X} size={18} />
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto px-2 py-3">
          <ul className="space-y-0.5">
            {items.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
              const NavIcon = NAV_ICONS[item.key];
              const body = (
                <>
                  <span className={`flex h-5 w-5 shrink-0 items-center justify-center ${isActive ? "text-red-700" : "text-slate-500"}`}>
                    {NavIcon ? <Icon icon={NavIcon} size={18} /> : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 text-sm font-medium">
                      {item.label}
                      {item.status === "soon" ? <span className="text-xs font-normal text-slate-400">Soon</span> : null}
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
                      className={`relative flex items-center gap-3 rounded-lg px-3 py-2 transition-colors ${
                        isActive
                          ? "bg-slate-100 text-slate-900 before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-full before:bg-red-700"
                          : "text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      {body}
                    </Link>
                  ) : (
                    <button
                      type="button"
                      disabled
                      className="flex w-full cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2 text-left text-slate-400"
                    >
                      {body}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="flex items-center gap-3 border-t border-slate-200 p-3 pl-4">
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-slate-900">{user?.name}</div>
            <div className="text-xs text-slate-500">{user ? ROLE_LABELS[user.role] : ""}</div>
          </div>
          <button
            type="button"
            onClick={onLogout}
            className="flex h-9 items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100"
          >
            <Icon icon={LogOut} size={14} className="text-slate-500" />
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
      <h1 className="text-lg font-medium text-slate-900">No access</h1>
      <p className="max-w-sm text-sm text-slate-600">Your account doesn&apos;t have permission to open this section.</p>
      <Link href={home} className="text-sm font-medium text-red-700 hover:underline">
        Go to {activeNavItem(home)?.label ?? "the start page"}
      </Link>
    </div>
  );
}
