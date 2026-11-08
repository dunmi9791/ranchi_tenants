import { NextResponse } from "next/server";
import { csvCell } from "@/lib/csv";
import { lagosToday } from "@/lib/leases";
import { propertyRows } from "@/lib/properties";
import { searchText } from "@/lib/search";
import { getSession } from "@/lib/session";

/** GET /api/admin/properties/export?q=<same search as /admin/properties> → CSV */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const q = searchText(new URL(req.url).searchParams.get("q") ?? undefined);
  const rows = await propertyRows(q);

  const header = [
    "property", "address", "company", "units", "occupied", "vacant", "lease_expired", "expiring_30_days", "occupancy_pct",
  ];
  const lines = [header.join(",")];
  for (const { p, counts } of rows) {
    lines.push(
      [
        p.name,
        p.address ?? "",
        p.company.name,
        p.units.length,
        counts.occupied,
        counts.vacant,
        counts.lease_expired,
        counts.expiring,
        p.units.length ? Math.round((counts.occupied / p.units.length) * 100) : "",
      ]
        .map(csvCell)
        .join(",")
    );
  }

  const name = `properties_${lagosToday().toISOString().slice(0, 10)}.csv`;
  return new NextResponse(lines.join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}
