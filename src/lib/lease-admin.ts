import type { Prisma, RentFrequency } from "@prisma/client";
import { prisma } from "./prisma";
import { type LeaseDates, effectiveEnd, fmtDay, leasesOverlap } from "./leases";

/** Error message if the dates are inconsistent or clash with another lease on the unit, else null. */
export async function leaseDatesError(
  unitId: string,
  dates: LeaseDates,
  excludeLeaseId?: string
): Promise<string | null> {
  if (dates.endDate && dates.endDate < dates.startDate) return "The end date is before the start date";
  if (dates.moveOutDate && dates.moveOutDate < dates.startDate) return "The move-out date is before the start date";

  const others = await prisma.lease.findMany({
    where: { unitId, ...(excludeLeaseId ? { id: { not: excludeLeaseId } } : {}) },
    select: { startDate: true, endDate: true, moveOutDate: true, tenant: { select: { name: true } } },
  });
  const clash = others.find((o) => leasesOverlap(dates, o));
  if (!clash) return null;
  const end = effectiveEnd(clash);
  return `Overlaps ${clash.tenant.name}'s lease (${fmtDay(clash.startDate)} – ${end ? fmtDay(end) : "rolling"}). End that lease first or change the dates.`;
}

export type NewLease = {
  unitId: string;
  tenantId: string;
  startDate: Date;
  endDate: Date | null;
  rentAmount: number;
  rentFrequency: RentFrequency;
  depositAmount?: number | null;
  notes?: string | null;
  renewedFromId?: string | null;
};

/**
 * Create a lease inside a transaction (dates already checked with leaseDatesError).
 * Also links a tenant without a company to the unit's company.
 */
export async function createLeaseTx(tx: Prisma.TransactionClient, l: NewLease, unitCompanyId: string) {
  // A different tenant whose lease ran out without a recorded move-out has evidently left:
  // close their lease on its end date so the unit's history reads correctly.
  if (!l.renewedFromId) {
    const lapsed = await tx.lease.findMany({
      where: {
        unitId: l.unitId,
        tenantId: { not: l.tenantId },
        moveOutDate: null,
        renewal: null,
        endDate: { not: null, lt: l.startDate },
      },
      select: { id: true, endDate: true },
    });
    for (const old of lapsed) {
      await tx.lease.update({ where: { id: old.id }, data: { moveOutDate: old.endDate, endReason: "Unit re-let" } });
    }
  }
  const created = await tx.lease.create({
    data: {
      unitId: l.unitId,
      tenantId: l.tenantId,
      startDate: l.startDate,
      endDate: l.endDate,
      rentAmount: l.rentAmount,
      rentFrequency: l.rentFrequency,
      depositAmount: l.depositAmount ?? null,
      notes: l.notes || null,
      renewedFromId: l.renewedFromId || null,
    },
  });
  await tx.user.updateMany({ where: { id: l.tenantId, companyId: null }, data: { companyId: unitCompanyId } });
  return created;
}
