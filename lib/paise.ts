/*
 * Exact money for expenses and payroll. Amounts are whole numbers of paise (₹1 = 100 paise), never
 * floating-point rupees. Calculations that divide (salary ÷ 30, weighted salaries) use exact fractions
 * and round once, at the end.
 */

export type Paise = number;

/** ₹ (whole or with paise) typed by a user → paise, exactly. Accepts "1,23,456.5", "₹ 500", "-20". Null when invalid. */
export function parseRupees(text: string): Paise | null {
  const t = text.replace(/[₹,\s]/g, "");
  const m = /^(-?)(\d+)(?:\.(\d{0,2}))?$/.exec(t);
  if (!m) return null;
  const v = Number(m[2]) * 100 + Number((m[3] ?? "").padEnd(2, "0"));
  if (!Number.isSafeInteger(v)) return null;
  return m[1] ? -v : v;
}

/** Whole rupees (seed data, existing project figures) → paise. */
export const rupeesToPaise = (r: number): Paise => Math.round(r * 100);

/** Paise → "1234.50" for an input field ("" for null). */
export function paiseInput(p: Paise | null | undefined): string {
  if (p === null || p === undefined) return "";
  const neg = p < 0;
  const a = Math.abs(p);
  const r = Math.floor(a / 100);
  const ps = a % 100;
  return `${neg ? "-" : ""}${r}${ps ? `.${String(ps).padStart(2, "0")}` : ""}`;
}

const group = (n: number) => {
  const s = String(n);
  if (s.length <= 3) return s;
  const last3 = s.slice(-3);
  return `${s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",")},${last3}`;
};

/** "₹1,23,456" or "₹1,23,456.50" (paise shown only when not zero, unless `always`). */
export function formatPaise(p: Paise, opts: { always?: boolean; sign?: boolean } = {}): string {
  const neg = p < 0;
  const a = Math.abs(p);
  const r = Math.floor(a / 100);
  const ps = a % 100;
  const sign = neg ? "−" : opts.sign && p > 0 ? "+" : "";
  return `${sign}₹${group(r)}${ps || opts.always ? `.${String(ps).padStart(2, "0")}` : ""}`;
}

/* ---------- exact fractions ---------- */

const gcd = (a: bigint, b: bigint): bigint => {
  a = a < 0n ? -a : a;
  b = b < 0n ? -b : b;
  while (b) [a, b] = [b, a % b];
  return a || 1n;
};

/** An exact rational number (numerator / denominator, BigInt). Used for paise amounts before rounding. */
export class Frac {
  readonly n: bigint;
  readonly d: bigint;
  constructor(n: bigint | number, d: bigint | number = 1n) {
    let nn = BigInt(n);
    let dd = BigInt(d);
    if (dd === 0n) throw new Error("Division by zero");
    if (dd < 0n) [nn, dd] = [-nn, -dd];
    const g = gcd(nn, dd);
    this.n = nn / g;
    this.d = dd / g;
  }
  static of(v: number) {
    // Halves (0.5 days) are the only fractions passed in as numbers.
    if (Number.isInteger(v)) return new Frac(v);
    if (Number.isInteger(v * 2)) return new Frac(v * 2, 2);
    throw new Error(`Not an exact value: ${v}`);
  }
  add(o: Frac) {
    return new Frac(this.n * o.d + o.n * this.d, this.d * o.d);
  }
  sub(o: Frac) {
    return new Frac(this.n * o.d - o.n * this.d, this.d * o.d);
  }
  mul(o: Frac | number) {
    const f = typeof o === "number" ? Frac.of(o) : o;
    return new Frac(this.n * f.n, this.d * f.d);
  }
  div(o: Frac | number) {
    const f = typeof o === "number" ? Frac.of(o) : o;
    return new Frac(this.n * f.d, this.d * f.n);
  }
  max0() {
    return this.n < 0n ? new Frac(0) : this;
  }
  /** Nearest paisa, half up (display of intermediate figures such as the daily rate). */
  toPaise(): Paise {
    return Number(roundHalfUp(this.n, this.d));
  }
  /** Nearest whole rupee, half up (50 paise and above rounds up), in paise. */
  toRupeePaise(): Paise {
    return Number(roundHalfUp(this.n, this.d * 100n)) * 100;
  }
  /** Rounded down to a whole rupee, in paise (caps that must never be exceeded). */
  floorRupeePaise(): Paise {
    return Number(floorDiv(this.n, this.d * 100n)) * 100;
  }
}

function floorDiv(n: bigint, d: bigint) {
  const q = n / d;
  return n % d !== 0n && n < 0n !== d < 0n ? q - 1n : q;
}
function roundHalfUp(n: bigint, d: bigint) {
  return floorDiv(2n * n + d, 2n * d);
}

/** Half of an amount, rounded down to the rupee (the 50 % deduction cap). */
export const halfFloorRupee = (p: Paise): Paise => new Frac(p, 2).floorRupeePaise();
