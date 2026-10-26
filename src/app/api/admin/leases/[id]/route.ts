import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { leaseDatesError } from "@/lib/lease-admin";
import { syncRentCharges } from "@/lib/rent";
import { firstIssue, leaseTermsSchema, optionalDaySchema } from "@/lib/rental-schemas";

async function assertAdmin() {
  const session = await getSession();
  if (!session.user || session.user.role !== "ADMIN") return null;
  return session;
}

/**
 * Edit a lease's terms, or end it by setting a move-out date (clear it to undo).
 * Unit and tenant are fixed: to move a tenant, end this lease and create a new one.
 * Unpaid rent charges follow the new terms; charges with payments are kept as they are.
 */
const updateSchema = leaseTermsSchema.partial().extend({
  moveOutDate: optionalDaySchema,
  endReason: z.string().trim().max(300).nullable().optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await assertAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const raw = await req.json().catch(() => ({}));
  const parsed = updateSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: firstIssue(parsed.error) }, { status: 400 });
  const body = parsed.data;

  const lease = await prisma.lease.findUnique({ where: { id } });
  if (!lease) return NextResponse.json({ error: "Lease not found" }, { status: 404 });

  // Optional fields: absent = unchanged, null / "" = cleared.
  const has = (k: string) => Object.prototype.hasOwnProperty.call(raw, k);
  const dates = {
    startDate: body.startDate ?? lease.startDate,
    endDate: has("endDate") ? (body.endDate ?? null) : lease.endDate,
    moveOutDate: has("moveOutDate") ? (body.moveOutDate ?? null) : lease.moveOutDate,
  };
  const clash = await leaseDatesError(lease.unitId, dates, lease.id);
  if (clash) return NextResponse.json({ error: clash }, { status: 400 });

  const updated = await prisma.lease.update({
    where: { id },
    data: {
      ...dates,
      rentAmount: body.rentAmount,
      rentFrequency: body.rentFrequency,
      depositAmount: has("depositAmount") ? (body.depositAmount ?? null) : undefined,
      notes: has("notes") ? body.notes || null : undefined,
      endReason: dates.moveOutDate ? (has("endReason") ? body.endReason || null : undefined) : null,
    },
  });
  await syncRentCharges({ id });
  console.log(`[Admin] ${session.user!.email} updated lease ${id}`);
  return NextResponse.json({ lease: updated });
}

/** Delete a lease entered by mistake; only while no rent has been paid against it. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await assertAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const lease = await prisma.lease.findUnique({
    where: { id },
    select: { renewal: { select: { id: true } }, rentCharges: { select: { _count: { select: { payments: true } } } } },
  });
  if (!lease) return NextResponse.json({ error: "Lease not found" }, { status: 404 });
  if (lease.rentCharges.some((c) => c._count.payments > 0)) {
    return NextResponse.json({ error: "Rent has been paid on this lease; end it instead" }, { status: 400 });
  }
  if (lease.renewal) return NextResponse.json({ error: "Delete its renewal first" }, { status: 400 });
  await prisma.lease.delete({ where: { id } });
  console.log(`[Admin] ${session.user!.email} deleted lease ${id}`);
  return NextResponse.json({ ok: true });
}
