import { redirect } from "next/navigation";
import { Nav } from "@/components/Nav";
import { Badge } from "@/components/Badge";
import { BuyForm } from "@/components/BuyForm";
import { RentPayButton } from "@/components/RentPayButton";
import { FREQUENCY_LABELS, daysLeft, effectiveEnd, fmtDay, lagosToday, leaseState } from "@/lib/leases";
import { prisma } from "@/lib/prisma";
import { computeServiceFee, getSettings } from "@/lib/pricing";
import { RENT_REFERENCE_PREFIX, chargeStatus, syncRentCharges } from "@/lib/rent";
import { getSession, loginPath } from "@/lib/session";
import { confirmPayment } from "@/lib/payments";
import { tenantMetersWhere } from "@/lib/tenancy";

const ngn = (n: number) => `₦${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ reference?: string }>;
}) {
  const session = await getSession();
  if (!session.user) redirect(loginPath(session));
  if (session.user.mustChangePassword) redirect("/account/password");

  // Returning from Paystack checkout: verify the payment (and vend the PIN for electricity)
  // here too, so it works even if the webhook never arrives.
  const { reference } = await searchParams;
  let paymentError: string | null = null;
  if (reference) {
    const owned = reference.startsWith(RENT_REFERENCE_PREFIX)
      ? await prisma.rentPayment.findFirst({
          where: { paystackReference: reference, charge: { lease: { tenantId: session.user.id } } },
          select: { id: true },
        })
      : await prisma.purchase.findFirst({
          where: { paystackReference: reference, userId: session.user.id },
          select: { id: true },
        });
    if (owned) {
      try {
        await confirmPayment(reference);
      } catch (err) {
        console.error("[Dashboard] payment confirmation failed", err);
        paymentError = "We couldn't confirm your payment yet. Refresh in a moment.";
      }
    }
  }

  const today = lagosToday();
  await syncRentCharges({ tenantId: session.user.id });
  const [meters, leases, settings] = await Promise.all([
    // Only meters on units the tenant holds an active lease on can be topped up.
    prisma.meter.findMany({
      where: tenantMetersWhere(session.user.id, today),
      include: { company: { select: { name: true } }, unit: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.lease.findMany({
      where: { tenantId: session.user.id },
      orderBy: { startDate: "desc" },
      include: {
        renewal: { select: { id: true } },
        unit: { select: { name: true, property: { select: { name: true, address: true } }, meters: { select: { meterNumber: true } } } },
        rentCharges: {
          orderBy: { dueDate: "asc" },
          include: { payments: { select: { amount: true, status: true } } },
        },
      },
    }),
    getSettings(),
  ]);

  const homes = leases
    .map((l) => ({ l, state: leaseState({ ...l, hasRenewal: !!l.renewal }, today) }))
    .filter((h) => h.state === "active" || h.state === "upcoming" || h.state === "expired");
  const rentDue = leases.flatMap((l) =>
    l.rentCharges
      .map((c) => ({ c, l, ...chargeStatus(c, today) }))
      .filter((r) => r.balance > 0)
  );
  rentDue.sort((a, b) => a.c.dueDate.getTime() - b.c.dueDate.getTime());

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
          <p className="text-slate-600">Your home, rent and electricity in one place.</p>
        </div>

        {paymentError && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            {paymentError}
          </p>
        )}

        <section className="grid gap-4 sm:grid-cols-2">
          {homes.map(({ l, state }) => {
            const end = effectiveEnd(l);
            const left = daysLeft(l, today);
            return (
              <div key={l.id} className="rounded-xl border bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs uppercase text-slate-500">{l.unit.property.name}</p>
                    <p className="text-lg font-semibold">{l.unit.name}</p>
                  </div>
                  {state === "active" &&
                    (left != null && left <= 30 ? <Badge tone="amber">Ends in {left} d</Badge> : <Badge tone="green">Active</Badge>)}
                  {state === "upcoming" && <Badge tone="blue">Starts {fmtDay(l.startDate)}</Badge>}
                  {state === "expired" && <Badge tone="red">Lease expired</Badge>}
                </div>
                {l.unit.property.address && <p className="text-sm text-slate-600">{l.unit.property.address}</p>}
                <p className="mt-2 text-sm text-slate-600">
                  Lease {fmtDay(l.startDate)} – {end ? fmtDay(end) : "rolling"} · {ngn(l.rentAmount)} {FREQUENCY_LABELS[l.rentFrequency]}
                </p>
                {l.unit.meters.length > 0 && (
                  <p className="text-sm text-slate-600">
                    Meter <span className="font-mono">{l.unit.meters.map((m) => m.meterNumber).join(", ")}</span>
                  </p>
                )}
                {state === "expired" && (
                  <p className="mt-2 text-sm text-red-700">
                    Your lease ended on {fmtDay(end!)}, so electricity can&apos;t be bought for this unit until it&apos;s renewed. Please
                    contact your property manager.
                  </p>
                )}
              </div>
            );
          })}
          {homes.length === 0 && (
            <p className="text-sm text-slate-600">No active lease on your account yet. Your property manager adds it.</p>
          )}
        </section>

        {rentDue.length > 0 && (
          <section>
            <h2 className="mb-3 text-lg font-semibold">Rent</h2>
            <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-3 py-2">Home</th>
                    <th className="px-3 py-2">Period</th>
                    <th className="px-3 py-2">Due</th>
                    <th className="px-3 py-2 text-right">Balance</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {rentDue.map(({ c, l, balance, paid, state }) => (
                    <tr key={c.id} className="border-b last:border-0">
                      <td className="px-3 py-2">
                        {l.unit.property.name} — {l.unit.name}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">
                        {fmtDay(c.periodStart)} – {fmtDay(c.periodEnd)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">
                        {fmtDay(c.dueDate)}
                        {state === "overdue" && <span className="block text-xs font-medium text-red-700">Overdue</span>}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right font-medium">
                        {ngn(balance)}
                        {paid > 0 && <span className="block text-xs font-normal text-slate-500">of {ngn(c.amount)}</span>}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <RentPayButton chargeId={c.id} balance={balance} fee={computeServiceFee(balance, settings)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        <BuyForm
          meters={meters.map((m) => ({
            id: m.id,
            meterNumber: m.meterNumber,
            label: m.label || m.unit?.name || null,
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
