"use client";

import { useState } from "react";
import { PageContainer, PageHeader } from "@/components/crm/ui";
import { useToast } from "@/components/Providers";
import { Card } from "@/components/ui/fields";
import { useAuth } from "@/lib/auth/AuthProvider";
import { formatDateTime } from "@/lib/format";
import { useRoles } from "@/lib/settings/hooks";
import { ChangePasswordForm } from "./ChangePassword";

/** /account: the signed-in user's own details and password change. */
export function AccountScreen() {
  const { user, session } = useAuth();
  const toast = useToast();
  const [formKey, setFormKey] = useState(0);
  const roles = useRoles();
  if (!user) return null;
  const rows: [string, string][] = [
    ["Name", user.name],
    ["Employee ID", user.code],
    ["Username", user.username],
    ["Role", roles.name(user.role)],
    ["Previous sign-in", session?.lastLoginAt ? formatDateTime(session.lastLoginAt) : "This is your first sign-in"],
  ];
  return (
    <PageContainer>
      <PageHeader title="My account" />
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <Card title="Profile">
          <dl className="space-y-2 text-sm">
            {rows.map(([k, v]) => (
              <div key={k} className="flex gap-3">
                <dt className="w-36 shrink-0 text-slate-500">{k}</dt>
                <dd className="text-slate-900">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-xs text-slate-500">To change your details or role, ask an administrator.</p>
        </Card>
        <Card title="Change password" description="Other devices and tabs signed in with this account will be signed out.">
          <ChangePasswordForm
            key={formKey}
            onDone={() => {
              toast("Password changed");
              setFormKey((k) => k + 1);
            }}
          />
        </Card>
      </div>
    </PageContainer>
  );
}
