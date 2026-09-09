import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPaystackSignature } from "@/lib/paystack";
import { fulfillPurchase } from "@/lib/vend";

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
    const purchase = await prisma.purchase.findUnique({ where: { paystackReference: reference } });
    if (!purchase) {
      return NextResponse.json({ ok: true, note: "unknown reference" });
    }
    if (purchase.status === "VENDED") {
      return NextResponse.json({ ok: true, note: "already vended" });
    }

    await prisma.purchase.update({
      where: { id: purchase.id },
      data: { status: "PAID", paidAt: new Date() },
    });

    await fulfillPurchase(purchase.id);
  }

  return NextResponse.json({ ok: true });
}
