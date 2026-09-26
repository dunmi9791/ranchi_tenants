import { describe, expect, it } from "vitest";
import { groupByKey, groupByPeriod, lagosDay, parseFilters, presetRange, summarize } from "../analytics";
import { csvCell } from "../csv";

// Saturday 26 Sep 2026, 17:00 WAT
const now = new Date("2026-09-26T16:00:00Z");
const day = (d: Date) => lagosDay(d);

describe("date ranges (Lagos time, weeks start Monday)", () => {
  it("today runs Lagos midnight to midnight", () => {
    const r = presetRange("today", now);
    expect(r.from.toISOString()).toBe("2026-09-25T23:00:00.000Z");
    expect(r.to.toISOString()).toBe("2026-09-26T23:00:00.000Z");
  });

  it("a purchase at 23:30 UTC counts as the next Lagos day", () => {
    const late = new Date("2026-09-25T23:30:00Z"); // 00:30 WAT on 26 Sep
    expect(day(late)).toBe("2026-09-26");
  });

  it("this week starts on Monday", () => {
    expect(day(presetRange("this_week", now).from)).toBe("2026-09-21");
  });

  it("this month and last month", () => {
    expect(day(presetRange("this_month", now).from)).toBe("2026-09-01");
    const lm = presetRange("last_month", now);
    expect(day(lm.from)).toBe("2026-08-01");
    expect(day(lm.to)).toBe("2026-09-01");
  });

  it("custom range treats the 'to' day as inclusive and picks a sensible grouping", () => {
    const f = parseFilters({ range: "custom", from: "2026-01-01", to: "2026-09-26" }, now);
    expect(day(f.from)).toBe("2026-01-01");
    expect(day(f.to)).toBe("2026-09-27");
    expect(f.groupBy).toBe("month");
  });

  it("falls back to safe defaults on junk input", () => {
    const f = parseFilters({ range: "bogus", status: "nope", groupBy: "year" }, now);
    expect(f.range).toBe("this_month");
    expect(f.status).toBe("paid");
    expect(f.groupBy).toBe("day");
  });
});

const p = (paid: string | null, naira: number, fee: number, kwh: number, status: "VENDED" | "FAILED" | "PENDING" = "VENDED") => ({
  kwhAmount: kwh,
  nairaAmount: naira,
  serviceFee: fee,
  status,
  paidAt: paid ? new Date(paid) : null,
  createdAt: new Date(paid ?? "2026-09-26T10:00:00Z"),
});

describe("totals", () => {
  const rows = [
    p("2026-09-21T09:00:00Z", 8000, 224, 10),
    p("2026-09-26T10:00:00Z", 4960, 178, 6.2),
    p("2026-09-26T11:00:00Z", 1050, 0, 10, "FAILED"),
    p(null, 800, 100, 1, "PENDING"),
  ];

  it("sums only paid purchases, counts kWh only when vended, tracks owed", () => {
    const t = summarize(rows);
    expect(t).toMatchObject({
      count: 4, paidCount: 3, kwh: 16.2, electricity: 14010, fees: 402, collected: 14412,
      owedCount: 1, owedAmount: 1050,
    });
  });

  it("buckets by Lagos day including empty days", () => {
    const f = parseFilters({ range: "this_week", groupBy: "day" }, now);
    const b = groupByPeriod(rows, f);
    expect(b.map((x) => x.key)).toEqual([
      "2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24", "2026-09-25", "2026-09-26",
    ]);
    expect(b[0].totals.collected).toBe(8224);
    expect(b[5].totals.paidCount).toBe(2);
  });

  it("groups by key, largest first", () => {
    const g = groupByKey(rows, (r) => ({ id: r.kwhAmount > 5 ? "A" : "B", label: "x" }));
    expect(g[0].id).toBe("A");
  });
});

describe("csvCell", () => {
  it("quotes and neutralises formulas", () => {
    expect(csvCell('a,"b"')).toBe('"a,""b"""');
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell(-5)).toBe("-5");
  });
});
