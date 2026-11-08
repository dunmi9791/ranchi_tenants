import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { firstIssue } from "@/lib/rental-schemas";

async function assertAdmin() {
  const session = await getSession();
  if (!session.user || session.user.role !== "ADMIN") return null;
  return session;
}

/** Reject an applicant (with an optional reason), or move a rejected one back to pending. */
const updateSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("reject"), reason: z.string().trim().max(300).nullable().optional() }),
  z.object({ action: z.literal("reopen") }),
]);

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await assertAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const parsed = updateSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: firstIssue(parsed.error) }, { status: 400 });
  const body = parsed.data;

  const applicant = await prisma.applicant.findUnique({ where: { id }, select: { id: true } });
  if (!applicant) return NextResponse.json({ error: "Applicant not found" }, { status: 404 });

  await prisma.applicant.update({
    where: { id },
    data:
      body.action === "reject"
        ? { status: "REJECTED", rejectedAt: new Date(), rejectedReason: body.reason || null }
        : { status: "PENDING", rejectedAt: null, rejectedReason: null },
  });
  console.log(`[Admin] ${session.user!.email} ${body.action}ed applicant ${id}`);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await assertAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const { count } = await prisma.applicant.deleteMany({ where: { id } });
  if (!count) return NextResponse.json({ error: "Applicant not found" }, { status: 404 });
  console.log(`[Admin] ${session.user!.email} deleted applicant ${id}`);
  return NextResponse.json({ ok: true });
}
