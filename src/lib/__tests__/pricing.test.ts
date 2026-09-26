import { describe, expect, it } from "vitest";
import { computeServiceFee, quoteForNaira } from "../pricing";

const paystackRate = { serviceFeePercent: 1.5, serviceFeeFlat: 100, serviceFeeCap: 2000 };
const noFee = { serviceFeePercent: 0, serviceFeeFlat: 0, serviceFeeCap: null };

/** Paystack local card charge on a total: 1.5% + ₦100 (waived < ₦2,500), capped at ₦2,000. */
const paystackCharge = (total: number) => Math.min(total * 0.015 + (total >= 2500 ? 100 : 0), 2000);

describe("quoteForNaira", () => {
  it("rounds kWh down to 0.1 and charges exactly kWh × StronPower price", () => {
    const q = quoteForNaira(5000, { unitPrice: 800 }, noFee);
    expect(q.kwh).toBe(6.2);
    expect(q.energyAmount).toBe(4960);
    expect(q.total).toBe(4960);
  });

  it("matches StronPower's own receipt for 10 kWh at ₦800 (GA651: ₦8,000)", () => {
    const q = quoteForNaira(8000, { unitPrice: 800 }, noFee);
    expect(q.kwh).toBe(10);
    expect(q.energyAmount).toBe(8000);
  });

  it("avoids float drift on exact multiples", () => {
    expect(quoteForNaira(240, { unitPrice: 800 }, noFee).kwh).toBe(0.3);
    expect(quoteForNaira(80, { unitPrice: 800 }, noFee).kwh).toBe(0.1);
  });

  it("never charges more energy than the tenant entered", () => {
    for (const naira of [999, 1234, 5000, 7999, 123456]) {
      const q = quoteForNaira(naira, { unitPrice: 777.77 }, noFee);
      expect(q.energyAmount).toBeLessThanOrEqual(naira);
    }
  });
});

describe("computeServiceFee", () => {
  it("covers Paystack's charge on the total so the full energy amount is received", () => {
    for (const energy of [2500, 4960, 8000, 20000, 100000]) {
      const fee = computeServiceFee(energy, paystackRate);
      expect(fee).toBeGreaterThanOrEqual(paystackCharge(energy + fee));
    }
  });

  it("respects the cap", () => {
    expect(computeServiceFee(1_000_000, paystackRate)).toBe(2000);
  });

  it("is zero when disabled and whole naira otherwise", () => {
    expect(computeServiceFee(8000, noFee)).toBe(0);
    expect(Number.isInteger(computeServiceFee(4960, paystackRate))).toBe(true);
  });

  it("is included in the quote total", () => {
    const q = quoteForNaira(8000, { unitPrice: 800 }, paystackRate);
    expect(q.serviceFee).toBe(computeServiceFee(8000, paystackRate));
    expect(q.total).toBe(8000 + q.serviceFee);
  });
});
