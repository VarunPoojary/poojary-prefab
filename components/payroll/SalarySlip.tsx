"use client";

import { Document, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer";
import { COMPANY } from "@/config/company";
import { Letterhead } from "@/components/pdf/Letterhead";
import { registerFonts, s as base } from "@/components/pdf/styles";
import { formatDate } from "@/lib/format";
import { amountInWords } from "@/lib/money";
import { formatPaise, type Paise } from "@/lib/paise";
import { monthLabel } from "@/lib/payroll/calc";
import { payModeLabel, payTypeLabel } from "@/lib/payroll/config";
import type { EmployeeMonthView } from "@/lib/payroll/types";

// The PDF fonts have no ₹ sign, so amounts print as "Rs.".
const rs = (p: Paise, always = false) => formatPaise(p, { always }).replace("₹", "Rs. ");

const st = StyleSheet.create({
  title: { fontSize: 15, fontWeight: "bold", fontFamily: "Helvetica-Bold", color: "#71090D", textAlign: "center", marginBottom: 12 },
  box: { borderWidth: 0.8, borderColor: "#999999", marginBottom: 10 },
  head: { backgroundColor: "#F2F2F2", paddingVertical: 4, paddingHorizontal: 6, fontFamily: "Helvetica-Bold", fontSize: 10 },
  row: { flexDirection: "row", borderTopWidth: 0.5, borderTopColor: "#CCCCCC", paddingVertical: 3, paddingHorizontal: 6 },
  label: { flex: 1, fontSize: 9.5, color: "#333333" },
  value: { width: 150, fontSize: 9.5, textAlign: "right" },
  strong: { fontFamily: "Helvetica-Bold" },
  grid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 6, paddingVertical: 4 },
  cell: { width: "50%", flexDirection: "row", paddingVertical: 2 },
  small: { fontSize: 8, color: "#555555", marginTop: 8 },
});

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={st.row}>
      <Text style={[st.label, strong ? st.strong : {}]}>{label}</Text>
      <Text style={[st.value, strong ? st.strong : {}]}>{value}</Text>
    </View>
  );
}

export function SalarySlipDocument({ v, assetBase }: { v: EmployeeMonthView; assetBase: string }) {
  registerFonts(assetBase);
  const c = v.closed!;
  const calc = c.calc;
  const f = c.figures;
  const e = v.employee;
  const payments = v.payments.filter((p) => p.type !== "advance");
  const info: [string, string][] = [
    ["Employee", e.name],
    ["Employee ID", e.code],
    ["Designation", e.designation],
    ["Department", e.department],
    ["Date of joining", formatDate(e.dateOfJoining)],
    ["Month", monthLabel(v.month)],
  ];
  return (
    <Document title={`Salary slip ${monthLabel(v.month)} – ${e.name}`} author={COMPANY.name} creator="Poojary Prefab">
      <Page size="A4" style={base.page}>
        <Letterhead base={assetBase} />
        <Text style={st.title}>SALARY SLIP – {monthLabel(v.month).toUpperCase()}</Text>
        <View style={st.box}>
          <View style={st.grid}>
            {info.map(([k, val]) => (
              <View key={k} style={st.cell}>
                <Text style={{ width: 90, fontSize: 9.5, color: "#555555" }}>{k}</Text>
                <Text style={{ fontSize: 9.5, fontFamily: "Helvetica-Bold" }}>{val}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={st.box}>
          <Text style={st.head}>Attendance ({calc.daysInMonth} days)</Text>
          <Row label="Present" value={String(calc.counts.present)} />
          <Row label="Half days" value={String(calc.counts.half)} />
          <Row label="Absent" value={String(calc.counts.absent)} />
          <Row label="Holidays (paid)" value={String(calc.counts.holiday)} />
          {calc.counts.outside ? <Row label="Days outside employment" value={String(calc.counts.outside)} /> : null}
          <Row label="Loss-of-pay days (Absent + ½ × Half days + outside employment)" value={String(calc.lopDays)} />
          <Row label="Paid days (of a fixed 30-day month)" value={String(calc.payableDays)} strong />
        </View>

        <View style={st.box}>
          <Text style={st.head}>Salary</Text>
          {calc.segments.length > 1
            ? calc.segments.map((sg) => <Row key={sg.from} label={`Monthly salary ${formatDate(sg.from)} – ${formatDate(sg.to)} (${sg.days} days)`} value={rs(sg.monthlyPaise)} />)
            : null}
          <Row label={calc.segments.length > 1 ? "Monthly salary for the month (weighted by days)" : "Monthly salary"} value={rs(calc.salaryPaise, calc.segments.length > 1)} />
          <Row label="Daily rate (monthly salary ÷ 30)" value={rs(calc.dailyRatePaise, true)} />
          <Row label="Loss of pay" value={`− ${rs(calc.lopDeductionPaise)}`} />
          <Row label="Gross salary (daily rate × paid days, rounded to the rupee)" value={rs(f.grossPaise)} strong />
          {c.oneOffs.map((o, i) => (
            <Row key={i} label={`${o.amountPaise > 0 ? "Addition" : "Deduction"}: ${o.label} (${o.reason})`} value={`${o.amountPaise > 0 ? "+" : "−"} ${rs(Math.abs(o.amountPaise))}`} />
          ))}
          {c.adjustments.map((a) => (
            <Row key={a.fromMonth} label={`Adjustment for ${monthLabel(a.fromMonth)}`} value={`${a.amountPaise >= 0 ? "+" : "−"} ${rs(Math.abs(a.amountPaise))}`} />
          ))}
          <Row label="Advance recovered" value={`− ${rs(f.recoveryPaise)}`} />
          <Row label="Net payable" value={rs(f.netPaise)} strong />
          <View style={st.row}>
            <Text style={{ fontSize: 9, fontStyle: "italic" }}>{amountInWords(Math.round(f.netPaise / 100))}</Text>
          </View>
        </View>

        <View style={st.box}>
          <Text style={st.head}>Payments for this month</Text>
          {payments.length ? (
            payments.map((p) => (
              <Row key={p.id} label={`${formatDate(p.date)} · ${payTypeLabel(p.type)} · ${payModeLabel(p.mode)}${p.reference ? ` ${p.reference}` : ""}`} value={rs(p.amountPaise, true)} />
            ))
          ) : (
            <Row label="No payment recorded yet" value="" />
          )}
          <Row label="Balance to pay" value={rs(v.balancePaise, true)} strong />
          <Row label="Advance outstanding after this month" value={rs(Math.max(0, c.outstandingPaise - f.recoveryPaise + f.shortfallPaise))} />
        </View>
        <Text style={st.small}>
          Computer-generated salary slip. Salary = monthly salary ÷ 30 × (30 − loss-of-pay days); holidays are paid. Closed on {formatDate(c.closedAt.slice(0, 10))}. {COMPANY.name}
        </Text>
      </Page>
    </Document>
  );
}

export async function downloadSalarySlip(v: EmployeeMonthView) {
  const blob = await pdf(<SalarySlipDocument v={v} assetBase={window.location.origin} />).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Salary_slip_${v.month}_${v.employee.name.replace(/\s+/g, "_")}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
