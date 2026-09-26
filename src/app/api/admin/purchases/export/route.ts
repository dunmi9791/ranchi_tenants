import { NextResponse } from "next/server";
import { lagosDay, parseFilters, purchaseWhere } from "@/lib/analytics";
import { csvCell } from "@/lib/csv";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

/** GET /api/admin/purchases/export?<same filters as /admin/purchases> → CSV */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const f = parseFilters(Object.fromEntries(new URL(req.url).searchParams));
  const rows = await prisma.purchase.findMany({
    where: purchaseWhere(f),
    orderBy: { createdAt: "asc" },
    include: {
      meter: { select: { meterNumber: true } },
      user: { select: { name: true, email: true } },
      company: { select: { name: true } },
    },
  });

  const header = [
    "created_at_utc", "paid_at_utc", "reference", "status", "company", "tenant", "tenant_email", "meter",
    "kwh", "unit_price_ngn", "electricity_ngn", "service_fee_ngn", "total_paid_ngn", "sts_pin", "error",
  ];
  const lines = [header.join(",")];
  for (const p of rows) {
    lines.push(
      [
        p.createdAt.toISOString(),
        p.paidAt?.toISOString() ?? "",
        p.paystackReference,
        p.status,
        p.company.name,
        p.user.name,
        p.user.email,
        p.meter.meterNumber,
        p.kwhAmount,
        p.unitPrice ?? "",
        p.nairaAmount,
        p.serviceFee,
        p.paidAt ? Math.round((p.nairaAmount + p.serviceFee) * 100) / 100 : "",
        p.stsPin ?? "",
        p.errorMessage?.replace(/\s+/g, " ").slice(0, 200) ?? "",
      ]
        .map(csvCell)
        .join(",")
    );
  }

  const name = `purchases_${lagosDay(f.from)}_to_${lagosDay(new Date(f.to.getTime() - 1))}.csv`;
  return new NextResponse(lines.join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}
