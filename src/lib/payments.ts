import { prisma } from "./prisma";
import { verifyTransaction } from "./paystack";
import { fulfillPurchase } from "./vend";

/**
 * Confirm a Paystack payment and vend the STS PIN exactly once.
 * Safe to call from both the webhook and the post-payment redirect:
 * the PENDING → PAID transition is atomic, so only the first caller vends.
 */
export async function confirmPaymentAndFulfill(reference: string) {
  const purchase = await prisma.purchase.findUnique({ where: { paystackReference: reference } });
  if (!purchase) return { ok: false as const, note: "unknown reference" };
  if (purchase.status !== "PENDING") return { ok: true as const, note: `already ${purchase.status}` };

  const tx = await verifyTransaction(reference);
  if (tx.status !== "success") return { ok: false as const, note: `paystack status ${tx.status}` };

  // Tenant pays energy cost + service fee.
  const expectedKobo = Math.round((purchase.nairaAmount + purchase.serviceFee) * 100);
  if (tx.amount < expectedKobo) {
    await prisma.purchase.updateMany({
      where: { id: purchase.id, status: "PENDING" },
      data: {
        status: "FAILED",
        errorMessage: `Amount mismatch: paid ${tx.amount} kobo, expected ${expectedKobo}`,
      },
    });
    return { ok: false as const, note: "amount mismatch" };
  }

  // Atomic claim: if another request already moved it off PENDING, don't vend again.
  const claimed = await prisma.purchase.updateMany({
    where: { id: purchase.id, status: "PENDING" },
    data: { status: "PAID", paidAt: new Date() },
  });
  if (claimed.count === 0) return { ok: true as const, note: "claimed elsewhere" };

  console.log(`[Payments] ${reference} verified, vending purchase ${purchase.id}...`);
  await fulfillPurchase(purchase.id);
  return { ok: true as const, note: "fulfilled" };
}
