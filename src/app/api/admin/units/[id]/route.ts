import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { unitSchema } from "@/lib/rental-schemas";

async function assertAdmin() {
  const session = await getSession();
  if (!session.user || session.user.role !== "ADMIN") return null;
  return session;
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await assertAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const parsed = unitSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const existing = await prisma.unit.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: "Unit not found" }, { status: 404 });

  // The default rent only seeds new leases; existing leases keep their own terms.
  const unit = await prisma.unit.update({
    where: { id },
    data: {
      name: parsed.data.name,
      rentAmount: parsed.data.rentAmount ?? null,
      rentFrequency: parsed.data.rentFrequency,
      notes: parsed.data.notes || null,
    },
  });
  return NextResponse.json({ unit });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await assertAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const unit = await prisma.unit.findUnique({
    where: { id },
    select: { _count: { select: { leases: true, meters: true } } },
  });
  if (!unit) return NextResponse.json({ error: "Unit not found" }, { status: 404 });
  if (unit._count.leases > 0) {
    return NextResponse.json({ error: "This unit has lease history and can't be deleted" }, { status: 400 });
  }
  if (unit._count.meters > 0) {
    return NextResponse.json({ error: "Move its meters to another unit first" }, { status: 400 });
  }
  await prisma.unit.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
