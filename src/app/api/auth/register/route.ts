import { NextResponse } from "next/server";
import { z } from "zod";
import { hashPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

const schema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  meterNumber: z.string().min(5).optional(),
});

export async function POST(req: Request) {
  try {
    const body = schema.parse(await req.json());
    const email = body.email.toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: "Email already registered" }, { status: 409 });
    }

    let companyId: string | null = null;
    let meterId: string | null = null;

    if (body.meterNumber) {
      const meter = await prisma.meter.findUnique({ where: { meterNumber: body.meterNumber } });
      if (!meter) {
        return NextResponse.json({ error: "Meter not found. Ask admin to register it first." }, { status: 404 });
      }
      if (meter.userId) {
        return NextResponse.json({ error: "Meter already linked to another user" }, { status: 409 });
      }
      companyId = meter.companyId;
      meterId = meter.id;
    }

    const user = await prisma.user.create({
      data: {
        email,
        name: body.name,
        passwordHash: await hashPassword(body.password),
        role: "TENANT",
        companyId,
      },
    });

    if (meterId) {
      await prisma.meter.update({ where: { id: meterId }, data: { userId: user.id } });
    }

    const session = await getSession();
    session.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      companyId: user.companyId,
    };
    await session.save();

    return NextResponse.json({
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: "Registration failed" }, { status: 500 });
  }
}
