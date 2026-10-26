import { NextResponse } from "next/server";
import { z } from "zod";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { initializeTransaction } from "@/lib/paystack";
import { computeServiceFee, getSettings } from "@/lib/pricing";
import { RENT_REFERENCE_PREFIX, chargeStatus } from "@/lib/rent";
import { lagosToday } from "@/lib/leases";

const schema = z.object({ chargeId: z.string().min(1) });

/** Tenant pays the outstanding balance of one rent charge through Paystack. */
export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = schema.parse(await req.json());
    const charge = await prisma.rentCharge.findUnique({
      where: { id: body.chargeId },
      include: {
        payments: { select: { amount: true, status: true } },
        lease: { select: { tenantId: true, unit: { select: { name: true, property: { select: { name: true } } } } } },
      },
    });
    if (!charge || charge.lease.tenantId !== session.user.id) {
      return NextResponse.json({ error: "Rent charge not found" }, { status: 404 });
    }
    const { balance } = chargeStatus(charge, lagosToday());
    if (balance <= 0) return NextResponse.json({ error: "This rent is already paid" }, { status: 400 });

    // Same fee rule as electricity: covers Paystack's charge on the total.
    const serviceFee = computeServiceFee(balance, await getSettings());
    const reference = `${RENT_REFERENCE_PREFIX}${randomBytes(12).toString("hex")}`;
    const payment = await prisma.rentPayment.create({
      data: {
        chargeId: charge.id,
        amount: balance,
        serviceFee,
        method: "PAYSTACK",
        status: "PENDING",
        paystackReference: reference,
      },
    });

    const appUrl = process.env.APP_URL || "http://localhost:3000";
    if (!process.env.PAYSTACK_SECRET_KEY || process.env.PAYSTACK_DRY_RUN === "true") {
      return NextResponse.json({ dryRun: true, paymentId: payment.id, reference, amount: balance, serviceFee });
    }

    const init = await initializeTransaction({
      email: session.user.email,
      amountKobo: Math.round((balance + serviceFee) * 100),
      reference,
      callbackUrl: `${appUrl}/dashboard?paid=1`,
      metadata: {
        rentPaymentId: payment.id,
        chargeId: charge.id,
        unit: `${charge.lease.unit.property.name} — ${charge.lease.unit.name}`,
      },
    });
    return NextResponse.json({ reference: init.reference, authorization_url: init.authorization_url });
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    console.error(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not start payment" },
      { status: 500 }
    );
  }
}
