"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useState } from "react";
import { AuthProvider } from "@/lib/auth/AuthProvider";

interface Toast {
  id: number;
  message: string;
  tone: "success" | "error";
}

const ToastContext = createContext<(message: string, tone?: Toast["tone"]) => void>(() => {});

export const useToast = () => useContext(ToastContext);

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
