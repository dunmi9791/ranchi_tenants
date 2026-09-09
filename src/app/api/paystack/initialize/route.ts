import { NextResponse } from "next/server";
import { z } from "zod";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { initializeTransaction } from "@/lib/paystack";

const schema = z.object({
  meterId: z.string().min(1),
  kwhAmount: z.number().positive().max(10000),
});

export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = schema.parse(await req.json());
    const meter = await prisma.meter.findUnique({
      where: { id: body.meterId },
      include: { company: true },
    });

    if (!meter || meter.userId !== session.user.id) {
      return NextResponse.json({ error: "Meter not found" }, { status: 404 });
    }

    const nairaAmount = Number((body.kwhAmount * meter.company.nairaPerKwh).toFixed(2));
    const amountKobo = Math.round(nairaAmount * 100);
    const reference = `rch_${randomBytes(12).toString("hex")}`;

    const purchase = await prisma.purchase.create({
      data: {
        userId: session.user.id,
        meterId: meter.id,
        companyId: meter.companyId,
        kwhAmount: body.kwhAmount,
        nairaAmount,
        paystackReference: reference,
        status: "PENDING",
      },
    });

    const appUrl = process.env.APP_URL || "http://localhost:3000";

    // Dry / missing Paystack: return mock checkout for local demo
    if (!process.env.PAYSTACK_SECRET_KEY || process.env.PAYSTACK_DRY_RUN === "true") {
      return NextResponse.json({
        dryRun: true,
        purchaseId: purchase.id,
        reference,
        nairaAmount,
        kwhAmount: body.kwhAmount,
        authorization_url: `${appUrl}/dashboard?mockPay=${reference}`,
      });
    }

    const init = await initializeTransaction({
      email: session.user.email,
      amountKobo,
      reference,
      callbackUrl: `${appUrl}/dashboard?paid=1`,
      metadata: {
        purchaseId: purchase.id,
        meterId: meter.id,
        kwhAmount: body.kwhAmount,
      },
    });

    return NextResponse.json({
      purchaseId: purchase.id,
      reference: init.reference,
      authorization_url: init.authorization_url,
      nairaAmount,
      kwhAmount: body.kwhAmount,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Initialize failed" },
      { status: 500 }
    );
  }
}
