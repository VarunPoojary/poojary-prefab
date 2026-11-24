"use client";

import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { AuthProvider } from "@/lib/auth/AuthProvider";
import { cloudStorage } from "@/lib/supabase";

interface Toast {
  id: number;
  message: string;
  tone: "success" | "error";
}

const ToastContext = createContext<(message: string, tone?: Toast["tone"]) => void>(() => {});

export const useToast = () => useContext(ToastContext);

/**
 * Supabase mode: when another user (or another tab) changes data, the screens re-read it; a background save
 * that the database refused is shown as an error toast.
 */
function CloudSync() {
  const qc = useQueryClient();
  const toast = useToast();
  useEffect(() => {
    const store = cloudStorage();
    if (!store) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const offChange = store.onChange(() => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        void qc.invalidateQueries();
      }, 300);
    });
    const offError = store.onError((e) => toast(e.message, "error"));
    return () => {
      offChange();
      offError();
      if (timer) clearTimeout(timer);
    };
  }, [qc, toast]);
  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 10_000, refetchOnWindowFocus: false } } }),
  );
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toast = useCallback((message: string, tone: Toast["tone"] = "success") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }, []);

  return (
    <QueryClientProvider client={client}>
      <ToastContext.Provider value={toast}>
        <CloudSync />
        <AuthProvider>{children}</AuthProvider>
        <div className="pointer-events-none fixed bottom-20 right-4 z-50 flex flex-col items-end gap-2">
          {toasts.map((t) => (
            <div
              key={t.id}
              role="status"
              className={`rounded-lg px-4 py-2 text-sm font-medium text-white shadow-lg ${t.tone === "error" ? "bg-red-700" : "bg-slate-900"}`}
            >
              {t.message}
            </div>
          ))}
        </div>
      </ToastContext.Provider>
    </QueryClientProvider>
  );
}
