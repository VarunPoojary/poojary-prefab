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
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">Loading</div>;
  }

  const inputCls =
    "h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 outline-none transition-[border-color,box-shadow] placeholder:text-slate-400 focus:border-red-700 focus:ring-3 focus:ring-red-700/10 sm:text-sm";

  return (
    <div className="grid grid-cols-1 min-h-dvh bg-slate-50 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      {/* Brand side, large screens only: the company's own site work carries the colour. */}
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-red-900 p-10 text-white lg:flex xl:p-14">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={COMPANY.assets.logoMark} alt="" className="h-9 w-auto rounded bg-white p-1" />
          <div className="leading-tight">
            <div className="text-base font-semibold">Poojary Prefab</div>
            <div className="text-xs text-white/60">Pvt. Ltd. · Pune</div>
          </div>
        </div>
        <div className="max-w-md">
          <p className="text-[40px] font-medium leading-[1.1] tracking-[-0.02em]">Built with precision. Backed by trust.</p>
          <p className="mt-4 text-base leading-relaxed text-white/70">{COMPANY.tagline}</p>
        </div>
        <figure>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={COMPANY.assets.samplePhotos[1]}
            alt="Poojary Prefab crew fixing roof sheeting on a two-storey prefab building"
            width={1157}
            height={375}
            className="w-full rounded-xl object-cover shadow-[0_8px_24px_rgba(0,0,0,0.25)]"
          />
          <figcaption className="mt-3 text-xs text-white/50">{COMPANY.certification}</figcaption>
        </figure>
      </aside>

      <main className="flex items-center justify-center px-4 py-10 sm:px-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center lg:hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={COMPANY.assets.logoMark} alt="" className="h-14 w-auto" />
          <div className="mt-3 text-xl font-semibold text-red-900">Poojary Prefab</div>
          <div className="text-xs text-slate-500">Pvt. Ltd.</div>
        </div>

        <form
          onSubmit={submit}
          noValidate
          className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8"
          aria-describedby={error ? "login-error" : undefined}
        >
          <h1 className="text-[22px] font-medium text-slate-900">Sign in</h1>
          <p className="mt-1 text-sm text-slate-500">Use the account given to you by your administrator.</p>
          {signedOut && !error ? (
            <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
              You were signed out because your login was changed or disabled by an administrator.
            </p>
          ) : null}

          <div className="mt-5 space-y-4">
            <div>
              <label htmlFor="username" className="mb-1.5 block text-[13px] font-medium text-slate-700">
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
              <label htmlFor="password" className="mb-1.5 block text-[13px] font-medium text-slate-700">
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
                  className="absolute inset-y-0 right-1.5 my-auto h-8 rounded-lg px-2.5 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </div>
          </div>

          {error ? (
            <p id="login-error" role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={submitting}
            className="mt-6 flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-red-900 px-4 text-sm font-medium text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] transition-[background-color,transform] hover:bg-red-800 active:scale-[0.98] disabled:opacity-70"
          >
            {submitting ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden />
            ) : null}
            {submitting ? "Signing in…" : "Sign in"}
          </button>
          <p className="mt-4 text-center text-xs text-slate-500">Accounts are created by the administrator</p>
        </form>

        {authService.demoAccounts?.length ? (
          <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-white p-4 text-xs text-slate-700">
            <div className="font-medium text-slate-900">Demo accounts (until the database is connected)</div>
            <ul className="mt-2 space-y-1">
              {authService.demoAccounts.map((a) => (
                <li key={a.username}>
                  <button
                    type="button"
                    className="text-left hover:text-slate-900 hover:underline"
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
        <p className="mt-6 text-center text-xs text-slate-500 lg:hidden">Built with precision. Backed by trust.</p>
      </div>
      </main>
    </div>
  );
}
