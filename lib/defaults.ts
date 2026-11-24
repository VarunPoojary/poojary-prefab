import { COMPANY } from "@/config/company";
import {
  AREA_EXCEL_NOTE,
  BOQ_HEADING,
  BOQ_INSTALL_LABEL,
  BOQ_LIBRARY,
  BOQ_SUPPLY_LABEL,
  CLAUSE_DEFAULTS,
  COVER_LETTER_CLOSING,
  COVER_LETTER_BODY,
  MATRIX_DEFAULTS,
  PHOTOS_TITLE,
  PRICING_INTRO,
  PRICING_NOTE_AREA,
  PRICING_NOTE_BOQ,
  SALUTATIONS,
  SCOPE_BLOCK_ORDER,
  SHED_INTRO,
  SHED_TITLE,
  TERMS_CLOSING,
  WORK_SCOPE_LIBRARY,
  defaultScopeBlock,
} from "./templates";
import { todayIso } from "./template";
import type { AreaRow, BoqItem, PricingMode, Quotation, ShedRow, TermsParams } from "./types";

let counter = 0;
export function uid(prefix = "id"): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}_${counter.toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function libraryBoqItem(key: string, overrides: Partial<BoqItem> = {}): BoqItem {
  const lib = BOQ_LIBRARY.find((l) => l.key === key) ?? BOQ_LIBRARY[BOQ_LIBRARY.length - 1];
  return { id: uid("boq"), ...lib.item, ...overrides };
}

export function libraryWorkScope(key: string) {
  const lib = WORK_SCOPE_LIBRARY.find((l) => l.key === key) ?? WORK_SCOPE_LIBRARY[WORK_SCOPE_LIBRARY.length - 1];
  return { id: uid("ws"), ...lib.item };
}

export function emptyAreaRow(overrides: Partial<AreaRow> = {}): AreaRow {
  return { id: uid("area"), name: "", areaPerUnit: null, units: 1, ratePerUnit: null, notQuoted: false, ...overrides };
}

export function emptyShedRow(overrides: Partial<ShedRow> = {}): ShedRow {
  return {
    id: uid("shed"),
    description: "",
    qty: 1,
    qtyUnit: "shed",
    length: null,
    width: null,
    areaOverride: null,
    ...overrides,
  };
}

export const DEFAULT_TERMS: TermsParams = {
  safetyOfficerCharge: 65000,
  insuranceVariant: "included",
  warrantyPeriod: "one year",
  advancePct: 50,
  inspectionPct: 40,
  balancePct: 10,
  paymentReleaseDays: 4,
  designDays: 7,
  separateDesignQuote: true,
  supplyMode: "start",
  supplyDays: 30,
  supplyAfterAdvance: true,
  completionDays: 30,
  includeRain: true,
  includeCovid: true,
  arbitrationPlace: "Pune, India",
  validityDays: 20,
};

function scopeBlocksFor(mode: PricingMode) {
  const boq = mode === "boq";
  const enabled: Record<string, boolean> = {
    boqNote: boq,
    workScope: boq,
    ratesNote: boq,
    billingNote: boq,
    designScope: !boq,
    steelSpec: true,
    volatility: true,
    wallPanel: false,
  };
  return SCOPE_BLOCK_ORDER.map((k) => defaultScopeBlock(k, enabled[k], uid("blk")));
}

export function createQuotation(mode: PricingMode = "boq"): Quotation {
  return {
    meta: { offerNo: "", date: todayIso(), revision: "00", subject: "", siteLocation: "", projectName: "" },
    client: { company: "", city: "", attentionName: "", attentionDesignation: "" },
    letter: {
      salutation: SALUTATIONS[0],
      body: COVER_LETTER_BODY,
      closing: COVER_LETTER_CLOSING,
      showSignature: true,
      signatoryName: COMPANY.signatory.name,
      signatoryDesignation: COMPANY.signatory.designation,
    },
    pricing: {
      mode,
      gstRate: 18,
      hsnCode: "94960091",
      introText: PRICING_INTRO,
      noteText: mode === "boq" ? PRICING_NOTE_BOQ : PRICING_NOTE_AREA,
      boq: {
        heading: BOQ_HEADING,
        supplyLabel: BOQ_SUPPLY_LABEL,
        installLabel: BOQ_INSTALL_LABEL,
        items: mode === "boq" ? [libraryBoqItem("steel")] : [],
      },
      area: {
        titleOverride: "",
        unit: "ft2",
        rows: mode === "area" ? [emptyAreaRow()] : [],
        showExcelNote: false,
        excelNote: AREA_EXCEL_NOTE,
      },
    },
    scope: {
      workScopeItems: [libraryWorkScope("steel")],
      siteVisits: 2,
      coatingMicrons: 70,
      volatilityPct: 10,
      blocks: scopeBlocksFor(mode),
    },
    terms: {
      params: { ...DEFAULT_TERMS },
      clauses: CLAUSE_DEFAULTS.map((c) => ({ ...c, id: uid("cl"), enabled: true })),
      closingText: TERMS_CLOSING,
      showStamp: true,
    },
    matrix: {
      enabled: true,
      style: "tick",
      rows: MATRIX_DEFAULTS.map((r) => ({ ...r, id: uid("mx") })),
    },
    annexures: {
      shedEnabled: false,
      shedIntro: SHED_INTRO,
      shedTitle: SHED_TITLE,
      shedRows: [],
      photosEnabled: false,
      photosTitle: PHOTOS_TITLE,
      photos: COMPANY.assets.samplePhotos.map((src) => ({ id: uid("ph"), src, caption: "" })),
      notesEnabled: false,
      notes: "",
    },
    fileName: "",
  };
}

const THERMAX_CLIENT = {
  company: "Thermax Ltd.",
  city: "Pune",
  attentionName: "Mr. Mukesh Shukla",
  attentionDesignation: "Contract & Const, Management",
};

function samplePolyHouses(): Quotation {
  const q = createQuotation("boq");
  q.client = { ...THERMAX_CLIENT };
  q.meta = {
    offerNo: "13",
    date: "2024-06-18",
    revision: "00",
    subject: "Supply and installation of Prefab Buildings structures",
    siteLocation: "Nagpur",
    projectName: "",
  };
  q.pricing.boq.items = [
    libraryBoqItem("steel", {
      qty: 43,
      supplyRate: 120000,
      installRate: 28000,
      sizeLine:
        "Shed Size: 30 x 12.5 x 11.25 meters. Steel quantity is approximate and may vary; actual quantity will be given after shop drawing.",
    }),
    libraryBoqItem("roof", { qty: 1500, supplyRate: 700, installRate: 280, sizeLine: "Plinth area: 1025 SQM" }),
    libraryBoqItem("gutter", { qty: 240, supplyRate: 5000, installRate: 500 }),
  ];
  q.scope.workScopeItems = [libraryWorkScope("steel"), libraryWorkScope("roof")];
  q.annexures.shedEnabled = true;
  q.annexures.shedRows = [
    emptyShedRow({ description: "TB007C200 - PSA Balloon Shed Poly House structure", qty: 1, length: 13, width: 25 }),
    emptyShedRow({ description: "TB007C200 - Hammer & Shredder Shed Poly House structure", qty: 4, length: 10, width: 10 }),
    emptyShedRow({ description: "TB007C201 - Feed Conveyor Shed Poly House structure", qty: 2, length: 10, width: 30 }),
  ];
  return q;
}

function sampleStairs(): Quotation {
  const q = createQuotation("boq");
  q.client = { ...THERMAX_CLIENT };
  q.meta = {
    offerNo: "14",
    date: "2024-06-21",
    revision: "00",
    subject: "Supply and installation of Prefab structures for stairs and railing",
    siteLocation: "",
    projectName: "",
  };
  q.pricing.boq.items = [libraryBoqItem("steel", { qty: 125, supplyRate: 120000, installRate: 21000 })];
  q.terms.params.completionDays = 90;
  return q;
}

function sampleAgartala(): Quotation {
  const q = createQuotation("area");
  q.client = {
    company: "Dineshchandra R Agarwal Infracon Pvt. Ltd.",
    city: "Agartala",
    attentionName: "Mr. Abdul Hannan",
    attentionDesignation: "",
  };
  q.meta = {
    offerNo: "71",
    date: "2023-11-29",
    revision: "0",
    subject: "Design, Fabrication, and Installation of Prefabricated Buildings",
    siteLocation: "Agartala, TR",
    projectName: "TR Agartala Bypass Project",
  };
  q.letter.salutation = "Dear Sir/Madam,";
  q.pricing.hsnCode = "94060091";
  q.pricing.area.showExcelNote = true;
  const r = (name: string, areaPerUnit: number, units: number, ratePerUnit: number | null) =>
    emptyAreaRow({ name, areaPerUnit, units, ratePerUnit, notQuoted: ratePerUnit === null });
  q.pricing.area.rows = [
    r("Main Office", 2175.25, 1, 3774140),
    r("Manager Quarter Type A", 251.77, 13, 431526),
    r("Eng & Super Type B", 251.77, 15, 431512),
    r("Driver & Opr Type C", 549, 9, 598684),
    r("Driver & Opr Type C incl Toilets", 1937.15, 1, null),
    r("Driver & Opr Type C incl Toilets", 968.15, 1, null),
    r("Kitchen & Dining - Tech", 1161, 1, 1693307),
    r("Kitchen & Dining - Mech", 993, 1, 1682017),
    r("Kitchen & Dining - Combined", 710, 1, 1085120),
    r("Main Lab", 1200, 1, 2007759),
    r("Main Store", 2475, 1, 2341657),
    r("Security Cabin & Qtr", 175, 2, null),
    r("Office & Store", 550, 1, null),
    r("Cement Godown 1", 3128.84, 1, null),
    r("Cement Godown 2", 2000, 1, null),
    r("Workshop", 2332, 1, null),
    r("Labour hutment", 2787, 1, 2508300),
  ];
  for (const b of q.scope.blocks) if (b.kind === "wallPanel") b.enabled = true;
  const p = q.terms.params;
  p.safetyOfficerCharge = null;
  p.insuranceVariant = "client";
  p.separateDesignQuote = false;
  p.supplyMode = "complete";
  p.supplyDays = 20;
  p.supplyAfterAdvance = false;
  p.completionDays = 100;
  p.includeRain = false;
  q.matrix.style = "text";
  q.annexures.photosEnabled = true;
  return q;
}

export interface Preset {
  key: string;
  label: string;
  description: string;
  create: () => Quotation;
}

export const PRESETS: Preset[] = [
  {
    key: "blank-boq",
    label: "Blank – BOQ (Supply + Installation)",
    description: "Steel structures, sheds, stairs, roofing. Item-wise supply & installation rates.",
    create: () => createQuotation("boq"),
  },
  {
    key: "blank-area",
    label: "Blank – Area-based buildings",
    description: "Site infrastructure / multiple building types priced per unit with area (ft²).",
    create: () => createQuotation("area"),
  },
  {
    key: "sample-poly",
    label: "Example: Poly houses, RIL Nagpur (Offer 13)",
    description: "3 BOQ items + shed details annexure.",
    create: samplePolyHouses,
  },
  {
    key: "sample-stairs",
    label: "Example: Stair & railings (Offer 14)",
    description: "Single steel BOQ item, 90-day completion.",
    create: sampleStairs,
  },
  {
    key: "sample-agartala",
    label: "Example: Site infra Agartala (Offer 71)",
    description: "17 structures priced by area, design scope, wall panels, photos.",
    create: sampleAgartala,
  },
];
