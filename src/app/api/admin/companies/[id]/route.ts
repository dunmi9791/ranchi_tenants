import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

async function assertAdmin() {
  const session = await getSession();
  if (!session.user || session.user.role !== "ADMIN") return null;
  return session;
}

const updateSchema = z.object({
  nairaPerKwh: z.number().positive().max(1_000_000),
});

/** Set a company's ₦/kWh price — what its tenants pay per kWh from the next quote on. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await assertAdmin();
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const parsed = updateSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const existing = await prisma.company.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: "Company not found" }, { status: 404 });

  const company = await prisma.company.update({
    where: { id },
    data: { nairaPerKwh: parsed.data.nairaPerKwh },
    // never return stronPassword to the browser
    select: { id: true, name: true, nairaPerKwh: true },
  });
  console.log(`[Admin] ${session.user!.email} set ${company.name} price to ₦${company.nairaPerKwh}/kWh`);
  return NextResponse.json({ company });
}
