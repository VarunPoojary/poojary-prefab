"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ErrorList } from "@/components/crm/ui";
import { useToast } from "@/components/Providers";
import { Button, Select, TextField } from "@/components/ui/fields";
import { Modal } from "@/components/ui/overlays";
import { crmRepo } from "@/lib/crm";
import { OPEN_STATUSES } from "@/lib/crm/config";
import { useUsers } from "@/lib/crm/hooks";
import { LEAVING_REASONS } from "@/lib/employees/config";
import { useDeactivate, useDeleteEmployee, useLinkedRecords } from "@/lib/employees/hooks";
import { todayIso, validateLeaving } from "@/lib/employees/rules";
import type { LeavingReason } from "@/lib/employees/types";

interface Target {
  id: string;
  fullName: string;
  dateOfJoining: string;
}

/** Leaving date + reason; disables the login and optionally hands open enquiries to someone else. */
export function DeactivateDialog({ employee, onClose }: { employee: Target; onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const deactivate = useDeactivate();
  const { data: users = [] } = useUsers();
  const [date, setDate] = useState(() => todayIso());
  const [reason, setReason] = useState<LeavingReason | "">("");
  const [other, setOther] = useState("");
  const [reassignTo, setReassignTo] = useState("");
  const [issues, setIssues] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const open = useQuery({
    queryKey: ["crm", "enquiries", "open-for", employee.id],
    queryFn: () => crmRepo.listEnquiries({ assignedTo: employee.id, statuses: OPEN_STATUSES, pageSize: 1000 }),
  });
  const openItems = open.data?.items ?? [];
  const candidates = users.filter((u) => u.assignable && u.id !== employee.id);

  const submit = async () => {
    const problems = validateLeaving(date, reason, other, employee.dateOfJoining);
    if (problems.length) return setIssues(problems);
    setBusy(true);
    setIssues([]);
    try {
      if (openItems.length && reassignTo !== "keep") {
        const name = candidates.find((c) => c.id === reassignTo)?.name;
        const comment = name
          ? `Reassigned to ${name} because ${employee.fullName} left the company.`
          : `Unassigned because ${employee.fullName} left the company.`;
        for (const e of openItems) await crmRepo.reassign(e.id, reassignTo, comment);
        void qc.invalidateQueries({ queryKey: ["crm"] });
      }
      await deactivate.mutateAsync({ id: employee.id, leaving: { date, reason: reason as LeavingReason, other: reason === "other" ? other.trim() : "" } });
      toast(`${employee.fullName} deactivated. Their login is disabled.`);
      onClose();
    } catch (err) {
      setIssues([err instanceof Error ? err.message : String(err)]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`Deactivate ${employee.fullName}`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={busy || open.isPending} onClick={() => void submit()}>
            {busy ? "Deactivating…" : "Deactivate"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          The record and its history are kept. Their login is disabled at once and they are signed out.
        </p>
        <TextField label="Date of leaving" required type="date" value={date} onChange={setDate} />
        <Select
          label="Reason for leaving *"
          value={reason}
          onChange={setReason}
          options={[{ value: "", label: "Choose…" }, ...LEAVING_REASONS]}
        />
        {reason === "other" ? <TextField label="Describe the reason" required value={other} onChange={setOther} /> : null}
        {open.isPending ? (
          <p className="text-xs text-slate-500">Checking open enquiries…</p>
        ) : openItems.length ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="text-sm font-medium text-amber-900">
              {openItems.length} open enquir{openItems.length === 1 ? "y is" : "ies are"} assigned to {employee.fullName}.
            </p>
            <ul className="mt-1 max-h-24 overflow-auto text-xs text-amber-900">
              {openItems.map((e) => (
                <li key={e.id}>
                  {e.number} · {e.clientName} – {e.projectName}
                </li>
              ))}
            </ul>
            <Select
              className="mt-2"
              label="Hand them over to"
              value={reassignTo}
              onChange={setReassignTo}
              options={[
                { value: "", label: "Leave unassigned" },
                ...candidates.map((c) => ({ value: c.id, label: c.name })),
                { value: "keep", label: `Keep assigned to ${employee.fullName}` },
              ]}
            />
          </div>
        ) : null}
        <ErrorList issues={issues} />
      </div>
    </Modal>
  );
}

/** Only possible when nothing refers to the employee; the admin types the full name to confirm. */
export function DeleteEmployeeDialog({ employee, onClose }: { employee: Target; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const links = useLinkedRecords(employee.id);
  const del = useDeleteEmployee();
  const [name, setName] = useState("");
  const [issues, setIssues] = useState<string[]>([]);
  const blocked = !!links.data && links.data.total > 0;

  return (
    <Modal
      open
      onClose={onClose}
      title={`Delete ${employee.fullName} permanently`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          {!blocked ? (
            <Button
              variant="primary"
              disabled={del.isPending || links.isPending || name.trim() !== employee.fullName}
              onClick={() =>
                del.mutate(
                  { id: employee.id, confirmName: name },
                  {
                    onSuccess: () => {
                      toast(`${employee.fullName} deleted.`);
                      router.replace("/employees");
                    },
                    onError: (e) => setIssues([e.message]),
                  },
                )
              }
            >
              Delete permanently
            </Button>
          ) : null}
        </>
      }
    >
      {links.isPending ? (
        <p className="text-sm text-slate-500">Checking linked records…</p>
      ) : blocked ? (
        <div className="space-y-2 text-sm text-slate-700">
          <p>This employee can&apos;t be deleted because other records refer to them:</p>
          <ul className="list-disc pl-5">
            {links.data!.enquiries ? <li>{links.data!.enquiries} enquiries (created, assigned or in history)</li> : null}
            {links.data!.quotations ? <li>{links.data!.quotations} quotations</li> : null}
            {links.data!.clients ? <li>{links.data!.clients} clients</li> : null}
            {links.data!.attendance ? <li>{links.data!.attendance} attendance records</li> : null}
            {links.data!.expenses ? <li>{links.data!.expenses} expenses</li> : null}
            {links.data!.payroll ? <li>{links.data!.payroll} payroll records</li> : null}
            {links.data!.historyEntries ? <li>{links.data!.historyEntries} entries in other employees&apos; history</li> : null}
          </ul>
          <p>Deactivate them instead – the record and history are kept.</p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-slate-700">
            This removes the employee, their login and documents for good. It can&apos;t be undone. Type{" "}
            <strong>{employee.fullName}</strong> to confirm.
          </p>
          <TextField label="Full name" value={name} onChange={setName} />
          <ErrorList issues={issues} />
        </div>
      )}
    </Modal>
  );
}
