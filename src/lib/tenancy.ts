import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { lagosToday } from "./leases";

/** Leases in force today (same rule as leaseState(...) === "active"). */
export function activeLeaseWhere(today: Date = lagosToday()): Prisma.LeaseWhereInput {
  return {
    startDate: { lte: today },
    AND: [
      { OR: [{ endDate: null }, { endDate: { gte: today } }] },
      { OR: [{ moveOutDate: null }, { moveOutDate: { gte: today } }] },
    ],
  };
}

/** Meters a tenant may top up: those on units where they hold a lease in force today. */
export function tenantMetersWhere(tenantId: string, today: Date = lagosToday()): Prisma.MeterWhereInput {
  return { unit: { leases: { some: { tenantId, ...activeLeaseWhere(today) } } } };
}

/** The meter with its company if this tenant may buy for it right now, else null. */
export function findTenantMeter(meterId: string, tenantId: string) {
  return prisma.meter.findFirst({
    where: { id: meterId, ...tenantMetersWhere(tenantId) },
    include: { company: true },
  });
}
