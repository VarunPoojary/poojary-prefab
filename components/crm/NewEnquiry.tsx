"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useToast } from "@/components/Providers";
import { Button, Card } from "@/components/ui/fields";
import { useAuth } from "@/lib/auth/AuthProvider";
import { crmRepo } from "@/lib/crm";
import { isClosed } from "@/lib/crm/config";
import { useAddAttachment, useClient, useClientSearch, useCreateEnquiry, useEnquiry, useRemoveAttachment, useUpdateEnquiry } from "@/lib/crm/hooks";
import { formatPhone } from "@/lib/crm/rules";
import type { EnquiryInput } from "@/lib/crm/types";
import { ClientForm } from "./ClientForm";
import { NotFound } from "./ClientDetail";
import { EnquiryForm, emptyEnquiryInput, type PendingFile } from "./EnquiryForm";
import { LoadingRows, PageContainer, PageHeader, useDebounced } from "./ui";

const issuesOf = (e: unknown) => (e && typeof e === "object" && "issues" in e ? (e as { issues: string[] }).issues : [String(e)]);

function Steps({ step }: { step: 1 | 2 }) {
  return (
    <ol className="mb-5 flex items-center gap-3 text-sm">
      {["Client", "Enquiry details"].map((s, i) => {
        const n = i + 1;
        const active = n === step;
        const done = n < step;
        return (
          <li key={s} className="flex items-center gap-2">
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                active ? "bg-red-700 text-white" : done ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-500"
              }`}
            >
              {done ? "✓" : n}
            </span>
            <span className={active ? "font-semibold text-slate-900" : "text-slate-500"}>{s}</span>
            {n === 1 ? <span className="mx-1 text-slate-300">—</span> : null}
          </li>
        );
      })}
    </ol>
  );
}

export function NewEnquiry() {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const { user } = useAuth();
  const [clientId, setClientId] = useState<string | null>(params.get("client"));
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState("");
  const [files, setFiles] = useState<PendingFile[]>([]);
  const q = useDebounced(search, 250);
  const results = useClientSearch(q, !clientId && !creating);
  const { data: client } = useClient(clientId);
  const create = useCreateEnquiry();
  const [saving, setSaving] = useState(false);

  const submit = async (input: EnquiryInput) => {
    setSaving(true);
    try {
      const e = await create.mutateAsync(input);
      const failed: string[] = [];
      for (const f of files) {
        try {
          await crmRepo.addAttachment(e.id, f);
        } catch (err) {
          failed.push(`${f.name}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      toast(`${e.number} created`);
      if (failed.length) toast(`Some files weren't attached: ${failed.join("; ")}`, "error");
      router.push(`/enquiries/${e.id}`);
    } catch (err) {
      setSaving(false);
      return issuesOf(err);
    }
  };

  return (
    <PageContainer>
      <PageHeader back={{ href: "/enquiries", label: "Enquiries" }} title="New enquiry" />
      <Steps step={client ? 2 : 1} />

      {!clientId ? (
        creating ? (
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-900">Create new client</h2>
              <Button size="sm" variant="ghost" onClick={() => setCreating(false)}>
                ← Back to search
              </Button>
            </div>
            <ClientForm
              compact
              onCancel={() => setCreating(false)}
              onUseExisting={(id) => {
                setCreating(false);
                setClientId(id);
              }}
              onSaved={(c) => {
                toast(`${c.name} added to the Client List`);
                setCreating(false);
                setClientId(c.id);
              }}
            />
          </div>
        ) : (
          <Card title="Find the client" description="Search by company name, contact name, phone or email.">
            <input
              type="search"
              autoFocus
              aria-label="Search clients"
              placeholder="e.g. Kalyani, 98900 11223, prakash@…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-red-600 focus:ring-2 focus:ring-red-100"
            />
            <ul className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-200">
              {(results.data ?? []).map((c) => {
                const p = c.contacts.find((x) => x.primary) ?? c.contacts[0];
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      data-testid="client-result"
                      onClick={() => setClientId(c.id)}
                      className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-red-50/40"
                    >
                      <span>
                        <span className="block font-medium text-slate-900">{c.name}</span>
                        <span className="block text-xs text-slate-500">
                          {[p?.name, p?.phone ? formatPhone(p.phone) : "", p?.email, c.city].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                      <span className="text-xs font-medium text-red-700">Select →</span>
                    </button>
                  </li>
                );
              })}
              {results.data && !results.data.length ? (
                <li className="px-4 py-6 text-center text-sm text-slate-500">No client found{q ? ` for “${q}”` : ""}.</li>
              ) : null}
              {results.isPending ? <li className="px-4 py-4 text-sm text-slate-500">Searching…</li> : null}
            </ul>
            <div className="mt-4 flex items-center justify-between rounded-lg bg-slate-50 px-4 py-3 text-sm">
              <span className="text-slate-600">Not in the list?</span>
              <Button variant="primary" onClick={() => setCreating(true)}>
                + Create new client
              </Button>
            </div>
          </Card>
        )
      ) : !client ? (
        <LoadingRows rows={3} />
      ) : (
        <>
          <div className="mb-5 flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <div>
              <div className="text-xs uppercase text-slate-500">Client</div>
              <div className="font-semibold text-slate-900">{client.name}</div>
              <div className="text-xs text-slate-500">{[client.city, client.state].filter(Boolean).join(", ")}</div>
            </div>
            <Button size="sm" variant="ghost" onClick={() => setClientId(null)}>
              Change client
            </Button>
          </div>
          {!client.active ? (
            <p className="mb-4 rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-900">
              This client is marked inactive. Saving an enquiry is still allowed.
            </p>
          ) : null}
          <EnquiryForm
            key={client.id}
            client={client}
            initial={emptyEnquiryInput(client, user?.id ?? "")}
            submitLabel="Save enquiry"
            submitting={saving}
            onCancel={() => router.push("/enquiries")}
            onSubmit={submit}
            pendingFiles={files}
            onPendingFiles={setFiles}
          />
        </>
      )}
    </PageContainer>
  );
}

export function EditEnquiry() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const { data: e, error, isPending } = useEnquiry(id);
  const { data: client } = useClient(e?.clientId);
  const update = useUpdateEnquiry();
  const addAttachment = useAddAttachment();
  const removeAttachment = useRemoveAttachment();
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [removed, setRemoved] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  if (error) return <NotFound what="Enquiry" />;
  if (isPending || !client) return <PageContainer><LoadingRows /></PageContainer>;
  if (isClosed(e.status)) {
    return (
      <PageContainer>
        <PageHeader back={{ href: `/enquiries/${id}`, label: e.number }} title={`Edit ${e.number}`} />
        <p className="rounded-lg bg-slate-100 px-4 py-3 text-sm text-slate-700">
          This enquiry is closed. Only notes can be changed, from the enquiry page.
        </p>
      </PageContainer>
    );
  }
  const { clientId, contactId, enquiryDate, projectName, siteLocation, buildingType, buildingTypeOther, scope, scopeOther, size, description, leadSource, leadSourceOther, assignedTo, expectedDecisionDate, notes } = e;
  return (
    <PageContainer>
      <PageHeader back={{ href: `/enquiries/${id}`, label: e.number }} title={`Edit ${e.number}`} subtitle={client.name} />
      <EnquiryForm
        client={client}
        initial={{ clientId, contactId, enquiryDate, projectName, siteLocation, buildingType, buildingTypeOther, scope, scopeOther, size, description, leadSource, leadSourceOther, assignedTo, expectedDecisionDate, notes }}
        submitLabel="Save changes"
        submitting={saving}
        onCancel={() => router.push(`/enquiries/${id}`)}
        pendingFiles={files}
        onPendingFiles={setFiles}
        existingFiles={e.attachments.filter((a) => !removed.includes(a.id))}
        onRemoveExisting={(attachmentId) => setRemoved((r) => [...r, attachmentId])}
        onSubmit={async (input) => {
          setSaving(true);
          try {
            await update.mutateAsync({ id, input });
          } catch (err) {
            setSaving(false);
            return issuesOf(err);
          }
          const failed: string[] = [];
          for (const attachmentId of removed) {
            try {
              await removeAttachment.mutateAsync({ id, attachmentId });
            } catch (err) {
              failed.push(err instanceof Error ? err.message : String(err));
            }
          }
          for (const f of files) {
            try {
              await addAttachment.mutateAsync({ id, file: f });
            } catch (err) {
              failed.push(`${f.name}: ${err instanceof Error ? err.message : String(err)}`);
            }
          }
          toast("Enquiry saved");
          if (failed.length) toast(`Some attachment changes failed: ${failed.join("; ")}`, "error");
          router.push(`/enquiries/${id}`);
        }}
      />
    </PageContainer>
  );
}
