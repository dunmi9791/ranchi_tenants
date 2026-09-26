import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

const schema = z.object({
  paused: z.boolean(),
  reason: z.string().max(200).optional().nullable(),
});

/** Pause or resume a tenant's login. Pausing ends their current sessions immediately. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const { paused, reason } = parsed.data;

  const tenant = await prisma.user.findFirst({ where: { id, role: "TENANT" }, select: { id: true } });
  if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });

  await prisma.user.update({
    where: { id },
    data: paused
      ? { isPaused: true, pausedAt: new Date(), pausedReason: reason || null, sessionVersion: { increment: 1 } }
      : { isPaused: false, pausedAt: null, pausedReason: null },
  });
  console.log(`[Admin] ${session.user.email} ${paused ? "paused" : "resumed"} tenant ${id}`);
  return NextResponse.json({ ok: true });
}
