import type { Prisma, PurchaseStatus } from "@prisma/client";

/** All reporting is in Lagos time (UTC+1, no DST); weeks start on Monday. */
const LAGOS_OFFSET_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export type GroupBy = "day" | "week" | "month";
export type RangePreset = "today" | "yesterday" | "this_week" | "this_month" | "last_7" | "last_30" | "last_month" | "custom";
export type StatusFilter = "paid" | "vended" | "unvended" | "pending" | "all";

export type Filters = {
  range: RangePreset;
  /** Inclusive start (UTC instant of Lagos midnight) */
  from: Date;
  /** Exclusive end (UTC instant of Lagos midnight after the last day) */
  to: Date;
  groupBy: GroupBy;
  status: StatusFilter;
  tenantId: string | null;
  companyId: string | null;
};

export const RANGE_LABELS: Record<RangePreset, string> = {
  today: "Today",
  yesterday: "Yesterday",
  this_week: "This week",
  this_month: "This month",
  last_7: "Last 7 days",
  last_30: "Last 30 days",
  last_month: "Last month",
  custom: "Custom",
};

export const STATUS_LABELS: Record<StatusFilter, string> = {
  paid: "All paid",
  vended: "Vended",
  unvended: "Paid, not vended",
  pending: "Pending payment",
  all: "Everything",
};

// --- Lagos calendar helpers (work on a "Lagos wall clock" shifted Date, read with UTC getters) ---

const toLagos = (d: Date) => new Date(d.getTime() + LAGOS_OFFSET_MS);
const fromLagos = (d: Date) => new Date(d.getTime() - LAGOS_OFFSET_MS);

/** UTC instant of Lagos midnight at the start of the day containing `d`. */
export function startOfLagosDay(d: Date): Date {
  const l = toLagos(d);
  return fromLagos(new Date(Date.UTC(l.getUTCFullYear(), l.getUTCMonth(), l.getUTCDate())));
}

export function startOfLagosWeek(d: Date): Date {
  const day = startOfLagosDay(d);
  const dow = (toLagos(day).getUTCDay() + 6) % 7; // Monday = 0
  return new Date(day.getTime() - dow * DAY_MS);
}

export function startOfLagosMonth(d: Date): Date {
  const l = toLagos(d);
  return fromLagos(new Date(Date.UTC(l.getUTCFullYear(), l.getUTCMonth(), 1)));
}

function addLagosMonths(monthStart: Date, n: number): Date {
  const l = toLagos(monthStart);
  return fromLagos(new Date(Date.UTC(l.getUTCFullYear(), l.getUTCMonth() + n, 1)));
}

/** Parse "YYYY-MM-DD" as a Lagos calendar day. */
function parseDay(s: string | undefined): Date | null {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : fromLagos(d);
}

/** Lagos calendar date "YYYY-MM-DD" for an instant. */
export function lagosDay(d: Date): string {
  return toLagos(d).toISOString().slice(0, 10);
}

export function presetRange(preset: Exclude<RangePreset, "custom">, now: Date): { from: Date; to: Date } {
  const today = startOfLagosDay(now);
  const tomorrow = new Date(today.getTime() + DAY_MS);
  switch (preset) {
    case "today":
      return { from: today, to: tomorrow };
    case "yesterday":
      return { from: new Date(today.getTime() - DAY_MS), to: today };
    case "this_week":
      return { from: startOfLagosWeek(now), to: tomorrow };
    case "this_month":
      return { from: startOfLagosMonth(now), to: tomorrow };
    case "last_7":
      return { from: new Date(tomorrow.getTime() - 7 * DAY_MS), to: tomorrow };
    case "last_30":
      return { from: new Date(tomorrow.getTime() - 30 * DAY_MS), to: tomorrow };
    case "last_month": {
      const thisMonth = startOfLagosMonth(now);
      return { from: addLagosMonths(thisMonth, -1), to: thisMonth };
    }
  }
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export function parseFilters(sp: Record<string, string | string[] | undefined>, now = new Date()): Filters {
  const rangeIn = one(sp.range) as RangePreset | undefined;
  const range: RangePreset = rangeIn && rangeIn in RANGE_LABELS ? rangeIn : "this_month";

  let from: Date;
  let to: Date;
  if (range === "custom") {
    const f = parseDay(one(sp.from));
    const t = parseDay(one(sp.to));
    const fallback = presetRange("this_month", now);
    from = f ?? fallback.from;
    to = t ? new Date(t.getTime() + DAY_MS) : fallback.to; // `to` day is inclusive in the UI
    if (to <= from) to = new Date(from.getTime() + DAY_MS);
  } else {
    ({ from, to } = presetRange(range, now));
  }

  const groupIn = one(sp.groupBy) as GroupBy | undefined;
  const spanDays = (to.getTime() - from.getTime()) / DAY_MS;
  const groupBy: GroupBy =
    groupIn === "day" || groupIn === "week" || groupIn === "month"
      ? groupIn
      : spanDays > 92
        ? "month"
        : spanDays > 31
          ? "week"
          : "day";

  const statusIn = one(sp.status) as StatusFilter | undefined;
  const status: StatusFilter = statusIn && statusIn in STATUS_LABELS ? statusIn : "paid";

  return {
    range,
    from,
    to,
    groupBy,
    status,
    tenantId: one(sp.tenant) || null,
    companyId: one(sp.company) || null,
  };
}

/** Query-string for the same filters (for links like CSV export). */
export function filtersToQuery(f: Filters): string {
  const q = new URLSearchParams({ range: f.range, groupBy: f.groupBy, status: f.status });
  if (f.range === "custom") {
    q.set("from", lagosDay(f.from));
    q.set("to", lagosDay(new Date(f.to.getTime() - DAY_MS)));
  }
  if (f.tenantId) q.set("tenant", f.tenantId);
  if (f.companyId) q.set("company", f.companyId);
  return q.toString();
}

const STATUS_WHERE: Record<StatusFilter, Prisma.PurchaseWhereInput> = {
  paid: { paidAt: { not: null } },
  vended: { status: "VENDED" },
  unvended: { paidAt: { not: null }, status: { in: ["PAID", "FAILED"] satisfies PurchaseStatus[] } },
  pending: { status: "PENDING" },
  all: {},
};

/**
 * A purchase's reporting date is when it was paid, or when it was created if unpaid.
 */
export function purchaseWhere(f: Filters): Prisma.PurchaseWhereInput {
  const inRange = { gte: f.from, lt: f.to };
  return {
    AND: [
      { OR: [{ paidAt: inRange }, { paidAt: null, createdAt: inRange }] },
      STATUS_WHERE[f.status],
      f.tenantId ? { userId: f.tenantId } : {},
      f.companyId ? { companyId: f.companyId } : {},
    ],
  };
}

export type PurchaseRow = {
  kwhAmount: number;
  nairaAmount: number;
  serviceFee: number;
  status: PurchaseStatus;
  paidAt: Date | null;
  createdAt: Date;
};

export type Totals = {
  count: number;
  paidCount: number;
  kwh: number;
  electricity: number;
  fees: number;
  collected: number;
  /** Paid but no token yet (PAID or FAILED) — money owed to tenants in electricity */
  owedCount: number;
  owedAmount: number;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

export function emptyTotals(): Totals {
  return { count: 0, paidCount: 0, kwh: 0, electricity: 0, fees: 0, collected: 0, owedCount: 0, owedAmount: 0 };
}

export function addTo(t: Totals, p: PurchaseRow): void {
  t.count++;
  if (!p.paidAt) return;
  t.paidCount++;
  t.electricity = r2(t.electricity + p.nairaAmount);
  t.fees = r2(t.fees + p.serviceFee);
  t.collected = r2(t.collected + p.nairaAmount + p.serviceFee);
  if (p.status === "VENDED") t.kwh = Math.round((t.kwh + p.kwhAmount) * 10) / 10;
  else {
    t.owedCount++;
    t.owedAmount = r2(t.owedAmount + p.nairaAmount);
  }
}

export function summarize(rows: PurchaseRow[]): Totals {
  const t = emptyTotals();
  for (const p of rows) addTo(t, p);
  return t;
}

export function bucketStart(d: Date, groupBy: GroupBy): Date {
  return groupBy === "day" ? startOfLagosDay(d) : groupBy === "week" ? startOfLagosWeek(d) : startOfLagosMonth(d);
}

function nextBucket(start: Date, groupBy: GroupBy): Date {
  if (groupBy === "day") return new Date(start.getTime() + DAY_MS);
  if (groupBy === "week") return new Date(start.getTime() + 7 * DAY_MS);
  return addLagosMonths(start, 1);
}

export function bucketLabel(start: Date, groupBy: GroupBy): string {
  const l = toLagos(start);
  const opts: Intl.DateTimeFormatOptions =
    groupBy === "month" ? { month: "short", year: "numeric", timeZone: "UTC" } : { day: "numeric", month: "short", timeZone: "UTC" };
  const s = l.toLocaleDateString("en-GB", opts);
  return groupBy === "week" ? `Week of ${s}` : s;
}

export type Bucket = { key: string; label: string; start: Date; totals: Totals };

/** Every period in the range (including empty ones), with totals. */
export function groupByPeriod(rows: PurchaseRow[], f: Pick<Filters, "from" | "to" | "groupBy">): Bucket[] {
  const buckets: Bucket[] = [];
  const index = new Map<string, Bucket>();
  for (let s = bucketStart(f.from, f.groupBy); s < f.to; s = nextBucket(s, f.groupBy)) {
    const b = { key: lagosDay(s), label: bucketLabel(s, f.groupBy), start: s, totals: emptyTotals() };
    buckets.push(b);
    index.set(b.key, b);
    if (buckets.length > 400) break; // guard against absurd ranges
  }
  for (const p of rows) {
    const key = lagosDay(bucketStart(p.paidAt ?? p.createdAt, f.groupBy));
    const b = index.get(key);
    if (b) addTo(b.totals, p);
  }
  return buckets;
}

/** Totals per key (tenant, company…), largest collected first. */
export function groupByKey<T extends PurchaseRow>(
  rows: T[],
  keyOf: (p: T) => { id: string; label: string }
): { id: string; label: string; totals: Totals }[] {
  const map = new Map<string, { id: string; label: string; totals: Totals }>();
  for (const p of rows) {
    const k = keyOf(p);
    let g = map.get(k.id);
    if (!g) map.set(k.id, (g = { ...k, totals: emptyTotals() }));
    addTo(g.totals, p);
  }
  return [...map.values()].sort((a, b) => b.totals.collected - a.totals.collected || b.totals.count - a.totals.count);
}
