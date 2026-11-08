import type { Prisma } from "@prisma/client";
import { type Occupancy, effectiveEnd, fmtDay, lagosToday, unitOccupancy } from "./leases";

/** Lease fields needed to work out a unit's occupancy. */
export const occupancyLeaseSelect = {
  id: true,
  startDate: true,
  endDate: true,
  moveOutDate: true,
  rentAmount: true,
  rentFrequency: true,
  tenant: { select: { id: true, name: true } },
  renewal: { select: { id: true } },
} satisfies Prisma.LeaseSelect;

type SelectedLease = Prisma.LeaseGetPayload<{ select: typeof occupancyLeaseSelect }>;
export type UnitLease = SelectedLease & { hasRenewal: boolean };

export function occupancyOf<L extends SelectedLease>(
  leases: L[],
  today: Date = lagosToday()
): Occupancy<L & { hasRenewal: boolean }> {
  return unitOccupancy(
    leases.map((l) => ({ ...l, hasRenewal: !!l.renewal })),
    today
  );
}

/** Short status text, e.g. for a unit picker: "vacant", "occupied until 31 Dec 2026". */
export function occupancyText(o: Occupancy<UnitLease>): string {
  if (o.status === "vacant") return o.upcoming ? `vacant, let from ${fmtDay(o.upcoming.startDate)}` : "vacant";
  if (o.status === "lease_expired") return `lease expired ${fmtDay(o.lease.endDate!)}`;
  const end = effectiveEnd(o.lease);
  return end ? `occupied until ${fmtDay(end)}` : "occupied, rolling";
}
