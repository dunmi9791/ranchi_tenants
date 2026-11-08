import { NextResponse } from "next/server";
import { csvCell } from "@/lib/csv";
import { FREQUENCY_LABELS, daysLeft, effectiveEnd, lagosToday } from "@/lib/leases";
import { occupancyLeaseSelect, occupancyOf } from "@/lib/occupancy";
import { prisma } from "@/lib/prisma";
import { propertyWhere } from "@/lib/properties";
import { searchText } from "@/lib/search";
import { getSession } from "@/lib/session";

const day = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : "");

/**
 * GET /api/admin/properties/occupants?propertyId=<id> | ?q=<same search as /admin/properties> → CSV
 * One row per unit (vacant units included) with its current tenant, lease and meters.
 */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const params = new URL(req.url).searchParams;
  const propertyId = params.get("propertyId");
  const q = searchText(params.get("q") ?? undefined);

  const properties = await prisma.property.findMany({
    where: propertyId ? { id: propertyId } : propertyWhere(q),
    orderBy: { name: "asc" },
    include: {
      company: { select: { name: true } },
      units: {
        orderBy: { name: "asc" },
        include: {
          meters: { orderBy: { meterNumber: "asc" }, select: { meterNumber: true, label: true, company: { select: { name: true } } } },
          leases: {
            select: {
              ...occupancyLeaseSelect,
              depositAmount: true,
              notes: true,
              tenant: { select: { id: true, name: true, email: true, phone: true, isPaused: true } },
            },
          },
        },
      },
    },
  });
  if (propertyId && properties.length === 0) {
    return NextResponse.json({ error: "Property not found" }, { status: 404 });
  }

  const today = lagosToday();
  const header = [
    "property", "address", "company", "unit", "status",
    "tenant", "tenant_email", "tenant_phone", "tenant_account",
    "lease_start", "lease_end", "days_left", "rent_ngn", "rent_frequency", "deposit_ngn", "lease_notes",
    "meters", "meter_labels", "meter_companies",
    "next_tenant", "next_lease_start", "unit_notes",
  ];
  const lines = [header.join(",")];
  for (const p of properties) {
    for (const u of p.units) {
      const o = occupancyOf(u.leases, today);
      const l = o.lease;
      lines.push(
        [
          p.name,
          p.address ?? "",
          p.company.name,
          u.name,
          o.status,
          l?.tenant.name ?? "",
          l?.tenant.email ?? "",
          l?.tenant.phone ?? "",
          l ? (l.tenant.isPaused ? "paused" : "active") : "",
          day(l?.startDate),
          l ? day(effectiveEnd(l)) || "rolling" : "",
          l ? (daysLeft(l, today) ?? "") : "",
          l?.rentAmount ?? "",
          l ? FREQUENCY_LABELS[l.rentFrequency] : "",
          l?.depositAmount ?? "",
          l?.notes?.replace(/\s+/g, " ") ?? "",
          u.meters.map((m) => m.meterNumber).join("; "),
          u.meters.map((m) => m.label ?? "").join("; "),
          u.meters.map((m) => m.company.name).join("; "),
          o.upcoming?.tenant.name ?? "",
          day(o.upcoming?.startDate),
          u.notes?.replace(/\s+/g, " ") ?? "",
        ]
          .map(csvCell)
          .join(",")
      );
    }
  }

  const slug = propertyId ? properties[0].name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "property" : "all";
  const name = `occupants_${slug}_${day(today)}.csv`;
  return new NextResponse(lines.join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}
