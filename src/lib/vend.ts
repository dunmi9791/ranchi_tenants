import { prisma } from "./prisma";
import { vendStsPin } from "./stronpower";

/**
 * After Paystack confirms payment: generate STS PIN via StronPower for the purchase.
 * Company credentials stay server-side only.
 */
export async function fulfillPurchase(purchaseId: string) {
  const purchase = await prisma.purchase.findUnique({
    where: { id: purchaseId },
    include: { company: true, meter: true },
  });
  if (!purchase) throw new Error("Purchase not found");
  if (purchase.status === "VENDED" && purchase.stsPin) {
    return purchase;
  }
  if (purchase.status !== "PAID" && purchase.status !== "PENDING") {
    // Allow PAID primarily; webhook sets PAID then calls this
  }

  const creds = {
    stronBaseUrl: purchase.company.stronBaseUrl,
    stronCompanyName: purchase.company.stronCompanyName,
    stronUsername: purchase.company.stronUsername,
    stronPassword: purchase.company.stronPassword,
  };

  try {
    const result = await vendStsPin(creds, {
      meterNumber: purchase.meter.meterNumber,
      kwhAmount: purchase.kwhAmount,
    });

    return prisma.purchase.update({
      where: { id: purchase.id },
      data: {
        status: result.pin ? "VENDED" : "FAILED",
        stsPin: result.pin,
        stronPreview: result.preview.slice(0, 4000),
        stronResponse: result.store.slice(0, 4000),
        errorMessage: result.pin ? null : "No PIN in StronPower response",
        vendedAt: result.pin ? new Date() : null,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Vend failed";
    return prisma.purchase.update({
      where: { id: purchase.id },
      data: {
        status: "FAILED",
        errorMessage: message.slice(0, 1000),
      },
    });
  }
}
