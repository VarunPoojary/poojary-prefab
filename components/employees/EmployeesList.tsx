"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { EmptyState, LoadingRows, PageContainer, PageHeader, useDebounced } from "@/components/crm/ui";
import { useToast } from "@/components/Providers";
import { Button } from "@/components/ui/fields";
import { OptionsMenu } from "@/components/ui/overlays";
import { ROLE_LABELS } from "@/lib/auth/types";
import { formatPhone } from "@/lib/crm/rules";
import { EMPLOYMENT_TYPES } from "@/lib/employees/config";
import { useEmployees, useLookups, useReactivate } from "@/lib/employees/hooks";
import type { EmployeeListParams, EmployeeSummary, EmploymentType } from "@/lib/employees/types";
import { formatDate } from "@/lib/format";
import { DeactivateDialog } from "./LifecycleDialogs";
import { LoginBadge, StatusPill } from "./bits";

type SortKey = NonNullable<EmployeeListParams["sort"]>;

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "code", label: "Employee ID" },
  { key: "name", label: "Name" },
  { key: "designation", label: "Designation" },
  { key: "department", label: "Department" },
  { key: "mobile", label: "Phone" },
  { key: "joining", label: "Date of joining" },
  { key: "status", label: "Status" },
  { key: "login", label: "Login" },
];

const typeLabel = (t: EmploymentType) => EMPLOYMENT_TYPES.find((x) => x.value === t)?.label ?? t;

/** CSV of the visible rows; salary is never exported. */
function downloadCsv(rows: EmployeeSummary[]) {
  const header = ["Employee ID", "Name", "Designation", "Department", "Employment type", "Mobile", "Date of joining", "Status", "Login"];
  const cell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const lines = rows.map((r) =>
    [
      r.code,
      r.fullName,
      r.designation,
      r.department,
      typeLabel(r.employmentType),
      r.mobile,
      r.dateOfJoining,
      r.status === "active" ? "Active" : "Inactive",
      r.login ? `${ROLE_LABELS[r.login.role]}${r.login.enabled ? "" : " (disabled)"}` : "None",
    ]
      .map(cell)
      .join(","),
  );
  // BOM so Excel reads the file as UTF-8.
  const blob = new Blob(["\ufeff" + [header.join(","), ...lines].join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `employees-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function EmployeesList() {
  const router = useRouter();
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("");
  const [designation, setDesignation] = useState("");
  const [employmentType, setEmploymentType] = useState<EmploymentType | "">("");
  const [status, setStatus] = useState<NonNullable<EmployeeListParams["status"]>>("active");
  const [hasLogin, setHasLogin] = useState<NonNullable<EmployeeListParams["hasLogin"]>>("");
  const [sort, setSort] = useState<SortKey>("name");
  const [dir, setDir] = useState<"asc" | "desc">("asc");
  const [deactivating, setDeactivating] = useState<EmployeeSummary | null>(null);
  const q = useDebounced(search, 200);
  const { data, isPending, error, refetch } = useEmployees({ search: q, department, designation, employmentType, status, hasLogin, sort, dir });
  const { data: lookups } = useLookups();
  const reactivate = useReactivate();
  const filtered = !!(q || department || designation || employmentType || status !== "active" || hasLogin);

  const sortBy = (k: SortKey) => {
    if (k === sort) setDir(dir === "asc" ? "desc" : "asc");
    else {
      setSort(k);
      setDir("asc");
    }
  };

  const menu = (e: EmployeeSummary) => [
    { label: "View", onSelect: () => router.push(`/employees/${e.id}/details`) },
    { label: "Edit", onSelect: () => router.push(`/employees/${e.id}/edit`) },
    { label: "Manage login", onSelect: () => router.push(`/employees/${e.id}/details#login`) },
    e.status === "active"
      ? { label: "Deactivate", danger: true, onSelect: () => setDeactivating(e) }
      : {
          label: "Reactivate",
          onSelect: () =>
            reactivate.mutate(e.id, {
              onSuccess: () => toast(`${e.fullName} reactivated. Their login stays disabled until you enable it.`),
              onError: (err) => toast(err.message, "error"),
            }),
        },
  ];

  const select = (lbl: string, value: string, onChange: (v: string) => void, options: [string, string][]) => (
    <select aria-label={lbl} value={value} onChange={(e) => onChange(e.target.value)} className="rounded-md border border-slate-300 bg-white px-2.5 py-2 text-sm">
      {options.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  );

  return (
    <PageContainer wide>
      <PageHeader
        title="Employees"
        subtitle="Employee records and application logins. Visible to admins only."
        actions={
          <>
            <Button disabled={!data?.length} onClick={() => data && downloadCsv(data)}>
              Export CSV
            </Button>
            <Button variant="primary" onClick={() => router.push("/employees/new")}>
              + Add employee
            </Button>
          </>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          type="search"
          aria-label="Search employees"
          placeholder="Search by employee ID, name, mobile or designation…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="min-w-[260px] flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-red-600 focus:ring-2 focus:ring-red-100"
        />
        {select("Filter by department", department, setDepartment, [["", "All departments"], ...(lookups?.departments ?? []).map((d): [string, string] => [d, d])])}
        {select("Filter by designation", designation, setDesignation, [["", "All designations"], ...(lookups?.designations ?? []).map((d): [string, string] => [d, d])])}
        {select("Filter by employment type", employmentType, (v) => setEmploymentType(v as EmploymentType | ""), [
          ["", "All types"],
          ...EMPLOYMENT_TYPES.map((t): [string, string] => [t.value, t.label]),
        ])}
        {select("Filter by status", status, (v) => setStatus(v as typeof status), [
          ["active", "Active"],
          ["inactive", "Inactive"],
          ["all", "All statuses"],
        ])}
        {select("Filter by login", hasLogin, (v) => setHasLogin(v as typeof hasLogin), [
          ["", "With or without login"],
          ["yes", "Has login"],
          ["no", "No login"],
        ])}
        {filtered ? (
          <button
            type="button"
            className="text-xs font-medium text-red-700 hover:underline"
            onClick={() => {
              setSearch("");
              setDepartment("");
              setDesignation("");
              setEmploymentType("");
              setStatus("active");
              setHasLogin("");
            }}
          >
            Clear filters
          </button>
        ) : null}
        <span className="ml-auto text-xs text-slate-500">{data ? `${data.length} employee${data.length === 1 ? "" : "s"}` : ""}</span>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {error ? (
          <EmptyState title={error.name === "ForbiddenError" ? "Only admins can open the Employee module." : "Could not load employees"}>
            {error.name !== "ForbiddenError" ? <Button onClick={() => void refetch()}>Retry</Button> : null}
          </EmptyState>
        ) : isPending ? (
          <LoadingRows />
        ) : !data.length ? (
          <EmptyState title={filtered ? "No employees match these filters." : "No employees yet."} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  {COLUMNS.map((c) => (
                    <th key={c.key} className="px-4 py-2" aria-sort={sort === c.key ? (dir === "asc" ? "ascending" : "descending") : undefined}>
                      <button type="button" className="flex items-center gap-1 uppercase hover:text-slate-800" onClick={() => sortBy(c.key)}>
                        {c.label}
                        <span className="text-[10px]">{sort === c.key ? (dir === "asc" ? "▲" : "▼") : ""}</span>
                      </button>
                    </th>
                  ))}
                  <th className="w-12" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.map((e) => (
                  <tr
                    key={e.id}
                    data-testid="employee-row"
                    onClick={() => router.push(`/employees/${e.id}/details`)}
                    className={`cursor-pointer hover:bg-red-50/40 ${e.status === "inactive" ? "opacity-60" : ""}`}
                  >
                    <td className="whitespace-nowrap px-4 py-3 font-semibold text-slate-900">{e.code}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{e.fullName}</div>
                      <div className="text-xs text-slate-500">{typeLabel(e.employmentType)}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{e.designation}</td>
                    <td className="px-4 py-3 text-slate-700">{e.department}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <a href={`tel:+91${e.mobile}`} onClick={(ev) => ev.stopPropagation()} className="text-slate-700 hover:underline">
                        {formatPhone(e.mobile)}
                      </a>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-700">{formatDate(e.dateOfJoining)}</td>
                    <td className="px-4 py-3">
                      <StatusPill status={e.status} />
                    </td>
                    <td className="px-4 py-3">
                      <LoginBadge login={e.login} />
                    </td>
                    <td className="px-2 py-3" onClick={(ev) => ev.stopPropagation()}>
                      <OptionsMenu label={`Actions for ${e.fullName}`} items={menu(e)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {deactivating ? (
        <DeactivateDialog
          employee={{ id: deactivating.id, fullName: deactivating.fullName, dateOfJoining: deactivating.dateOfJoining }}
          onClose={() => setDeactivating(null)}
        />
      ) : null}
    </PageContainer>
  );
}
