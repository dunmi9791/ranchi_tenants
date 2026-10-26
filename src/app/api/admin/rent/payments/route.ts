import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { lagosToday } from "@/lib/leases";
import { chargeStatus } from "@/lib/rent";
import { firstIssue, optionalDaySchema } from "@/lib/rental-schemas";

async function assertAdmin() {
  const session = await getSession();
  if (!session.user || session.user.role !== "ADMIN") return null;
  return session;
}

const schema = z.object({
  chargeId: z.string().min(1),
  amount: z.number().positive("Enter an amount").max(1_000_000_000),
  method: z.enum(["CASH", "TRANSFER", "OTHER"]),
  /** Day the money was received; defaults to today */
  paidOn: optionalDaySchema,
  reference: z.string().trim().max(120).nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
});

/** Record rent received outside Paystack (cash, bank transfer). Part payments are allowed. */
export async function POST(req: Request) {
  const session = await assertAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: firstIssue(parsed.error) }, { status: 400 });
  const body = parsed.data;

  const charge = await prisma.rentCharge.findUnique({
    where: { id: body.chargeId },
    include: { payments: { select: { amount: true, status: true } } },
  });
  if (!charge) return NextResponse.json({ error: "Rent charge not found" }, { status: 404 });
  const { balance } = chargeStatus(charge, lagosToday());
  if (body.amount > balance + 0.005) {
    return NextResponse.json({ error: `That's more than the ₦${balance.toLocaleString()} outstanding` }, { status: 400 });
  }

  const payment = await prisma.rentPayment.create({
    data: {
      chargeId: charge.id,
      amount: body.amount,
      method: body.method,
      status: "PAID",
      paidAt: body.paidOn ?? new Date(),
      reference: body.reference || null,
      note: body.note || null,
      recordedById: session.user!.id,
    },
  });
  console.log(`[Admin] ${session.user!.email} recorded ₦${body.amount} rent (${body.method}) on charge ${charge.id}`);
  return NextResponse.json({ payment }, { status: 201 });
}
