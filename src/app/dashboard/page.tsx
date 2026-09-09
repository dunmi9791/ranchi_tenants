import { redirect } from "next/navigation";
import { Nav } from "@/components/Nav";
import { BuyForm } from "@/components/BuyForm";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export default async function DashboardPage() {
  const session = await getSession();
  if (!session.user) redirect("/login");

  const meters = await prisma.meter.findMany({
    where: { userId: session.user.id },
    include: { company: { select: { name: true, nairaPerKwh: true } } },
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

        <section className="grid gap-4 sm:grid-cols-2">
          {meters.map((m) => (
            <div key={m.id} className="rounded-xl border bg-white p-4 shadow-sm">
              <p className="text-xs uppercase text-slate-500">Meter</p>
              <p className="font-mono text-lg font-semibold">{m.meterNumber}</p>
              <p className="text-sm text-slate-600">
                {m.label || "Unlabeled"} · {m.company.name} · ₦{m.company.nairaPerKwh}/kWh
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
                    <td className="px-3 py-2">₦{p.nairaAmount.toLocaleString()}</td>
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
