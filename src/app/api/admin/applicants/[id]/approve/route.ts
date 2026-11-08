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

const approveSchema = leaseTermsSchema.extend({
  unitId: z.string().min(1, "Choose a unit"),
});

/**
 * Make an applicant a tenant: create their User (with the password they registered with)
 * and their first lease, then remove the applicant record. All or nothing.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await assertAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const parsed = approveSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: firstIssue(parsed.error) }, { status: 400 });
  const body = parsed.data;

  const [applicant, unit] = await Promise.all([
    prisma.applicant.findUnique({ where: { id } }),
    prisma.unit.findUnique({ where: { id: body.unitId }, select: { id: true, property: { select: { companyId: true } } } }),
  ]);
  if (!applicant) return NextResponse.json({ error: "Applicant not found" }, { status: 404 });
  if (!unit) return NextResponse.json({ error: "Unit not found" }, { status: 404 });
  if (await prisma.user.findUnique({ where: { email: applicant.email }, select: { id: true } })) {
    return NextResponse.json({ error: `An account already exists for ${applicant.email}` }, { status: 409 });
  }

  const clash = await leaseDatesError(unit.id, { startDate: body.startDate, endDate: body.endDate, moveOutDate: null });
  if (clash) return NextResponse.json({ error: clash }, { status: 400 });

  const { tenant, lease } = await prisma.$transaction(async (tx) => {
    const tenant = await tx.user.create({
      data: {
        email: applicant.email,
        name: applicant.name,
        phone: applicant.phone,
        passwordHash: applicant.passwordHash,
        role: "TENANT",
        companyId: unit.property.companyId,
      },
      select: { id: true, name: true, email: true },
    });
    const lease = await createLeaseTx(tx, { ...body, unitId: unit.id, tenantId: tenant.id }, unit.property.companyId);
    await tx.applicant.delete({ where: { id: applicant.id } });
    return { tenant, lease };
  });

  await syncRentCharges({ id: lease.id });
  console.log(`[Admin] ${session.user!.email} approved applicant ${applicant.email} as tenant ${tenant.id} with lease ${lease.id}`);
  return NextResponse.json({ tenant, lease }, { status: 201 });
}
