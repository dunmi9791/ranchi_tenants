import { redirect } from "next/navigation";
import { Nav } from "@/components/Nav";
import { BuyForm } from "@/components/BuyForm";
import { prisma } from "@/lib/prisma";
import { getSession, loginPath } from "@/lib/session";
import { confirmPaymentAndFulfill } from "@/lib/payments";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ reference?: string }>;
}) {
  const session = await getSession();
  if (!session.user) redirect(loginPath(session));
  if (session.user.mustChangePassword) redirect("/account/password");

  // Returning from Paystack checkout: verify the payment and vend the PIN
  // here too, so it works even if the webhook never arrives.
  const { reference } = await searchParams;
  let paymentError: string | null = null;
  if (reference) {
    const owned = await prisma.purchase.findFirst({
      where: { paystackReference: reference, userId: session.user.id },
      select: { id: true },
    });
    if (owned) {
      try {
        await confirmPaymentAndFulfill(reference);
      } catch (err) {
        console.error("[Dashboard] payment confirmation failed", err);
        paymentError = "We couldn't confirm your payment yet. Refresh in a moment.";
      }
    }
  }

  const meters = await prisma.meter.findMany({
    where: { userId: session.user.id },
    include: { company: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });

  const purchases = await prisma.purchase.findMany({
    where: { userId: session.user.id },
    include: { meter: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return (
    <div>
      <Nav user={session.user} />
      <main className="mx-auto max-w-5xl space-y-8 px-4 py-8">
        <div>
          <h1 className="text-2xl font-bold">Hello, {session.user.name}</h1>
          <p className="text-slate-600">Manage meters, buy kWh, and view STS PINs.</p>
        </div>

        {paymentError && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            {paymentError}
          </p>
        )}

        <section className="grid gap-4 sm:grid-cols-2">
          {meters.map((m) => (
            <div key={m.id} className="rounded-xl border bg-white p-4 shadow-sm">
              <p className="text-xs uppercase text-slate-500">Meter</p>
              <p className="font-mono text-lg font-semibold">{m.meterNumber}</p>
              <p className="text-sm text-slate-600">
                {m.label || "Unlabeled"} · {m.company.name}
              </p>
            </div>
          ))}
          {meters.length === 0 && (
            <p className="text-sm text-slate-600">No meters yet.</p>
          )}
        </section>

        <BuyForm
          meters={meters.map((m) => ({
            id: m.id,
            meterNumber: m.meterNumber,
            label: m.label,
            company: m.company,
          }))}
        />

        <section>
          <h2 className="mb-3 text-lg font-semibold">Purchase history</h2>
          <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Meter</th>
                  <th className="px-3 py-2">kWh</th>
                  <th className="px-3 py-2">NGN</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">STS PIN</th>
                </tr>
              </thead>
              <tbody>
                {purchases.map((p) => (
                  <tr key={p.id} className="border-b last:border-0">
                    <td className="px-3 py-2 whitespace-nowrap">
                      {p.createdAt.toISOString().slice(0, 16).replace("T", " ")} UTC
                    </td>
                    <td className="px-3 py-2 font-mono">{p.meter.meterNumber}</td>
                    <td className="px-3 py-2">{p.kwhAmount}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      ₦{(p.nairaAmount + p.serviceFee).toLocaleString()}
                      {p.serviceFee > 0 && (
                        <span className="block text-xs text-slate-500">
                          incl. ₦{p.serviceFee.toLocaleString()} fee
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={
                          p.status === "VENDED"
                            ? "text-emerald-700"
                            : p.status === "FAILED"
                              ? "text-red-600"
                              : "text-slate-700"
                        }
                      >
                        {p.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono font-semibold tracking-wide">
                      {p.stsPin || (p.errorMessage ? `— (${p.errorMessage.slice(0, 40)})` : "—")}
                    </td>
                  </tr>
                ))}
                {purchases.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-slate-500">
                      No purchases yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
