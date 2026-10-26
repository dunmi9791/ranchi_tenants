import type { Company, Meter, Purchase } from "@prisma/client";
import { prisma } from "./prisma";
import { notifyPurchaseOutcome } from "./notify";
import { vendStsPin } from "./stronpower";

/**
 * After Paystack confirms payment: generate STS PIN via StronPower for the purchase.
 * Callers must have atomically moved the purchase to PAID first (see payments.ts / retry).
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

  const settled = await vendAndRecord(purchase);
  // Fire and forget: email/SMS must never hold up or break the Paystack webhook.
  void notifyPurchaseOutcome(settled.id);
  return settled;
}

async function vendAndRecord(purchase: Purchase & { company: Company; meter: Meter }) {
  const creds = {
    stronBaseUrl: purchase.company.stronBaseUrl,
    stronCompanyName: purchase.company.stronCompanyName,
    stronUsername: purchase.company.stronUsername,
    stronPassword: purchase.company.stronPassword,
  };

  try {
    const result = await vendStsPin(
      creds,
      { meterNumber: purchase.meter.meterNumber, kwhAmount: purchase.kwhAmount },
      {
        // Priced in the app (company ₦/kWh): StronPower only has to vend the kWh paid for;
        // vendStsPin refuses if its preview is for different units.
        beforeStore: async (preview) => {
          await prisma.purchase.update({
            where: { id: purchase.id },
            data: { storeAttemptedAt: new Date(), stronPreview: preview.slice(0, 4000) },
          });
        },
      }
    );

    return prisma.purchase.update({
      where: { id: purchase.id },
      data: {
        status: result.pin ? "VENDED" : "FAILED",
        stsPin: result.pin,
        stronPreview: result.preview.slice(0, 4000),
        stronResponse: result.store.slice(0, 4000),
        errorMessage: result.pin
          ? null
          : `No STS token in StronPower response: ${result.store.slice(0, 300)}`,
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

/**
 * Admin retry of a FAILED purchase. If the store request was already sent, a token may
 * exist on StronPower, so the admin must confirm they checked the vending records.
 */
export async function retryVend(purchaseId: string, { confirmedNoToken = false } = {}) {
  const purchase = await prisma.purchase.findUnique({ where: { id: purchaseId } });
  if (!purchase) return { ok: false as const, error: "Purchase not found" };
  if (purchase.status !== "FAILED") {
    return { ok: false as const, error: `Only FAILED purchases can be retried (this is ${purchase.status})` };
  }
  if (!purchase.paidAt) return { ok: false as const, error: "Purchase was never paid" };
  if (purchase.storeAttemptedAt && !confirmedNoToken) {
    return {
      ok: false as const,
      needsConfirmation: true,
      error:
        "The vend request reached StronPower's final step before failing, so a token may already exist. Check StronPower's vending records for this meter first.",
    };
  }

  // Atomic claim so two clicks can't vend twice.
  const claimed = await prisma.purchase.updateMany({
    where: { id: purchase.id, status: "FAILED" },
    data: { status: "PAID", errorMessage: null, storeAttemptedAt: null },
  });
  if (claimed.count === 0) return { ok: false as const, error: "Already being retried" };

  const updated = await fulfillPurchase(purchase.id);
  return { ok: updated.status === "VENDED", purchase: updated, error: updated.errorMessage ?? undefined };
}
