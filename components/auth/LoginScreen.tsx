"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { COMPANY } from "@/config/company";
import { authService } from "@/lib/auth";
import { useAuth } from "@/lib/auth/AuthProvider";
import { safeNext } from "@/lib/navigation";


export function LoginScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const signedOut = params.get("signedOut") === "1";
  const { status, login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (status === "authenticated") router.replace(next);
  }, [status, next, router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!username.trim()) return setError("Enter your mobile number or username.");
    if (!password) return setError("Enter your password.");
    setSubmitting(true);
    try {
      await login(username, password);
      router.replace(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed. Please try again.");
      setPassword("");
      passwordRef.current?.focus();
      setSubmitting(false);
    }
  };

  if (status !== "anonymous") {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">Loading…</div>;
  }

  const inputCls =
    "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-[#71090D] focus:ring-2 focus:ring-red-100";

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-white to-red-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={COMPANY.assets.logoMark} alt="" className="h-16 w-auto" />
          <div className="mt-3 text-2xl font-bold tracking-[0.12em] text-[#71090D]">POOJARY</div>
          <div className="text-xs tracking-[0.35em] text-slate-500">PREFAB PVT LTD</div>
        </div>

        <form
          onSubmit={submit}
          noValidate
          className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
          aria-describedby={error ? "login-error" : undefined}
        >
          <h1 className="text-lg font-semibold text-slate-900">Sign in</h1>
          <p className="mt-1 text-sm text-slate-500">Use the account given to you by your administrator.</p>
          {signedOut && !error ? (
            <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
              You were signed out because your login was changed or disabled by an administrator.
            </p>
          ) : null}

          <div className="mt-5 space-y-4">
            <div>
              <label htmlFor="username" className="mb-1 block text-sm font-medium text-slate-700">
                Mobile number or username
              </label>
              <input
                id="username"
                type="text"
                autoCapitalize="none"
                autoComplete="username"
                autoFocus
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className={inputCls}
                placeholder="e.g. 98765 43210"
              />
            </div>
            <div>
              <label htmlFor="password" className="mb-1 block text-sm font-medium text-slate-700">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  ref={passwordRef}
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`${inputCls} pr-16`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute inset-y-0 right-2 my-auto h-7 rounded px-2 text-xs font-medium text-slate-500 hover:bg-slate-100"
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </div>
          </div>

          {error ? (
            <p id="login-error" role="alert" className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={submitting}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-[#71090D] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#5a070a] disabled:opacity-70"
          >
            {submitting ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden />
            ) : null}
            {submitting ? "Signing in…" : "Sign in"}
          </button>
          <p className="mt-4 text-center text-xs text-slate-400">Accounts are created by the administrator.</p>
        </form>

        {authService.demoAccounts?.length ? (
          <div className="mt-4 rounded-xl border border-dashed border-amber-300 bg-amber-50/70 p-3 text-xs text-amber-900">
            <div className="font-semibold">Demo accounts (until the database is connected)</div>
            <ul className="mt-1 space-y-0.5">
              {authService.demoAccounts.map((a) => (
                <li key={a.username}>
                  <button
                    type="button"
                    className="hover:underline"
                    onClick={() => {
                      setUsername(a.username);
                      setPassword(a.password);
                      setError("");
                    }}
                  >
                    {a.label}: <span className="font-mono">{a.username}</span> / <span className="font-mono">{a.password}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <p className="mt-6 text-center text-[11px] text-slate-400">{COMPANY.brandLine}</p>
      </div>
    </div>
  );
}
