import { describe, expect, it } from "vitest";
import {
  addMonths,
  daysLeft,
  lagosToday,
  leaseState,
  leasesOverlap,
  parseDay,
  unitOccupancy,
} from "../leases";

const d = (s: string) => parseDay(s)!;
const lease = (start: string, end: string | null, moveOut: string | null = null) => ({
  startDate: d(start),
  endDate: end ? d(end) : null,
  moveOutDate: moveOut ? d(moveOut) : null,
});

describe("dates", () => {
  it("uses the Lagos calendar day", () => {
    expect(lagosToday(new Date("2026-09-30T22:59:00Z")).toISOString()).toBe("2026-09-30T00:00:00.000Z");
    expect(lagosToday(new Date("2026-09-30T23:00:00Z")).toISOString()).toBe("2026-10-01T00:00:00.000Z");
  });

  it("parses only real YYYY-MM-DD days", () => {
    expect(parseDay("2026-02-29")).toBeNull();
    expect(parseDay("15/10/2026")).toBeNull();
    expect(parseDay("")).toBeNull();
    expect(parseDay("2028-02-29")?.toISOString()).toBe("2028-02-29T00:00:00.000Z");
  });

  it("clamps month arithmetic to the month's last day", () => {
    expect(addMonths(d("2026-01-31"), 1)).toEqual(d("2026-02-28"));
    expect(addMonths(d("2026-01-31"), 2)).toEqual(d("2026-03-31"));
    expect(addMonths(d("2026-11-15"), 3)).toEqual(d("2027-02-15"));
  });
});

describe("leaseState", () => {
  const l = lease("2026-01-01", "2026-12-31");

  it("runs through the whole start and end days", () => {
    expect(leaseState(l, d("2025-12-31"))).toBe("upcoming");
    expect(leaseState(l, d("2026-01-01"))).toBe("active");
    expect(leaseState(l, d("2026-12-31"))).toBe("active");
    expect(leaseState(l, d("2027-01-01"))).toBe("expired");
  });

  it("is renewed rather than expired when a renewal follows", () => {
    expect(leaseState({ ...l, hasRenewal: true }, d("2027-01-01"))).toBe("renewed");
  });

  it("ends the day after move-out, even before the end date", () => {
    const left = lease("2026-01-01", "2026-12-31", "2026-06-30");
    expect(leaseState(left, d("2026-06-30"))).toBe("active");
    expect(leaseState(left, d("2026-07-01"))).toBe("ended");
    expect(daysLeft(left, d("2026-06-20"))).toBe(10);
  });

  it("treats a rolling lease as active until move-out", () => {
    expect(leaseState(lease("2026-01-01", null), d("2030-01-01"))).toBe("active");
    expect(daysLeft(lease("2026-01-01", null), d("2030-01-01"))).toBeNull();
  });
});

describe("leasesOverlap", () => {
  it("detects shared days, including the boundary day", () => {
    expect(leasesOverlap(lease("2026-01-01", "2026-12-31"), lease("2026-12-31", "2027-12-31"))).toBe(true);
    expect(leasesOverlap(lease("2026-01-01", "2026-12-31"), lease("2027-01-01", "2027-12-31"))).toBe(false);
  });

  it("uses the move-out date and treats rolling leases as open-ended", () => {
    expect(leasesOverlap(lease("2026-01-01", "2026-12-31", "2026-03-31"), lease("2026-04-01", null))).toBe(false);
    expect(leasesOverlap(lease("2026-01-01", null), lease("2030-01-01", "2030-12-31"))).toBe(true);
  });
});

describe("unitOccupancy", () => {
  const today = d("2026-10-15");

  it("is occupied by the active lease and shows the next one", () => {
    const current = lease("2026-01-01", "2026-12-31");
    const next = lease("2027-01-01", "2027-12-31");
    expect(unitOccupancy([next, current], today)).toEqual({ status: "occupied", lease: current, upcoming: next });
  });

  it("flags a lapsed lease with no move-out as lease expired", () => {
    const lapsed = lease("2025-01-01", "2025-12-31");
    expect(unitOccupancy([lapsed], today).status).toBe("lease_expired");
  });

  it("is vacant once the tenant moved out or the lease was renewed", () => {
    expect(unitOccupancy([lease("2025-01-01", "2025-12-31", "2025-12-31")], today).status).toBe("vacant");
    expect(unitOccupancy([{ ...lease("2025-01-01", "2025-12-31"), hasRenewal: true }], today).status).toBe("vacant");
    expect(unitOccupancy([], today)).toEqual({ status: "vacant", lease: null, upcoming: null });
  });
});
