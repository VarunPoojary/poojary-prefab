import { createQuotation, emptyAreaRow, libraryBoqItem, PRESETS } from "@/lib/defaults";
import type { Quotation } from "@/lib/types";
import { SEED_QUOTE_LINKS, seedEnquiryNumbers, seedQuoteId } from "@/lib/crm/seed-links";
import { SCHEMA_VERSION, type QuotationRecord, type QuotationStatus } from "./types";

/*
 * Demo data for the temporary browser storage. Replace with real data from the API later.
 * The three "real" quotations come from the presets; the rest are made up for testing
 * search, filters and sorting.
 */

const preset = (key: string) => PRESETS.find((p) => p.key === key)!.create();

function boq(o: {
  offerNo: string;
  revision?: string;
  date: string;
  client: string;
  city: string;
  attention: string;
  subject: string;
  site: string;
  items: { key: string; qty: number; supply: number; install: number; size?: string }[];
  completionDays?: number;
}): Quotation {
  const q = createQuotation("boq");
  q.meta = { offerNo: o.offerNo, date: o.date, revision: o.revision ?? "00", subject: o.subject, siteLocation: o.site, projectName: "" };
  q.client = { company: o.client, city: o.city, attentionName: o.attention, attentionDesignation: "" };
  q.pricing.boq.items = o.items.map((i) =>
    libraryBoqItem(i.key, { qty: i.qty, supplyRate: i.supply, installRate: i.install, ...(i.size !== undefined ? { sizeLine: i.size } : {}) }),
  );
  if (o.completionDays) q.terms.params.completionDays = o.completionDays;
  return q;
}

function area(o: {
  offerNo: string;
  date: string;
  client: string;
  city: string;
  attention: string;
  site: string;
  project: string;
  rows: [string, number, number, number | null][];
}): Quotation {
  const q = createQuotation("area");
  q.meta = {
    offerNo: o.offerNo,
    date: o.date,
    revision: "00",
    subject: "Design, Fabrication, and Installation of Prefabricated Buildings",
    siteLocation: o.site,
    projectName: o.project,
  };
  q.client = { company: o.client, city: o.city, attentionName: o.attention, attentionDesignation: "" };
  q.letter.salutation = "Dear Sir/Madam,";
  q.pricing.area.rows = o.rows.map(([name, areaPerUnit, units, ratePerUnit]) =>
    emptyAreaRow({ name, areaPerUnit, units, ratePerUnit, notQuoted: ratePerUnit === null }),
  );
  return q;
}

interface SeedItem {
  data: Quotation;
  status: QuotationStatus;
  /** How long ago (hours) the record was last updated – gives the list a realistic order. */
  updatedHoursAgo: number;
}

export function seedItems(): SeedItem[] {
  return [
    { data: preset("sample-agartala"), status: "final", updatedHoursAgo: 24 * 360 },
    { data: preset("sample-poly"), status: "final", updatedHoursAgo: 24 * 158 },
    { data: preset("sample-stairs"), status: "final", updatedHoursAgo: 24 * 155 },
    {
      data: boq({
        offerNo: "15",
        date: "2024-07-02",
        client: "Kalyani Steels Ltd.",
        city: "Pune",
        attention: "Mr. Prakash Joshi",
        subject: "Supply and installation of Prefab warehouse shed",
        site: "Chakan, Pune",
        items: [
          { key: "steel", qty: 60, supply: 115000, install: 26000, size: "Shed Size: 40 x 20 x 9 meters." },
          { key: "roof", qty: 950, supply: 690, install: 270, size: "Plinth area: 800 SQM" },
          { key: "gutter", qty: 90, supply: 4800, install: 500 },
        ],
      }),
      status: "final",
      updatedHoursAgo: 24 * 140,
    },
    {
      data: boq({
        offerNo: "15",
        revision: "01",
        date: "2024-07-09",
        client: "Kalyani Steels Ltd.",
        city: "Pune",
        attention: "Mr. Prakash Joshi",
        subject: "Supply and installation of Prefab warehouse shed",
        site: "Chakan, Pune",
        items: [
          { key: "steel", qty: 58, supply: 112000, install: 25000, size: "Shed Size: 40 x 20 x 9 meters." },
          { key: "roof", qty: 950, supply: 680, install: 260, size: "Plinth area: 800 SQM" },
          { key: "gutter", qty: 90, supply: 4800, install: 500 },
        ],
      }),
      status: "final",
      updatedHoursAgo: 24 * 133,
    },
    {
      data: boq({
        offerNo: "16",
        date: "2024-08-12",
        client: "Mahindra Logistics Ltd.",
        city: "Mumbai",
        attention: "Ms. Neha Kulkarni",
        subject: "Supply and installation of Prefab structures for mezzanine floor",
        site: "Bhiwandi, Thane",
        items: [{ key: "steel", qty: 32, supply: 118000, install: 24000, size: "Mezzanine size: 30 x 15 meters." }],
        completionDays: 45,
      }),
      status: "draft",
      updatedHoursAgo: 24 * 90,
    },
    {
      data: area({
        offerNo: "17",
        date: "2024-09-20",
        client: "L&T Construction",
        city: "Chennai",
        attention: "Mr. S. Raghavan",
        site: "Sriperumbudur, TN",
        project: "Metro Depot Site Camp",
        rows: [
          ["Site Office", 1200, 1, 2160000],
          ["Staff Quarters", 320, 10, 520000],
          ["Labour Hutment", 2400, 2, 2150000],
          ["Store", 1500, 1, null],
        ],
      }),
      status: "final",
      updatedHoursAgo: 24 * 60,
    },
    {
      data: boq({
        offerNo: "18",
        date: "2024-11-05",
        client: "Bharat Forge Ltd.",
        city: "Pune",
        attention: "Mr. Amit Deshpande",
        subject: "Supply and installation of Prefab canteen building",
        site: "Mundhwa, Pune",
        items: [
          { key: "steel", qty: 22, supply: 120000, install: 27000, size: "Building size: 25 x 12 x 6 meters." },
          { key: "roof", qty: 360, supply: 700, install: 280, size: "Plinth area: 300 SQM" },
        ],
      }),
      status: "draft",
      updatedHoursAgo: 24 * 12,
    },
    {
      data: area({
        offerNo: "19",
        date: "2025-01-14",
        client: "Afcons Infrastructure Ltd.",
        city: "Mumbai",
        attention: "Mr. Rohan Mehta",
        site: "Nashik, MH",
        project: "Samruddhi Expressway Package 12",
        rows: [
          ["Project Office", 1800, 1, 3100000],
          ["Engineer Quarters", 260, 8, 445000],
          ["Mess & Kitchen", 900, 1, 1450000],
        ],
      }),
      status: "draft",
      updatedHoursAgo: 5,
    },
    {
      data: boq({
        offerNo: "20",
        date: "2025-02-03",
        client: "Tata Projects Ltd.",
        city: "Hyderabad",
        attention: "Mr. K. Srinivas",
        subject: "Supply and installation of Prefab Buildings structures",
        site: "Sanand, Gujarat",
        items: [
          { key: "steel", qty: 85, supply: 119000, install: 26500, size: "Shed Size: 60 x 25 x 10 meters." },
          { key: "roof", qty: 1700, supply: 700, install: 280, size: "Plinth area: 1500 SQM" },
          { key: "gutter", qty: 170, supply: 5000, install: 500 },
        ],
        completionDays: 60,
      }),
      status: "draft",
      updatedHoursAgo: 0.5,
    },
  ];
}

/** Demo records with fixed ids, linked to the demo clients/enquiries in lib/crm/seed.ts. */
export function seedRecords(now = Date.now()): QuotationRecord[] {
  const numbers = seedEnquiryNumbers(now);
  return seedItems().map((s) => {
    const t = new Date(now - s.updatedHoursAgo * 3600_000).toISOString();
    const id = seedQuoteId(s.data.meta.offerNo, s.data.meta.revision);
    const link = SEED_QUOTE_LINKS[id];
    const data = link ? { ...s.data, client: { ...s.data.client, clientId: link.clientId } } : s.data;
    return {
      id,
      status: s.status,
      schemaVersion: SCHEMA_VERSION,
      createdAt: t,
      updatedAt: t,
      data,
      enquiryId: link?.enquiryId ?? null,
      enquiryNumber: link?.enquiryId ? numbers[link.enquiryId] : null,
      enquiryRevision: link?.revision ?? null,
      sentAt: link?.sentHoursAgo !== undefined ? new Date(now - link.sentHoursAgo * 3600_000).toISOString() : null,
    };
  });
}
