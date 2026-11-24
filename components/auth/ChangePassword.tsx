"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useToast } from "@/components/Providers";
import { COMPANY } from "@/config/company";
import { useAuth } from "@/lib/auth/AuthProvider";
import { PASSWORD_MIN_LENGTH } from "@/lib/employees/config";
import { validatePassword } from "@/lib/employees/rules";
import { safeNext } from "@/lib/navigation";

const inputCls =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-[#71090D] focus:ring-2 focus:ring-red-100";

/** Current + new + confirm password form, used for the forced first-login change and My account. */
export function ChangePasswordForm({ onDone, submitLabel = "Change password" }: { onDone: () => void; submitLabel?: string }) {
  const { changePassword } = useAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [issues, setIssues] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const problems = [...validatePassword(next)];
    if (!current) problems.unshift("Enter your current password.");
    if (next && confirm !== next) problems.push("The new passwords don't match.");
    setIssues(problems);
    if (problems.length) return;
    setSaving(true);
    try {
      await changePassword(current, next);
      onDone();
    } catch (err) {
      setIssues(err && typeof err === "object" && "issues" in err ? (err as { issues: string[] }).issues : [String(err)]);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <div>
        <label htmlFor="pw-current" className="mb-1 block text-sm font-medium text-slate-700">
          Current password
        </label>
        <input id="pw-current" type={show ? "text" : "password"} autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} className={inputCls} />
      </div>
      <div>
        <label htmlFor="pw-new" className="mb-1 block text-sm font-medium text-slate-700">
          New password
        </label>
        <input id="pw-new" type={show ? "text" : "password"} autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} className={inputCls} />
        <p className="mt-1 text-xs text-slate-500">At least {PASSWORD_MIN_LENGTH} characters, with letters and numbers.</p>
      </div>
      <div>
        <label htmlFor="pw-confirm" className="mb-1 block text-sm font-medium text-slate-700">
          Confirm new password
        </label>
        <input id="pw-confirm" type={show ? "text" : "password"} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={inputCls} />
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-600">
        <input type="checkbox" className="accent-red-700" checked={show} onChange={(e) => setShow(e.target.checked)} />
        Show passwords
      </label>
      {issues.length ? (
        <ul id="pw-error" role="alert" className="list-disc space-y-0.5 rounded-md bg-red-50 px-3 py-2 pl-7 text-sm text-red-800">
          {issues.map((i) => (
            <li key={i}>{i}</li>
          ))}
        </ul>
      ) : null}
      <button
        type="submit"
        disabled={saving}
        className="flex w-full items-center justify-center rounded-lg bg-[#71090D] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#5a070a] disabled:opacity-70"
      >
        {saving ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}

/** /change-password: shown after signing in with a temporary password; nothing else opens until it's done. */
export function ForcedPasswordChange() {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const { status, session, user, logout } = useAuth();
  const next = safeNext(params.get("next"));

  useEffect(() => {
    if (status === "anonymous") router.replace("/login");
    else if (status === "authenticated" && !session?.mustChangePassword) router.replace(next);
  }, [status, session?.mustChangePassword, next, router]);

  if (status !== "authenticated" || !session?.mustChangePassword) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">Loading…</div>;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-white to-red-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={COMPANY.assets.logoMark} alt="" className="h-14 w-auto" />
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-lg font-semibold text-slate-900">Choose your password</h1>
          <p className="mb-5 mt-1 text-sm text-slate-500">
            Welcome, {user?.name}. You signed in with a temporary password; set your own to continue. Only you will know it.
          </p>
          <ChangePasswordForm
            submitLabel="Save and continue"
            onDone={() => {
              toast("Password changed");
              router.replace(next);
            }}
          />
          <button
            type="button"
            onClick={() => void logout().then(() => router.replace("/login"))}
            className="mt-3 w-full text-center text-xs text-slate-500 hover:underline"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
