"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ErrorList, PageContainer, PageHeader, SearchSelect, useDebounced } from "@/components/crm/ui";
import { useToast } from "@/components/Providers";
import { Button, Card, NumberField, Select, TextField } from "@/components/ui/fields";
import { useClient, useClientSearch, useUsers } from "@/lib/crm/hooks";
import { projectRepo } from "@/lib/projects";
import { useAvailableEnquiries, useProjectMutation } from "@/lib/projects/hooks";
import { todayIso } from "@/lib/projects/rules";
import type { ManualProjectInput } from "@/lib/projects/types";

const issuesOf = (e: unknown) => (e && typeof e === "object" && "issues" in e ? (e as { issues: string[] }).issues : [String(e)]);

/** Admin: create a project by hand – from a Finalised enquiry without a project, or unlinked (old running projects). */
export function NewProject() {
  const router = useRouter();
  const toast = useToast();
  const { data: enquiries = [], isPending } = useAvailableEnquiries();
  const { data: users = [] } = useUsers();
  const create = useProjectMutation((input: ManualProjectInput) => projectRepo.createManual(input));
  const [mode, setMode] = useState<"enquiry" | "unlinked">("enquiry");
  const [enquiryId, setEnquiryId] = useState("");
  const [query, setQuery] = useState("");
  const q = useDebounced(query, 200);
  const { data: results = [], isFetching } = useClientSearch(q, mode === "unlinked");
  const [f, setF] = useState<ManualProjectInput>({
    enquiryId: null,
    clientId: "",
    contactId: "",
    name: "",
    siteLocation: "",
    valueBasic: null,
    gstRate: 18,
    startDate: todayIso(),
    plannedCompletion: "",
    projectManagerId: "",
    poNumber: "",
    poDate: "",
  });
  const { data: client } = useClient(f.clientId || null);
  const [issues, setIssues] = useState<string[]>([]);
  const set = (patch: Partial<ManualProjectInput>) => setF((x) => ({ ...x, ...patch }));

  const submit = () => {
    if (mode === "enquiry" && !enquiryId) return setIssues(["Choose the enquiry."]);
    create.mutate(mode === "enquiry" ? { ...f, enquiryId } : { ...f, enquiryId: null }, {
      onSuccess: (p) => {
        toast(`${p.code} created`);
        router.push(`/projects/${p.id}/details`);
      },
      onError: (e) => setIssues(issuesOf(e)),
    });
  };

  return (
    <PageContainer>
      <PageHeader back={{ href: "/projects", label: "Projects" }} title="New project" subtitle="Projects are created automatically when an enquiry is Finalised. Use this for older projects or missed ones." />
      <div className="mb-4 flex gap-2" role="tablist">
        {(
          [
            ["enquiry", "From a Finalised enquiry"],
            ["unlinked", "Not linked to an enquiry"],
          ] as const
        ).map(([k, l]) => (
          <button
            key={k}
            role="tab"
            type="button"
            aria-selected={mode === k}
            onClick={() => setMode(k)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium ${mode === k ? "bg-red-700 text-white" : "bg-white text-slate-700 ring-1 ring-slate-300"}`}
          >
            {l}
          </button>
        ))}
      </div>

      <div className="space-y-4">
        {mode === "enquiry" ? (
          <Card title="Finalised enquiry" description="Everything is filled in from the enquiry, the accepted quotation and the PO / LOI.">
            {isPending ? (
              <p className="text-sm text-slate-500">Loading…</p>
            ) : enquiries.length ? (
              <Select
                label="Enquiry"
                value={enquiryId}
                onChange={setEnquiryId}
                options={[{ value: "", label: "Choose…" }, ...enquiries.map((e) => ({ value: e.id, label: `${e.number} · ${e.clientName} – ${e.projectName}` }))]}
              />
            ) : (
              <p className="text-sm text-slate-600">Every Finalised enquiry already has a project.</p>
            )}
          </Card>
        ) : (
          <Card title="Project">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <SearchSelect
                  label="Client *"
                  placeholder="Search the Client List…"
                  query={query}
                  onQuery={setQuery}
                  loading={isFetching}
                  options={results.map((c) => ({ value: c.id, label: c.name, sub: [c.city, c.state].filter(Boolean).join(", ") }))}
                  selectedLabel={client?.name}
                  onSelect={(id) => {
                    const c = results.find((x) => x.id === id);
                    set({ clientId: id, contactId: c?.contacts.find((x) => x.primary)?.id ?? c?.contacts[0]?.id ?? "" });
                  }}
                  onClear={() => set({ clientId: "", contactId: "" })}
                />
              </div>
              {client ? (
                <Select
                  label="Point of contact"
                  value={f.contactId}
                  onChange={(v) => set({ contactId: v })}
                  options={client.contacts.map((c) => ({ value: c.id, label: c.name }))}
                />
              ) : null}
              <TextField className="sm:col-span-2" label="Project name" required value={f.name} onChange={(v) => set({ name: v })} />
              <TextField label="Site location" value={f.siteLocation} onChange={(v) => set({ siteLocation: v })} placeholder="City, state" />
              <NumberField label="Project value before GST (₹)" value={f.valueBasic} onChange={(v) => set({ valueBasic: v })} />
              <NumberField label="GST rate" suffix="%" value={f.gstRate} onChange={(v) => set({ gstRate: v })} />
              <TextField label="PO / LOI number" value={f.poNumber} onChange={(v) => set({ poNumber: v })} />
              <TextField label="PO / LOI date" type="date" value={f.poDate} onChange={(v) => set({ poDate: v })} />
            </div>
          </Card>
        )}
        <Card title="Schedule and team">
          <div className="grid gap-4 sm:grid-cols-3">
            <TextField label="Start date" required type="date" value={f.startDate} onChange={(v) => set({ startDate: v })} />
            <TextField label="Planned completion" type="date" value={f.plannedCompletion} onChange={(v) => set({ plannedCompletion: v })} hint="Saved as the baseline." />
            {mode === "unlinked" ? (
              <Select
                label="Project manager"
                value={f.projectManagerId}
                onChange={(v) => set({ projectManagerId: v })}
                options={[{ value: "", label: "Me" }, ...users.filter((u) => u.assignable).map((u) => ({ value: u.id, label: u.name }))]}
              />
            ) : (
              <p className="self-end text-xs text-slate-500">The project manager is the enquiry&apos;s assignee; change it on the project page.</p>
            )}
          </div>
        </Card>
        <ErrorList issues={issues} />
        <div className="flex justify-end gap-2">
          <Button onClick={() => router.push("/projects")}>Cancel</Button>
          <Button variant="primary" disabled={create.isPending} onClick={submit}>
            {create.isPending ? "Creating…" : "Create project"}
          </Button>
        </div>
      </div>
    </PageContainer>
  );
}
