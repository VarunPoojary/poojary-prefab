"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { authService } from "./index";
import type { Session, User } from "./types";

type Status = "loading" | "authenticated" | "anonymous";

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  status: Status;
  login: (username: string, password: string) => Promise<Session>;
  logout: () => Promise<void>;
  /** Re-reads the session so admin changes (role, disabled login, password reset) apply at once. */
  refresh: () => Promise<void>;
  changePassword: (current: string, next: string) => Promise<Session>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<Status>("loading");

  const apply = useCallback((s: Session | null) => {
    setSession((prev) => (JSON.stringify(prev) === JSON.stringify(s) ? prev : s));
    setStatus(s ? "authenticated" : "anonymous");
  }, []);

  const refresh = useCallback(async () => {
    apply(await authService.getSession());
  }, [apply]);

  useEffect(() => {
    void authService.getSession().then(apply);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    const timer = setInterval(onFocus, 30_000);
    return () => {
      window.removeEventListener("focus", onFocus);
      clearInterval(timer);
    };
  }, [refresh, apply]);

  const login = useCallback(
    async (username: string, password: string) => {
      const s = await authService.login(username, password);
      apply(s);
      return s;
    },
    [apply],
  );

  const logout = useCallback(async () => {
    await authService.logout();
    apply(null);
  }, [apply]);

  const changePassword = useCallback(
    async (current: string, next: string) => {
      const s = await authService.changePassword(current, next);
      apply(s);
      return s;
    },
    [apply],
  );

  const value = useMemo(
    () => ({ user: session?.user ?? null, session, status, login, logout, refresh, changePassword }),
    [session, status, login, logout, refresh, changePassword],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
