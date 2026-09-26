import { NextResponse } from "next/server";
import { z } from "zod";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { initializeTransaction } from "@/lib/paystack";
import { MIN_KWH, getSettings, getTariff, quoteForNaira } from "@/lib/pricing";

const schema = z.object({
  meterId: z.string().min(1),
  /** Naira the tenant wants to spend on energy; kWh and fee are computed server-side */
  nairaAmount: z.number().positive().max(10_000_000),
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

    // Always price from StronPower at the moment of purchase, never from the client.
    const [tariff, settings] = await Promise.all([
      getTariff(meter.company, meter.meterNumber, { fresh: true }),
      getSettings(),
    ]);
    const quote = quoteForNaira(body.nairaAmount, tariff, settings);
    if (quote.kwh < MIN_KWH) {
      return NextResponse.json(
        { error: `Minimum purchase is ${MIN_KWH} kWh (₦${Math.ceil(MIN_KWH * tariff.unitPrice).toLocaleString()})` },
        { status: 400 }
      );
    }
    const amountKobo = Math.round(quote.total * 100);
    const reference = `rch_${randomBytes(12).toString("hex")}`;

    const purchase = await prisma.purchase.create({
      data: {
        userId: session.user.id,
        meterId: meter.id,
        companyId: meter.companyId,
        kwhAmount: quote.kwh,
        nairaAmount: quote.energyAmount,
        serviceFee: quote.serviceFee,
        unitPrice: quote.unitPrice,
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
        quote,
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
        kwhAmount: quote.kwh,
        serviceFee: quote.serviceFee,
      },
    });

    return NextResponse.json({
      purchaseId: purchase.id,
      reference: init.reference,
      authorization_url: init.authorization_url,
      quote,
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
