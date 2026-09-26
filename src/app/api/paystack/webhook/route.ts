import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPaystackSignature } from "@/lib/paystack";
import { fulfillPurchase } from "@/lib/vend";
import { confirmPaymentAndFulfill } from "@/lib/payments";

export async function POST(req: Request) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-paystack-signature");

  const dry =
    process.env.PAYSTACK_DRY_RUN === "true" ||
    process.env.STRON_DRY_RUN === "true" ||
    !process.env.PAYSTACK_SECRET_KEY;

  if (!dry && !verifyPaystackSignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: { event?: string; data?: { reference?: string; status?: string } };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (event.event === "charge.success" && event.data?.reference) {
    const reference = event.data.reference;
    console.log(`[Webhook] charge.success for ref ${reference}`);

    if (dry) {
      // Dry-run: no Paystack key to verify against, so trust the event.
      const claimed = await prisma.purchase.updateMany({
        where: { paystackReference: reference, status: "PENDING" },
        data: { status: "PAID", paidAt: new Date() },
      });
      if (claimed.count > 0) {
        const purchase = await prisma.purchase.findUnique({ where: { paystackReference: reference } });
        if (purchase) await fulfillPurchase(purchase.id);
      }
    } else {
      const result = await confirmPaymentAndFulfill(reference);
      return NextResponse.json(result);
    }
  }

  return NextResponse.json({ ok: true });
}
