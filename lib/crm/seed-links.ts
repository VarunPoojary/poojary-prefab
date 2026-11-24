/*
 * Fixed IDs that tie the demo quotations (lib/data/seed.ts) to the demo clients and enquiries
 * (lib/crm/seed.ts). Only used for demo data in browser storage.
 */

export const seedQuoteId = (offerNo: string, revision: string) => `q_seed_${offerNo}_${revision}`;

export interface SeedQuoteLink {
  clientId: string;
  enquiryId?: string;
  revision?: number;
  /** Hours ago the quotation was recorded as sent (via the enquiry status). */
  sentHoursAgo?: number;
}

/** How many days ago each demo enquiry was created (demo data is relative to today). */
export const SEED_ENQUIRY_DAYS_AGO: Record<string, number> = {
  e_agartala: 365,
  e_poly: 162,
  e_stairs: 159,
  e_sunrise: 135,
  e_kalyani: 145,
  e_mahindra: 95,
  e_lnt: 65,
  e_bharat: 25,
  e_green: 11,
  e_afcons: 6,
  e_thermax3: 2,
};

/** ENQ-<year>-<seq> numbers for the demo enquiries, sequential per year of creation. */
export function seedEnquiryNumbers(now: number): Record<string, string> {
  const byDate = Object.entries(SEED_ENQUIRY_DAYS_AGO).sort((a, b) => b[1] - a[1]);
  const seq: Record<number, number> = {};
  const out: Record<string, string> = {};
  for (const [id, days] of byDate) {
    const year = new Date(now - days * 86_400_000).getFullYear();
    seq[year] = (seq[year] ?? 0) + 1;
    out[id] = `ENQ-${year}-${String(seq[year]).padStart(4, "0")}`;
  }
  return out;
}

const link = (clientId: string, enquiryId?: string, revision?: number, sentHoursAgo?: number): SeedQuoteLink => ({
  clientId,
  ...(enquiryId ? { enquiryId, revision } : {}),
  ...(sentHoursAgo !== undefined ? { sentHoursAgo } : {}),
});

export const SEED_QUOTE_LINKS: Record<string, SeedQuoteLink> = {
  [seedQuoteId("71", "0")]: link("c_dra", "e_agartala", 0, 24 * 355),
  [seedQuoteId("13", "00")]: link("c_thermax", "e_poly", 0, 24 * 157),
  [seedQuoteId("14", "00")]: link("c_thermax", "e_stairs", 0, 24 * 150),
  [seedQuoteId("15", "00")]: link("c_kalyani", "e_kalyani", 0, 24 * 139),
  [seedQuoteId("15", "01")]: link("c_kalyani", "e_kalyani", 1, 24 * 130),
  [seedQuoteId("16", "00")]: link("c_mahindra", "e_mahindra", 0),
  [seedQuoteId("17", "00")]: link("c_lnt", "e_lnt", 0, 24 * 58),
  [seedQuoteId("18", "00")]: link("c_bharat"),
  [seedQuoteId("19", "00")]: link("c_afcons", "e_afcons", 0),
  [seedQuoteId("20", "00")]: link("c_tata"),
};
