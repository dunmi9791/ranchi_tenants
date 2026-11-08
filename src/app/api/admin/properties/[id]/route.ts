import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { propertySchema } from "@/lib/rental-schemas";

async function assertAdmin() {
  const session = await getSession();
  if (!session.user || session.user.role !== "ADMIN") return null;
  return session;
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await assertAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const parsed = propertySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const existing = await prisma.property.findUnique({
    where: { id },
    select: { companyId: true, units: { select: { meters: { select: { id: true } } } } },
  });
  if (!existing) return NextResponse.json({ error: "Property not found" }, { status: 404 });
  // Meters are vended through their company's StronPower account, so a property with meters can't move.
  if (parsed.data.companyId !== existing.companyId && existing.units.some((u) => u.meters.length > 0)) {
    return NextResponse.json(
      { error: "This property's units have meters on its current company. Move or remove the meters first." },
      { status: 400 }
    );
  }

  const property = await prisma.property.update({
    where: { id },
    data: {
      name: parsed.data.name,
      companyId: parsed.data.companyId,
      address: parsed.data.address || null,
      notes: parsed.data.notes || null,
    },
  });
  return NextResponse.json({ property });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await assertAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const property = await prisma.property.findUnique({ where: { id }, select: { _count: { select: { units: true } } } });
  if (!property) return NextResponse.json({ error: "Property not found" }, { status: 404 });
  if (property._count.units > 0) {
    return NextResponse.json({ error: "Delete its units first" }, { status: 400 });
  }
  await prisma.property.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
