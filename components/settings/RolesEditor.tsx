"use client";

import { Lock, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ErrorList } from "@/components/crm/ui";
import { useToast } from "@/components/Providers";
import { Button, Card } from "@/components/ui/fields";
import { Icon } from "@/components/ui/icons";
import { ADMIN_ROLE, ASSIGNABLE_PAGES, type PageKey, type RoleDef } from "@/lib/auth/roles";
import { useEmployees } from "@/lib/employees/hooks";
import { useSaveRoles } from "@/lib/settings/hooks";

const issuesOf = (e: unknown) => (e && typeof e === "object" && "issues" in e ? (e as { issues: string[] }).issues : [e instanceof Error ? e.message : String(e)]);

/** Settings → Roles and access: add, rename and delete roles, and choose the pages each one opens. */
export function RolesEditor({ initial }: { initial: RoleDef[] }) {
  const toast = useToast();
  const save = useSaveRoles();
  const [rows, setRows] = useState<RoleDef[]>(initial);
  const [issues, setIssues] = useState<string[]>([]);
  const { data: people } = useEmployees({ status: "all", hasLogin: "yes" });

  // Who has each role, from the employees' logins.
  const members = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const e of people ?? []) {
      if (!e.login) continue;
      m.set(e.login.role, [...(m.get(e.login.role) ?? []), e.fullName]);
    }
    return m;
  }, [people]);

  const dirty = JSON.stringify(rows) !== JSON.stringify(initial);
  const set = (i: number, patch: Partial<RoleDef>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const togglePage = (i: number, page: PageKey, on: boolean) =>
    set(i, { pages: on ? ASSIGNABLE_PAGES.map((p) => p.key).filter((k) => k === page || rows[i].pages.includes(k)) : rows[i].pages.filter((k) => k !== page) });

  return (
    <Card
      title="Roles and access"
      description="Choose which pages each role can open, then give people a role on their employee page (Login section). Admin always has every page; Employees and Settings are Admin-only."
    >
      <div className="space-y-3" data-testid="roles-editor">
        {rows.map((r, i) => {
          const admin = r.id === ADMIN_ROLE;
          const who = members.get(r.id) ?? [];
          const isNew = !initial.some((x) => x.id === r.id);
          return (
            <section key={r.id || `new-${i}`} className="rounded-xl border border-slate-200 p-4" data-testid={`role-${r.id || "new"}`}>
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  {admin ? (
                    <div className="flex h-10 items-center gap-2 text-base font-medium text-slate-900">
                      <Icon icon={Lock} className="text-slate-500" />
                      Admin
                      <span className="text-xs font-normal text-slate-500">built in</span>
                    </div>
                  ) : (
                    <input
                      aria-label={`Role name ${i + 1}`}
                      value={r.name}
                      placeholder="Role name, e.g. Site engineer"
                      onChange={(e) => set(i, { name: e.target.value })}
                      className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-base font-medium text-slate-900 outline-none transition-[border-color,box-shadow] placeholder:font-normal placeholder:text-slate-400 focus:border-red-700 focus:ring-3 focus:ring-red-700/10 sm:max-w-xs sm:text-sm"
                    />
                  )}
                  <p className="mt-1 text-xs text-slate-500">
                    {who.length ? (
                      <>
                        {who.length} {who.length === 1 ? "person" : "people"}: {who.slice(0, 4).join(", ")}
                        {who.length > 4 ? ` and ${who.length - 4} more` : ""}
                      </>
                    ) : isNew ? (
                      "New role. Save, then assign it on an employee's page."
                    ) : (
                      "Nobody has this role yet."
                    )}
                  </p>
                </div>
                {!admin ? (
                  <button
                    type="button"
                    aria-label={`Delete role ${r.name || i + 1}`}
                    title={who.length ? "Give these people another role first" : "Delete role"}
                    disabled={who.length > 0}
                    onClick={() => setRows((x) => x.filter((_, j) => j !== i))}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-slate-400"
                  >
                    <Icon icon={Trash2} size={16} />
                  </button>
                ) : null}
              </div>

              <fieldset className="mt-3">
                <legend className="sr-only">Pages {admin ? "Admin" : r.name} can open</legend>
                <div className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2 xl:grid-cols-4">
                  {ASSIGNABLE_PAGES.map((p) => {
                    const on = admin || r.pages.includes(p.key);
                    return (
                      <label
                        key={p.key}
                        className={`flex min-h-11 items-start gap-2.5 rounded-lg px-2 py-2 ${admin ? "cursor-default" : "cursor-pointer hover:bg-slate-50"}`}
                      >
                        <input
                          type="checkbox"
                          className="mt-0.5 h-4 w-4 shrink-0 accent-red-700"
                          checked={on}
                          disabled={admin}
                          onChange={(e) => togglePage(i, p.key, e.target.checked)}
                          aria-label={`${admin ? "Admin" : r.name || "New role"}: ${p.label}`}
                        />
                        <span className="min-w-0">
                          <span className="block text-sm text-slate-800">{p.label}</span>
                          <span className="block text-xs text-slate-500">{p.hint}</span>
                        </span>
                      </label>
                    );
                  })}
                  {admin ? (
                    <div className="flex min-h-11 items-start gap-2.5 px-2 py-2 text-sm text-slate-800">
                      <Icon icon={Lock} size={14} className="mt-0.5 text-slate-400" />
                      <span>
                        Employees and Settings
                        <span className="block text-xs text-slate-500">Admin only</span>
                      </span>
                    </div>
                  ) : null}
                </div>
              </fieldset>
            </section>
          );
        })}
      </div>

      <div className="mt-4 space-y-3">
        <ErrorList issues={issues} />
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => setRows((x) => [...x, { id: "", name: "", pages: [] }])}>
            <Icon icon={Plus} size={16} />
            Add role
          </Button>
          <span className="flex-1" />
          {dirty ? (
            <Button
              variant="ghost"
              onClick={() => {
                setRows(initial);
                setIssues([]);
              }}
            >
              Discard
            </Button>
          ) : null}
          <Button
            variant="primary"
            disabled={!dirty || save.isPending}
            onClick={() =>
              save.mutate(rows, {
                onSuccess: () => {
                  setIssues([]);
                  toast("Roles saved");
                },
                onError: (e) => setIssues(issuesOf(e)),
              })
            }
          >
            {save.isPending ? "Saving…" : "Save roles"}
          </Button>
        </div>
        <p className="text-xs text-slate-500">
          People see their new pages the next time a page loads. To give someone a role, open{" "}
          <Link href="/employees" className="font-medium text-red-700 hover:underline">
            Employees
          </Link>{" "}
          → their name → Login.
        </p>
      </div>
    </Card>
  );
}
