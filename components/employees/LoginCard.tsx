"use client";

import { useState } from "react";
import { ErrorList, InfoRow } from "@/components/crm/ui";
import { useToast } from "@/components/Providers";
import { Button, Card, Select, TextField, Toggle } from "@/components/ui/fields";
import { Modal } from "@/components/ui/overlays";
import { useAuth } from "@/lib/auth/AuthProvider";
import { ADMIN_ROLE, ASSIGNABLE_PAGES } from "@/lib/auth/roles";
import type { Role } from "@/lib/auth/types";
import { useRoles } from "@/lib/settings/hooks";
import { useCreateLogin, useEmployeeLogin, useResetPassword, useSetLoginEnabled, useSetRole } from "@/lib/employees/hooks";
import type { CreatedLogin, Employee } from "@/lib/employees/types";
import { formatDateTime } from "@/lib/format";
import { Lock } from "lucide-react";
import { Icon } from "@/components/ui/icons";

/** Role choices from Settings → Roles and access, each with the pages it opens. */
function useRoleOptions(current?: Role) {
  const { roles } = useRoles();
  const pageLabel = (k: string) => ASSIGNABLE_PAGES.find((p) => p.key === k)?.label ?? k;
  const options = roles.map((r) => ({
    value: r.id,
    label:
      r.id === ADMIN_ROLE
        ? "Admin – everything, including employees, salaries and settings"
        : `${r.name} – ${r.pages.length ? r.pages.map(pageLabel).join(", ") : "no pages yet"}`,
  }));
  if (current && !roles.some((r) => r.id === current)) options.push({ value: current, label: `${current} (role no longer exists)` });
  const fallback = roles.find((r) => r.id === "staff")?.id ?? roles.find((r) => r.id !== ADMIN_ROLE)?.id ?? ADMIN_ROLE;
  return { options, fallback, name: (id: Role) => roles.find((r) => r.id === id)?.name ?? id };
}

/** Shows a temporary password once, with copy buttons. */
function PasswordReveal({ employee, created, onClose }: { employee: Employee; created: CreatedLogin; onClose: () => void }) {
  const toast = useToast();
  const message =
    `Hello ${employee.fullName},\n\nYour login for the Poojary Prefab application:\n` +
    `Link: ${window.location.origin}/login\nUsername: ${created.login.username}\nTemporary password: ${created.temporaryPassword}\n\n` +
    `You will be asked to choose your own password when you sign in.`;
  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast(`${what} copied.`);
    } catch {
      toast("Copy failed – select the text and copy it manually.", "error");
    }
  };
  return (
    <Modal open onClose={onClose} title="Temporary password" footer={<Button variant="primary" onClick={onClose}>Done</Button>}>
      <div className="space-y-3">
        <p className="text-sm text-slate-700">
          Give these details to <strong>{employee.fullName}</strong>. The password is shown <strong>only once</strong>.
        </p>
        <dl className="rounded-lg bg-slate-50 p-3">
          <InfoRow label="Username">{created.login.username}</InfoRow>
          <InfoRow label="Temporary password">
            <code data-testid="temp-password" className="rounded bg-white px-2 py-0.5 font-mono text-base font-semibold ">
              {created.temporaryPassword}
            </code>
          </InfoRow>
        </dl>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => void copy(created.temporaryPassword, "Password")}>
            Copy password
          </Button>
          <Button size="sm" onClick={() => void copy(message, "WhatsApp message")}>
            Copy WhatsApp message
          </Button>
        </div>
        {created.login.mustChangePassword ? (
          <p className="text-xs text-slate-500">They will have to choose a new password the first time they sign in.</p>
        ) : null}
      </div>
    </Modal>
  );
}

function CreateLoginDialog({ employee, onClose, onCreated }: { employee: Employee; onClose: () => void; onCreated: (c: CreatedLogin) => void }) {
  const create = useCreateLogin();
  const [username, setUsername] = useState(employee.mobile);
  const roleOptions = useRoleOptions();
  const [role, setRole] = useState<Role>(roleOptions.fallback);
  const [mustChange, setMustChange] = useState(true);
  const [issues, setIssues] = useState<string[]>([]);
  return (
    <Modal
      open
      onClose={onClose}
      title={`Create login for ${employee.fullName}`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={create.isPending}
            onClick={() =>
              create.mutate(
                { id: employee.id, username, role, mustChangePassword: mustChange },
                { onSuccess: onCreated, onError: (e) => setIssues([e.message]) },
              )
            }
          >
            {create.isPending ? "Creating…" : "Create login"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <TextField label="Username" required value={username} onChange={setUsername} hint="Their mobile number is easiest to remember." />
        <Select label="Role" value={role} onChange={setRole} options={roleOptions.options} hint="Change what each role can open in Settings → Roles and access." />
        <Toggle checked={mustChange} onChange={setMustChange} label="Ask them to change the password at first sign-in" hint="Recommended." />
        <p className="text-xs text-slate-500">A temporary password is generated and shown once after you create the login.</p>
        <ErrorList issues={issues} />
      </div>
    </Modal>
  );
}

/** Login section of the employee page: create, reset password, role, enable/disable. */
export function LoginCard({ employee, autoCreate }: { employee: Employee; autoCreate?: boolean }) {
  const toast = useToast();
  const { user } = useAuth();
  const { data: login, isPending } = useEmployeeLogin(employee.id);
  const reset = useResetPassword();
  const setRole = useSetRole();
  const roleOptions = useRoleOptions(login?.role);
  const setEnabled = useSetLoginEnabled();
  const [creating, setCreating] = useState(!!autoCreate && employee.status === "active");
  const [revealed, setRevealed] = useState<CreatedLogin | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [now] = useState(() => Date.now());
  const self = user?.id === employee.id;
  const inactive = employee.status !== "active";
  const fail = (e: Error) => toast(e.message, "error");

  return (
    <div id="login">
      <Card
        title="Application login"
        description={login ? undefined : "Workers who don't use the application don't need a login."}
        actions={
          !isPending && !login ? (
            <Button variant="primary" disabled={inactive} title={inactive ? "Reactivate the employee first" : undefined} onClick={() => setCreating(true)}>
              Create login
            </Button>
          ) : null
        }
      >
        {isPending ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : !login ? (
          <p className="text-sm text-slate-600">No login – this employee can&apos;t sign in.</p>
        ) : (
          <div className="space-y-4">
            <dl>
              <InfoRow label="Username">{login.username}</InfoRow>
              <InfoRow label="Status">
                {login.enabled ? (
                  <span className="font-medium text-emerald-700">Enabled</span>
                ) : (
                  <span className="font-medium text-slate-500"><Icon icon={Lock} size={14} className="mr-1 inline-block align-[-2px]" />Disabled</span>
                )}
                {login.lockedUntil && new Date(login.lockedUntil).getTime() > now ? (
                  <span className="ml-2 text-xs text-amber-700">(locked after failed attempts until {formatDateTime(login.lockedUntil)})</span>
                ) : null}
              </InfoRow>
              <InfoRow label="Last sign-in">{login.lastLoginAt ? formatDateTime(login.lastLoginAt) : "Never"}</InfoRow>
              {login.mustChangePassword ? <InfoRow label="Password">Must be changed at next sign-in</InfoRow> : null}
            </dl>
            <div className="max-w-sm">
              <Select
                label="Role"
                value={login.role}
                onChange={(role) =>
                  setRole.mutate({ id: employee.id, role }, { onSuccess: () => toast(`Role changed to ${roleOptions.name(role)}.`), onError: fail })
                }
                options={roleOptions.options}
                hint="Change what each role can open in Settings → Roles and access."
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => setConfirmReset(true)}
                disabled={self || reset.isPending}
                title={self ? "Change your own password from My account" : undefined}
              >
                Reset password
              </Button>
              {login.enabled ? (
                <Button
                  variant="danger"
                  disabled={self || setEnabled.isPending}
                  title={self ? "You can't disable your own login" : undefined}
                  onClick={() =>
                    setEnabled.mutate(
                      { id: employee.id, enabled: false },
                      { onSuccess: () => toast("Login disabled. They have been signed out."), onError: fail },
                    )
                  }
                >
                  Disable login
                </Button>
              ) : (
                <Button
                  disabled={inactive || setEnabled.isPending}
                  title={inactive ? "Reactivate the employee first" : undefined}
                  onClick={() => setEnabled.mutate({ id: employee.id, enabled: true }, { onSuccess: () => toast("Login enabled."), onError: fail })}
                >
                  Enable login
                </Button>
              )}
            </div>
          </div>
        )}
      </Card>

      {creating ? (
        <CreateLoginDialog
          employee={employee}
          onClose={() => setCreating(false)}
          onCreated={(c) => {
            setCreating(false);
            setRevealed(c);
          }}
        />
      ) : null}
      {confirmReset ? (
        <Modal
          open
          onClose={() => setConfirmReset(false)}
          title="Reset password?"
          footer={
            <>
              <Button onClick={() => setConfirmReset(false)}>Cancel</Button>
              <Button
                variant="primary"
                disabled={reset.isPending}
                onClick={() =>
                  reset.mutate(employee.id, {
                    onSuccess: (c) => {
                      setConfirmReset(false);
                      setRevealed(c);
                    },
                    onError: fail,
                  })
                }
              >
                Reset password
              </Button>
            </>
          }
        >
          <p className="text-sm text-slate-700">
            A new temporary password is generated and {employee.fullName} will be signed out everywhere. The old password stops working
            at once.
          </p>
        </Modal>
      ) : null}
      {revealed ? <PasswordReveal employee={employee} created={revealed} onClose={() => setRevealed(null)} /> : null}
    </div>
  );
}
