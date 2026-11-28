"use client";

import { ArrowDownWideNarrow, ArrowUpNarrowWide, Plus, Search } from "lucide-react";
import { Icon } from "@/components/ui/icons";
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

/** Shared size of every filter control: one 40px row height. */
const control = "h-10 rounded-lg border border-slate-300 bg-white";

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
      className={`flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border px-3 text-xs font-medium transition-colors sm:h-8 ${
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
            <Icon icon={Plus} size={14} className="inline-block align-[-2px]" /> New enquiry
          </Button>
        }
      />

      {/* Phones: one row that scrolls sideways, edge to edge. Larger screens: chips wrap. */}
      <div
        className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0"
        aria-label="Filter by status"
      >
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

      {/*
        Phones: a two-column grid in a fixed order (search · client + source · assignee + follow-up ·
        from–to dates · sort). From the sm breakpoint everything flows on one wrapping row.
      */}
      <div className="mb-4 grid grid-cols-2 gap-2 text-sm sm:flex sm:flex-wrap sm:items-center">
        <div className="relative col-span-2 sm:min-w-[240px] sm:flex-1">
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400">
            <Icon icon={Search} />
          </span>
          <input
            type="search"
            aria-label="Search enquiries"
            placeholder="Search number, client or project"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className={`${control} w-full pl-9 pr-3 outline-none transition-[border-color,box-shadow] placeholder:text-slate-400 focus:border-red-700 focus:ring-3 focus:ring-red-700/10`}
          />
        </div>
        <select
          aria-label="Filter by client"
          value={clientId}
          onChange={(e) => {
            setClientId(e.target.value);
            setPage(1);
          }}
          className={`${control} min-w-0 px-2.5 sm:max-w-[200px]`}
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
          className={`${control} min-w-0 px-2.5`}
        >
          <option value="">Any source</option>
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
          className={`${control} min-w-0 px-2.5`}
        >
          <option value="">Anyone</option>
          <option value="unassigned">Unassigned</option>
          {users.filter((u) => u.active).map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
        <label className={`${control} flex cursor-pointer items-center gap-2 px-3 text-slate-700`}>
          <input
            type="checkbox"
            className="h-4 w-4 shrink-0 accent-red-700"
            checked={needsFollowUp}
            onChange={(e) => {
              setNeedsFollowUp(e.target.checked);
              setPage(1);
            }}
          />
          <span className="truncate">Needs follow-up</span>
        </label>
        <fieldset className="col-span-2 grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-2 gap-y-1 sm:flex sm:items-center">
          <legend className="sr-only">Enquiry date</legend>
          <span aria-hidden className="col-span-3 text-xs text-slate-500 sm:hidden">
            Enquiry date
          </span>
          <input type="date" aria-label="From date" value={from} onChange={(e) => setFrom(e.target.value)} className={`${control} min-w-0 px-2 sm:w-40`} />
          <span aria-hidden className="text-slate-400">
            –
          </span>
          <input type="date" aria-label="To date" value={to} onChange={(e) => setTo(e.target.value)} className={`${control} min-w-0 px-2 sm:w-40`} />
        </fieldset>
        <div className="col-span-2 flex items-center gap-2">
        <select
          aria-label="Sort by"
          value={sort}
          onChange={(e) => setSort(e.target.value as typeof sort)}
          className={`${control} min-w-0 flex-1 px-2.5 sm:flex-none`}
        >
          <option value="updated">Last updated</option>
          <option value="date">Enquiry date</option>
          <option value="number">Number</option>
          <option value="value">Quote value</option>
        </select>
        <button
          type="button"
          aria-label={dir === "asc" ? "Ascending" : "Descending"}
          title={dir === "asc" ? "Ascending" : "Descending"}
          onClick={() => setDir(dir === "asc" ? "desc" : "asc")}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
        >
          <Icon icon={dir === "asc" ? ArrowUpNarrowWide : ArrowDownWideNarrow} />
        </button>
        </div>
        <div className="col-span-2 flex items-center gap-3 sm:ml-auto">
          {anyFilter ? (
            <button type="button" className="text-xs font-medium text-red-700 hover:underline" onClick={reset}>
              Clear filters
            </button>
          ) : null}
          <span className="ml-auto text-xs tabular-nums text-slate-500">{data ? `${data.total} enquir${data.total === 1 ? "y" : "ies"}` : ""}</span>
        </div>
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
          <>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[1100px] text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-500">
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
                    className={`cursor-pointer hover:bg-slate-50 ${e.needsFollowUp ? "bg-amber-50/40" : ""}`}
                  >
                    <td className="ref-code whitespace-nowrap px-4 py-3 font-medium text-slate-900">{e.number}</td>
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
                      {e.needsFollowUp ? <div className="text-[11px] font-medium text-red-700">Follow up</div> : null}
                    </td>
                    <td className="px-2 py-3">
                      <OptionsMenu label={`Options for ${e.number}`} items={menu(e)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="divide-y divide-slate-100 md:hidden">
            {data.items.map((e) => (
              <li
                key={e.id}
                data-testid="enquiry-card"
                onClick={() => router.push(`/enquiries/${e.id}`)}
                className="flex cursor-pointer items-start gap-2 py-3 pl-4 pr-2 transition-colors active:bg-slate-50"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="ref-code font-medium text-slate-900">{e.number}</span>
                    <StatusBadge status={e.status} />
                  </div>
                  <div className="mt-1 truncate text-sm font-medium text-slate-900">{e.clientName}</div>
                  <div className="truncate text-sm text-slate-600">{e.projectName}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
                    <span>{formatDate(e.enquiryDate)}</span>
                    {e.latestValue !== null ? <span className="tabular-nums">· {formatRupee(e.latestValue)}</span> : null}
                    {e.needsFollowUp ? <span className="font-medium text-red-700">· Follow up</span> : null}
                  </div>
                </div>
                <div onClick={(ev) => ev.stopPropagation()}>
                  <OptionsMenu label={`Options for ${e.number}`} items={menu(e)} />
                </div>
              </li>
            ))}
          </ul>
          </>
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
