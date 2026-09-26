import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import bcrypt from "bcryptjs";

async function assertAdmin() {
  const session = await getSession();
  if (!session.user || session.user.role !== "ADMIN") return null;
  return session;
}

export async function GET() {
  if (!(await assertAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const tenants = await prisma.user.findMany({
    where: { role: "TENANT" },
    orderBy: { createdAt: "desc" },
    // never return passwordHash to the browser
    select: {
      id: true,
      name: true,
      email: true,
      leaseExpiryDate: true,
      leaseNotes: true,
      isPaused: true,
      createdAt: true,
      meters: { select: { id: true, meterNumber: true, label: true } },
    },
  });
  return NextResponse.json({ tenants });
}

const createSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  leaseExpiryDate: z.string().optional().nullable(),
  leaseNotes: z.string().optional().nullable(),
});

export async function POST(req: Request) {
  if (!(await assertAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const body = createSchema.parse(await req.json());
    
    const existing = await prisma.user.findUnique({
      where: { email: body.email.toLowerCase() },
    });
    if (existing) {
      return NextResponse.json({ error: "Email already exists" }, { status: 400 });
    }

    const tenant = await prisma.user.create({
      data: {
        name: body.name,
        email: body.email.toLowerCase(),
        passwordHash: await bcrypt.hash(body.password, 10),
        role: "TENANT",
        leaseExpiryDate: body.leaseExpiryDate ? new Date(body.leaseExpiryDate) : null,
        leaseNotes: body.leaseNotes,
      },
      // never return passwordHash to the browser
      select: { id: true, name: true, email: true, leaseExpiryDate: true, leaseNotes: true },
    });

    return NextResponse.json({ tenant }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: "Create failed" }, { status: 500 });
  }
}
