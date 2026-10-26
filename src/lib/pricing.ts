import type { Company, Settings } from "@prisma/client";
import { prisma } from "./prisma";

/** Smallest kWh step we vend; StronPower's own UI works in 0.1 kWh. */
export const KWH_STEP = 0.1;
export const MIN_KWH = 1;

export type Tariff = {
  /** NGN per kWh, set per company in the app */
  price: number;
  /** VAT % (the company price is all-inclusive, so 0) */
  vatPercent: number;
  /** NGN per kWh the tenant pays for energy */
  unitPrice: number;
  source: "company";
};

export type Quote = {
  kwh: number;
  unitPrice: number;
  /** Energy cost at the company price (kWh × unitPrice) */
  energyAmount: number;
  serviceFee: number;
  /** What the tenant pays via Paystack */
  total: number;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export async function getSettings(): Promise<Settings> {
  return prisma.settings.upsert({ where: { id: "default" }, update: {}, create: { id: "default" } });
}

/**
 * Service fee that covers a "percent + flat" processor charge levied on the TOTAL:
 * after Paystack takes percent% + flat from (energy + fee), we still receive `energy`.
 *   total = (energy + flat) / (1 - percent/100);  fee = total - energy
 * Limited to the cap, rounded up to whole naira so it never falls short.
 */
export function computeServiceFee(
  energyAmount: number,
  s: Pick<Settings, "serviceFeePercent" | "serviceFeeFlat" | "serviceFeeCap">
): number {
  const rate = Math.min(s.serviceFeePercent, 99) / 100;
  let fee = (energyAmount + s.serviceFeeFlat) / (1 - rate) - energyAmount;
  if (s.serviceFeeCap != null) fee = Math.min(fee, s.serviceFeeCap);
  return Math.max(0, Math.ceil(fee - 1e-9));
}

/**
 * Turn the naira the tenant wants to spend into whole-step kWh at the company price.
 * kWh is rounded DOWN so the energy cost never exceeds what they entered; the tenant
 * is charged exactly kWh × unitPrice (+ service fee).
 */
export function quoteForNaira(
  naira: number,
  tariff: Pick<Tariff, "unitPrice">,
  s: Pick<Settings, "serviceFeePercent" | "serviceFeeFlat" | "serviceFeeCap">
): Quote {
  const steps = Math.floor(round2(naira / tariff.unitPrice) / KWH_STEP + 1e-9);
  const kwh = Number((steps * KWH_STEP).toFixed(1));
  const energyAmount = round2(kwh * tariff.unitPrice);
  const serviceFee = computeServiceFee(energyAmount, s);
  return { kwh, unitPrice: tariff.unitPrice, energyAmount, serviceFee, total: round2(energyAmount + serviceFee) };
}

/**
 * NGN/kWh for a company's meters — the price an admin sets in the app (Admin → Companies).
 * StronPower's own tariff is not used: we sell kWh at this price and vend those kWh.
 */
export function getTariff(company: Pick<Company, "nairaPerKwh">): Tariff {
  return { price: company.nairaPerKwh, vatPercent: 0, unitPrice: company.nairaPerKwh, source: "company" };
}
