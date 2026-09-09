import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { fulfillPurchase } from "@/lib/vend";

/** Local-only helper when PAYSTACK_DRY_RUN / no secret key */
const schema = z.object({ reference: z.string().min(1) });

export async function POST(req: Request) {
  if (process.env.NODE_ENV === "production" && process.env.PAYSTACK_DRY_RUN !== "true") {
    return NextResponse.json({ error: "Not available" }, { status: 403 });
  }

  const session = await getSession();
  if (!session.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = schema.parse(await req.json());
  const purchase = await prisma.purchase.findUnique({
    where: { paystackReference: body.reference },
  });
  if (!purchase || purchase.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.purchase.update({
    where: { id: purchase.id },
    data: { status: "PAID", paidAt: new Date() },
  });

  const updated = await fulfillPurchase(purchase.id);
  return NextResponse.json({
    purchase: {
      id: updated.id,
      status: updated.status,
      stsPin: updated.stsPin,
      errorMessage: updated.errorMessage,
    },
  });
}
