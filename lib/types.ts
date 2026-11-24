export type PricingMode = "boq" | "area";

export interface BoqItem {
  id: string;
  title: string;
  description: string;
  sizeLine: string;
  uom: string;
  qty: number | null;
  supplyRate: number | null;
  installRate: number | null;
}

export interface AreaRow {
  id: string;
  name: string;
  areaPerUnit: number | null;
  units: number | null;
  ratePerUnit: number | null;
  notQuoted: boolean;
}

export interface WorkScopeItem {
  id: string;
  heading: string;
  /** One bullet per line. */
  bullets: string;
}

export type ScopeBlockKind =
  | "boqNote"
  | "workScope"
  | "ratesNote"
  | "billingNote"
  | "designScope"
  | "steelSpec"
  | "volatility"
  | "wallPanel"
  | "custom";

export interface ScopeBlock {
  id: string;
  kind: ScopeBlockKind;
  label: string;
  title: string;
  /** Free text. Lines starting with "- " are bullets, "1. " are numbered points, blank lines separate paragraphs. */
  text: string;
  enabled: boolean;
}

export interface Clause {
  id: string;
  key: string;
  title: string;
  text: string;
  enabled: boolean;
  custom?: boolean;
}

export interface TermsParams {
  safetyOfficerCharge: number | null;
  insuranceVariant: "included" | "client";
  warrantyPeriod: string;
  advancePct: number | null;
  inspectionPct: number | null;
  balancePct: number | null;
  paymentReleaseDays: number | null;
  designDays: number | null;
  separateDesignQuote: boolean;
  supplyMode: "start" | "complete";
  supplyDays: number | null;
  supplyAfterAdvance: boolean;
  completionDays: number | null;
  includeRain: boolean;
  includeCovid: boolean;
  arbitrationPlace: string;
  validityDays: number | null;
}

export interface MatrixRow {
  id: string;
  description: string;
  client: boolean;
  pppl: boolean;
}

export interface ShedRow {
  id: string;
  description: string;
  qty: number | null;
  qtyUnit: string;
  length: number | null;
  width: number | null;
  areaOverride: number | null;
}

export interface Photo {
  id: string;
  src: string;
  caption: string;
}

export interface Quotation {
  meta: {
    offerNo: string;
    date: string; // yyyy-mm-dd
    revision: string;
    subject: string;
    siteLocation: string;
    projectName: string;
  };
  client: {
    company: string;
    city: string;
    attentionName: string;
    attentionDesignation: string;
    /** Client List record this client block was filled from (CRM). */
    clientId?: string;
  };
  letter: {
    salutation: string;
    /** Paragraphs separated by a blank line. */
    body: string;
    closing: string;
    showSignature: boolean;
    signatoryName: string;
    signatoryDesignation: string;
  };
  pricing: {
    mode: PricingMode;
    gstRate: number | null;
    hsnCode: string;
    introText: string;
    noteText: string;
    boq: {
      heading: string;
      supplyLabel: string;
      installLabel: string;
      items: BoqItem[];
    };
    area: {
      titleOverride: string;
      unit: "ft2" | "m2";
      rows: AreaRow[];
      showExcelNote: boolean;
      excelNote: string;
    };
  };
  scope: {
    workScopeItems: WorkScopeItem[];
    siteVisits: number | null;
    coatingMicrons: number | null;
    volatilityPct: number | null;
    blocks: ScopeBlock[];
  };
  terms: {
    params: TermsParams;
    clauses: Clause[];
    closingText: string;
    showStamp: boolean;
  };
  matrix: {
    enabled: boolean;
    style: "tick" | "text";
    rows: MatrixRow[];
  };
  annexures: {
    shedEnabled: boolean;
    shedIntro: string;
    shedTitle: string;
    shedRows: ShedRow[];
    photosEnabled: boolean;
    photosTitle: string;
    photos: Photo[];
    notesEnabled: boolean;
    notes: string;
  };
  fileName: string;
}
