"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/fields";
import { OptionsMenu } from "@/components/ui/overlays";
import { LEAD_SOURCES, STATUSES, isClosed, OPEN_STATUSES } from "@/lib/crm/config";
import { useClients, useEnquiries, useStatusCounts, useUsers } from "@/lib/crm/hooks";
import type { EnquiryListParams, EnquiryStatus, EnquirySummary, LeadSource } from "@/lib/crm/types";
import { formatDate } from "@/lib/format";
import { formatRupee } from "@/lib/money";
import { CreateQuotationMenu } from "./EnquiryDetail";
import { StatusDialog } from "./StatusDialog";
import { EmptyState, LoadingRows, PageContainer, PageHeader, StatusBadge, useDebounced, useUserName } from "./ui";

export function EnquiriesList() {
  const router = useRouter();
  const params = useSearchParams();
  const userName = useUserName();
  const [search, setSearch] = useState("");
  const [statuses, setStatuses] = useState<EnquiryStatus[]>([]);
  const [clientId, setClientId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [leadSource, setLeadSource] = useState<LeadSource | "">("");
  const [assignedTo, setAssignedTo] = useState("");
  const [needsFollowUp, setNeedsFollowUp] = useState(params.get("followUp") === "1");
  const [sort, setSort] = useState<NonNullable<EnquiryListParams["sort"]>>("updated");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [statusFor, setStatusFor] = useState<string | null>(null);
  const [quoteFor, setQuoteFor] = useState<string | null>(null);
  const q = useDebounced(search, 300);

  const filters: EnquiryListParams = { search: q, clientId, from, to, leadSource, assignedTo, needsFollowUp };
  const { data, isPending, error, refetch } = useEnquiries({ ...filters, statuses, sort, dir, page, pageSize: 20 });
  const { data: counts } = useStatusCounts(filters);
  const { data: clients } = useClients({ active: "all", pageSize: 1000 });
  const { data: users = [] } = useUsers();
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const anyFilter = !!(q || statuses.length || clientId || from || to || leadSource || assignedTo || needsFollowUp);
  const totalAll = counts ? Object.values(counts).reduce((a, b) => a + b, 0) : 0;
  const openCount = counts ? OPEN_STATUSES.reduce((a, s) => a + counts[s], 0) : 0;
  const reset = () => {
    setSearch("");
    setStatuses([]);
    setClientId("");
    setFrom("");
    setTo("");
    setLeadSource("");
    setAssignedTo("");
    setNeedsFollowUp(false);
    setPage(1);
  };
  const toggleStatus = (s: EnquiryStatus) => {
    setStatuses((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));
    setPage(1);
  };
  const sameSet = (a: EnquiryStatus[], b: EnquiryStatus[]) => a.length === b.length && a.every((x) => b.includes(x));

  const menu = (e: EnquirySummary) => [
    { label: "Open", onSelect: () => router.push(`/enquiries/${e.id}`) },
    { label: "Edit", disabled: isClosed(e.status), onSelect: () => router.push(`/enquiries/${e.id}/edit`) },
    { label: "Change status", disabled: isClosed(e.status), onSelect: () => setStatusFor(e.id) },
    { label: "Create quotation", disabled: isClosed(e.status), onSelect: () => setQuoteFor(e.id) },
  ];

  const chip = (active: boolean, label: React.ReactNode, onClick: () => void, key: string, testId?: string) => (
    <button
      key={key}
      type="button"
      data-testid={testId}
      aria-pressed={active}
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition ${
        active ? "border-red-700 bg-red-50 text-red-800" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
      }`}
    >
      {label}
    </button>
  );

  return (
    <PageContainer wide>
      <PageHeader
        title="Enquiries"
        subtitle="Every enquiry from first contact to Finalised or Declined."
        actions={
          <Button variant="primary" onClick={() => router.push("/enquiries/new")}>
            + New enquiry
          </Button>
        }
      />

      <div className="mb-3 flex flex-wrap gap-2" aria-label="Filter by status">
        {chip(!statuses.length, <>All <b>{totalAll}</b></>, () => setStatuses([]), "all")}
        {chip(sameSet(statuses, OPEN_STATUSES), <>Open <b>{openCount}</b></>, () => setStatuses(OPEN_STATUSES), "open")}
        {STATUSES.map((s) =>
          chip(
            statuses.includes(s.value) && !sameSet(statuses, OPEN_STATUSES),
            <>
              <span className={`h-2 w-2 rounded-full ${s.badge.split(" ")[0]}`} />
              {s.label} <b>{counts?.[s.value] ?? 0}</b>
            </>,
            () => (sameSet(statuses, OPEN_STATUSES) ? setStatuses([s.value]) : toggleStatus(s.value)),
            s.value,
            `status-chip-${s.value}`,
          ),
        )}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <input
          type="search"
          aria-label="Search enquiries"
          placeholder="Search by number, client or project…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="min-w-[240px] flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 outline-none focus:border-red-600 focus:ring-2 focus:ring-red-100"
        />
        <select
          aria-label="Filter by client"
          value={clientId}
          onChange={(e) => {
            setClientId(e.target.value);
            setPage(1);
          }}
          className="max-w-[200px] rounded-md border border-slate-300 bg-white px-2.5 py-2"
        >
          <option value="">All clients</option>
          {clients?.items.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by lead source"
          value={leadSource}
          onChange={(e) => setLeadSource(e.target.value as LeadSource | "")}
          className="rounded-md border border-slate-300 bg-white px-2.5 py-2"
        >
          <option value="">All lead sources</option>
          {LEAD_SOURCES.map((l) => (
            <option key={l.value} value={l.value}>
              {l.label}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by assignee"
          value={assignedTo}
          onChange={(e) => setAssignedTo(e.target.value)}
          className="rounded-md border border-slate-300 bg-white px-2.5 py-2"
        >
          <option value="">Anyone</option>
          <option value="unassigned">Unassigned</option>
          {users.filter((u) => u.active).map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1 text-xs text-slate-600">
          From
          <input type="date" aria-label="From date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-md border border-slate-300 px-2 py-1.5" />
        </label>
        <label className="flex items-center gap-1 text-xs text-slate-600">
          To
          <input type="date" aria-label="To date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-md border border-slate-300 px-2 py-1.5" />
        </label>
        <label className="flex cursor-pointer items-center gap-2 rounded-md border border-slate-300 bg-white px-2.5 py-2 text-xs font-medium text-slate-700">
          <input
            type="checkbox"
            className="accent-red-700"
            checked={needsFollowUp}
            onChange={(e) => {
              setNeedsFollowUp(e.target.checked);
              setPage(1);
            }}
          />
          Needs follow-up
        </label>
        <select
          aria-label="Sort by"
          value={sort}
          onChange={(e) => setSort(e.target.value as typeof sort)}
          className="rounded-md border border-slate-300 bg-white px-2.5 py-2"
        >
          <option value="updated">Last updated</option>
          <option value="date">Enquiry date</option>
          <option value="number">Number</option>
          <option value="value">Quote value</option>
        </select>
        <button
          type="button"
          aria-label={dir === "asc" ? "Ascending" : "Descending"}
          onClick={() => setDir(dir === "asc" ? "desc" : "asc")}
          className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5"
        >
          {dir === "asc" ? "↑" : "↓"}
        </button>
        {anyFilter ? (
          <button type="button" className="text-xs font-medium text-red-700 hover:underline" onClick={reset}>
            Clear filters
          </button>
        ) : null}
        <span className="ml-auto text-xs text-slate-500">{data ? `${data.total} enquir${data.total === 1 ? "y" : "ies"}` : ""}</span>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {error ? (
          <EmptyState title="Could not load enquiries">
            <Button onClick={() => void refetch()}>Retry</Button>
          </EmptyState>
        ) : isPending ? (
          <LoadingRows />
        ) : data.items.length === 0 ? (
          <EmptyState title={anyFilter ? "No enquiries match these filters." : "No enquiries yet."}>
            {anyFilter ? (
              <button type="button" className="font-medium text-red-700 hover:underline" onClick={reset}>
                Clear filters
              </button>
            ) : null}
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Number</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Client / contact</th>
                  <th className="px-4 py-3">Project</th>
                  <th className="px-4 py-3">Location</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Latest quote</th>
                  <th className="px-4 py-3">Assigned to</th>
                  <th className="px-4 py-3 text-right">Last update</th>
                  <th className="w-12" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.items.map((e) => (
                  <tr
                    key={e.id}
                    data-testid="enquiry-row"
                    onClick={() => router.push(`/enquiries/${e.id}`)}
                    className={`cursor-pointer hover:bg-red-50/40 ${e.needsFollowUp ? "bg-amber-50/40" : ""}`}
                  >
                    <td className="whitespace-nowrap px-4 py-3 font-semibold text-slate-900">{e.number}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-700">{formatDate(e.enquiryDate)}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{e.clientName}</div>
                      <div className="text-xs text-slate-500">{e.contactName}</div>
                    </td>
                    <td className="max-w-[220px] px-4 py-3 text-slate-700">
                      <div className="line-clamp-2">{e.projectName}</div>
                    </td>
                    <td className="max-w-[160px] px-4 py-3 text-slate-700">
                      <div className="line-clamp-2">{e.siteLocation}</div>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={e.status} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-slate-900">
                      {e.latestValue !== null ? formatRupee(e.latestValue) : <span className="text-slate-400">–</span>}
                      {e.quotationCount > 1 ? <div className="text-[11px] text-slate-500">R{e.quotationCount - 1}</div> : null}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{userName(e.assignedTo) || <span className="text-slate-400">–</span>}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right" title={e.followUpReason || undefined}>
                      <span className={e.needsFollowUp ? "font-semibold text-red-700" : "text-slate-500"}>
                        {e.daysSinceUpdate === 0 ? "Today" : `${e.daysSinceUpdate}d`}
                      </span>
                      {e.needsFollowUp ? <div className="text-[10px] font-medium uppercase text-red-700">Follow up</div> : null}
                    </td>
                    <td className="px-2 py-3">
                      <OptionsMenu label={`Options for ${e.number}`} items={menu(e)} />
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

      {statusFor ? <StatusDialog enquiryId={statusFor} open onClose={() => setStatusFor(null)} /> : null}
      {quoteFor ? <CreateQuotationMenu enquiryId={quoteFor} open onClose={() => setQuoteFor(null)} /> : null}
    </PageContainer>
  );
}
