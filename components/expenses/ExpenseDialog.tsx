"use client";

import { useEffect, useState } from "react";
import { ErrorList } from "@/components/crm/ui";
import { useToast } from "@/components/Providers";
import { Button, NumberField, Select, TextArea, TextField } from "@/components/ui/fields";
import { Modal } from "@/components/ui/overlays";
import { expenseRepo } from "@/lib/expenses";
import { CASUAL_LABOUR_CATEGORY } from "@/lib/expenses/config";
import { useExpenseCategories, useExpenseMutation } from "@/lib/expenses/hooks";
import type { CasualFill, CasualLine, DuplicateHit, Expense, ExpenseInput, ExpensePayment } from "@/lib/expenses/types";
import { BUDGET_GROUPS, STAGES } from "@/lib/projects/config";
import { currentStage, todayIso } from "@/lib/projects/rules";
import type { Project, StageKey } from "@/lib/projects/types";
import { dayLabel } from "@/lib/attendance/rules";
import { BillPicker, MoneyField, PaymentFields, blankPayment, issuesOf, rupee } from "./bits";
import { HardHat, TriangleAlert, X } from "lucide-react";
import { Icon } from "@/components/ui/icons";

type Mode = "request" | "add" | "edit";

const fromExpense = (e: Expense): ExpenseInput => ({
  date: e.date,
  category: e.category,
  group: e.group,
  description: e.description,
  amountPaise: e.amountPaise,
  gstPaise: e.gstPaise,
  paidTo: e.paidTo,
  quantity: e.quantity,
  unit: e.unit,
  stage: e.stage ?? "",
  bill: e.bill,
  billNumber: e.billNumber,
  casual: e.casual,
});

/** The day's casual workers (from site attendance) with their daily rate; lines can be removed or re-rated. */
function CasualPanel({ fill, lines, onLines }: { fill: CasualFill; lines: CasualLine[]; onLines: (l: CasualLine[]) => void }) {
  const total = lines.reduce((s, l) => s + l.amountPaise, 0);
  return (
    <div className="space-y-2 rounded-lg border border-sky-200 bg-sky-50/50 p-3" data-testid="casual-fill">
      <div className="text-sm font-semibold text-slate-800">
        Casual workers on {dayLabel(fill.date)} ({lines.length})
      </div>
      {fill.existing ? (
        <p className="text-sm font-medium text-red-700">Casual labour for this day is already requested ({fill.existing.code}).</p>
      ) : null}
      {!fill.lines.length ? <p className="text-sm text-slate-600">No casual workers are marked present at this site on this day.</p> : null}
      {lines.length ? (
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-slate-500">
            <tr>
              <th className="py-1">Worker</th>
              <th>Status</th>
              <th className="w-32 text-right">Daily rate</th>
              <th className="text-right">Amount</th>
              <th />
            </tr>
          </thead>
          <tbody className="divide-y divide-sky-100">
            {lines.map((l, i) => (
              <tr key={l.workerId}>
                <td className="py-1">{l.name}</td>
                <td>{l.status === "present" ? "Present" : "Half day"}</td>
                <td className="py-1">
                  <MoneyField
                    value={l.ratePaise || null}
                    placeholder={`Rate for ${l.name}`}
                    onChange={(r) => {
                      const rate = r ?? 0;
                      onLines(lines.map((x, j) => (j === i ? { ...x, ratePaise: rate, amountPaise: x.status === "present" ? rate : Math.round(rate / 2) } : x)));
                    }}
                  />
                </td>
                <td className="text-right tabular-nums">{rupee(l.amountPaise)}</td>
                <td className="text-right">
                  <button type="button" aria-label={`Remove ${l.name}`} className="px-2 text-xs text-slate-400 hover:text-red-700" onClick={() => onLines(lines.filter((_, j) => j !== i))}>
                    <Icon icon={X} size={16} />
                  </button>
                </td>
              </tr>
            ))}
            <tr className="font-semibold">
              <td className="py-1" colSpan={3}>
                Total (present = full rate, half day = half)
              </td>
              <td className="text-right tabular-nums">{rupee(total)}</td>
              <td />
            </tr>
          </tbody>
        </table>
      ) : null}
      {fill.unrated.length ? <p className="text-xs text-amber-800">No daily rate in the register for: {fill.unrated.join(", ")}. Enter the rate above.</p> : null}
    </div>
  );
}

const blank = (project: Project, date: string): ExpenseInput => ({
  date,
  category: "",
  group: "",
  description: "",
  amountPaise: null,
  gstPaise: null,
  paidTo: "",
  quantity: null,
  unit: "",
  stage: currentStage(project.stages) ?? "",
  bill: null,
  billNumber: "",
  casual: null,
});

/** Fills the form from the day's casual workers. */
function casualInput(x: ExpenseInput, r: CasualFill): ExpenseInput {
  const n = r.lines.length;
  return {
    ...x,
    date: r.date,
    category: CASUAL_LABOUR_CATEGORY,
    group: "",
    stage: "erection",
    description: `Casual labour ${r.date.slice(8)}/${r.date.slice(5, 7)}: ${n} worker${n === 1 ? "" : "s"}`,
    amountPaise: r.totalPaise || x.amountPaise,
    paidTo: x.paidTo || "Casual workers (cash)",
    casual: { date: r.date, lines: r.lines },
  };
}

/** Request (site manager), add (Admin, optionally as Accepted / Paid) or edit (Admin, with a reason) an expense. */
export function ExpenseDialog({ project, mode, expense, initialFill, onClose }: { project: Project; mode: Mode; expense?: Expense; initialFill?: CasualFill; onClose: () => void }) {
  const toast = useToast();
  const cats = useExpenseCategories();
  const [f, setF] = useState<ExpenseInput>(() =>
    expense
      ? fromExpense(expense)
      : initialFill
        ? casualInput(blank(project, initialFill.date), initialFill)
        : blank(project, todayIso()),
  );
  const [saveAs, setSaveAs] = useState<"requested" | "accepted" | "paid">(mode === "add" ? "accepted" : "requested");
  const [payment, setPayment] = useState<ExpensePayment>(() => expense?.payment ?? blankPayment());
  const [reason, setReason] = useState("");
  const [issues, setIssues] = useState<string[]>([]);
  const [dups, setDups] = useState<DuplicateHit[]>([]);
  const [fill, setFill] = useState<CasualFill | null>(initialFill ?? null);
  const [loadingFill, setLoadingFill] = useState(false);
  const set = <K extends keyof ExpenseInput>(k: K, v: ExpenseInput[K]) => setF((x) => ({ ...x, [k]: v }));

  const loadCasual = async (date: string) => {
    setLoadingFill(true);
    try {
      const r = await expenseRepo.casualFill(project.id, date);
      setFill(r);
      setF((x) => casualInput(x, r));
    } catch (e) {
      setIssues(issuesOf(e));
    }
    setLoadingFill(false);
  };
  // Possible duplicate bills (warning only).
  useEffect(() => {
    if (!f.billNumber.trim() && !(f.paidTo.trim() && f.amountPaise)) return;
    const t = setTimeout(() => {
      void expenseRepo
        .duplicates(project.id, { billNumber: f.billNumber, paidTo: f.paidTo, amountPaise: f.amountPaise, date: f.date }, expense?.id)
        .then(setDups)
        .catch(() => undefined);
    }, 400);
    return () => clearTimeout(t);
  }, [f.billNumber, f.paidTo, f.amountPaise, f.date, project.id, expense?.id]);
  const shownDups = !f.billNumber.trim() && !(f.paidTo.trim() && f.amountPaise) ? [] : dups;

  const save = useExpenseMutation(() => {
    if (mode === "edit") return expenseRepo.edit(expense!.id, f, reason, expense!.status === "paid" ? payment : undefined);
    return expenseRepo.create(project.id, f, mode === "add" ? { status: saveAs, ...(saveAs === "paid" ? { payment } : {}) } : { status: "requested" });
  });
  const isCasual = !!f.casual;
  const spendEdit = mode === "edit" && (expense!.status === "accepted" || expense!.status === "paid");
  const blocked = !!fill?.existing && !expense;

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={mode === "edit" ? `Edit ${expense!.code}` : mode === "add" ? "Add expense" : "Request expense"}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={save.isPending || blocked}
            onClick={() =>
              save.mutate(undefined, {
                onSuccess: (e) => {
                  toast(mode === "edit" ? `${e.code} saved` : mode === "add" ? `${e.code} added` : `${e.code} requested – admins notified`);
                  onClose();
                },
                onError: (e) => setIssues(issuesOf(e)),
              })
            }
          >
            {mode === "request" ? "Send request" : "Save"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {!expense ? (
          <div className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm">
            <span className="text-slate-700">Casual (daily-wage) labour?</span>
            <Button size="sm" disabled={loadingFill} onClick={() => void loadCasual(f.date > todayIso() ? todayIso() : f.date)}>
              <Icon icon={HardHat} size={14} className="mr-1 inline-block align-[-2px]" />Fill from attendance for {dayLabel(f.date > todayIso() ? todayIso() : f.date)}
            </Button>
            {isCasual ? (
              <button type="button" className="text-xs text-slate-500 hover:underline" onClick={() => (setFill(null), set("casual", null))}>
                Not casual labour
              </button>
            ) : null}
          </div>
        ) : null}
        {fill && isCasual ? <CasualPanel fill={fill} lines={f.casual!.lines} onLines={(lines) => setF((x) => ({ ...x, casual: { date: fill.date, lines }, amountPaise: lines.reduce((s, l) => s + l.amountPaise, 0) || x.amountPaise }))} /> : null}
        {expense?.casual ? (
          <p className="text-xs text-slate-500">
            Casual labour for {dayLabel(expense.casual.date)}: {expense.casual.lines.length} workers.
          </p>
        ) : null}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <TextField
            label="Date of expense"
            required
            type="date"
            value={f.date}
            onChange={(date) => {
              set("date", date);
              if (isCasual && date && date <= todayIso()) void loadCasual(date);
            }}
          />
          <Select
            label="Work stage (budget) *"
            value={f.category}
            onChange={(category) => setF((x) => ({ ...x, category, group: "" }))}
            options={[{ value: "", label: "Choose…" }, ...cats.items.map((c) => ({ value: c.value, label: c.label }))]}
            hint={f.category ? BUDGET_GROUPS.find((g) => g.value === f.category)?.hint : "The budget line in Details → Money this spend counts against."}
          />
          <TextField className="sm:col-span-2" label="Description" required value={f.description} onChange={(v) => set("description", v)} placeholder="e.g. Crane hire for rafter lifting, 8 hours" />
          <MoneyField label="Amount incl. GST" required value={f.amountPaise} onChange={(v) => set("amountPaise", v)} />
          <MoneyField label="GST included" value={f.gstPaise} onChange={(v) => set("gstPaise", v)} hint="The GST part, if there is a GST bill." />
          <TextField label="Paid to" required value={f.paidTo} onChange={(v) => set("paidTo", v)} placeholder="Vendor, contractor or person" />
          <div className="grid grid-cols-[1fr_7rem] gap-2">
            <NumberField label="Quantity" value={f.quantity} onChange={(v) => set("quantity", v)} />
            <TextField label="Unit" value={f.unit} onChange={(v) => set("unit", v)} placeholder="hours, MT…" />
          </div>
          <Select<StageKey | "">
            label="Project stage"
            value={f.stage}
            onChange={(v) => set("stage", v)}
            options={[{ value: "", label: "Not linked" }, ...STAGES.map((s) => ({ value: s.key, label: s.label }))]}
          />
          <TextField label="Bill number" value={f.billNumber} onChange={(v) => set("billNumber", v)} />
          <BillPicker bill={f.bill} onChange={(b) => set("bill", b)} />
        </div>

        {shownDups.length ? (
          <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900" data-testid="duplicate-warning">
            <Icon icon={TriangleAlert} size={14} className="mr-1 inline-block align-[-2px]" />Possible duplicate: {shownDups.map((d) => `${d.code} (${d.why})`).join("; ")}. You can still save.
          </div>
        ) : null}

        {mode === "add" ? (
          <div className="space-y-3 rounded-lg border border-slate-200 p-3">
            <Select
              label="Save as"
              value={saveAs}
              onChange={setSaveAs}
              options={[
                { value: "requested", label: "Requested (approve later)" },
                { value: "accepted", label: "Accepted" },
                { value: "paid", label: "Paid" },
              ]}
            />
            {saveAs === "paid" ? <PaymentFields value={payment} onChange={setPayment} /> : null}
          </div>
        ) : null}
        {mode === "edit" && expense!.status === "paid" ? (
          <div className="space-y-2 rounded-lg border border-slate-200 p-3">
            <div className="text-sm font-semibold text-slate-800">Payment</div>
            <PaymentFields value={payment} onChange={setPayment} />
          </div>
        ) : null}
        {mode === "edit" ? (
          <TextArea
            label={spendEdit ? "Reason for the change" : "Reason (optional)"}
            required={spendEdit}
            rows={2}
            value={reason}
            onChange={setReason}
            placeholder={spendEdit ? "Needed when the amount or work stage changes" : ""}
          />
        ) : null}
        {mode === "request" ? <p className="text-xs text-slate-500">An admin accepts or rejects the request. You can&apos;t change it after sending; ask an admin if something is wrong.</p> : null}
        <ErrorList issues={issues} />
      </div>
    </Modal>
  );
}
