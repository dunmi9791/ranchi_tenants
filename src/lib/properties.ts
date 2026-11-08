import type { Prisma } from "@prisma/client";
import { daysLeft, lagosToday } from "@/lib/leases";
import { occupancyLeaseSelect, occupancyOf } from "@/lib/occupancy";
import { prisma } from "@/lib/prisma";
import { wordsWhere } from "@/lib/search";

/** The /admin/properties search: property, address, company or unit name. */
export function propertyWhere(q: string | null) {
  return wordsWhere<Prisma.PropertyWhereInput>(q, (c) => [
    { name: c },
    { address: c },
    { company: { name: c } },
    { units: { some: { name: c } } },
  ]);
}

/** Properties matching the admin search, each with its unit occupancy counts. Shared by the list and its CSV export. */
export async function propertyRows(q: string | null) {
  const properties = await prisma.property.findMany({
    where: propertyWhere(q),
    orderBy: { name: "asc" },
    include: {
      company: { select: { name: true } },
      units: { select: { id: true, leases: { select: occupancyLeaseSelect } } },
    },
  });

  const today = lagosToday();
  return properties.map((p) => {
    const counts = { occupied: 0, lease_expired: 0, vacant: 0, expiring: 0 };
    for (const u of p.units) {
      const o = occupancyOf(u.leases, today);
      counts[o.status]++;
      if (o.status === "occupied") {
        const left = daysLeft(o.lease, today);
        if (left != null && left <= 30) counts.expiring++;
      }
    }
    return { p, counts };
  });
}
