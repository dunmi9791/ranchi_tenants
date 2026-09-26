import type { Company, Settings } from "@prisma/client";
import { prisma } from "./prisma";
import { getMeterRow, stronLogin } from "./stronpower";

/** Smallest kWh step we vend; StronPower's own UI works in 0.1 kWh. */
export const KWH_STEP = 0.1;
export const MIN_KWH = 1;

export type Tariff = {
  /** NGN per kWh before VAT, from StronPower */
  price: number;
  /** VAT % from StronPower */
  vatPercent: number;
  /** NGN per kWh including VAT — what StronPower charges */
  unitPrice: number;
  source: "stronpower" | "dry-run";
};

export type Quote = {
  kwh: number;
  unitPrice: number;
  /** Energy cost recorded on StronPower */
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
 * Turn the naira the tenant wants to spend into whole-step kWh at StronPower's price.
 * kWh is rounded DOWN so the energy cost never exceeds what they entered; the tenant
 * is charged exactly kWh × unitPrice (+ service fee), which is what StronPower records.
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

const CACHE_MS = 5 * 60 * 1000;
const tariffCache = new Map<string, { tariff: Tariff; at: number }>();

/**
 * Current NGN/kWh for a meter, read from StronPower's vending grid.
 * Cached briefly for quotes; pass fresh=true when creating a purchase.
 * With STRON_DRY_RUN=true the company's configured nairaPerKwh is used instead.
 */
export async function getTariff(
  company: Pick<Company, "id" | "stronBaseUrl" | "stronCompanyName" | "stronUsername" | "stronPassword" | "nairaPerKwh">,
  meterNumber: string,
  { fresh = false } = {}
): Promise<Tariff> {
  if (process.env.STRON_DRY_RUN === "true") {
    return { price: company.nairaPerKwh, vatPercent: 0, unitPrice: company.nairaPerKwh, source: "dry-run" };
  }

  const key = `${company.id}:${meterNumber}`;
  const hit = tariffCache.get(key);
  if (!fresh && hit && Date.now() - hit.at < CACHE_MS) return hit.tariff;

  const jar = await stronLogin(company);
  const row = await getMeterRow(company, jar, meterNumber);
  const price = Number(row.PRICE);
  const vatPercent = Number(row.VAT || 0);
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error(`StronPower returned no usable price for meter ${meterNumber}`);
  }
  const tariff: Tariff = {
    price,
    vatPercent: Number.isFinite(vatPercent) ? vatPercent : 0,
    unitPrice: round2(price * (1 + (Number.isFinite(vatPercent) ? vatPercent : 0) / 100)),
    source: "stronpower",
  };
  tariffCache.set(key, { tariff, at: Date.now() });
  return tariff;
}
