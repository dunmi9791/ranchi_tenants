import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { propertySchema } from "@/lib/rental-schemas";

async function assertAdmin() {
  const session = await getSession();
  if (!session.user || session.user.role !== "ADMIN") return null;
  return session;
}

export async function POST(req: Request) {
  if (!(await assertAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = propertySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const company = await prisma.company.findUnique({ where: { id: parsed.data.companyId }, select: { id: true } });
  if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });

  const property = await prisma.property.create({
    data: {
      name: parsed.data.name,
      companyId: parsed.data.companyId,
      address: parsed.data.address || null,
      notes: parsed.data.notes || null,
    },
  });
  return NextResponse.json({ property }, { status: 201 });
}
