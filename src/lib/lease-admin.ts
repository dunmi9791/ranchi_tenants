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
