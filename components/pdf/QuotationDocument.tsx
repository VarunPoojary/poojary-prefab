import React from "react";
import { Document, Image, Page, Text, View } from "@react-pdf/renderer";
import { COMPANY } from "@/config/company";
import { areaTotals, boqTotals, shedArea, shedSize } from "@/lib/calc";
import { amountInWords, formatINR } from "@/lib/money";
import { fillTemplate, formatLongDate, templateVars } from "@/lib/template";
import type { Quotation } from "@/lib/types";
import { Letterhead } from "./Letterhead";
import { Cell, RichText } from "./primitives";
import { BORDER, registerFonts, s } from "./styles";

interface DocProps {
  q: Quotation;
  /** Origin (browser) or absolute path to the public folder (node), used to resolve fonts & images. */
  assetBase: string;
}

const asset = (base: string, src: string) => (src.startsWith("/") ? `${base}${src}` : src);

function CoverPage({ q, base }: { q: Quotation; base: string }) {
  const label = { fontSize: 10.5, color: "#333" };
  return (
    <View>
      <View style={[s.table, { marginBottom: 14 }]}>
        <View style={s.row}>
          <Cell w={64} textStyle={{ fontFamily: "Times-Roman", fontSize: 14 }}>
            {q.client.company}
          </Cell>
          <Cell w={12} textStyle={label}>Offer No</Cell>
          <Cell w={24}>{q.meta.offerNo}</Cell>
        </View>
        <View style={s.row}>
          <Cell w={64}>{q.client.city}</Cell>
          <Cell w={12} textStyle={label}>Date</Cell>
          <Cell w={24}>{formatLongDate(q.meta.date)}</Cell>
        </View>
        <View style={s.row}>
          <Cell w={64}>
            <Text style={{ fontSize: 8.5 }}>
              <Text style={s.bold}>Kind Attention: </Text>
              <Text style={s.bold}>{q.client.attentionName}</Text>
              {q.client.attentionDesignation ? `, ${q.client.attentionDesignation}` : ""}
            </Text>
          </Cell>
          <Cell w={12} textStyle={label}>Revision</Cell>
          <Cell w={24}>{q.meta.revision}</Cell>
        </View>
      </View>
      <View style={[s.table, { marginBottom: 22 }]}>
        <View style={s.row}>
          <Cell w={20} textStyle={label}>Subject</Cell>
          <Cell w={80} textStyle={[s.bold, { fontSize: 9 }]}>
            {q.meta.subject}
          </Cell>
        </View>
        <View style={s.row}>
          <Cell w={20} textStyle={label}>Site Location</Cell>
          <Cell w={80}>{q.meta.siteLocation}</Cell>
        </View>
      </View>
      <Text style={s.p}>{q.letter.salutation}</Text>
      {q.letter.body
        .split(/\n\s*\n/)
        .map((p) => p.trim())
        .filter((p) => p.trim())
        .map((p, i) => (
          <Text key={i} style={[s.p, { marginBottom: 10 }]}>
            {p}
          </Text>
        ))}
      <Signature
        lead={q.letter.closing}
        q={q}
        base={base}
        company={COMPANY.name}
        showSignature={q.letter.showSignature}
        showStamp={false}
      />
    </View>
  );
}

function Signature(props: {
  lead: string;
  q: Quotation;
  base: string;
  company: string;
  showSignature: boolean;
  showStamp: boolean;
}) {
  const { lead, q, base, company, showSignature, showStamp } = props;
  return (
    <View wrap={false} style={{ marginTop: 4 }}>
      <Text>{lead}</Text>
      <View style={{ height: 46, flexDirection: "row", alignItems: "center" }}>
        {/* eslint-disable-next-line jsx-a11y/alt-text */}
        {showSignature && <Image src={asset(base, COMPANY.assets.signature)} style={{ height: 42, width: 34 }} />}
        {/* eslint-disable-next-line jsx-a11y/alt-text */}
        {showStamp && <Image src={asset(base, COMPANY.assets.stamp)} style={{ height: 46, width: 50, marginLeft: 8 }} />}
      </View>
      <Text>
        {q.letter.signatoryName} | {q.letter.signatoryDesignation}
      </Text>
      <Text>For {company}</Text>
    </View>
  );
}

function BoqTable({ q }: { q: Quotation }) {
  const { boq, gstRate } = q.pricing;
  const t = boqTotals(boq.items, gstRate);
  const W = { sr: 5, item: 38, uom: 7, qty: 8, sRate: 10, sAmt: 11, iRate: 9, iAmt: 12 };
  const num = (n: number | null) => (n === null ? "" : formatINR(n));
  const tf = s.tableFont;
  const r = [tf, s.right];
  const hb = [s.th, s.center];
  return (
    <View style={[s.table, tf]}>
      <View style={s.row} wrap={false}>
        <Cell w={100} textStyle={hb}>
          {boq.heading}
        </Cell>
      </View>
      <View style={s.row} wrap={false}>
        <Cell w={W.sr + W.item + W.uom} />
        <Cell w={W.qty + W.sRate + W.sAmt} textStyle={[tf, s.center]}>
          {boq.supplyLabel}
        </Cell>
        <Cell w={W.iRate + W.iAmt} textStyle={[tf, s.th, s.center, { fontSize: 9 }]}>
          {boq.installLabel}
        </Cell>
      </View>
      <View style={s.row} wrap={false}>
        <Cell w={W.sr} textStyle={s.th}>Sr No</Cell>
        <Cell w={W.item} textStyle={s.th}>Items</Cell>
        <Cell w={W.uom} textStyle={s.th}>UOM</Cell>
        <Cell w={W.qty} textStyle={s.th}>Qty</Cell>
        <Cell w={W.sRate} textStyle={s.th}>Rate</Cell>
        <Cell w={W.sAmt} textStyle={s.th}>Amount</Cell>
        <Cell w={W.iRate} textStyle={s.th}>Rate</Cell>
        <Cell w={W.iAmt} textStyle={s.th}>Amount</Cell>
      </View>
      {boq.items.map((it, i) => {
        const c = t.rows[i];
        return (
          <View key={it.id} style={s.row} wrap={false}>
            <Cell w={W.sr}>{String(i + 1)}</Cell>
            <Cell w={W.item}>
              <Text>
                {it.title ? (
                  <Text style={{ fontWeight: "bold", color: "#C00000", textDecoration: "underline" }}>{it.title}</Text>
                ) : null}
                {it.title ? " " : ""}
                {it.description}
                {it.sizeLine ? ` ${it.sizeLine}` : ""}
              </Text>
            </Cell>
            <Cell w={W.uom}>{it.uom}</Cell>
            <Cell w={W.qty} textStyle={r}>{num(it.qty)}</Cell>
            <Cell w={W.sRate} textStyle={r}>{num(it.supplyRate)}</Cell>
            <Cell w={W.sAmt} textStyle={r}>{num(c.supplyAmount)}</Cell>
            <Cell w={W.iRate} textStyle={r}>{num(it.installRate)}</Cell>
            <Cell w={W.iAmt} textStyle={r}>{num(c.installAmount)}</Cell>
          </View>
        );
      })}
      {[
        { label: "Total basic value", a: t.supplyBasic, b: t.installBasic, bold: true },
        { label: `GST @${gstRate ?? 0}%`, a: t.supplyGst, b: t.installGst, bold: false },
        { label: "Total value", a: t.supplyTotal, b: t.installTotal, bold: true },
      ].map((row) => {
        const st = row.bold ? [s.th, s.right] : r;
        return (
          <View key={row.label} style={[s.row, s.shaded]} wrap={false}>
            <Cell w={W.sr} />
            <Cell w={W.item} textStyle={row.bold ? s.th : tf}>{row.label}</Cell>
            <Cell w={W.uom} />
            <Cell w={W.qty} />
            <Cell w={W.sRate} />
            <Cell w={W.sAmt} textStyle={st}>{formatINR(row.a)}</Cell>
            <Cell w={W.iRate} />
            <Cell w={W.iAmt} textStyle={st}>{formatINR(row.b)}</Cell>
          </View>
        );
      })}
      <View style={s.row} wrap={false}>
        <Cell w={100 - W.iAmt} textStyle={[s.th, { fontSize: 11 }]}>Total cost for Supply and installation</Cell>
        <Cell w={W.iAmt} textStyle={[s.th, s.right, { fontSize: 11 }]}>{formatINR(t.grandTotal)}</Cell>
      </View>
      <View style={s.row} wrap={false}>
        <Cell w={100} textStyle={[tf, { fontStyle: "italic" }]}>
          {`Amount in words: ${amountInWords(t.grandTotal)}`}
        </Cell>
      </View>
    </View>
  );
}

function AreaTable({ q }: { q: Quotation }) {
  const { area, gstRate, hsnCode } = q.pricing;
  const t = areaTotals(area.rows, gstRate);
  const u = area.unit === "ft2" ? { sup: "ft²", rate: "SQF" } : { sup: "m²", rate: "SQM" };
  const W = { sl: 6, name: 27, area: 10, units: 7, total: 11, rate: 13, amt: 14, per: 12 };
  const tf = s.tableFont;
  const r = [tf, s.right];
  const c = [tf, s.center];
  const hd = [s.th, s.center];
  const site = q.meta.projectName || q.meta.siteLocation;
  const title = area.titleOverride || `Client: ${q.client.company}${site ? `  Site: ${site}` : ""}`;
  return (
    <View style={[s.table, tf]}>
      <View style={s.row} wrap={false}>
        <Cell w={100} textStyle={[s.th, s.center, { fontSize: 11 }]}>{title}</Cell>
      </View>
      <View style={s.row} wrap={false}>
        <Cell w={W.sl} textStyle={hd}>Sl No</Cell>
        <Cell w={W.name} textStyle={hd}>Structure Name</Cell>
        <Cell w={W.area} textStyle={hd}>{`Area ${u.sup}`}</Cell>
        <Cell w={W.units} textStyle={hd}>Total Unit</Cell>
        <Cell w={W.total} textStyle={hd}>{`Total area (${u.sup})`}</Cell>
        <Cell w={W.rate} textStyle={hd}>Rate per unit</Cell>
        <Cell w={W.amt} textStyle={hd}>Amount</Cell>
        <Cell w={W.per} textStyle={hd}>{`Rate per ${u.rate}`}</Cell>
      </View>
      {area.rows.map((row, i) => {
        const k = t.rows[i];
        return (
          <View key={row.id} style={s.row} wrap={false}>
            <Cell w={W.sl} textStyle={c}>{String(i + 1)}</Cell>
            <Cell w={W.name} textStyle={c}>{row.name}</Cell>
            <Cell w={W.area} textStyle={r}>{formatINR(row.areaPerUnit)}</Cell>
            <Cell w={W.units} textStyle={c}>{formatINR(row.units)}</Cell>
            <Cell w={W.total} textStyle={r}>{formatINR(k.totalArea)}</Cell>
            <Cell w={W.rate} textStyle={row.notQuoted ? [tf, s.center, { color: "#777" }] : r}>
              {row.notQuoted ? "Not quoted" : formatINR(row.ratePerUnit)}
            </Cell>
            <Cell w={W.amt} textStyle={r}>{row.notQuoted ? "-" : formatINR(k.amount)}</Cell>
            <Cell w={W.per} textStyle={r}>{row.notQuoted ? "-" : formatINR(k.ratePerArea)}</Cell>
          </View>
        );
      })}
      {[
        { label: "Total", v: t.basic },
        { label: `Add GST @${gstRate ?? 0}%${hsnCode ? ` HSN Code ${hsnCode}` : ""}`, v: t.gst },
        { label: "Total Cost", v: t.grandTotal },
      ].map((row, i) => (
        <View key={row.label} style={[s.row, s.shaded]} wrap={false}>
          <Cell w={W.sl} />
          <Cell w={W.name + W.area + W.units + W.total + W.rate} textStyle={[i === 1 ? tf : s.th, s.center]}>
            {row.label}
          </Cell>
          <Cell w={W.amt} textStyle={[i === 1 ? tf : s.th, s.right]}>{formatINR(row.v)}</Cell>
          <Cell w={W.per} />
        </View>
      ))}
      <View style={s.row} wrap={false}>
        <Cell w={100} textStyle={[tf, { fontStyle: "italic" }]}>
          {`Amount in words: ${amountInWords(t.grandTotal)}`}
        </Cell>
      </View>
    </View>
  );
}

function ScopeSection({ q, vars }: { q: Quotation; vars: Record<string, string> }) {
  return (
    <View>
      {q.scope.blocks
        .filter((b) => b.enabled)
        .map((b) => {
          if (b.kind === "workScope") {
            const items = q.scope.workScopeItems.filter((w) => w.heading.trim() || w.bullets.trim());
            if (!items.length) return null;
            return (
              <View key={b.id} style={s.block}>
                {b.title ? (
                  <Text style={s.sectionTitle} minPresenceAhead={60}>
                    {fillTemplate(b.title, vars)}
                  </Text>
                ) : null}
                <Text style={[s.bold, { marginBottom: 4 }]}>Scope of Work:</Text>
                {items.map((w, i) => (
                  <View key={w.id} style={{ marginBottom: 4 }}>
                    <Text style={s.bold} minPresenceAhead={30}>
                      {i + 1}. {w.heading}
                    </Text>
                    {w.bullets
                      .split("\n")
                      .filter((l) => l.trim())
                      .map((l, j) => (
                        <View key={j} style={s.bulletRow}>
                          <Text style={s.bulletMark}>•</Text>
                          <Text style={s.flex1}>{fillTemplate(l.replace(/^\s*[-•]\s*/, ""), vars)}</Text>
                        </View>
                      ))}
                  </View>
                ))}
              </View>
            );
          }
          return (
            <View key={b.id} style={s.block}>
              {b.title ? (
                  <Text style={s.sectionTitle} minPresenceAhead={60}>
                    {fillTemplate(b.title, vars)}
                  </Text>
                ) : null}
              <RichText text={fillTemplate(b.text, vars)} />
            </View>
          );
        })}
    </View>
  );
}

function TermsSection({ q, vars }: { q: Quotation; vars: Record<string, string> }) {
  const clauses = q.terms.clauses.filter((c) => c.enabled && (c.title.trim() || c.text.trim()));
  return (
    <View>
      <Text style={s.underlineTitle} minPresenceAhead={80}>
        Terms and conditions:
      </Text>
      {clauses.map((c, i) => (
        <View key={c.id} style={{ flexDirection: "row", marginBottom: 6, paddingLeft: 6 }}>
          <Text style={{ width: 22 }}>{i + 1}.</Text>
          <View style={{ flex: 1 }}>
            <RichText text={fillTemplate(c.text, vars)} lead={c.title.trim() || undefined} />
          </View>
        </View>
      ))}
    </View>
  );
}

function MatrixTable({ q }: { q: Quotation }) {
  const tick = (on: boolean, text: string) => (on ? (q.matrix.style === "tick" ? "√" : text) : "");
  const tf = [s.tableFont, { color: "#333" }];
  return (
    <View>
      <Text style={s.underlineTitle} minPresenceAhead={80}>
        Scope matrix:
      </Text>
      <View style={[s.table, s.tableFont]}>
        <View style={s.row} wrap={false}>
          <Cell w={7} textStyle={s.th}>S No.</Cell>
          <Cell w={67} textStyle={s.th}>Description</Cell>
          <Cell w={13} textStyle={[s.th, s.center]}>Client&apos;s Scope</Cell>
          <Cell w={13} textStyle={[s.th, s.center]}>PPPL&apos;s Scope</Cell>
        </View>
        {q.matrix.rows.map((r, i) => (
          <View key={r.id} style={s.row} wrap={false}>
            <Cell w={7} textStyle={tf}>{String(i + 1)}</Cell>
            <Cell w={67} textStyle={tf}>{r.description}</Cell>
            <Cell w={13} textStyle={[...tf, s.center]}>{tick(r.client, "Client")}</Cell>
            <Cell w={13} textStyle={[...tf, s.center]}>{tick(r.pppl, "PPPL")}</Cell>
          </View>
        ))}
      </View>
    </View>
  );
}

function ShedTable({ q }: { q: Quotation }) {
  const a = q.annexures;
  const plural = (n: number | null, unit: string) =>
    n === null ? "" : `${formatINR(n)} ${unit}${n !== 1 && unit && !unit.endsWith("s") ? "s" : ""}`;
  const tf = s.tableFont;
  return (
    <View style={{ marginTop: 14 }}>
      {a.shedIntro ? (
        <Text style={{ textDecoration: "underline", marginBottom: 6 }} minPresenceAhead={80}>
          {a.shedIntro}
        </Text>
      ) : null}
      <View style={[s.table, tf]}>
        <View style={s.row} wrap={false}>
          <Cell w={100} textStyle={[s.th, s.center]}>{a.shedTitle}</Cell>
        </View>
        <View style={s.row} wrap={false}>
          <Cell w={6} textStyle={[s.th, s.center]}>S no</Cell>
          <Cell w={52} textStyle={[s.th, s.center]}>Items</Cell>
          <Cell w={14} textStyle={s.th}>Qty</Cell>
          <Cell w={14} textStyle={s.th}>Size</Cell>
          <Cell w={14} textStyle={[s.th, s.right]}>Area in SQM</Cell>
        </View>
        {a.shedRows.map((r, i) => (
          <View key={r.id} style={s.row} wrap={false}>
            <Cell w={6} textStyle={[tf, s.center]}>{String(i + 1)}</Cell>
            <Cell w={52}>{r.description}</Cell>
            <Cell w={14}>{plural(r.qty, r.qtyUnit)}</Cell>
            <Cell w={14}>{shedSize(r)}</Cell>
            <Cell w={14} textStyle={[tf, s.right]}>{formatINR(shedArea(r))}</Cell>
          </View>
        ))}
      </View>
    </View>
  );
}

export function QuotationDocument({ q, assetBase }: DocProps) {
  registerFonts(assetBase);
  const vars = templateVars(q);
  const a = q.annexures;
  return (
    <Document
      title={`Quotation ${q.meta.offerNo} – ${q.client.company}`}
      author={COMPANY.name}
      subject={q.meta.subject}
      creator="Poojary Prefab Quotation Maker"
    >
      <Page size="A4" style={s.page}>
        <Letterhead base={assetBase} />
        <CoverPage q={q} base={assetBase} />

        <View break>
          <Text style={s.p}>{q.letter.salutation}</Text>
          <Text style={[s.p, { marginBottom: 12 }]}>{fillTemplate(q.pricing.introText, vars)}</Text>
          {q.pricing.mode === "boq" ? <BoqTable q={q} /> : <AreaTable q={q} />}
          {q.pricing.noteText.trim() ? (
            <Text style={[s.bold, { marginTop: 10 }]}>{fillTemplate(q.pricing.noteText, vars)}</Text>
          ) : null}
          {q.pricing.mode === "area" && q.pricing.area.showExcelNote && q.pricing.area.excelNote.trim() ? (
            <Text style={{ marginTop: 8 }}>{q.pricing.area.excelNote}</Text>
          ) : null}
        </View>

        <View style={{ marginTop: 12 }}>
          <ScopeSection q={q} vars={vars} />
        </View>

        <TermsSection q={q} vars={vars} />

        <View wrap={false} style={{ marginTop: 6 }}>
          <Text style={[s.p, { textAlign: "left" }]}>{q.terms.closingText}</Text>
          <Signature
            lead="Regards"
            q={q}
            base={assetBase}
            company={COMPANY.legalName}
            showSignature={q.letter.showSignature}
            showStamp={q.terms.showStamp}
          />
        </View>

        {q.matrix.enabled && q.matrix.rows.length > 0 ? (
          <View style={{ marginTop: 18 }}>
            <MatrixTable q={q} />
          </View>
        ) : null}

        {a.shedEnabled && a.shedRows.length > 0 ? <ShedTable q={q} /> : null}

        {a.notesEnabled && a.notes.trim() ? (
          <View style={{ marginTop: 14 }}>
            <RichText text={fillTemplate(a.notes, vars)} />
          </View>
        ) : null}

        {a.photosEnabled && a.photos.length > 0 ? (
          <View break>
            <Text style={[s.underlineTitle, { marginTop: 0 }]}>{a.photosTitle}</Text>
            {a.photos.map((p) => (
              <View key={p.id} wrap={false} style={{ marginBottom: 14, borderBottomWidth: 0, borderColor: BORDER }}>
                {/* eslint-disable-next-line jsx-a11y/alt-text */}
                <Image src={asset(assetBase, p.src)} style={{ maxHeight: 260, objectFit: "contain" }} />
                {p.caption ? <Text style={[s.center, { fontSize: 9.5, marginTop: 4 }]}>{p.caption}</Text> : null}
              </View>
            ))}
          </View>
        ) : null}
      </Page>
    </Document>
  );
}
