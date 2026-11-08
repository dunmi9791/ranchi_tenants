import { describe, expect, it } from "vitest";
import { parseDay } from "../leases";
import { chargeStatus, rentSchedule } from "../rent";

const d = (s: string) => parseDay(s)!;
const iso = (x: Date) => x.toISOString().slice(0, 10);

describe("rentSchedule", () => {
  const annual = {
    startDate: d("2026-01-01"),
    endDate: d("2026-12-31"),
    moveOutDate: null,
    rentAmount: 1_200_000,
    rentFrequency: "ANNUAL" as const,
  };

  it("bills a one-year lease once, in advance", () => {
    const s = rentSchedule(annual, d("2030-01-01"));
    expect(s.map((c) => [iso(c.periodStart), iso(c.periodEnd), iso(c.dueDate), c.amount])).toEqual([
      ["2026-01-01", "2026-12-31", "2026-01-01", 1_200_000],
    ]);
  });

  it("only includes periods starting by the horizon", () => {
    const monthly = { ...annual, rentAmount: 100_000, rentFrequency: "MONTHLY" as const };
    expect(rentSchedule(monthly, d("2026-03-15")).map((c) => iso(c.periodStart))).toEqual([
      "2026-01-01",
      "2026-02-01",
      "2026-03-01",
    ]);
  });

  it("counts months from the start date without drifting", () => {
    const fromJan31 = { ...annual, startDate: d("2026-01-31"), endDate: null, rentFrequency: "MONTHLY" as const };
    const s = rentSchedule(fromJan31, d("2026-04-29"));
    expect(s.map((c) => [iso(c.periodStart), iso(c.periodEnd)])).toEqual([
      ["2026-01-31", "2026-02-27"],
      ["2026-02-28", "2026-03-30"],
      ["2026-03-31", "2026-04-29"],
    ]);
  });

  it("pro-rates the last period by days when the lease ends mid-period", () => {
    // Quarterly from 1 Jan; move-out 15 Feb = 46 of the first quarter's 90 days.
    const q = { ...annual, rentAmount: 90_000, rentFrequency: "QUARTERLY" as const, moveOutDate: d("2026-02-15") };
    const s = rentSchedule(q, d("2030-01-01"));
    expect(s).toHaveLength(1);
    expect(iso(s[0].periodEnd)).toBe("2026-02-15");
    expect(s[0].amount).toBe(46_000);
  });

  it("bills nothing at zero rent", () => {
    expect(rentSchedule({ ...annual, rentAmount: 0 }, d("2030-01-01"))).toEqual([]);
  });
});

describe("chargeStatus", () => {
  const charge = { amount: 500_000, dueDate: d("2026-10-01"), payments: [] as { amount: number; status: string }[] };

  it("counts only completed payments", () => {
    const s = chargeStatus(
      { ...charge, payments: [{ amount: 200_000, status: "PAID" }, { amount: 300_000, status: "PENDING" }] },
      d("2026-09-01")
    );
    expect(s).toEqual({ paid: 200_000, balance: 300_000, state: "upcoming" });
  });

  it("is overdue after the due date and paid once settled", () => {
    expect(chargeStatus(charge, d("2026-10-01")).state).toBe("due");
    expect(chargeStatus(charge, d("2026-10-02")).state).toBe("overdue");
    expect(chargeStatus({ ...charge, payments: [{ amount: 500_000, status: "PAID" }] }, d("2026-12-01")).state).toBe("paid");
  });
});
