import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { createLeaseTx, leaseDatesError } from "@/lib/lease-admin";
import { syncRentCharges } from "@/lib/rent";
import { firstIssue, leaseTermsSchema } from "@/lib/rental-schemas";

async function assertAdmin() {
  const session = await getSession();
  if (!session.user || session.user.role !== "ADMIN") return null;
  return session;
}

const createSchema = leaseTermsSchema.extend({
  unitId: z.string().min(1, "Choose a unit"),
  tenantId: z.string().min(1, "Choose a tenant"),
  /** Set when renewing: the lease this one follows */
  renewedFromId: z.string().nullable().optional(),
});

export async function POST(req: Request) {
  const session = await assertAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = createSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: firstIssue(parsed.error) }, { status: 400 });
  const body = parsed.data;

  const [unit, tenant] = await Promise.all([
    prisma.unit.findUnique({ where: { id: body.unitId }, select: { id: true, property: { select: { companyId: true } } } }),
    prisma.user.findFirst({ where: { id: body.tenantId, role: "TENANT" }, select: { id: true } }),
  ]);
  if (!unit) return NextResponse.json({ error: "Unit not found" }, { status: 404 });
  if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });

  if (body.renewedFromId) {
    const previous = await prisma.lease.findUnique({
      where: { id: body.renewedFromId },
      select: { unitId: true, tenantId: true, renewal: { select: { id: true } } },
    });
    if (!previous || previous.unitId !== unit.id || previous.tenantId !== tenant.id) {
      return NextResponse.json({ error: "A renewal must be for the same tenant and unit" }, { status: 400 });
    }
    if (previous.renewal) return NextResponse.json({ error: "That lease has already been renewed" }, { status: 400 });
  }

  const dates = { startDate: body.startDate, endDate: body.endDate, moveOutDate: null };
  const clash = await leaseDatesError(unit.id, dates);
  if (clash) return NextResponse.json({ error: clash }, { status: 400 });

  const lease = await prisma.$transaction((tx) =>
    createLeaseTx(tx, { ...body, unitId: unit.id, tenantId: tenant.id }, unit.property.companyId)
  );

  await syncRentCharges({ id: lease.id });
  console.log(`[Admin] ${session.user!.email} created lease ${lease.id} on unit ${unit.id}`);
  return NextResponse.json({ lease }, { status: 201 });
}
