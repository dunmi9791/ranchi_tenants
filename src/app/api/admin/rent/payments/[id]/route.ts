import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

/** Remove a manually recorded payment entered by mistake. Paystack payments can't be removed. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const payment = await prisma.rentPayment.findUnique({ where: { id }, select: { method: true, amount: true } });
  if (!payment) return NextResponse.json({ error: "Payment not found" }, { status: 404 });
  if (payment.method === "PAYSTACK") {
    return NextResponse.json({ error: "Paystack payments can't be removed" }, { status: 400 });
  }
  await prisma.rentPayment.delete({ where: { id } });
  console.log(`[Admin] ${session.user.email} removed manual rent payment ${id} (₦${payment.amount})`);
  return NextResponse.json({ ok: true });
}
