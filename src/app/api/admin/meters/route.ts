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
      user: { select: { id: true, email: true, name: true } },
    },
  });
  return NextResponse.json({ meters });
}

const schema = z.object({
  meterNumber: z.string().min(5),
  label: z.string().optional(),
  companyId: z.string().min(1),
  userEmail: z.string().email().optional(),
});

export async function POST(req: Request) {
  if (!(await assertAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const body = schema.parse(await req.json());
    let userId: string | undefined;
    if (body.userEmail) {
      const user = await prisma.user.findUnique({ where: { email: body.userEmail.toLowerCase() } });
      if (!user) {
        return NextResponse.json({ error: "User email not found" }, { status: 404 });
      }
      userId = user.id;
      await prisma.user.update({
        where: { id: user.id },
        data: { companyId: body.companyId },
      });
    }

    const meter = await prisma.meter.create({
      data: {
        meterNumber: body.meterNumber,
        label: body.label,
        companyId: body.companyId,
        userId,
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
