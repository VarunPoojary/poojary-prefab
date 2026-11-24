"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useToast } from "@/components/Providers";
import { Button } from "@/components/ui/fields";
import { Modal, OptionsMenu } from "@/components/ui/overlays";
import { LEAD_SOURCES, labelOf } from "@/lib/crm/config";
import { useClients, useDeleteClient, useSetClientActive } from "@/lib/crm/hooks";
import { formatPhone } from "@/lib/crm/rules";
import type { ClientListParams, ClientSummary } from "@/lib/crm/types";
import { relativeTime } from "@/lib/format";
import { EmptyState, LoadingRows, PageContainer, PageHeader, useDebounced } from "./ui";

export function ClientsList() {
  const router = useRouter();
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [active, setActive] = useState<ClientListParams["active"]>("active");
  const [page, setPage] = useState(1);
  const [toDelete, setToDelete] = useState<ClientSummary | null>(null);
  const q = useDebounced(search, 300);
  const { data, isPending, error, refetch } = useClients({ search: q, active, page, pageSize: 20 });
  const setActiveMut = useSetClientActive();
  const del = useDeleteClient();
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  const menu = (c: ClientSummary) => [
    { label: "Open", onSelect: () => router.push(`/clients/${c.id}`) },
    { label: "Edit", onSelect: () => router.push(`/clients/${c.id}/edit`) },
    { label: "New enquiry", onSelect: () => router.push(`/enquiries/new?client=${c.id}`), disabled: !c.active },
    {
      label: c.active ? "Mark inactive" : "Mark active",
      onSelect: () =>
        setActiveMut.mutate(
          { id: c.id, active: !c.active },
          { onSuccess: () => toast(`${c.name} marked ${c.active ? "inactive" : "active"}`) },
        ),
    },
    ...(c.enquiryCount === 0 ? [{ label: "Delete", danger: true, onSelect: () => setToDelete(c) }] : []),
  ];

  return (
    <PageContainer wide>
      <PageHeader
        title="Clients"
        subtitle="Every client once, reused for all their enquiries."
        actions={
          <Button variant="primary" onClick={() => router.push("/clients/new")}>
            + New client
          </Button>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          type="search"
          aria-label="Search clients"
          placeholder="Search by company, contact, phone, email or city…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="min-w-[260px] flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-red-600 focus:ring-2 focus:ring-red-100"
        />
        <select
          aria-label="Filter by active"
          value={active}
          onChange={(e) => {
            setActive(e.target.value as ClientListParams["active"]);
            setPage(1);
          }}
          className="rounded-md border border-slate-300 bg-white px-2.5 py-2 text-sm"
        >
          <option value="active">Active clients</option>
          <option value="inactive">Inactive clients</option>
          <option value="all">All clients</option>
        </select>
        <span className="ml-auto text-xs text-slate-500">{data ? `${data.total} client${data.total === 1 ? "" : "s"}` : ""}</span>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {error ? (
          <EmptyState title="Could not load clients">
            <Button onClick={() => void refetch()}>Retry</Button>
          </EmptyState>
        ) : isPending ? (
          <LoadingRows />
        ) : data.items.length === 0 ? (
          <EmptyState title={q ? "No clients match your search." : "No clients yet."}>
            {!q ? <Link href="/clients/new" className="font-medium text-red-700 hover:underline">Add your first client</Link> : null}
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Company</th>
                  <th className="px-4 py-3">Primary contact</th>
                  <th className="px-4 py-3">Phone</th>
                  <th className="px-4 py-3">City</th>
                  <th className="px-4 py-3">Lead source</th>
                  <th className="px-4 py-3 text-right">Enquiries</th>
                  <th className="px-4 py-3">Last activity</th>
                  <th className="w-12" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.items.map((c) => (
                  <tr
                    key={c.id}
                    data-testid="client-row"
                    className="cursor-pointer hover:bg-red-50/40"
                    onClick={() => router.push(`/clients/${c.id}`)}
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{c.name}</div>
                      {!c.active ? (
                        <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-600">
                          Inactive
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{c.primaryContact?.name}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                      {c.primaryContact?.phone ? formatPhone(c.primaryContact.phone) : "–"}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{c.city || "–"}</td>
                    <td className="px-4 py-3 text-slate-700">{labelOf(LEAD_SOURCES, c.leadSource)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{c.enquiryCount}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">{relativeTime(c.lastActivity)}</td>
                    <td className="px-2 py-3">
                      <OptionsMenu label={`Options for ${c.name}`} items={menu(c)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {data && pages > 1 ? (
        <div className="mt-4 flex items-center justify-end gap-2 text-sm">
          <Button size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            ← Prev
          </Button>
          <span className="text-slate-600">
            Page {page} of {pages}
          </span>
          <Button size="sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>
            Next →
          </Button>
        </div>
      ) : null}

      <Modal
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        title="Delete client?"
        footer={
          <>
            <Button onClick={() => setToDelete(null)}>Cancel</Button>
            <Button
              variant="primary"
              disabled={del.isPending}
              onClick={() =>
                del.mutate(toDelete!.id, {
                  onSuccess: () => {
                    toast(`${toDelete!.name} deleted`);
                    setToDelete(null);
                  },
                  onError: (e) => toast(e.message, "error"),
                })
              }
            >
              Delete
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-700">
          <b>{toDelete?.name}</b> has no enquiries and will be permanently deleted.
        </p>
      </Modal>
    </PageContainer>
  );
}
