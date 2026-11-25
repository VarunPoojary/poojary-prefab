"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { EmptyState, ErrorList, InfoRow, PageContainer, PageHeader, useUserName } from "@/components/crm/ui";
import { useToast } from "@/components/Providers";
import { Button, Card, NumberField, Select, TextField } from "@/components/ui/fields";
import { Modal, OptionsMenu } from "@/components/ui/overlays";
import { labelOf } from "@/lib/crm/config";
import { formatPhone } from "@/lib/crm/rules";
import { BLOOD_GROUPS, EMPLOYMENT_TYPES, GENDERS, LEAVING_REASONS, PAY_TYPES } from "@/lib/employees/config";
import { useAddSalary, useEmployee, useReactivate } from "@/lib/employees/hooks";
import { ageOn, currentSalary, todayIso, validateSalary } from "@/lib/employees/rules";
import { EMPLOYEE_TABS, tabHref, type EmployeeTab } from "@/lib/employees/tabs";
import type { Employee, EmployeeEvent, NewSalary } from "@/lib/employees/types";
import { formatDate, formatDateTime } from "@/lib/format";
import { money, StatusPill } from "./bits";
import { DocumentsEditor } from "./Documents";
import { DeactivateDialog, DeleteEmployeeDialog } from "./LifecycleDialogs";
import { LoginCard } from "./LoginCard";
import { EmployeeAttendance } from "@/components/attendance/EmployeeAttendance";
import { Lock } from "lucide-react";
import { Icon } from "@/components/ui/icons";

const EVENT_LABELS: Record<EmployeeEvent["type"], string> = {
  created: "Employee added",
  edited: "Details edited",
  salary: "Salary changed",
  document_added: "Document uploaded",
  document_removed: "Document removed",
  deactivated: "Deactivated",
  reactivated: "Reactivated",
  login_created: "Login created",
  login_reset: "Password reset",
  login_role: "Role changed",
  login_enabled: "Login enabled",
  login_disabled: "Login disabled",
};

/** Header + tab bar shared by every employee tab route. */
export function EmployeeFrame({ active, children }: { active: EmployeeTab["key"]; children: (e: Employee) => React.ReactNode }) {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const { data: e, isPending, error } = useEmployee(id);
  const reactivate = useReactivate();
  const [dialog, setDialog] = useState<"deactivate" | "reactivate" | "delete" | null>(null);

  if (error)
    return (
      <PageContainer>
        <EmptyState title={error.name === "ForbiddenError" ? "Only admins can open the Employee module." : "Employee not found."}>
          <Link href="/employees" className="text-sm font-medium text-red-700 hover:underline">
            ← Back to employees
          </Link>
        </EmptyState>
      </PageContainer>
    );
  if (isPending) return <div className="p-6 text-sm text-slate-500">Loading…</div>;

  return (
    <PageContainer>
      <PageHeader
        back={{ href: "/employees", label: "Employees" }}
        title={
          <span className="flex flex-wrap items-center gap-2">
            {e.fullName} <StatusPill status={e.status} />
          </span>
        }
        subtitle={`${e.code} · ${e.designation} · ${e.department}`}
        actions={
          <>
            <Button onClick={() => router.push(`/employees/${e.id}/edit`)}>Edit</Button>
            {e.status === "active" ? (
              <Button variant="danger" onClick={() => setDialog("deactivate")}>
                Deactivate
              </Button>
            ) : (
              <Button onClick={() => setDialog("reactivate")}>Reactivate</Button>
            )}
            <OptionsMenu label="More actions" items={[{ label: "Delete permanently…", danger: true, onSelect: () => setDialog("delete") }]} />
          </>
        }
      />

      <nav className="mb-5 grid grid-cols-3 border-b border-slate-200 sm:flex sm:gap-1" aria-label="Employee sections">
        {EMPLOYEE_TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            aria-current={t.key === active ? "page" : undefined}
            onClick={() => (t.locked ? toast(`${t.label} is coming soon.`) : router.push(tabHref(e.id, t.key)))}
            className={`-mb-px flex h-11 items-center justify-center gap-1 border-b-2 px-3 text-sm font-medium transition-colors ${
              t.key === active ? "border-red-700 text-red-800" : "border-transparent text-slate-500 hover:text-slate-800"
            } ${t.locked ? "cursor-not-allowed opacity-60" : ""}`}
          >
            {t.label}
            {t.locked ? <span aria-label="coming soon"><Icon icon={Lock} size={14} className="mr-1 inline-block align-[-2px]" /></span> : null}
          </button>
        ))}
      </nav>

      {children(e)}

      {dialog === "deactivate" ? <DeactivateDialog employee={e} onClose={() => setDialog(null)} /> : null}
      {dialog === "delete" ? <DeleteEmployeeDialog employee={e} onClose={() => setDialog(null)} /> : null}
      {dialog === "reactivate" ? (
        <Modal
          open
          onClose={() => setDialog(null)}
          title={`Reactivate ${e.fullName}?`}
          footer={
            <>
              <Button onClick={() => setDialog(null)}>Cancel</Button>
              <Button
                variant="primary"
                disabled={reactivate.isPending}
                onClick={() =>
                  reactivate.mutate(e.id, {
                    onSuccess: () => {
                      toast(`${e.fullName} reactivated.`);
                      setDialog(null);
                    },
                    onError: (err) => toast(err.message, "error"),
                  })
                }
              >
                Reactivate
              </Button>
            </>
          }
        >
          <p className="text-sm text-slate-700">
            The leaving details are cleared. If they have a login it stays <strong>disabled</strong> until you enable it.
          </p>
        </Modal>
      ) : null}
    </PageContainer>
  );
}

function ChangeSalaryDialog({ employee, onClose }: { employee: Employee; onClose: () => void }) {
  const toast = useToast();
  const add = useAddSalary();
  const current = currentSalary(employee.salary, todayIso());
  const [s, setS] = useState<NewSalary>({ payType: current?.payType ?? "", amount: null, effectiveFrom: todayIso() });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [issues, setIssues] = useState<string[]>([]);
  const submit = () => {
    const errs = validateSalary(s);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    add.mutate(
      { id: employee.id, salary: s },
      {
        onSuccess: () => {
          toast("Salary updated.");
          onClose();
        },
        onError: (e) => setIssues([e.message]),
      },
    );
  };
  return (
    <Modal
      open
      onClose={onClose}
      title="Change salary"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={add.isPending} onClick={submit}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {current ? <p className="text-sm text-slate-600">Current: {money(current.amount, current.payType)}</p> : null}
        <Select
          label="Pay type"
          value={s.payType}
          onChange={(v) => setS({ ...s, payType: v })}
          options={[{ value: "", label: "Choose…" }, ...PAY_TYPES.map((p) => ({ value: p.value, label: p.label }))]}
        />
        <NumberField label="New amount (₹)" required value={s.amount} onChange={(v) => setS({ ...s, amount: v })} />
        <TextField
          label="Effective from"
          required
          type="date"
          value={s.effectiveFrom}
          onChange={(v) => setS({ ...s, effectiveFrom: v })}
          hint="Can be a future date (e.g. next month's increment)."
        />
        <ErrorList issues={[...Object.values(errors), ...issues]} />
      </div>
    </Modal>
  );
}

function SalaryCard({ employee }: { employee: Employee }) {
  const userName = useUserName();
  const [changing, setChanging] = useState(false);
  const today = todayIso();
  const current = currentSalary(employee.salary, today);
  const upcoming = employee.salary.filter((x) => x.effectiveFrom > today).sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  const history = [...employee.salary].sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom) || b.createdAt.localeCompare(a.createdAt));
  return (
    <Card
      title="Salary"
      description="Visible to admins only."
      actions={
        <Button size="sm" disabled={employee.status !== "active"} onClick={() => setChanging(true)}>
          Change salary
        </Button>
      }
    >
      <p className="text-sm text-slate-700">
        Current: <strong data-testid="current-salary">{current ? money(current.amount, current.payType) : "not set"}</strong>
        {current ? <span className="text-slate-500"> since {formatDate(current.effectiveFrom)}</span> : null}
      </p>
      {upcoming.map((u) => (
        <p key={u.id} className="mt-1 text-sm text-amber-800">
          Upcoming: {money(u.amount, u.payType)} from {formatDate(u.effectiveFrom)}
        </p>
      ))}
      {history.length > 1 ? (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-medium text-slate-600">Salary history ({history.length})</summary>
          <table className="mt-2 w-full text-xs">
            <thead className="text-left text-slate-500">
              <tr>
                <th className="py-1">Effective from</th>
                <th>Amount</th>
                <th>Recorded</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id} className="border-t border-slate-100">
                  <td className="py-1">{formatDate(h.effectiveFrom)}</td>
                  <td>{money(h.amount, h.payType)}</td>
                  <td className="text-slate-500">
                    {formatDate(h.createdAt)} by {userName(h.createdBy)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      ) : null}
      {changing ? <ChangeSalaryDialog employee={employee} onClose={() => setChanging(false)} /> : null}
    </Card>
  );
}

function HistoryCard({ employee }: { employee: Employee }) {
  const userName = useUserName();
  const items = [...employee.history].reverse();
  return (
    <Card title="History">
      <ol className="space-y-3">
        {items.map((h) => (
          <li key={h.id} className="flex gap-3 text-sm">
            <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-slate-300" />
            <div className="min-w-0">
              <div className="text-slate-900">
                <span className="font-medium">{EVENT_LABELS[h.type]}</span>
                {h.field ? (
                  <span className="text-slate-700">
                    {" "}
                    – {h.field}: <span className="text-slate-500 line-through">{h.from || "empty"}</span> → {h.to || "empty"}
                  </span>
                ) : h.from || h.to ? (
                  <span className="text-slate-700">
                    {" "}
                    – {h.from} → {h.to}
                  </span>
                ) : null}
                {h.comment ? <span className="text-slate-700"> – {h.comment}</span> : null}
              </div>
              <div className="text-xs text-slate-500">
                {formatDateTime(h.at)} · {userName(h.userId)}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}

function Details({ e }: { e: Employee }) {
  const search = useSearchParams();
  const today = todayIso();
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card title="Basic details">
        <dl>
          <InfoRow label="Employee ID">{e.code}</InfoRow>
          <InfoRow label="Full name">{e.fullName}</InfoRow>
          <InfoRow label="Mobile">
            <a href={`tel:+91${e.mobile}`} className="hover:underline">
              {formatPhone(e.mobile)}
            </a>
          </InfoRow>
          <InfoRow label="Date of birth">{e.dob ? `${formatDate(e.dob)} (${ageOn(e.dob, today)} years)` : ""}</InfoRow>
          <InfoRow label="Gender">{e.gender ? labelOf(GENDERS, e.gender) : ""}</InfoRow>
          <InfoRow label="Blood group">{e.bloodGroup ? labelOf(BLOOD_GROUPS, e.bloodGroup) : ""}</InfoRow>
          <InfoRow label="Address">
            <span className="whitespace-pre-line">{e.address}</span>
          </InfoRow>
        </dl>
      </Card>
      <Card title="Job details">
        <dl>
          <InfoRow label="Designation">{e.designation}</InfoRow>
          <InfoRow label="Department">{e.department}</InfoRow>
          <InfoRow label="Employment type">{labelOf(EMPLOYMENT_TYPES, e.employmentType)}</InfoRow>
          <InfoRow label="Date of joining">{formatDate(e.dateOfJoining)}</InfoRow>
          {e.leaving ? (
            <>
              <InfoRow label="Date of leaving">{formatDate(e.leaving.date)}</InfoRow>
              <InfoRow label="Reason">{e.leaving.reason === "other" ? e.leaving.other : labelOf(LEAVING_REASONS, e.leaving.reason)}</InfoRow>
            </>
          ) : null}
        </dl>
      </Card>
      <SalaryCard employee={e} />
      <Card title="Emergency contact">
        <dl>
          <InfoRow label="Name">{e.emergencyContact.name}</InfoRow>
          <InfoRow label="Relation">{e.emergencyContact.relation}</InfoRow>
          <InfoRow label="Phone">
            {e.emergencyContact.phone ? (
              <a href={`tel:+91${e.emergencyContact.phone}`} className="hover:underline">
                {formatPhone(e.emergencyContact.phone)}
              </a>
            ) : (
              ""
            )}
          </InfoRow>
        </dl>
      </Card>
      <div className="lg:col-span-2">
        <LoginCard employee={e} autoCreate={search.get("createLogin") === "1"} />
      </div>
      <div className="lg:col-span-2">
        <DocumentsEditor employee={e} />
      </div>
      <div className="lg:col-span-2">
        <HistoryCard employee={e} />
      </div>
    </div>
  );
}

export function EmployeeAttendanceTab() {
  return <EmployeeFrame active="attendance">{(e) => <EmployeeAttendance employee={e} />}</EmployeeFrame>;
}

export function EmployeeDetailsTab() {
  // Scroll to "#login" when coming from the list's "Manage login".
  useEffect(() => {
    if (window.location.hash !== "#login") return;
    const t = setInterval(() => {
      const el = document.getElementById("login");
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        clearInterval(t);
      }
    }, 100);
    const stop = setTimeout(() => clearInterval(t), 3000);
    return () => {
      clearInterval(t);
      clearTimeout(stop);
    };
  }, []);
  return <EmployeeFrame active="details">{(e) => <Details e={e} />}</EmployeeFrame>;
}

/** Attendance / Payroll routes: not released yet, so explain and go back to Details. */
export function EmployeeLockedTab() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const shown = useRef(false);
  useEffect(() => {
    if (shown.current) return;
    shown.current = true;
    const tab = EMPLOYEE_TABS.find((t) => window.location.pathname.endsWith(`/${t.key}`));
    toast(`${tab?.label ?? "This section"} is coming soon.`);
    router.replace(tabHref(id, "details"));
  }, [id, router, toast]);
  return <div className="p-6 text-sm text-slate-500">Coming soon…</div>;
}
