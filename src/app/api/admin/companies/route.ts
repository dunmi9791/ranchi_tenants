import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

async function assertAdmin() {
  const session = await getSession();
  if (!session.user || session.user.role !== "ADMIN") {
    return null;
  }
  return session;
}

export async function GET() {
  if (!(await assertAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const companies = await prisma.company.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      stronBaseUrl: true,
      stronCompanyName: true,
      stronUsername: true,
      // never return stronPassword to browser
      nairaPerKwh: true,
      createdAt: true,
      _count: { select: { meters: true, users: true } },
    },
  });
  return NextResponse.json({ companies });
}

const createSchema = z.object({
  name: z.string().min(2),
  stronBaseUrl: z.string().url(),
  stronCompanyName: z.string().min(1),
  stronUsername: z.string().min(1),
  stronPassword: z.string().min(1),
  nairaPerKwh: z.number().positive(),
});

export async function POST(req: Request) {
  if (!(await assertAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const body = createSchema.parse(await req.json());
    const company = await prisma.company.create({
      data: body,
      select: {
        id: true,
        name: true,
        stronBaseUrl: true,
        stronCompanyName: true,
        stronUsername: true,
        nairaPerKwh: true,
      },
    });
    return NextResponse.json({ company }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid input", details: err.flatten() }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: "Create failed" }, { status: 500 });
  }
}
