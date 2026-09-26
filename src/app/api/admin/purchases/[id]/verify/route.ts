import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { confirmPaymentAndFulfill } from "@/lib/payments";

/** Ask Paystack about a PENDING purchase; if it was paid, vend it. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const purchase = await prisma.purchase.findUnique({ where: { id } });
  if (!purchase) return NextResponse.json({ error: "Purchase not found" }, { status: 404 });

  console.log(`[Admin] ${session.user.email} verifying payment for purchase ${id}`);
  try {
    const result = await confirmPaymentAndFulfill(purchase.paystackReference);
    const updated = await prisma.purchase.findUnique({ where: { id } });
    return NextResponse.json({ note: result.note, status: updated?.status, stsPin: updated?.stsPin });
  } catch (err) {
    console.error("[Admin verify]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Verify failed" }, { status: 502 });
  }
}
