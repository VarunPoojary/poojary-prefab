"use client";

import Link from "next/link";
import { useState } from "react";
import { ErrorList, InfoRow, useUserName } from "@/components/crm/ui";
import { FileLink } from "@/components/files/Files";
import { useToast } from "@/components/Providers";
import { Button, Card, NumberField, Select, TextArea, TextField } from "@/components/ui/fields";
import { Modal } from "@/components/ui/overlays";
import { useAuth } from "@/lib/auth/AuthProvider";
import { BUILDING_TYPES, CONTACT_ROLES, SCOPES, labelOf } from "@/lib/crm/config";
import { useClient, useEnquiry, useUsers } from "@/lib/crm/hooks";
import { formatPhone } from "@/lib/crm/rules";
import { fileStore, uploadFile } from "@/lib/files";
import { formatBytes, formatDate } from "@/lib/format";
import { projectRepo } from "@/lib/projects";
import { BUDGET_GROUPS, PAYMENT_MODES, PROJECT_DOC_SLOTS, type BudgetGroup } from "@/lib/projects/config";
import { useProjectMutation } from "@/lib/projects/hooks";
import { moneyTotals, todayIso } from "@/lib/projects/rules";
import type { ExternalParty, Milestone, Payment, Project, ProjectContact, ProjectDocSlot, ProjectInfoInput, TeamMember, Variation } from "@/lib/projects/types";
import { useList } from "@/lib/settings/hooks";
import { RowsDialog } from "./RowsDialog";
import { fmtManDays } from "@/components/attendance/bits";
import { useLabourCost } from "@/lib/attendance/hooks";
import { useExpenseBudget } from "@/lib/expenses/hooks";
import { formatPaise } from "@/lib/paise";
import { useEmployeeLabourCost } from "@/lib/payroll/hooks";
import { Timeline } from "./Timeline";
import { FileText, MapPin, Plus, TriangleAlert, Upload, X } from "lucide-react";
import { Icon } from "@/components/ui/icons";

const rupee = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const issuesOf = (e: unknown) => (e && typeof e === "object" && "issues" in e ? (e as { issues: string[] }).issues : [e instanceof Error ? e.message : String(e)]);
const blankId = () => "";

const infoOf = (p: Project): ProjectInfoInput => ({
  name: p.name,
  siteLocation: p.siteLocation,
  siteAddress: p.siteAddress,
  lat: p.lat,
  lng: p.lng,
  buildingType: p.buildingType,
  buildingTypeOther: p.buildingTypeOther,
  scope: p.scope,
  scopeOther: p.scopeOther,
  size: { ...p.size },
  steelMt: p.steelMt,
  poNumber: p.poNumber,
  poDate: p.poDate,
  startDate: p.startDate,
  projectManagerId: p.projectManagerId,
  contactId: p.contactId,
});

/* ---------- A. Project information ---------- */

function InfoDialog({ project, onClose }: { project: Project; onClose: () => void }) {
  const toast = useToast();
  const { data: users = [] } = useUsers();
  const [f, setF] = useState<ProjectInfoInput>(() => infoOf(project));
  const [issues, setIssues] = useState<string[]>([]);
  const [locating, setLocating] = useState(false);
  const save = useProjectMutation((input: ProjectInfoInput) => projectRepo.updateInfo(project.id, input));
  const set = (patch: Partial<ProjectInfoInput>) => setF((x) => ({ ...x, ...patch }));
  const setSize = (patch: Partial<ProjectInfoInput["size"]>) => setF((x) => ({ ...x, size: { ...x.size, ...patch } }));
  const locate = () => {
    if (!navigator.geolocation) return setIssues(["This browser can't share its location."]);
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        set({ lat: Math.round(pos.coords.latitude * 1e6) / 1e6, lng: Math.round(pos.coords.longitude * 1e6) / 1e6 });
        setLocating(false);
      },
      (err) => {
        setIssues([`Couldn't get your location: ${err.message}`]);
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };
  return (
    <Modal
      open
      wide
      onClose={onClose}
      title="Edit project information"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={save.isPending}
            onClick={() => save.mutate(f, { onSuccess: () => (toast("Project details saved"), onClose()), onError: (e) => setIssues(issuesOf(e)) })}
          >
            Save
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField className="sm:col-span-2" label="Project name" required value={f.name} onChange={(v) => set({ name: v })} />
        <TextField label="Site location" value={f.siteLocation} onChange={(v) => set({ siteLocation: v })} placeholder="City, state" />
        <Select
          label="Project manager"
          value={f.projectManagerId}
          onChange={(v) => set({ projectManagerId: v })}
          options={users.filter((u) => u.assignable || u.id === f.projectManagerId).map((u) => ({ value: u.id, label: u.name }))}
        />
        <TextArea className="sm:col-span-2" label="Site address" rows={2} value={f.siteAddress} onChange={(v) => set({ siteAddress: v })} />
        <div className="grid grid-cols-2 gap-2 sm:col-span-2 sm:grid-cols-[1fr_1fr_auto]">
          <NumberField label="Latitude" value={f.lat} onChange={(v) => set({ lat: v })} />
          <NumberField label="Longitude" value={f.lng} onChange={(v) => set({ lng: v })} />
          <div className="col-span-2 flex items-end sm:col-span-1">
            <Button onClick={locate} disabled={locating}>
              <Icon icon={MapPin} size={14} className="mr-1 inline-block align-[-2px]" />{locating ? "Locating…" : "Use my current location"}
            </Button>
          </div>
        </div>
        <Select label="Building type" value={f.buildingType} onChange={(v) => set({ buildingType: v })} options={[{ value: "", label: "Not set" }, ...BUILDING_TYPES]} />
        {f.buildingType === "other" ? <TextField label="Other building type" value={f.buildingTypeOther} onChange={(v) => set({ buildingTypeOther: v })} /> : <span className="hidden sm:block" />}
        <Select label="Scope" value={f.scope} onChange={(v) => set({ scope: v })} options={[{ value: "", label: "Not set" }, ...SCOPES]} />
        {f.scope === "other" ? <TextField label="Other scope" value={f.scopeOther} onChange={(v) => set({ scopeOther: v })} /> : <span className="hidden sm:block" />}
        <div className="grid grid-cols-2 gap-2 sm:col-span-2 sm:grid-cols-4">
          <NumberField label="Length (m)" value={f.size.length} onChange={(v) => setSize({ length: v })} />
          <NumberField label="Width (m)" value={f.size.width} onChange={(v) => setSize({ width: v })} />
          <NumberField label="Eave height (m)" value={f.size.eaveHeight} onChange={(v) => setSize({ eaveHeight: v })} />
          <NumberField label="Area (sq ft)" value={f.size.areaSqft} onChange={(v) => setSize({ areaSqft: v })} />
        </div>
        <NumberField label="Total steel weight" suffix="MT" value={f.steelMt} onChange={(v) => set({ steelMt: v })} />
        <TextField label="Start date" required type="date" value={f.startDate} onChange={(v) => set({ startDate: v })} />
        <TextField label="PO / LOI number" value={f.poNumber} onChange={(v) => set({ poNumber: v })} />
        <TextField label="PO / LOI date" type="date" value={f.poDate} onChange={(v) => set({ poDate: v })} />
      </div>
      <div className="mt-3">
        <ErrorList issues={issues} />
      </div>
    </Modal>
  );
}

function PlannedCompletionDialog({ project, onClose }: { project: Project; onClose: () => void }) {
  const toast = useToast();
  const [date, setDate] = useState(project.plannedCompletion);
  const [reason, setReason] = useState("");
  const [issues, setIssues] = useState<string[]>([]);
  const save = useProjectMutation(() => projectRepo.setPlannedCompletion(project.id, date, reason));
  const first = !project.plannedCompletionBaseline;
  return (
    <Modal
      open
      onClose={onClose}
      title={first ? "Set planned completion" : "Change planned completion"}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={save.isPending} onClick={() => save.mutate(undefined, { onSuccess: () => (toast("Planned completion saved"), onClose()), onError: (e) => setIssues(issuesOf(e)) })}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <TextField label="Planned completion" required type="date" value={date} onChange={setDate} />
        {first ? (
          <p className="text-xs text-slate-500">This first date is kept as the baseline for planned-vs-actual reports.</p>
        ) : (
          <>
            <p className="text-xs text-slate-500">The baseline ({formatDate(project.plannedCompletionBaseline)}) is kept; this change is logged.</p>
            <TextArea label="Reason" required rows={2} value={reason} onChange={setReason} />
          </>
        )}
        <ErrorList issues={issues} />
      </div>
    </Modal>
  );
}

function InfoSection({ p, isAdmin }: { p: Project; isAdmin: boolean }) {
  const toast = useToast();
  const userName = useUserName();
  const { data: enquiry } = useEnquiry(p.enquiryId);
  const [editing, setEditing] = useState(false);
  const [planning, setPlanning] = useState(false);
  const fill = useProjectMutation(() => projectRepo.fillSteelTotals(p.id));
  const emptyMt = p.stages.flatMap((s) => s.tasks).filter((t) => t.measure === "quantity" && t.unit === "MT" && !t.total).length;
  const size = [p.size.length, p.size.width, p.size.eaveHeight].every((x) => x !== null) ? `${p.size.length} × ${p.size.width} × ${p.size.eaveHeight} m` : "";
  return (
    <Card
      title="A. Project information"
      actions={
        isAdmin ? (
          <Button size="sm" onClick={() => setEditing(true)}>
            Edit
          </Button>
        ) : null
      }
    >
      <dl id="info">
        <InfoRow label="Project code">{p.code}</InfoRow>
        <InfoRow label="Linked enquiry">
          {p.enquiryId ? (
            <Link href={`/enquiries/${p.enquiryId}`} className="text-red-700 hover:underline">
              {enquiry?.number ?? "Open enquiry"}
            </Link>
          ) : (
            "Not linked"
          )}
        </InfoRow>
        <InfoRow label="Final quotation">
          {p.quotationId ? (
            <Link href={`/quotations/${p.quotationId}`} className="text-red-700 hover:underline">
              Open quotation{p.quotationRevision !== null ? ` (R${p.quotationRevision})` : ""}
            </Link>
          ) : (
            ""
          )}
        </InfoRow>
        <InfoRow label="PO / LOI">{p.poNumber ? `${p.poNumber}${p.poDate ? ` dated ${formatDate(p.poDate)}` : ""}` : ""}</InfoRow>
        <InfoRow label="Building type">{p.buildingType === "other" ? p.buildingTypeOther : p.buildingType ? labelOf(BUILDING_TYPES, p.buildingType) : ""}</InfoRow>
        <InfoRow label="Scope">{p.scope === "other" ? p.scopeOther : p.scope ? labelOf(SCOPES, p.scope) : ""}</InfoRow>
        <InfoRow label="Site address">
          <span className="whitespace-pre-line">{[p.siteAddress, p.siteLocation].filter(Boolean).join("\n")}</span>
          {p.lat !== null && p.lng !== null ? (
            <a
              href={`https://www.google.com/maps?q=${p.lat},${p.lng}`}
              target="_blank"
              rel="noreferrer"
              className="mt-1 block text-xs font-medium text-red-700 hover:underline"
            >
              <Icon icon={MapPin} size={14} className="mr-1 inline-block align-[-2px]" />{p.lat}, {p.lng} – Open in Google Maps
            </a>
          ) : null}
        </InfoRow>
        <InfoRow label="Building size">{[size, p.size.areaSqft ? `${p.size.areaSqft.toLocaleString("en-IN")} sq ft` : ""].filter(Boolean).join(", ")}</InfoRow>
        <InfoRow label="Total steel weight">{p.steelMt !== null ? `${p.steelMt} MT` : ""}</InfoRow>
        <InfoRow label="Project manager">{userName(p.projectManagerId)}</InfoRow>
        <InfoRow label="Start date">{formatDate(p.startDate)}</InfoRow>
        <InfoRow label="Planned completion">
          {p.plannedCompletion ? formatDate(p.plannedCompletion) : <span className="text-slate-400">Not set</span>}
          {p.plannedCompletionBaseline && p.plannedCompletionBaseline !== p.plannedCompletion ? (
            <span className="ml-2 text-xs text-slate-500">(baseline {formatDate(p.plannedCompletionBaseline)})</span>
          ) : null}
          {isAdmin && p.status !== "completed" && p.status !== "cancelled" ? (
            <button type="button" className="ml-2 text-xs font-medium text-red-700 hover:underline" onClick={() => setPlanning(true)}>
              {p.plannedCompletion ? "Change" : "Set"}
            </button>
          ) : null}
        </InfoRow>
        <InfoRow label="Actual completion">{p.actualCompletion ? formatDate(p.actualCompletion) : ""}</InfoRow>
      </dl>
      {isAdmin && p.steelMt && emptyMt && p.status === "active" ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-900">
          <span>
            {emptyMt} task{emptyMt === 1 ? "" : "s"} measured in MT {emptyMt === 1 ? "has" : "have"} no total yet. Use {p.steelMt} MT?
          </span>
          <Button size="sm" disabled={fill.isPending} onClick={() => fill.mutate(undefined, { onSuccess: (n) => toast(`${n} task totals set to ${p.steelMt} MT`), onError: (e) => toast(e.message, "error") })}>
            Fill MT totals
          </Button>
        </div>
      ) : null}
      {editing ? <InfoDialog project={p} onClose={() => setEditing(false)} /> : null}
      {planning ? <PlannedCompletionDialog project={p} onClose={() => setPlanning(false)} /> : null}
    </Card>
  );
}

/* ---------- B. Client and point of contact ---------- */

function ClientSection({ p, isAdmin }: { p: Project; isAdmin: boolean }) {
  const toast = useToast();
  const { data: client } = useClient(p.clientId);
  const [editing, setEditing] = useState(false);
  const [pickContact, setPickContact] = useState(false);
  const [contactId, setContactId] = useState(p.contactId);
  const saveContacts = useProjectMutation((rows: ProjectContact[]) => projectRepo.saveContacts(p.id, rows));
  const saveInfo = useProjectMutation((input: ProjectInfoInput) => projectRepo.updateInfo(p.id, input));
  const contact = client?.contacts.find((c) => c.id === p.contactId);
  return (
    <Card
      title="B. Client and point of contact"
      actions={
        isAdmin ? (
          <>
            <Button size="sm" onClick={() => setPickContact(true)}>
              Change contact
            </Button>
            <Button size="sm" onClick={() => setEditing(true)}>
              Project contacts
            </Button>
          </>
        ) : null
      }
    >
      <dl>
        <InfoRow label="Client">
          {client ? (
            <Link href={`/clients/${client.id}`} className="text-red-700 hover:underline">
              {client.name}
            </Link>
          ) : (
            ""
          )}
        </InfoRow>
        <InfoRow label="Point of contact">
          {contact ? (
            <>
              {contact.name} <span className="text-xs text-slate-500">({labelOf(CONTACT_ROLES, contact.role)})</span>
              <span className="block text-xs">
                {contact.phone ? (
                  <a href={`tel:+91${contact.phone}`} className="hover:underline">
                    {formatPhone(contact.phone)}
                  </a>
                ) : null}
                {contact.email ? (
                  <>
                    {" · "}
                    <a href={`mailto:${contact.email}`} className="hover:underline">
                      {contact.email}
                    </a>
                  </>
                ) : null}
              </span>
            </>
          ) : (
            ""
          )}
        </InfoRow>
      </dl>
      {p.extraContacts.length ? (
        <ul className="mt-3 divide-y divide-slate-100 border-t border-slate-100 text-sm">
          {p.extraContacts.map((c) => (
            <li key={c.id} className="py-2">
              <span className="font-medium text-slate-900">{c.name}</span> <span className="text-xs text-slate-500">{c.role}</span>
              <span className="block text-xs text-slate-600">{[c.phone && formatPhone(c.phone), c.email].filter(Boolean).join(" · ")}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-xs text-slate-500">No extra project contacts (e.g. site in-charge, accounts person).</p>
      )}
      {editing ? (
        <RowsDialog<ProjectContact>
          title="Client-side contacts for this project"
          rows={p.extraContacts}
          blank={() => ({ id: blankId(), name: "", role: "", phone: "", email: "" })}
          columns={[
            { key: "name", label: "Name", type: "text" },
            { key: "role", label: "Role", type: "text", placeholder: "Site in-charge" },
            { key: "phone", label: "Phone", type: "text" },
            { key: "email", label: "Email", type: "text" },
          ]}
          addLabel="+ Add contact"
          saving={saveContacts.isPending}
          onSave={(rows) => saveContacts.mutateAsync(rows)}
          onClose={() => setEditing(false)}
        />
      ) : null}
      {pickContact && client ? (
        <Modal
          open
          onClose={() => setPickContact(false)}
          title="Point of contact"
          footer={
            <>
              <Button onClick={() => setPickContact(false)}>Cancel</Button>
              <Button
                variant="primary"
                onClick={() =>
                  saveInfo.mutate(
                    { ...infoOf(p), contactId },
                    { onSuccess: () => (toast("Point of contact changed"), setPickContact(false)), onError: (e) => toast(e.message, "error") },
                  )
                }
              >
                Save
              </Button>
            </>
          }
        >
          <Select label="Contact person of the client" value={contactId} onChange={setContactId} options={client.contacts.map((c) => ({ value: c.id, label: `${c.name} (${labelOf(CONTACT_ROLES, c.role)})` }))} />
          <p className="mt-2 text-xs text-slate-500">Add new people to the client in the Client List first.</p>
        </Modal>
      ) : null}
    </Card>
  );
}

/* ---------- C. People involved ---------- */

function PeopleSection({ p, isAdmin }: { p: Project; isAdmin: boolean }) {
  const userName = useUserName();
  const { data: users = [] } = useUsers();
  const roles = useList("projectRoles");
  const partyTypes = useList("partyTypes");
  const [editTeam, setEditTeam] = useState(false);
  const [editParties, setEditParties] = useState(false);
  const [today] = useState(() => todayIso());
  const saveTeam = useProjectMutation((rows: TeamMember[]) => projectRepo.saveTeam(p.id, rows));
  const saveParties = useProjectMutation((rows: ExternalParty[]) => projectRepo.saveParties(p.id, rows));
  return (
    <Card title="C. People involved">
      <div id="people" className="mb-2 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-slate-800">Internal team</h4>
        {isAdmin ? (
          <Button size="sm" onClick={() => setEditTeam(true)}>
            Edit team
          </Button>
        ) : null}
      </div>
      <ul className="divide-y divide-slate-100 text-sm" data-testid="team-list">
        {p.team.map((m) => {
          const left = !!m.to && m.to < today;
          return (
            <li key={m.id} className={`flex flex-wrap items-center justify-between gap-2 py-2 ${left ? "text-slate-400" : ""}`}>
              <span>
                <span className="font-medium">{userName(m.employeeId)}</span> <span className="text-xs">· {roles.label(m.role)}</span>
                {m.employeeId === p.projectManagerId ? <span className="ml-1 rounded bg-red-50 px-1.5 text-[11px] font-semibold text-red-800">PM</span> : null}
              </span>
              <span className="text-xs">
                {m.from ? formatDate(m.from) : "–"} → {m.to ? formatDate(m.to) : "now"} {left ? "(left the team)" : ""}
              </span>
            </li>
          );
        })}
      </ul>
      <div className="mb-2 mt-5 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-slate-800">External parties</h4>
        {isAdmin ? (
          <Button size="sm" onClick={() => setEditParties(true)}>
            Edit parties
          </Button>
        ) : null}
      </div>
      {p.externalParties.length ? (
        <ul className="divide-y divide-slate-100 text-sm">
          {p.externalParties.map((x) => (
            <li key={x.id} className="py-2">
              <span className="font-medium text-slate-900">{x.company}</span> <span className="text-xs text-slate-500">· {partyTypes.label(x.type)}</span>
              <span className="block text-xs text-slate-600">{[x.person, x.phone && formatPhone(x.phone), x.email].filter(Boolean).join(" · ")}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-slate-500">Consultants, PMC, civil contractor, transporters, crane suppliers…</p>
      )}
      {editTeam ? (
        <RowsDialog<TeamMember>
          title="Project team"
          description="Members see the project while today is between their from and to dates. The project manager is always on the team."
          rows={p.team}
          blank={() => ({ id: blankId(), employeeId: "", role: "", from: todayIso(), to: "" })}
          columns={[
            { key: "employeeId", label: "Employee", type: "select", options: users.filter((u) => u.active || p.team.some((m) => m.employeeId === u.id)).map((u) => ({ value: u.id, label: u.name })), width: "flex-[2]" },
            { key: "role", label: "Project role", type: "select", options: roles.items, width: "flex-[2]" },
            { key: "from", label: "From", type: "date" },
            { key: "to", label: "To", type: "date" },
          ]}
          addLabel="+ Add team member"
          saving={saveTeam.isPending}
          onSave={(rows) => saveTeam.mutateAsync(rows)}
          onClose={() => setEditTeam(false)}
        />
      ) : null}
      {editParties ? (
        <RowsDialog<ExternalParty>
          title="External parties"
          rows={p.externalParties}
          blank={() => ({ id: blankId(), type: "", company: "", person: "", phone: "", email: "" })}
          columns={[
            { key: "type", label: "Type", type: "select", options: partyTypes.items },
            { key: "company", label: "Company", type: "text" },
            { key: "person", label: "Person", type: "text" },
            { key: "phone", label: "Phone", type: "text" },
            { key: "email", label: "Email", type: "text" },
          ]}
          addLabel="+ Add party"
          saving={saveParties.isPending}
          onSave={(rows) => saveParties.mutateAsync(rows)}
          onClose={() => setEditParties(false)}
        />
      ) : null}
    </Card>
  );
}

/* ---------- D. Money (admin) ---------- */

function MoneyTile({ label, value, tone }: { label: string; value: string; tone?: "red" | "green" }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2">
      <div className="text-[11px] font-semibold text-slate-500">{label}</div>
      <div className={`text-sm font-semibold ${tone === "red" ? "text-red-700" : tone === "green" ? "text-emerald-700" : "text-slate-900"}`}>{value}</div>
    </div>
  );
}

function MoneySection({ p }: { p: Project }) {
  const toast = useToast();
  const { user } = useAuth();
  const userName = useUserName();
  const [today] = useState(() => todayIso());
  const [dialog, setDialog] = useState<"value" | "variation" | "milestones" | "payment" | "budget" | null>(null);
  const m = p.money!;
  const t = moneyTotals(m, today);
  const removeVariation = useProjectMutation((id: string) => projectRepo.removeVariation(p.id, id));
  const removePayment = useProjectMutation((id: string) => projectRepo.removePayment(p.id, id));
  const saveMilestones = useProjectMutation((rows: Milestone[]) => projectRepo.saveMilestones(p.id, rows));
  const saveBudget = useProjectMutation((rows: { id: BudgetGroup; amount: number | null }[]) =>
    projectRepo.saveBudget(p.id, Object.fromEntries(rows.map((r) => [r.id, r.amount ?? 0]))),
  );
  const msName = (id: string) => m.milestones.find((x) => x.id === id)?.name ?? "";
  const editable = p.status !== "completed" && p.status !== "cancelled";
  const { data: actual } = useExpenseBudget(p.id);
  const spent = (g: BudgetGroup) => actual?.lines.find((l) => l.group === g);

  return (
    <Card title="D. Money" description="Visible to admins only.">
      <div id="money" className="grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid="money-totals">
        <MoneyTile label="Revised value (with GST)" value={rupee(t.revisedWithGst)} />
        <MoneyTile label="Received" value={rupee(t.received)} tone="green" />
        <MoneyTile label="Outstanding" value={rupee(t.outstanding)} />
        <MoneyTile label="% collected" value={`${t.pctCollected.toFixed(1)}%`} />
      </div>

      <h4 className="mb-1 mt-5 flex items-center justify-between text-sm font-semibold text-slate-800">
        Project value
        {editable ? (
          <Button size="sm" onClick={() => setDialog("value")}>
            Edit value
          </Button>
        ) : null}
      </h4>
      <dl>
        <InfoRow label="Value before GST">{rupee(m.valueBasic)}</InfoRow>
        <InfoRow label="Value with GST">{`${rupee(Math.round(m.valueBasic * (1 + m.gstRate / 100)))} (GST ${m.gstRate}%)`}</InfoRow>
        <InfoRow label="Variations">{t.variationsTotal ? `${t.variationsTotal > 0 ? "+" : "−"}${rupee(Math.abs(t.variationsTotal))} before GST` : "None"}</InfoRow>
        <InfoRow label="Revised value">{`${rupee(t.revisedBasic)} + GST = ${rupee(t.revisedWithGst)}`}</InfoRow>
      </dl>

      <h4 className="mb-1 mt-5 flex items-center justify-between text-sm font-semibold text-slate-800">
        Variations
        {editable ? (
          <Button size="sm" onClick={() => setDialog("variation")}>
            <Icon icon={Plus} size={14} className="inline-block align-[-2px]" /> Add variation
          </Button>
        ) : null}
      </h4>
      {m.variations.length ? (
        <ul className="divide-y divide-slate-100 text-sm">
          {m.variations.map((v) => (
            <li key={v.id} className="flex items-center justify-between gap-2 py-2">
              <span>
                <span className="text-xs text-slate-500">{formatDate(v.date)}</span> {v.description}{" "}
                <span className="text-xs text-slate-500">· approved by {v.approvedBy}</span>
              </span>
              <span className="flex items-center gap-2 whitespace-nowrap font-medium">
                {v.amount > 0 ? "+" : "−"}
                {rupee(Math.abs(v.amount))}
                {editable ? (
                  <button type="button" aria-label="Remove variation" className="-my-1.5 flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-red-50 hover:text-red-700" onClick={() => window.confirm("Remove this variation?") && removeVariation.mutate(v.id)}>
                    <Icon icon={X} size={16} />
                  </button>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-slate-500">No approved changes.</p>
      )}

      <h4 className="mb-1 mt-5 flex items-center justify-between text-sm font-semibold text-slate-800">
        Payment milestones
        {editable ? (
          <Button size="sm" onClick={() => setDialog("milestones")}>
            Edit milestones
          </Button>
        ) : null}
      </h4>
      {m.milestones.length ? (
        <div className="overflow-x-auto">
          <table className="stack-table stack-flush w-full min-w-[520px] text-sm" data-testid="milestones">
            <thead className="text-left text-xs text-slate-500">
              <tr>
                <th className="py-1">Milestone</th>
                <th className="text-right">%</th>
                <th className="text-right">Amount</th>
                <th className="pl-3">Expected</th>
                <th className="text-right">Received</th>
                <th className="pl-3">State</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {m.milestones.map((ms) => {
                const got = t.milestoneReceived[ms.id] ?? 0;
                const overdue = t.overdue.some((x) => x.id === ms.id);
                return (
                  <tr key={ms.id}>
                    <td className="py-1.5 max-md:font-medium">{ms.name}</td>
                    <td data-half data-label="Share %" className="text-right">{ms.pct ?? ""}</td>
                    <td data-half data-label="Amount" className="text-right">{rupee(ms.amount)}</td>
                    <td data-half data-label="Expected" className="pl-3">{ms.expectedDate ? formatDate(ms.expectedDate) : <span className="text-slate-400">–</span>}</td>
                    <td data-half data-label="Received" className="text-right">{rupee(got)}</td>
                    <td data-menu className="pl-3 text-xs font-semibold">
                      {got >= ms.amount ? (
                        <span className="text-emerald-700">Received</span>
                      ) : overdue ? (
                        <span className="text-red-700">Overdue</span>
                      ) : got > 0 ? (
                        <span className="text-amber-700">Part paid</span>
                      ) : (
                        <span className="text-slate-500">Due</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-xs text-slate-500">No milestones. Add them (e.g. Advance, Against dispatch, Against erection, Retention).</p>
      )}

      <h4 className="mb-1 mt-5 flex items-center justify-between text-sm font-semibold text-slate-800">
        Payments received
        <Button size="sm" variant="primary" onClick={() => setDialog("payment")}>
          <Icon icon={Plus} size={14} className="inline-block align-[-2px]" /> Record payment
        </Button>
      </h4>
      {m.payments.length ? (
        <ul className="divide-y divide-slate-100 text-sm" data-testid="payments">
          {[...m.payments]
            .sort((a, b) => b.date.localeCompare(a.date))
            .map((x) => (
              <li key={x.id} className="flex items-center justify-between gap-2 py-2">
                <span>
                  <span className="text-xs text-slate-500">{formatDate(x.date)}</span> {labelOf(PAYMENT_MODES, x.mode)}
                  {x.reference ? ` · ${x.reference}` : ""}
                  {x.milestoneId ? <span className="text-xs text-slate-500"> · {msName(x.milestoneId)}</span> : null}
                  <span className="block text-xs text-slate-500">recorded by {userName(x.createdBy)}</span>
                </span>
                <span className="flex items-center gap-2 whitespace-nowrap font-semibold text-emerald-700">
                  {rupee(x.amount)}
                  {user?.role === "admin" ? (
                    <button type="button" aria-label="Remove payment" className="-my-1.5 flex h-8 w-8 items-center justify-center rounded-lg font-normal text-slate-400 transition-colors hover:bg-red-50 hover:text-red-700" onClick={() => window.confirm("Remove this payment?") && removePayment.mutate(x.id)}>
                      <Icon icon={X} size={16} />
                    </button>
                  ) : null}
                </span>
              </li>
            ))}
        </ul>
      ) : (
        <p className="text-xs text-slate-500">No payments recorded yet.</p>
      )}
      {t.overdue.length ? <p className="mt-2 text-sm font-medium text-red-700"><Icon icon={TriangleAlert} size={14} className="mr-1 inline-block align-[-2px]" />{t.overdue.length} milestone{t.overdue.length === 1 ? "" : "s"} overdue.</p> : null}

      <h4 className="mb-1 mt-5 flex items-center justify-between text-sm font-semibold text-slate-800">
        Budget (planned cost)
        {editable ? (
          <Button size="sm" onClick={() => setDialog("budget")}>
            Edit budget
          </Button>
        ) : null}
      </h4>
      <div className="overflow-x-auto">
        <table className="w-full text-sm" data-testid="budget">
          <thead className="text-left text-xs text-slate-500">
            <tr>
              <th className="py-1">Work stage</th>
              <th className="text-right">Budget</th>
              <th className="text-right">% of budget</th>
              <th className="text-right">Actual</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {BUDGET_GROUPS.map((g) => {
              const amount = m.budget[g.value] ?? 0;
              return (
                <tr key={g.value}>
                  <td className="py-1.5">
                    {g.label}
                    {g.hint ? <span className="block text-[11px] text-slate-500">{g.hint}</span> : null}
                  </td>
                  <td className="text-right">{amount ? rupee(amount) : <span className="text-slate-400">–</span>}</td>
                  <td className="text-right text-xs text-slate-500">{amount && t.budgetTotal ? `${((amount / t.budgetTotal) * 100).toFixed(0)}%` : ""}</td>
                  <td className={`text-right ${spent(g.value)?.over ? "font-semibold text-red-700" : ""}`} data-testid={`actual-${g.value}`}>
                    {spent(g.value) ? formatPaise(spent(g.value)!.spentPaise) : "–"}
                    {spent(g.value)?.pctUsed !== null && spent(g.value) ? <span className="block text-[11px] text-slate-500">{Math.round(spent(g.value)!.pctUsed!)}% used</span> : null}
                  </td>
                </tr>
              );
            })}
            <tr className="font-semibold">
              <td className="py-1.5">Total budget</td>
              <td className="text-right">{rupee(t.budgetTotal)}</td>
              <td />
              <td className="text-right">{actual ? formatPaise(actual.totalSpentPaise) : "–"}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-sm text-slate-700">
        Planned margin (revised value − budget): <b className={t.plannedMargin < 0 ? "text-red-700" : ""}>{rupee(t.plannedMargin)}</b>{" "}
        <span className="text-xs text-slate-500">({t.plannedMarginPct.toFixed(1)}% before GST)</span>
      </p>
      {actual ? (
        <p className="text-sm text-slate-700" data-testid="actual-margin">
          Actual spend so far: <b>{formatPaise(actual.totalSpentPaise)}</b> · actual margin (revised value − actual spend):{" "}
          <b className={t.revisedBasic * 100 - actual.totalSpentPaise < 0 ? "text-red-700" : ""}>{formatPaise(t.revisedBasic * 100 - actual.totalSpentPaise)}</b>{" "}
          <span className="text-xs text-slate-500">
            (accepted + paid expenses, including GST ·{" "}
            <Link href={`/projects/${p.id}/expenses`} className="text-red-700 hover:underline">
              Expenses tab
            </Link>
            )
          </span>
        </p>
      ) : null}
      <LabourCostLine projectId={p.id} />
      <EmployeeLabourLine projectId={p.id} />

      {dialog === "value" ? <ValueDialog p={p} onClose={() => setDialog(null)} /> : null}
      {dialog === "variation" ? <VariationDialog p={p} onClose={() => setDialog(null)} /> : null}
      {dialog === "payment" ? <PaymentDialog p={p} onClose={() => setDialog(null)} /> : null}
      {dialog === "milestones" ? (
        <RowsDialog<Milestone>
          title="Payment milestones"
          description={`Amounts are with GST. Changing % recalculates the amount from the revised value (${rupee(t.revisedWithGst)}).`}
          rows={m.milestones}
          blank={() => ({ id: blankId(), name: "", pct: null, amount: 0, expectedDate: "" })}
          columns={[
            { key: "name", label: "Milestone", type: "text", width: "flex-[2]" },
            { key: "pct", label: "%", type: "number", width: "w-20" },
            { key: "amount", label: "Amount (₹)", type: "number" },
            { key: "expectedDate", label: "Expected date", type: "date" },
          ]}
          onRowChange={(row, key) => (key === "pct" && row.pct !== null ? { ...row, amount: Math.round((t.revisedWithGst * row.pct) / 100) } : row)}
          addLabel="+ Add milestone"
          saving={saveMilestones.isPending}
          onSave={(rows) => saveMilestones.mutateAsync(rows.map((r) => ({ ...r, amount: Number(r.amount) || 0 })))}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog === "budget" ? (
        <RowsDialog<{ id: BudgetGroup; label: string; amount: number | null }>
          title="Budget by work stage"
          description="Planned cost (including GST, like the expenses it is compared with) for each stage of the work. Site work covers erection, quality check and handover; Labour covers fabrication, erection and casual labour. Expenses are booked against the same stages."
          rows={BUDGET_GROUPS.map((g) => ({ id: g.value, label: g.label, amount: m.budget[g.value] ?? null }))}
          columns={[
            { key: "label", label: "Work stage", type: "text", width: "flex-[2]", readOnly: true },
            { key: "amount", label: "Budget (₹)", type: "number" },
          ]}
          saving={saveBudget.isPending}
          onSave={(rows) => saveBudget.mutateAsync(rows).then(() => toast("Budget saved"))}
          onClose={() => setDialog(null)}
        />
      ) : null}
    </Card>
  );
}

/** Casual labour so far from site attendance (man-days × daily rate). */
function LabourCostLine({ projectId }: { projectId: string }) {
  const { data } = useLabourCost(projectId);
  if (!data || (!data.casualManDays && !data.employeeManDays)) return null;
  return (
    <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700" data-testid="labour-cost">
      <b>Site labour so far:</b> {fmtManDays(data.casualManDays)} casual man-days ={" "}
      <b>{rupee(data.casualCost)}</b>
      {data.unratedManDays ? <span className="text-xs text-slate-500"> ({fmtManDays(data.unratedManDays)} man-days of workers without a daily rate not costed)</span> : null}
      <span className="block text-xs text-slate-500">
        Plus {fmtManDays(data.employeeManDays)} employee man-days on site. From the Attendance tab; the casual labour is paid through site expense requests.
      </span>
    </div>
  );
}

/** Salaried employees' days on site × their daily rate (information only; salaries are paid through payroll). */
function EmployeeLabourLine({ projectId }: { projectId: string }) {
  const { data } = useEmployeeLabourCost(projectId);
  if (!data || !data.rows.length) return null;
  return (
    <details className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700" data-testid="employee-labour">
      <summary className="cursor-pointer">
        <b>Employee labour on site:</b> {fmtManDays(data.manDays)} man-days ≈ <b>{formatPaise(data.totalPaise)}</b>{" "}
        <span className="text-xs text-slate-500">(salary ÷ 30 per day; for information, not part of expenses)</span>
      </summary>
      <ul className="mt-1 text-xs">
        {data.rows.map((r) => (
          <li key={r.employeeId}>
            {r.name}: {fmtManDays(r.manDays)} days · {formatPaise(r.costPaise)}
          </li>
        ))}
      </ul>
    </details>
  );
}

function ValueDialog({ p, onClose }: { p: Project; onClose: () => void }) {
  const [basic, setBasic] = useState<number | null>(p.money!.valueBasic);
  const [gst, setGst] = useState<number | null>(p.money!.gstRate);
  const [issues, setIssues] = useState<string[]>([]);
  const save = useProjectMutation(() => projectRepo.setValue(p.id, basic ?? -1, gst ?? -1));
  return (
    <Modal
      open
      onClose={onClose}
      title="Project value"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={save.isPending} onClick={() => save.mutate(undefined, { onSuccess: onClose, onError: (e) => setIssues(issuesOf(e)) })}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-xs text-slate-500">Changes to the agreed scope should be recorded as variations instead. This change is logged.</p>
        <NumberField label="Value before GST (₹)" value={basic} onChange={setBasic} />
        <NumberField label="GST rate" suffix="%" value={gst} onChange={setGst} />
        <ErrorList issues={issues} />
      </div>
    </Modal>
  );
}

function VariationDialog({ p, onClose }: { p: Project; onClose: () => void }) {
  const [v, setV] = useState<Pick<Variation, "date" | "description" | "approvedBy"> & { amount: number | null }>({ date: todayIso(), description: "", amount: null, approvedBy: "" });
  const [issues, setIssues] = useState<string[]>([]);
  const save = useProjectMutation(() => projectRepo.addVariation(p.id, { ...v, amount: v.amount ?? 0 }));
  return (
    <Modal
      open
      onClose={onClose}
      title="Add variation"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={save.isPending} onClick={() => save.mutate(undefined, { onSuccess: onClose, onError: (e) => setIssues(issuesOf(e)) })}>
            Add
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <TextField label="Date" required type="date" value={v.date} onChange={(date) => setV({ ...v, date })} />
        <TextArea label="Description" required rows={2} value={v.description} onChange={(description) => setV({ ...v, description })} />
        <NumberField label="Amount before GST (₹; negative for a reduction)" required value={v.amount} onChange={(amount) => setV({ ...v, amount })} />
        <TextField label="Approved by" required value={v.approvedBy} onChange={(approvedBy) => setV({ ...v, approvedBy })} placeholder="Client's name" />
        <ErrorList issues={issues} />
      </div>
    </Modal>
  );
}

function PaymentDialog({ p, onClose }: { p: Project; onClose: () => void }) {
  const toast = useToast();
  const m = p.money!;
  const [f, setF] = useState<Pick<Payment, "date" | "mode" | "reference" | "milestoneId"> & { amount: number | null }>({
    date: todayIso(),
    amount: null,
    mode: "neft",
    reference: "",
    milestoneId: "",
  });
  const [issues, setIssues] = useState<string[]>([]);
  const save = useProjectMutation(() => projectRepo.addPayment(p.id, { ...f, amount: f.amount ?? 0 }));
  return (
    <Modal
      open
      onClose={onClose}
      title="Record payment received"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={save.isPending} onClick={() => save.mutate(undefined, { onSuccess: () => (toast("Payment recorded"), onClose()), onError: (e) => setIssues(issuesOf(e)) })}>
            Save payment
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <TextField label="Date" required type="date" value={f.date} onChange={(date) => setF({ ...f, date })} />
        <NumberField label="Amount (₹)" required value={f.amount} onChange={(amount) => setF({ ...f, amount })} />
        <Select label="Mode" value={f.mode} onChange={(mode) => setF({ ...f, mode })} options={PAYMENT_MODES} />
        <TextField label="Reference no." value={f.reference} onChange={(reference) => setF({ ...f, reference })} placeholder="UTR / cheque no." />
        <Select
          className="sm:col-span-2"
          label="Against milestone"
          value={f.milestoneId}
          onChange={(milestoneId) => setF({ ...f, milestoneId })}
          options={[{ value: "", label: "Not against a milestone" }, ...m.milestones.map((x) => ({ value: x.id, label: `${x.name} (${rupee(x.amount)})` }))]}
        />
        <div className="sm:col-span-2">
          <ErrorList issues={issues} />
        </div>
      </div>
    </Modal>
  );
}

/* ---------- E. Documents ---------- */

function DocumentsSection({ p, isAdmin }: { p: Project; isAdmin: boolean }) {
  const toast = useToast();
  const userName = useUserName();
  const [slot, setSlot] = useState<ProjectDocSlot>("po");
  const [busy, setBusy] = useState(false);
  const add = useProjectMutation((doc: Parameters<typeof projectRepo.addDocument>[1]) => projectRepo.addDocument(p.id, doc));
  const remove = useProjectMutation((docId: string) => projectRepo.removeDocument(p.id, docId));
  return (
    <Card
      title="E. Documents"
      description="PO / LOI, approved drawings, anchor bolt plan, contracts, handover certificate."
      actions={
        isAdmin ? (
          <div className="flex flex-wrap items-end gap-2">
            <select aria-label="Document type" value={slot} onChange={(e) => setSlot(e.target.value as ProjectDocSlot)} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
              {PROJECT_DOC_SLOTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
            <label className={`cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-slate-50 ${busy ? "opacity-60" : ""}`}>
              <Icon icon={Upload} size={16} />
            {busy ? "Uploading…" : "Upload"}
              <input
                type="file"
                multiple
                className="hidden"
                aria-label="Upload project documents"
                disabled={busy}
                onChange={async (e) => {
                  const files = Array.from(e.target.files ?? []);
                  e.target.value = "";
                  setBusy(true);
                  for (const f of files) {
                    try {
                      const m = await uploadFile(f);
                      await add.mutateAsync({ slot, fileId: m.id, name: m.name, type: m.type, size: m.size });
                    } catch (err) {
                      toast(err instanceof Error ? err.message : String(err), "error");
                    }
                  }
                  setBusy(false);
                }}
              />
            </label>
          </div>
        ) : null
      }
    >
      <div id="documents">
        {p.documents.length ? (
          <ul className="divide-y divide-slate-100 text-sm">
            {p.documents.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="min-w-0">
                  <span className="flex items-center gap-1 font-medium">
                    <Icon icon={FileText} size={14} className="mr-1 inline-block align-[-2px]" /><FileLink file={d} />
                  </span>
                  <span className="block text-xs text-slate-500">
                    {labelOf(PROJECT_DOC_SLOTS, d.slot)} · {formatBytes(d.size)} · {formatDate(d.uploadedAt)} by {userName(d.uploadedBy)}
                  </span>
                </span>
                {isAdmin ? (
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => {
                      if (!window.confirm(`Remove ${d.name}?`)) return;
                      remove.mutate(d.id, { onSuccess: () => void fileStore.remove(d.fileId).catch(() => undefined) });
                    }}
                  >
                    Remove
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-slate-500">No documents uploaded.</p>
        )}
      </div>
    </Card>
  );
}

/** Details tab: sections A–E and the timeline (F). */
export function ProjectDetails({ p }: { p: Project }) {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="space-y-4">
        <InfoSection p={p} isAdmin={isAdmin} />
        <ClientSection p={p} isAdmin={isAdmin} />
        <PeopleSection p={p} isAdmin={isAdmin} />
        <DocumentsSection p={p} isAdmin={isAdmin} />
      </div>
      <div className="space-y-4">
        {isAdmin && p.money ? <MoneySection p={p} /> : null}
        <Timeline project={p} />
      </div>
    </div>
  );
}
