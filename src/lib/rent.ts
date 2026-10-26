import type { Prisma, RentFrequency } from "@prisma/client";
import { prisma } from "./prisma";
import { verifyTransaction } from "./paystack";
import { DAY_MS, FREQUENCY_MONTHS, type LeaseDates, addDays, addMonths, effectiveEnd, lagosToday } from "./leases";

/** Rent charges appear this many days before they fall due, so tenants can pay ahead. */
export const CHARGE_LEAD_DAYS = 31;

/** Paystack references for rent start with this; electricity purchases use "rch_". */
export const RENT_REFERENCE_PREFIX = "rnt_";

export type ScheduledCharge = { periodStart: Date; periodEnd: Date; dueDate: Date; amount: number };

/**
 * Rent periods of a lease that start on or before `horizon`, paid in advance on each period's
 * first day. Periods are counted from the start date (so 31 Jan monthly → 28 Feb → 31 Mar),
 * and the last one stops at the end / move-out date with the rent pro-rated by days.
 */
export function rentSchedule(
  lease: LeaseDates & { rentAmount: number; rentFrequency: RentFrequency },
  horizon: Date
): ScheduledCharge[] {
  if (!(lease.rentAmount > 0)) return [];
  const months = FREQUENCY_MONTHS[lease.rentFrequency];
  const end = effectiveEnd(lease);
  const out: ScheduledCharge[] = [];
  for (let i = 0; ; i++) {
    const periodStart = addMonths(lease.startDate, i * months);
    if (periodStart > horizon || (end && periodStart > end)) break;
    const fullEnd = addDays(addMonths(lease.startDate, (i + 1) * months), -1);
    const periodEnd = end && end < fullEnd ? end : fullEnd;
    const days = (d: Date) => Math.round((d.getTime() - periodStart.getTime()) / DAY_MS) + 1;
    const amount =
      periodEnd < fullEnd ? Math.round((lease.rentAmount * days(periodEnd)) / days(fullEnd)) : lease.rentAmount;
    out.push({ periodStart, periodEnd, dueDate: periodStart, amount });
  }
  return out;
}

type PaymentLike = { amount: number; status: string };

export function amountPaid(payments: PaymentLike[]): number {
  return payments.filter((p) => p.status === "PAID").reduce((s, p) => s + p.amount, 0);
}

export type ChargeState = "paid" | "overdue" | "due" | "upcoming";

/** Outstanding balance and state of a charge; "due" means due today. */
export function chargeStatus(
  charge: { amount: number; dueDate: Date; payments: PaymentLike[] },
  today: Date
): { paid: number; balance: number; state: ChargeState } {
  const paid = amountPaid(charge.payments);
  const balance = Math.max(0, Math.round((charge.amount - paid) * 100) / 100);
  const state: ChargeState =
    balance <= 0 ? "paid" : charge.dueDate < today ? "overdue" : charge.dueDate.getTime() === today.getTime() ? "due" : "upcoming";
  return { paid, balance, state };
}

/**
 * Bring stored charges in line with the leases' schedules: add periods that have come within
 * CHARGE_LEAD_DAYS, and update or remove charges with no payments whose lease terms changed
 * (rent edited, moved out early). Charges with any payment are left alone. Idempotent.
 */
export async function syncRentCharges(where: Prisma.LeaseWhereInput = {}, now: Date = new Date()) {
  const horizon = addDays(lagosToday(now), CHARGE_LEAD_DAYS);
  const leases = await prisma.lease.findMany({
    where,
    select: {
      id: true,
      startDate: true,
      endDate: true,
      moveOutDate: true,
      rentAmount: true,
      rentFrequency: true,
      rentCharges: { select: { id: true, periodStart: true, periodEnd: true, amount: true, _count: { select: { payments: true } } } },
    },
  });

  const ops: Prisma.PrismaPromise<unknown>[] = [];
  for (const lease of leases) {
    const wanted = new Map(rentSchedule(lease, horizon).map((c) => [c.periodStart.getTime(), c]));
    for (const existing of lease.rentCharges) {
      const want = wanted.get(existing.periodStart.getTime());
      wanted.delete(existing.periodStart.getTime());
      if (existing._count.payments > 0) continue;
      if (!want) {
        ops.push(prisma.rentCharge.delete({ where: { id: existing.id } }));
      } else if (want.amount !== existing.amount || want.periodEnd.getTime() !== existing.periodEnd.getTime()) {
        ops.push(
          prisma.rentCharge.update({
            where: { id: existing.id },
            data: { amount: want.amount, periodEnd: want.periodEnd },
          })
        );
      }
    }
    if (wanted.size > 0) {
      ops.push(
        prisma.rentCharge.createMany({ data: [...wanted.values()].map((c) => ({ leaseId: lease.id, ...c })) })
      );
    }
  }
  if (ops.length > 0) await prisma.$transaction(ops);
}

/**
 * Confirm a Paystack rent payment exactly once (webhook and post-payment redirect both call
 * this). The PENDING → PAID transition is atomic.
 */
export async function confirmRentPayment(reference: string) {
  const payment = await prisma.rentPayment.findUnique({ where: { paystackReference: reference } });
  if (!payment) return { ok: false as const, note: "unknown reference" };
  if (payment.status !== "PENDING") return { ok: true as const, note: `already ${payment.status}` };

  const tx = await verifyTransaction(reference);
  if (tx.status !== "success") return { ok: false as const, note: `paystack status ${tx.status}` };
  return markRentPaid(payment.id, tx.amount);
}

/** Atomically settle a pending rent payment, checking Paystack's amount (kobo) when given. */
export async function markRentPaid(paymentId: string, paidKobo?: number) {
  const payment = await prisma.rentPayment.findUnique({ where: { id: paymentId } });
  if (!payment) return { ok: false as const, note: "unknown payment" };
  const expectedKobo = Math.round((payment.amount + payment.serviceFee) * 100);
  if (paidKobo !== undefined && paidKobo < expectedKobo) {
    await prisma.rentPayment.updateMany({
      where: { id: payment.id, status: "PENDING" },
      data: { status: "FAILED", errorMessage: `Amount mismatch: paid ${paidKobo} kobo, expected ${expectedKobo}` },
    });
    return { ok: false as const, note: "amount mismatch" };
  }
  const claimed = await prisma.rentPayment.updateMany({
    where: { id: payment.id, status: "PENDING" },
    data: { status: "PAID", paidAt: new Date() },
  });
  if (claimed.count === 0) return { ok: true as const, note: "claimed elsewhere" };
  console.log(`[Rent] payment ${payment.id} (${payment.paystackReference}) confirmed`);
  return { ok: true as const, note: "paid" };
}
