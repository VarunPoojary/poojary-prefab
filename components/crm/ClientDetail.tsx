"use client";

import { Plus } from "lucide-react";
import { Icon } from "@/components/ui/icons";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useToast } from "@/components/Providers";
import { Button, Card } from "@/components/ui/fields";
import { CONTACT_ROLES, LEAD_SOURCES, labelOf } from "@/lib/crm/config";
import { useClient, useEnquiries, useLinkedQuotations, useSetClientActive } from "@/lib/crm/hooks";
import { useProjects } from "@/lib/projects/hooks";
import { ProjectStatusBadge } from "@/components/projects/bits";
import { formatPhone } from "@/lib/crm/rules";
import { formatDate } from "@/lib/format";
import { formatRupee } from "@/lib/money";
import { ClientForm } from "./ClientForm";
import { EmptyState, InfoRow, LoadingRows, PageContainer, PageHeader, StatusBadge, useUserName } from "./ui";

export function ClientDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const userName = useUserName();
  const { data: c, error, isPending } = useClient(id);
  const enquiries = useEnquiries({ clientId: id, pageSize: 200, sort: "date", dir: "desc" });
  const quotes = useLinkedQuotations({ clientId: id });
  const projects = useProjects({ clientId: id, statuses: [] });
  const setActive = useSetClientActive();

  if (error) return <NotFound what="Client" />;
  if (isPending) return <PageContainer><LoadingRows /></PageContainer>;

  return (
    <PageContainer wide>
      <PageHeader
        back={{ href: "/clients", label: "Clients" }}
        title={
          <span className="flex flex-wrap items-center gap-2">
            {c.name}
            {!c.active ? (
              <span className="rounded-lg bg-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-600">Inactive</span>
            ) : null}
          </span>
        }
        subtitle={[c.city, c.state].filter(Boolean).join(", ")}
        actions={
          <>
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                setActive.mutate(
                  { id: c.id, active: !c.active },
                  { onSuccess: () => toast(`Client marked ${c.active ? "inactive" : "active"}`) },
                )
              }
            >
              {c.active ? "Mark inactive" : "Mark active"}
            </Button>
            <Button onClick={() => router.push(`/clients/${c.id}/edit`)}>Edit</Button>
            <Button variant="primary" disabled={!c.active} onClick={() => router.push(`/enquiries/new?client=${c.id}`)}>
              <Icon icon={Plus} size={14} className="inline-block align-[-2px]" /> New enquiry
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5">
          <Card title={`Contacts (${c.contacts.length})`}>
            <ul className="space-y-3">
              {c.contacts.map((p) => (
                <li key={p.id} className="text-sm">
                  <div className="flex items-center gap-2 font-medium text-slate-900">
                    {p.name}
                    {p.primary ? (
                      <span className="rounded-lg bg-red-50 px-1.5 py-0.5 text-[11px] font-semibold text-red-800">Primary</span>
                    ) : null}
                  </div>
                  <div className="text-xs text-slate-500">{labelOf(CONTACT_ROLES, p.role)}</div>
                  <div className="text-slate-700">
                    {p.phone ? <a href={`tel:${p.phone}`} className="hover:underline">{formatPhone(p.phone)}</a> : null}
                    {p.phone && p.email ? " · " : ""}
                    {p.email ? <a href={`mailto:${p.email}`} className="hover:underline">{p.email}</a> : null}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
          <Card title="Details">
            <dl>
              <InfoRow label="Lead source">
                {labelOf(LEAD_SOURCES, c.leadSource)}
                {c.leadSource === "referral" && c.referredBy ? ` – ${c.referredBy}` : ""}
                {c.leadSource === "other" && c.leadSourceOther ? ` – ${c.leadSourceOther}` : ""}
              </InfoRow>
              <InfoRow label="Address">{c.address}</InfoRow>
              <InfoRow label="GSTIN">{c.gstin}</InfoRow>
              <InfoRow label="Notes">{c.notes}</InfoRow>
              <InfoRow label="Created">
                {formatDate(c.createdAt)} by {userName(c.createdBy)}
              </InfoRow>
            </dl>
          </Card>
        </div>

        <div className="space-y-5 lg:col-span-2">
          <Card title={`Enquiries (${enquiries.data?.total ?? "…"})`}>
            {enquiries.isPending ? (
              <LoadingRows rows={2} />
            ) : !enquiries.data?.items.length ? (
              <EmptyState title="No enquiries yet" />
            ) : (
              <ul className="divide-y divide-slate-100">
                {enquiries.data.items.map((e) => (
                  <li key={e.id}>
                    <Link href={`/enquiries/${e.id}`} className="flex flex-wrap items-center gap-3 py-2.5 text-sm hover:bg-slate-50">
                      <span className="ref-code w-32 font-medium text-slate-900">{e.number}</span>
                      <span className="min-w-0 flex-1 truncate text-slate-700">{e.projectName}</span>
                      <StatusBadge status={e.status} />
                      <span className="w-28 text-right tabular-nums text-slate-900">{e.latestValue !== null ? formatRupee(e.latestValue) : "–"}</span>
                      <span className="w-24 text-right text-xs text-slate-500">{formatDate(e.enquiryDate)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title={`Projects (${projects.data?.length ?? "…"})`}>
            {projects.isPending ? (
              <LoadingRows rows={1} />
            ) : !projects.data?.length ? (
              <EmptyState title="No projects yet" />
            ) : (
              <ul className="divide-y divide-slate-100" data-testid="client-projects">
                {projects.data.map((p) => (
                  <li key={p.id}>
                    <Link href={`/projects/${p.id}/details`} className="flex flex-wrap items-center gap-3 py-2.5 text-sm hover:bg-slate-50">
                      <span className="ref-code w-32 font-medium text-slate-900">{p.code}</span>
                      <span className="min-w-0 flex-1 truncate text-slate-700">{p.name}</span>
                      <ProjectStatusBadge status={p.status} />
                      <span className="w-24 text-right text-xs font-semibold text-slate-700">{Math.round(p.progress)}% done</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title={`Quotations (${quotes.data?.total ?? "…"})`}>
            {quotes.isPending ? (
              <LoadingRows rows={2} />
            ) : !quotes.data?.items.length ? (
              <EmptyState title="No quotations yet" />
            ) : (
              <ul className="divide-y divide-slate-100">
                {quotes.data.items.map((q) => (
                  <li key={q.id}>
                    <Link href={`/quotations/${q.id}`} className="flex flex-wrap items-center gap-3 py-2.5 text-sm hover:bg-slate-50">
                      <span className="w-20 font-semibold text-slate-900">
                        {q.offerNo} / {q.revision}
                      </span>
                      <span className="w-32 text-xs text-slate-600">
                        {q.enquiryNumber ? `${q.enquiryNumber} · R${q.enquiryRevision}` : <i className="text-slate-400">Unlinked</i>}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-slate-700">{q.subject}</span>
                      <QuoteStatus status={q.status} sentAt={q.sentAt} />
                      <span className="w-28 text-right tabular-nums text-slate-900">{formatRupee(q.grandTotal)}</span>
                      <span className="w-24 text-right text-xs text-slate-500">{formatDate(q.date)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </PageContainer>
  );
}

export function QuoteStatus({ status, sentAt }: { status: "draft" | "final"; sentAt: string | null }) {
  const [label, cls] = sentAt
    ? ["Sent", "bg-sky-100 text-sky-900"]
    : status === "final"
      ? ["Final", "bg-emerald-100 text-emerald-800"]
      : ["Draft", "bg-amber-100 text-amber-800"];
  return <span className={`rounded-lg px-2 py-0.5 text-[11px] font-semibold ${cls}`}>{label}</span>;
}

export function NotFound({ what }: { what: string }) {
  const href = what === "Client" ? "/clients" : "/enquiries";
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-10 text-center">
      <h1 className="text-lg font-semibold text-slate-900">{what} not found</h1>
      <p className="text-sm text-slate-600">It may have been deleted, or it was saved in a different browser.</p>
      <Link href={href} className="text-sm font-medium text-red-700 hover:underline">
        Back to {what === "Client" ? "clients" : "enquiries"}
      </Link>
    </div>
  );
}

export const NewClientScreen = () => <ClientEditScreen mode="new" />;
export const EditClientScreen = () => <ClientEditScreen mode="edit" />;

export function ClientEditScreen({ mode }: { mode: "new" | "edit" }) {
  const { id } = useParams<{ id?: string }>();
  const router = useRouter();
  const toast = useToast();
  const { data, error, isPending } = useClient(mode === "edit" ? id : null);
  if (mode === "edit" && error) return <NotFound what="Client" />;
  if (mode === "edit" && isPending) return <PageContainer><LoadingRows /></PageContainer>;
  return (
    <PageContainer>
      <PageHeader
        back={mode === "edit" ? { href: `/clients/${id}`, label: data?.name ?? "Client" } : { href: "/clients", label: "Clients" }}
        title={mode === "edit" ? `Edit ${data?.name}` : "New client"}
      />
      <ClientForm
        initial={mode === "edit" ? data : undefined}
        onCancel={() => router.back()}
        onUseExisting={(cid) => router.push(`/clients/${cid}`)}
        onSaved={(c) => {
          toast(mode === "edit" ? "Client saved" : `${c.name} added to the Client List`);
          router.push(`/clients/${c.id}`);
        }}
      />
    </PageContainer>
  );
}
