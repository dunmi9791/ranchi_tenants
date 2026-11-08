import type { RentFrequency } from "@prisma/client";

/**
 * Lease dates are calendar days stored as midnight UTC (what <input type="date"> gives us),
 * read in Lagos time (UTC+1, no DST). A lease runs from the whole start day to the whole end day.
 */
const LAGOS_OFFSET_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * 60 * 60 * 1000;

/** Today's Lagos calendar date as midnight UTC, comparable with stored lease dates. */
export function lagosToday(now: Date = new Date()): Date {
  const l = new Date(now.getTime() + LAGOS_OFFSET_MS);
  return new Date(Date.UTC(l.getUTCFullYear(), l.getUTCMonth(), l.getUTCDate()));
}

/** "2026-10-15" → midnight UTC that day; null for blank or invalid input. */
export function parseDay(value: string | null | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value ? null : d;
}

/** Value for <input type="date">. */
export function dayInput(d: Date | null | undefined): string {
  return d ? d.toISOString().slice(0, 10) : "";
}

export function fmtDay(d: Date): string {
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * DAY_MS);
}

/** Calendar months later, clamped to the month's last day (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(d: Date, months: number): Date {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + months;
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(d.getUTCDate(), lastDay)));
}

export const FREQUENCY_MONTHS: Record<RentFrequency, number> = {
  MONTHLY: 1,
  QUARTERLY: 3,
  BIANNUAL: 6,
  ANNUAL: 12,
};

export const FREQUENCY_LABELS: Record<RentFrequency, string> = {
  MONTHLY: "per month",
  QUARTERLY: "per quarter",
  BIANNUAL: "per 6 months",
  ANNUAL: "per year",
};

export type LeaseDates = {
  startDate: Date;
  /** Last day of the lease; null = rolling */
  endDate: Date | null;
  /** Last day of occupancy, when the tenant moved out */
  moveOutDate: Date | null;
};

/** Last day the tenant may occupy the unit: the earlier of the end and move-out dates. */
export function effectiveEnd(l: LeaseDates): Date | null {
  if (l.endDate && l.moveOutDate) return l.endDate < l.moveOutDate ? l.endDate : l.moveOutDate;
  return l.moveOutDate ?? l.endDate;
}

/**
 * - upcoming: starts in the future
 * - active: today is within the lease (meters on the unit can be topped up)
 * - expired: end date passed, tenant hasn't moved out and it wasn't renewed (needs attention)
 * - renewed: end date passed and a renewal lease follows it
 * - ended: tenant moved out
 */
export type LeaseState = "upcoming" | "active" | "expired" | "renewed" | "ended";

export function leaseState(l: LeaseDates & { hasRenewal?: boolean }, today: Date): LeaseState {
  if (l.moveOutDate && today > l.moveOutDate) return "ended";
  if (today < l.startDate) return "upcoming";
  if (l.endDate && today > l.endDate) return l.hasRenewal ? "renewed" : "expired";
  return "active";
}

/** Whole days from today to the last day of the lease (0 = ends today); null if rolling. */
export function daysLeft(l: LeaseDates, today: Date): number | null {
  const end = effectiveEnd(l);
  return end ? Math.round((end.getTime() - today.getTime()) / DAY_MS) : null;
}

/** Do two leases claim the unit on any common day? Rolling leases run forever. */
export function leasesOverlap(a: LeaseDates, b: LeaseDates): boolean {
  const aEnd = effectiveEnd(a);
  const bEnd = effectiveEnd(b);
  return (!bEnd || a.startDate <= bEnd) && (!aEnd || b.startDate <= aEnd);
}

export type Occupancy<L> =
  | { status: "occupied"; lease: L; upcoming: L | null }
  | { status: "lease_expired"; lease: L; upcoming: L | null }
  | { status: "vacant"; lease: null; upcoming: L | null };

/**
 * A unit is occupied while it has an active lease. If the last lease ran out without a
 * move-out or renewal, the tenant is presumably still there: "lease expired".
 */
export function unitOccupancy<L extends LeaseDates & { hasRenewal?: boolean }>(
  leases: L[],
  today: Date
): Occupancy<L> {
  const upcoming =
    leases
      .filter((l) => leaseState(l, today) === "upcoming")
      .sort((a, b) => a.startDate.getTime() - b.startDate.getTime())[0] ?? null;
  const active = leases.find((l) => leaseState(l, today) === "active");
  if (active) return { status: "occupied", lease: active, upcoming };
  const expired = leases
    .filter((l) => leaseState(l, today) === "expired")
    .sort((a, b) => b.startDate.getTime() - a.startDate.getTime())[0];
  if (expired) return { status: "lease_expired", lease: expired, upcoming };
  return { status: "vacant", lease: null, upcoming };
}
