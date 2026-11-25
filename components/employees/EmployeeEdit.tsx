"use client";

import { Plus } from "lucide-react";
import { Icon } from "@/components/ui/icons";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { EmptyState, ErrorList, PageContainer, PageHeader, useDebounced } from "@/components/crm/ui";
import { useToast } from "@/components/Providers";
import { Button, Card, NumberField, Select, TextArea, TextField } from "@/components/ui/fields";
import { Modal } from "@/components/ui/overlays";
import { formatPhone } from "@/lib/crm/rules";
import { BLOOD_GROUPS, EMPLOYMENT_TYPES, GENDERS, PAY_TYPES } from "@/lib/employees/config";
import { employeeRepo } from "@/lib/employees";
import { useAddLookup, useCreateEmployee, useEmployee, useLookups, useUpdateEmployee } from "@/lib/employees/hooks";
import type { NewDocument } from "@/lib/employees/repository";
import { currentSalary, todayIso, validateEmployee, validateSalary } from "@/lib/employees/rules";
import type { Employee, EmployeeInput, NewSalary } from "@/lib/employees/types";
import { formatDate } from "@/lib/format";
import { money } from "./bits";
import { DocumentsEditor, PendingDocuments } from "./Documents";

type TabKey = "basic" | "job" | "salary" | "emergency" | "documents";

const TABS: { key: TabKey; label: string; fields: string[] }[] = [
  { key: "basic", label: "Basic details", fields: ["fullName", "mobile", "dob", "gender", "bloodGroup", "address"] },
  { key: "job", label: "Job details", fields: ["designation", "department", "employmentType", "dateOfJoining"] },
  { key: "salary", label: "Salary", fields: ["payType", "amount", "effectiveFrom"] },
  { key: "emergency", label: "Emergency contact", fields: ["emergencyPhone"] },
  { key: "documents", label: "Documents", fields: [] },
];

const emptyInput = (): EmployeeInput => ({
  fullName: "",
  mobile: "",
  dob: "",
  gender: "",
  bloodGroup: "",
  address: "",
  designation: "",
  department: "",
  employmentType: "",
  dateOfJoining: todayIso(),
  emergencyContact: { name: "", relation: "", phone: "" },
});

const toInput = (e: Employee): EmployeeInput => ({
  fullName: e.fullName,
  mobile: e.mobile,
  dob: e.dob,
  gender: e.gender,
  bloodGroup: e.bloodGroup,
  address: e.address,
  designation: e.designation,
  department: e.department,
  employmentType: e.employmentType,
  dateOfJoining: e.dateOfJoining,
  emergencyContact: { ...e.emergencyContact },
});

function Err({ msg }: { msg?: string }) {
  return msg ? <p className="mt-1 text-xs font-medium text-red-700">{msg}</p> : null;
}

/** Dropdown from the admin-managed list with "+ Add new". */
function LookupSelect({
  kind,
  label,
  value,
  onChange,
  error,
}: {
  kind: "designations" | "departments";
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
}) {
  const { data } = useLookups();
  const add = useAddLookup();
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState("");
  const [issue, setIssue] = useState("");
  const options = data?.[kind] ?? [];
  const singular = kind === "designations" ? "designation" : "department";
  return (
    <div>
      <div className="flex items-end gap-2">
        <Select
          className="flex-1"
          label={`${label} *`}
          value={value}
          onChange={onChange}
          options={[{ value: "", label: "Choose…" }, ...(value && !options.includes(value) ? [value] : []).concat(options).map((o) => ({ value: o, label: o }))]}
        />
        <Button size="sm" onClick={() => setAdding(true)}>
          <Icon icon={Plus} size={14} className="inline-block align-[-2px]" /> Add new
        </Button>
      </div>
      <Err msg={error} />
      <Modal
        open={adding}
        onClose={() => setAdding(false)}
        title={`Add a ${singular}`}
        footer={
          <>
            <Button onClick={() => setAdding(false)}>Cancel</Button>
            <Button
              variant="primary"
              disabled={add.isPending}
              onClick={() =>
                add.mutate(
                  { kind, value: text },
                  {
                    onSuccess: (l) => {
                      const v = l[kind].find((x) => x.toLowerCase() === text.trim().toLowerCase()) ?? text.trim();
                      onChange(v);
                      setText("");
                      setIssue("");
                      setAdding(false);
                    },
                    onError: (e) => setIssue(e.message),
                  },
                )
              }
            >
              Add
            </Button>
          </>
        }
      >
        <TextField label={`New ${singular}`} value={text} onChange={setText} />
        <Err msg={issue} />
      </Modal>
    </div>
  );
}

function EmployeeForm({ employee }: { employee?: Employee }) {
  const router = useRouter();
  const toast = useToast();
  const create = useCreateEmployee();
  const update = useUpdateEmployee();
  const [f, setF] = useState<EmployeeInput>(() => (employee ? toInput(employee) : emptyInput()));
  const [salary, setSalary] = useState<NewSalary>(() => ({ payType: "", amount: null, effectiveFrom: employee ? "" : todayIso() }));
  const [docs, setDocs] = useState<NewDocument[]>([]);
  const [tab, setTab] = useState<TabKey>("basic");
  // Messages appear after the first save attempt and then follow the fields as they are fixed.
  const [attempted, setAttempted] = useState(false);
  const [issues, setIssues] = useState<string[]>([]);
  const [created, setCreated] = useState<Employee | null>(null);
  const isNew = !employee;
  const set = (patch: Partial<EmployeeInput>) => setF((x) => ({ ...x, ...patch }));
  const setEc = (patch: Partial<EmployeeInput["emergencyContact"]>) => set({ emergencyContact: { ...f.emergencyContact, ...patch } });

  // Daily-wage workers are usually paid per day; suggest it but let the admin change it.
  const setEmploymentType = (v: EmployeeInput["employmentType"]) => {
    set({ employmentType: v });
    if (isNew && v && !salary.payType) setSalary((s) => ({ ...s, payType: v === "daily_wage" ? "daily" : "monthly" }));
  };
  // The first salary starts on the joining date unless the admin chose another date.
  const setJoining = (v: string) => {
    set({ dateOfJoining: v });
    if (isNew && (!salary.effectiveFrom || salary.effectiveFrom === f.dateOfJoining)) setSalary((s) => ({ ...s, effectiveFrom: v }));
  };

  const mobile = useDebounced(f.mobile, 300);
  const [found, setFound] = useState<{ mobile: string; match: { id: string; code: string; fullName: string } | null } | null>(null);
  useEffect(() => {
    if (!mobile.trim()) return;
    let alive = true;
    employeeRepo
      .checkMobile(mobile, employee?.id)
      .then((match) => alive && setFound({ mobile, match }))
      .catch(() => alive && setFound(null));
    return () => {
      alive = false;
    };
  }, [mobile, employee?.id]);
  const duplicate = found && found.mobile === f.mobile && f.mobile.trim() ? found.match : null;

  const check = () => {
    const errs = { ...validateEmployee(f), ...(isNew ? validateSalary(salary) : {}) };
    if (duplicate) errs.mobile = `Already used by ${duplicate.fullName} (${duplicate.code}).`;
    return errs;
  };
  const errors = attempted ? check() : {};

  const submit = async () => {
    const errs = check();
    setAttempted(true);
    setIssues([]);
    if (Object.keys(errs).length) {
      const first = TABS.find((t) => t.fields.some((k) => errs[k]));
      if (first) setTab(first.key);
      return;
    }
    try {
      if (isNew) {
        const e = await create.mutateAsync({ input: f, salary, documents: docs });
        setCreated(e);
      } else {
        await update.mutateAsync({ id: employee.id, input: f });
        toast("Employee details saved.");
        router.push(`/employees/${employee.id}/details`);
      }
    } catch (err) {
      setIssues([err instanceof Error ? err.message : String(err)]);
    }
  };

  const busy = create.isPending || update.isPending;
  const today = todayIso();
  const current = employee ? currentSalary(employee.salary, today) : null;

  return (
    <PageContainer>
      <PageHeader
        title={isNew ? "Add employee" : `Edit ${employee.fullName}`}
        subtitle={isNew ? "The employee ID is given automatically when you save." : employee.code}
        back={isNew ? { href: "/employees", label: "Employees" } : { href: `/employees/${employee.id}/details`, label: employee.fullName }}
      />

      <div role="tablist" className="mb-4 flex flex-wrap gap-1 border-b border-slate-200">
        {TABS.map((t) => {
          const bad = t.fields.some((k) => errors[k]);
          return (
            <button
              key={t.key}
              role="tab"
              type="button"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={`relative -mb-px border-b-2 px-3 py-2 text-sm font-medium ${
                tab === t.key ? "border-red-700 text-red-800" : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              {t.label}
              {bad ? <span aria-label="has errors" className="absolute right-0.5 top-1.5 h-2 w-2 rounded-full bg-red-600" /> : null}
            </button>
          );
        })}
      </div>

      <div className="space-y-4">
        {tab === "basic" ? (
          <Card title="Basic details">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <TextField label="Full name" required value={f.fullName} onChange={(v) => set({ fullName: v })} />
                <Err msg={errors.fullName} />
              </div>
              <div>
                <TextField label="Mobile number" required value={f.mobile} onChange={(v) => set({ mobile: v })} placeholder="98xxxxxxxx" />
                <Err msg={errors.mobile} />
                {duplicate && !errors.mobile ? (
                  <p className="mt-1 text-xs font-medium text-amber-700">
                    Already used by {duplicate.fullName} ({duplicate.code}). Each employee needs their own number.
                  </p>
                ) : null}
              </div>
              <div>
                <TextField label="Date of birth" type="date" value={f.dob} onChange={(v) => set({ dob: v })} />
                <Err msg={errors.dob} />
              </div>
              <Select
                label="Gender"
                value={f.gender}
                onChange={(v) => set({ gender: v })}
                options={[{ value: "", label: "Not specified" }, ...GENDERS]}
              />
              <Select
                label="Blood group"
                value={f.bloodGroup}
                onChange={(v) => set({ bloodGroup: v })}
                options={[{ value: "", label: "Not specified" }, ...BLOOD_GROUPS]}
              />
              <TextArea className="sm:col-span-2" label="Address" rows={3} value={f.address} onChange={(v) => set({ address: v })} />
            </div>
          </Card>
        ) : null}

        {tab === "job" ? (
          <Card title="Job details">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <LookupSelect kind="designations" label="Designation" value={f.designation} onChange={(v) => set({ designation: v })} error={errors.designation} />
              <LookupSelect kind="departments" label="Department" value={f.department} onChange={(v) => set({ department: v })} error={errors.department} />
              <div>
                <Select
                  label="Employment type *"
                  value={f.employmentType}
                  onChange={setEmploymentType}
                  options={[{ value: "", label: "Choose…" }, ...EMPLOYMENT_TYPES]}
                />
                <Err msg={errors.employmentType} />
              </div>
              <div>
                <TextField label="Date of joining" required type="date" value={f.dateOfJoining} onChange={setJoining} />
                <Err msg={errors.dateOfJoining} />
              </div>
            </div>
          </Card>
        ) : null}

        {tab === "salary" ? (
          isNew ? (
            <Card title="Salary" description="Only admins can see salary. Later changes are kept as a history with effective dates.">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <Select
                    label="Pay type *"
                    value={salary.payType}
                    onChange={(v) => setSalary({ ...salary, payType: v })}
                    options={[{ value: "", label: "Choose…" }, ...PAY_TYPES.map((p) => ({ value: p.value, label: p.label }))]}
                  />
                  <Err msg={errors.payType} />
                </div>
                <div>
                  <NumberField
                    label="Amount (₹)"
                    required
                    value={salary.amount}
                    onChange={(v) => setSalary({ ...salary, amount: v })}
                    suffix={salary.payType === "daily" ? "/day" : salary.payType === "monthly" ? "/mo" : undefined}
                  />
                  <Err msg={errors.amount} />
                </div>
                <div>
                  <TextField
                    label="Effective from"
                    required
                    type="date"
                    value={salary.effectiveFrom}
                    onChange={(v) => setSalary({ ...salary, effectiveFrom: v })}
                  />
                  <Err msg={errors.effectiveFrom} />
                </div>
              </div>
            </Card>
          ) : (
            <Card title="Salary">
              <p className="text-sm text-slate-700">
                Current: <strong>{current ? money(current.amount, current.payType) : "not set"}</strong>
                {current ? <span className="text-slate-500"> (from {formatDate(current.effectiveFrom)})</span> : null}
              </p>
              <p className="mt-2 text-xs text-slate-500">
                To change the salary, use <strong>Change salary</strong> on the employee&apos;s page. Every change is kept in the salary history.
              </p>
            </Card>
          )
        ) : null}

        {tab === "emergency" ? (
          <Card title="Emergency contact" description="Important for site and factory workers.">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <TextField label="Name" value={f.emergencyContact.name} onChange={(v) => setEc({ name: v })} />
              <TextField label="Relation" value={f.emergencyContact.relation} onChange={(v) => setEc({ relation: v })} placeholder="e.g. Wife, Father" />
              <div>
                <TextField label="Phone" value={f.emergencyContact.phone} onChange={(v) => setEc({ phone: v })} />
                <Err msg={errors.emergencyPhone} />
              </div>
            </div>
          </Card>
        ) : null}

        {tab === "documents" ? (
          isNew ? (
            <PendingDocuments docs={docs} onChange={setDocs} />
          ) : (
            <DocumentsEditor employee={employee} />
          )
        ) : null}

        {Object.keys(errors).length ? <ErrorList issues={Object.values(errors)} /> : null}
        <ErrorList issues={issues} />
        <div className="flex justify-end gap-2">
          <Button onClick={() => router.push(isNew ? "/employees" : `/employees/${employee.id}/details`)}>Cancel</Button>
          <Button variant="primary" disabled={busy} onClick={() => void submit()}>
            {busy ? "Saving…" : isNew ? "Add employee" : "Save changes"}
          </Button>
        </div>
      </div>

      {created ? (
        <Modal
          open
          onClose={() => router.push(`/employees/${created.id}/details`)}
          title="Employee added"
          footer={
            <>
              <Button onClick={() => router.push(`/employees/${created.id}/details`)}>Not now</Button>
              <Button variant="primary" onClick={() => router.push(`/employees/${created.id}/details?createLogin=1`)}>
                Create login
              </Button>
            </>
          }
        >
          <p className="text-sm text-slate-700">
            <strong>{created.fullName}</strong> was added as <strong>{created.code}</strong>.
          </p>
          <p className="mt-2 text-sm text-slate-700">
            Should they sign in to this application? You can create a login now or later from their page. Workers who don&apos;t use the
            application don&apos;t need one.
          </p>
          <p className="mt-2 text-xs text-slate-500">Mobile: {formatPhone(created.mobile)}</p>
        </Modal>
      ) : null}
    </PageContainer>
  );
}

export function NewEmployeeScreen() {
  return <EmployeeForm />;
}

export function EditEmployeeScreen() {
  const { id } = useParams<{ id: string }>();
  const { data, isPending, error } = useEmployee(id);
  if (error)
    return (
      <PageContainer>
        <EmptyState title={error.name === "ForbiddenError" ? "Only admins can edit employees." : "Employee not found."} />
      </PageContainer>
    );
  if (isPending) return <div className="p-6 text-sm text-slate-500">Loading…</div>;
  return <EmployeeForm key={data.id} employee={data} />;
}
