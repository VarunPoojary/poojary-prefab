"use client";

import dynamic from "next/dynamic";

// The shell reads the session from browser storage, so it renders on the client only.
const Shell = dynamic(() => import("./AppShellClient").then((m) => m.AppShellClient), {
  ssr: false,
  loading: () => <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">Loading…</div>,
});

export function AppShell({ children }: { children: React.ReactNode }) {
  return <Shell>{children}</Shell>;
}
