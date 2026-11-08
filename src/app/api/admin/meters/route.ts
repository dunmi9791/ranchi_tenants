import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

async function assertAdmin() {
  const session = await getSession();
  if (!session.user || session.user.role !== "ADMIN") return null;
  return session;
}

export async function GET() {
  if (!(await assertAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const meters = await prisma.meter.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      company: { select: { id: true, name: true } },
      unit: { select: { id: true, name: true, property: { select: { id: true, name: true } } } },
    },
  });
  return NextResponse.json({ meters });
}

const schema = z.object({
  meterNumber: z.string().min(5),
  label: z.string().optional(),
  companyId: z.string().min(1),
  /** Unit the meter supplies; "" = not installed in a unit */
  unitId: z.string().optional().or(z.literal("")),
});

const patchSchema = schema.partial().extend({ id: z.string().min(1) });

/**
 * A meter is vended through its company's StronPower account, so it can only be placed in a
 * unit of a property under that same company. Returns an error message, or null if fine.
 */
async function unitError(unitId: string, companyId: string): Promise<string | null> {
  const unit = await prisma.unit.findUnique({
    where: { id: unitId },
    select: { property: { select: { companyId: true, name: true } } },
  });
  if (!unit) return "Unit not found";
  if (unit.property.companyId !== companyId) {
    return `${unit.property.name} belongs to a different company than this meter`;
  }
  return null;
}

export async function PATCH(req: Request) {
  if (!(await assertAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const body = patchSchema.parse(await req.json());
    const existing = await prisma.meter.findUnique({ where: { id: body.id } });
    if (!existing) {
      return NextResponse.json({ error: "Meter not found" }, { status: 404 });
    }

    const companyId = body.companyId || existing.companyId;
    const unitId = body.unitId === undefined ? existing.unitId : body.unitId || null;
    if (unitId) {
      const error = await unitError(unitId, companyId);
      if (error) return NextResponse.json({ error }, { status: 400 });
    }

    const meter = await prisma.meter.update({
      where: { id: body.id },
      data: {
        meterNumber: body.meterNumber,
        label: body.label,
        companyId: body.companyId,
        unitId,
      },
    });
    return NextResponse.json({ meter });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  if (!(await assertAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const body = schema.parse(await req.json());
    if (body.unitId) {
      const error = await unitError(body.unitId, body.companyId);
      if (error) return NextResponse.json({ error }, { status: 400 });
    }

    const meter = await prisma.meter.create({
      data: {
        meterNumber: body.meterNumber,
        label: body.label,
        companyId: body.companyId,
        unitId: body.unitId || null,
      },
    });
    return NextResponse.json({ meter }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: "Create failed" }, { status: 500 });
  }
}
