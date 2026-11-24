const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
  "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function belowHundred(n: number): string {
  if (n < 20) return ONES[n];
  return [TENS[Math.floor(n / 10)], ONES[n % 10]].filter(Boolean).join(" ");
}

function belowThousand(n: number): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  return [h ? `${ONES[h]} Hundred` : "", r ? belowHundred(r) : ""].filter(Boolean).join(" ");
}

/** Converts a non-negative integer to words using the Indian numbering system (lakh, crore). */
export function integerToIndianWords(num: number): string {
  let n = Math.floor(Math.abs(num));
  if (n === 0) return "Zero";
  const parts: string[] = [];
  const crore = Math.floor(n / 1e7);
  n %= 1e7;
  if (crore) parts.push(`${integerToIndianWords(crore)} Crore`);
  const lakh = Math.floor(n / 1e5);
  n %= 1e5;
  if (lakh) parts.push(`${belowHundred(lakh)} Lakh`);
  const thousand = Math.floor(n / 1e3);
  n %= 1e3;
  if (thousand) parts.push(`${belowHundred(thousand)} Thousand`);
  if (n) parts.push(belowThousand(n));
  return parts.join(" ");
}

export function amountInWords(amount: number): string {
  const rupees = Math.floor(Math.abs(amount));
  const paise = Math.round((Math.abs(amount) - rupees) * 100);
  let s = `Rupees ${integerToIndianWords(rupees)}`;
  if (paise) s += ` and ${belowHundred(paise)} Paise`;
  return `${s} Only`;
}

const inr = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 0 });

/** Indian digit grouping, e.g. 10801720 -> "1,08,01,720". */
export function formatINR(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "";
  return inr.format(n);
}

export function formatRupee(n: number | null | undefined): string {
  const s = formatINR(n);
  return s ? `₹ ${s}` : "";
}

const SMALL_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
export function smallNumberWords(n: number | null | undefined): string {
  if (n === null || n === undefined) return "";
  return Number.isInteger(n) && n >= 0 && n <= 10 ? SMALL_WORDS[n] : String(n);
}
