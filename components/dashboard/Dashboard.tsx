"use client";

import { ArrowDownWideNarrow, ArrowUpNarrowWide, Layers, Plus, Search } from "lucide-react";
import { Icon } from "@/components/ui/icons";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/components/Providers";
import { Button } from "@/components/ui/fields";
import { LinkToEnquiryDialog } from "@/components/crm/LinkEnquiryCard";
import { Modal, OptionsMenu } from "@/components/ui/overlays";
import { quotationRepo, type ListParams, type QuotationSummary, type SortKey } from "@/lib/data";
import {
  quotationKeys,
  useDeleteQuotation,
  useDuplicateQuotation,
  useNewRevision,
  useQuotationList,
  useResetDemoData,
} from "@/lib/data/hooks";
import { PRESETS } from "@/lib/defaults";
import { useProjects } from "@/lib/projects/hooks";
import { formatRupee } from "@/lib/money";
import { defaultFileName, formatLongDate } from "@/lib/template";
import { cloudEnabled } from "@/lib/supabase/config";

const PAGE_SIZE = 20;

function relativeTime(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  const units: [number, string][] = [
    [60, "minute"],
    [3600, "hour"],
    [86400, "day"],
    [2592000, "month"],
    [31536000, "year"],
  ];
  let [size, name] = units[0];
  for (const u of units) if (diff >= u[0]) [size, name] = u;
  const n = Math.floor(diff / size);
  return `${n} ${name}${n === 1 ? "" : "s"} ago`;
}

function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function StatusBadge({ status }: { status: QuotationSummary["status"] }) {
  return (
    <span
      className={`inline-flex rounded-lg px-2 py-0.5 text-[11px] font-semibold ${
        status === "final" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
      }`}
    >
      {status === "final" ? "Final" : "Draft"}
    </span>
  );
}

export function Dashboard() {
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<ListParams["status"]>("all");
  const [mode, setMode] = useState<ListParams["mode"]>("all");
  const [linked, setLinked] = useState<NonNullable<ListParams["linked"]>>("all");
  const [linkFor, setLinkFor] = useState<QuotationSummary | null>(null);
  const [sort, setSort] = useState<SortKey>("updated");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [showNew, setShowNew] = useState(false);
  const [toDelete, setToDelete] = useState<QuotationSummary | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const debouncedSearch = useDebounced(search);

  const params: ListParams = { search: debouncedSearch, status, mode, linked, sort, dir, page, pageSize: PAGE_SIZE };
  const { data, isPending, isFetching, error, refetch } = useQuotationList(params);
  const del = useDeleteQuotation();
  const { data: allProjects } = useProjects({ statuses: [] });
  const projectByQuote = new Map((allProjects ?? []).filter((p) => p.quotationId).map((p) => [p.quotationId!, p]));
  const dup = useDuplicateQuotation();
  const rev = useNewRevision();
  const reset = useResetDemoData();

  const filtersActive = !!debouncedSearch || status !== "all" || mode !== "all" || linked !== "all";
  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  const label = (s: QuotationSummary) => `Offer ${s.offerNo || "–"} Rev ${s.revision || "–"}`;

  const run = async (id: string, fn: () => Promise<void>) => {
    setBusyId(id);
    try {
      await fn();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setBusyId(null);
    }
  };

  const download = (s: QuotationSummary) =>
    run(s.id, async () => {
      const record = await qc.fetchQuery({ queryKey: quotationKeys.detail(s.id), queryFn: () => quotationRepo.get(s.id) });
      const { downloadQuotation } = await import("@/components/pdf/PdfPreview");
      await downloadQuotation(record.data, record.data.fileName || defaultFileName(record.data));
      toast(`Downloaded ${label(s)}`);
    });

  const menuFor = (s: QuotationSummary) => [
    { label: "Edit", onSelect: () => router.push(`/quotations/${s.id}`) },
    s.enquiryId
      ? { label: `Open ${s.enquiryNumber}`, onSelect: () => router.push(`/enquiries/${s.enquiryId}`) }
      : { label: "Link to enquiry…", onSelect: () => setLinkFor(s) },
    {
      label: "Duplicate",
      onSelect: () =>
        run(s.id, async () => {
          const r = await dup.mutateAsync(s.id);
          toast(`Duplicated as offer ${r.data.meta.offerNo}`);
        }),
    },
    {
      label: "New revision",
      onSelect: () =>
        run(s.id, async () => {
          const { record: r, linkError } = await rev.mutateAsync(s.id);
          const linked = r.enquiryNumber ? ` (R${r.enquiryRevision} of ${r.enquiryNumber})` : "";
          toast(`Revision ${r.data.meta.revision} of offer ${r.data.meta.offerNo} created${linked}`);
          if (linkError) toast(`Not linked to the enquiry: ${linkError}`, "error");
        }),
    },
    { label: "Download PDF", onSelect: () => void download(s) },
    { label: "Delete", danger: true, onSelect: () => setToDelete(s) },
  ];

  const resetFilters = () => {
    setSearch("");
    setStatus("all");
    setMode("all");
    setLinked("all");
    setPage(1);
  };

  return (
    <div className="bg-slate-50">
      <div className="sticky top-0 z-20 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3 sm:px-6 lg:px-8">
          <h1 className="order-1 text-[22px] font-medium leading-tight text-slate-900">Quotations</h1>
          <div className="relative order-3 w-full sm:order-2 sm:w-auto sm:min-w-[240px] sm:flex-1">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400">
              <Icon icon={Search} />
            </span>
            <input
              type="search"
              aria-label="Search quotations"
              placeholder="Search quotations"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="h-10 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm outline-none transition-[border-color,box-shadow] placeholder:text-slate-400 focus:border-red-700 focus:ring-3 focus:ring-red-700/10"
            />
          </div>
          <div className="order-2 ml-auto sm:order-3">
            <Button variant="primary" onClick={() => setShowNew(true)}>
              <Icon icon={Plus} />
              New quotation
            </Button>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="filter-bar mb-4 flex flex-wrap items-center gap-2 text-sm">
          <FilterSelect
            label="Filter by status"
            value={status ?? "all"}
            onChange={(v) => {
              setStatus(v as ListParams["status"]);
              setPage(1);
            }}
            options={[
              ["all", "All statuses"],
              ["draft", "Draft"],
              ["final", "Final"],
            ]}
          />
          <FilterSelect
            label="Filter by pricing type"
            value={mode ?? "all"}
            onChange={(v) => {
              setMode(v as ListParams["mode"]);
              setPage(1);
            }}
            options={[
              ["all", "All types"],
              ["boq", "BOQ"],
              ["area", "Area-based"],
            ]}
          />
          <FilterSelect
            label="Filter by enquiry link"
            value={linked}
            onChange={(v) => {
              setLinked(v as typeof linked);
              setPage(1);
            }}
            options={[
              ["all", "Linked & unlinked"],
              ["linked", "Linked to an enquiry"],
              ["unlinked", "Unlinked"],
            ]}
          />
          <div className="flex items-center gap-1" data-span>
            <FilterSelect
              label="Sort by"
              value={sort}
              onChange={(v) => setSort(v as SortKey)}
              options={[
                ["updated", "Last updated"],
                ["date", "Quotation date"],
                ["offerNo", "Offer no."],
                ["amount", "Amount"],
              ]}
            />
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
          {filtersActive ? (
            <button type="button" className="text-xs font-medium text-red-700 hover:underline" onClick={resetFilters}>
              Clear filters
            </button>
          ) : null}
          <span className="ml-auto text-xs tabular-nums text-slate-500" data-span>
            {isFetching && !isPending ? "Refreshing… " : ""}
            {data ? `${data.total} quotation${data.total === 1 ? "" : "s"}` : ""}
          </span>
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          {error ? (
            <div className="p-10 text-center">
              <p className="text-sm text-red-700">Could not load quotations: {error.message}</p>
              <Button onClick={() => void refetch()}>Retry</Button>
            </div>
          ) : isPending ? (
            <div className="divide-y divide-slate-100">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex animate-pulse gap-4 px-5 py-4">
                  <div className="h-4 w-16 rounded bg-slate-200" />
                  <div className="h-4 flex-1 rounded bg-slate-100" />
                  <div className="h-4 w-24 rounded bg-slate-200" />
                </div>
              ))}
            </div>
          ) : data.items.length === 0 ? (
            <div className="p-12 text-center">
              {filtersActive ? (
                <>
                  <p className="font-medium text-slate-900">No quotations match your search.</p>
                  <button type="button" className="mt-2 text-sm font-medium text-red-700 hover:underline" onClick={resetFilters}>
                    Clear filters
                  </button>
                </>
              ) : (
                <>
                  <p className="font-medium text-slate-900">No quotations yet.</p>
                  <p className="mt-1 text-sm text-slate-500">Create your first quotation to get started.</p>
                  <div className="mt-4">
                    <Button variant="primary" onClick={() => setShowNew(true)}>
                      <Icon icon={Plus} size={14} className="inline-block align-[-2px]" /> New quotation
                    </Button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <>
              <table className="hidden w-full text-sm lg:table">
                <thead className="bg-slate-50 text-left text-xs font-medium text-slate-500">
                  <tr>
                    <th className="whitespace-nowrap px-4 py-3 font-medium">Offer / Rev</th>
                    <th className="min-w-44 px-4 py-3 font-medium">Client</th>
                    <th className="min-w-48 px-4 py-3 font-medium">Subject</th>
                    <th className="px-4 py-3 font-medium">Enquiry</th>
                    <th className="hidden px-4 py-3 font-medium 2xl:table-cell">Site</th>
                    <th className="px-4 py-3 font-medium">Date</th>
                    <th className="px-4 py-3 text-right font-medium">Amount</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="hidden px-4 py-3 font-medium xl:table-cell">Updated</th>
                    <th className="w-12 px-2 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.items.map((s) => (
                    <tr
                      key={s.id}
                      data-testid="quotation-row"
                      onClick={() => router.push(`/quotations/${s.id}`)}
                      className={`cursor-pointer transition-colors hover:bg-slate-50 ${busyId === s.id ? "opacity-50" : ""}`}
                    >
                      <td className="ref-code whitespace-nowrap px-4 py-3 font-medium text-slate-900">
                        {s.offerNo || "–"} <span className="font-normal text-slate-400">/ {s.revision || "–"}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">{s.client || <i className="text-slate-400">No client</i>}</div>
                        {s.attention ? <div className="text-xs text-slate-500">{s.attention}</div> : null}
                      </td>
                      <td className="max-w-xs px-4 py-3">
                        <div className="line-clamp-2 text-slate-700">{s.subject}</div>
                        <div className="mt-0.5 text-xs text-slate-500">{s.pricingMode === "boq" ? "BOQ" : "Area-based"}</div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        {s.enquiryId ? (
                          <>
                            <div className="ref-code text-slate-800">{s.enquiryNumber}</div>
                            <div className="mt-0.5 text-xs text-slate-500">
                              R{s.enquiryRevision}
                              {projectByQuote.get(s.id) ? (
                                <span title={`Project ${projectByQuote.get(s.id)!.code} is based on this quotation`} className="ref-code ml-1 inline-flex items-center gap-1 rounded-md bg-slate-100 px-1.5 text-slate-700">
                                  <Icon icon={Layers} size={12} />{projectByQuote.get(s.id)!.code}
                                </span>
                              ) : null}
                            </div>
                          </>
                        ) : (
                          <span className="text-xs text-slate-400">
                            Unlinked
                          </span>
                        )}
                      </td>
                      <td className="hidden px-4 py-3 text-slate-700 2xl:table-cell">{s.siteLocation || "–"}</td>
                      <td className="whitespace-nowrap px-4 py-3 tabular-nums text-slate-700">{formatLongDate(s.date)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-medium tabular-nums text-slate-900">
                        {formatRupee(s.grandTotal)}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={s.status} />
                      </td>
                      <td className="hidden whitespace-nowrap px-4 py-3 text-xs text-slate-500 xl:table-cell">{relativeTime(s.updatedAt)}</td>
                      <td className="px-2 py-3">
                        <OptionsMenu label={`Options for ${label(s)}`} items={menuFor(s)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <ul className="divide-y divide-slate-100 lg:hidden">
                {data.items.map((s) => (
                  <li key={s.id} className="flex cursor-pointer items-start gap-3 px-4 py-3 transition-colors active:bg-slate-50" onClick={() => router.push(`/quotations/${s.id}`)}>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="ref-code font-medium text-slate-900">
                          {s.offerNo} <span className="text-slate-400">/ {s.revision}</span>
                        </span>
                        <StatusBadge status={s.status} />
                      </div>
                      <div className="truncate text-sm text-slate-800">{s.client}</div>
                      <div className="truncate text-xs text-slate-500">{s.subject}</div>
                      <div className="mt-1 text-xs text-slate-500">
                        {formatLongDate(s.date)} · {formatRupee(s.grandTotal)}
                      </div>
                    </div>
                    <OptionsMenu label={`Options for ${label(s)}`} items={menuFor(s)} />
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

        <p className="mt-8 text-center text-xs text-slate-400">
          {cloudEnabled ? "Storage: Supabase cloud database." : `Storage: ${quotationRepo.label} – data stays in this browser until the database is connected.`}
          {quotationRepo.resetDemoData ? (
            <>
              {" "}
              <button
                type="button"
                className="font-medium text-slate-500 underline hover:text-slate-700"
                onClick={() => {
                  const question = cloudEnabled
                    ? "Replace ALL data in the cloud database (every module, for every user) with the demo data? This can’t be undone."
                    : "Replace all quotations in this session with the demo data?";
                  if (!confirm(question)) return;
                  reset.mutate(undefined, {
                    onSuccess: () => toast("Demo data restored"),
                    onError: (e) => toast(e instanceof Error ? e.message : String(e), "error"),
                  });
                }}
              >
                Reset demo data
              </button>
            </>
          ) : null}
        </p>
      </main>

      {linkFor ? <LinkToEnquiryDialog quotation={linkFor} onClose={() => setLinkFor(null)} /> : null}

      <Modal open={showNew} onClose={() => setShowNew(false)} title="New quotation – choose a starting point" wide>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => router.push(`/quotations/new?from=${p.key}`)}
              className="rounded-xl border border-slate-200 p-4 text-left transition-colors hover:border-red-400 hover:bg-slate-50"
            >
              <div className="text-sm font-semibold text-slate-900">{p.label}</div>
              <div className="mt-1 text-xs text-slate-500">{p.description}</div>
            </button>
          ))}
        </div>
        <p className="mt-3 text-xs text-slate-500">The new quotation gets the next offer number automatically; you can change it.</p>
      </Modal>

      <Modal
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        title="Delete quotation?"
        footer={
          <>
            <Button onClick={() => setToDelete(null)}>Cancel</Button>
            <Button
              variant="primary"
              disabled={del.isPending}
              onClick={() => {
                const s = toDelete!;
                del.mutate(s.id, {
                  onSuccess: () => {
                    toast(`${label(s)} deleted`);
                    setToDelete(null);
                  },
                  onError: (e) => toast(e.message, "error"),
                });
              }}
            >
              {del.isPending ? "Deleting…" : "Delete"}
            </Button>
          </>
        }
      >
        {toDelete ? (
          <p className="text-sm text-slate-700">
            <b>{label(toDelete)}</b> for <b>{toDelete.client || "no client"}</b> will be permanently deleted. This cannot
            be undone.
          </p>
        ) : null}
      </Modal>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-10 min-w-0 rounded-lg border border-slate-300 bg-white px-2.5 text-sm text-slate-700"
    >
      {options.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  );
}
