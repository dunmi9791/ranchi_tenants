import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { unitSchema } from "@/lib/rental-schemas";

async function assertAdmin() {
  const session = await getSession();
  if (!session.user || session.user.role !== "ADMIN") return null;
  return session;
}

const createSchema = unitSchema.extend({ propertyId: z.string().min(1) });

export async function POST(req: Request) {
  if (!(await assertAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = createSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const property = await prisma.property.findUnique({ where: { id: parsed.data.propertyId }, select: { id: true } });
  if (!property) return NextResponse.json({ error: "Property not found" }, { status: 404 });

  const unit = await prisma.unit.create({
    data: {
      propertyId: property.id,
      name: parsed.data.name,
      rentAmount: parsed.data.rentAmount ?? null,
      rentFrequency: parsed.data.rentFrequency,
      notes: parsed.data.notes || null,
    },
  });
  return NextResponse.json({ unit }, { status: 201 });
}
