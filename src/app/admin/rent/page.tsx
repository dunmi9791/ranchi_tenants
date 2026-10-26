import Link from "next/link";
import { redirect } from "next/navigation";
import type { RentPaymentMethod } from "@prisma/client";
import { Badge } from "@/components/Badge";
import { Nav } from "@/components/Nav";
import { RecordPaymentButton, RemovePaymentButton } from "@/components/RentActions";
import { dayInput, fmtDay, lagosToday } from "@/lib/leases";
import { prisma } from "@/lib/prisma";
import { CHARGE_LEAD_DAYS, type ChargeState, chargeStatus, syncRentCharges } from "@/lib/rent";
import { getSession } from "@/lib/session";

const ngn = (n: number) => `₦${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

const FILTERS = { outstanding: "Outstanding", overdue: "Overdue", paid: "Paid", all: "All" } as const;
type Filter = keyof typeof FILTERS;

const STATE_BADGE: Record<ChargeState, { tone: "green" | "red" | "amber" | "slate"; label: string }> = {
  paid: { tone: "green", label: "Paid" },
  overdue: { tone: "red", label: "Overdue" },
  due: { tone: "amber", label: "Due today" },
  upcoming: { tone: "slate", label: "Upcoming" },
};

const METHOD_LABELS: Record<RentPaymentMethod, string> = {
  PAYSTACK: "Paystack",
  CASH: "Cash",
  TRANSFER: "Transfer",
  OTHER: "Other",
};

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "warn" }) {
  return (
    <div className={`rounded-xl border p-4 shadow-sm ${tone === "warn" ? "border-amber-200 bg-amber-50" : "bg-white"}`}>
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-semibold text-slate-900">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

export default async function RentPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSession();
  if (!session.user) redirect("/login");
  if (session.user.role !== "ADMIN") redirect("/dashboard");
  if (session.user.mustChangePassword) redirect("/account/password");

  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k][0] : sp[k]);
  const filter: Filter = (one("status") as Filter) in FILTERS ? (one("status") as Filter) : "outstanding";
  const tenantFilter = one("tenant") || null;

  await syncRentCharges();
  const today = lagosToday();
  const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const tenantWhere = tenantFilter ? { lease: { tenantId: tenantFilter } } : {};

  // Lagos midnight on the 1st. Manually recorded payments are dated midnight UTC, Paystack ones carry the time.
  const monthStartInstant = new Date(monthStart.getTime() - 60 * 60 * 1000);

  const [charges, payments, tenant, collected] = await Promise.all([
    prisma.rentCharge.findMany({
      where: tenantWhere,
      orderBy: { dueDate: "asc" },
      include: {
        payments: { select: { amount: true, status: true } },
        lease: {
          select: {
            tenant: { select: { id: true, name: true } },
            unit: { select: { name: true, property: { select: { name: true } } } },
          },
        },
      },
    }),
    prisma.rentPayment.findMany({
      where: { status: "PAID", charge: tenantWhere },
      orderBy: { paidAt: "desc" },
      take: 50,
      include: {
        recordedBy: { select: { name: true } },
        charge: {
          select: {
            periodStart: true,
            lease: { select: { tenant: { select: { name: true } }, unit: { select: { name: true, property: { select: { name: true } } } } } },
          },
        },
      },
    }),
    tenantFilter ? prisma.user.findUnique({ where: { id: tenantFilter }, select: { name: true } }) : null,
    prisma.rentPayment.aggregate({
      _sum: { amount: true },
      where: { status: "PAID", paidAt: { gte: monthStartInstant }, charge: tenantWhere },
    }),
  ]);

  const rows = charges.map((c) => ({ c, ...chargeStatus(c, today) }));
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  const overdue = sum(rows.filter((r) => r.state === "overdue").map((r) => r.balance));
  const dueSoon = sum(rows.filter((r) => r.state === "due" || r.state === "upcoming").map((r) => r.balance));
  const collectedMonth = collected._sum.amount ?? 0;

  const matches = (r: (typeof rows)[number]) =>
    filter === "all" ||
    (filter === "outstanding" && r.balance > 0) ||
    (filter === "overdue" && r.state === "overdue") ||
    (filter === "paid" && r.state === "paid");
  const shown = rows.filter(matches);
  if (filter === "paid") shown.reverse();

  const href = (patch: Record<string, string | null>) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries({ status: filter, tenant: tenantFilter, ...patch })) if (v) q.set(k, v);
    return `/admin/rent?${q}`;
  };

  return (
    <div>
      <Nav user={session.user} />
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-8">
        <div>
          <h1 className="text-2xl font-bold">Rent</h1>
          <p className="text-sm text-slate-600">
            Rent is billed per lease period, due on the first day, and appears {CHARGE_LEAD_DAYS} days ahead. Tenants pay on their
            dashboard with Paystack; record cash and transfers here.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Tile label="Overdue" value={ngn(overdue)} tone={overdue > 0 ? "warn" : undefined} />
          <Tile label="Due in the next month" value={ngn(dueSoon)} />
          <Tile label="Collected this month" value={ngn(collectedMonth)} />
        </div>

        <div className="flex flex-wrap items-center gap-2 text-sm">
          {(Object.keys(FILTERS) as Filter[]).map((f) => (
            <Link
              key={f}
              href={href({ status: f })}
              className={`rounded-full border px-3 py-1 ${filter === f ? "border-emerald-600 bg-emerald-50 text-emerald-800" : "border-slate-300 hover:bg-slate-50"}`}
            >
              {FILTERS[f]}
            </Link>
          ))}
          {tenant && (
            <span className="ml-2 rounded-full bg-slate-100 px-3 py-1">
              Tenant: {tenant.name}{" "}
              <Link href={href({ tenant: null })} className="text-emerald-700 underline">
                clear
              </Link>
            </span>
          )}
        </div>

        <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b bg-slate-50 text-slate-600">
              <tr>
                <th className="px-3 py-2">Tenant</th>
                <th className="px-3 py-2">Unit</th>
                <th className="px-3 py-2">Period</th>
                <th className="px-3 py-2">Due</th>
                <th className="px-3 py-2 text-right">Rent</th>
                <th className="px-3 py-2 text-right">Paid</th>
                <th className="px-3 py-2 text-right">Balance</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {shown.map(({ c, paid, balance, state }) => (
                <tr key={c.id} className="border-b last:border-0">
                  <td className="px-3 py-2">
                    <Link href={href({ tenant: c.lease.tenant.id })} className="hover:underline">
                      {c.lease.tenant.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    {c.lease.unit.property.name}
                    <span className="block text-xs text-slate-500">{c.lease.unit.name}</span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">
                    {fmtDay(c.periodStart)} – {fmtDay(c.periodEnd)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">{fmtDay(c.dueDate)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{ngn(c.amount)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{paid ? ngn(paid) : "—"}</td>
                  <td className={`px-3 py-2 text-right font-medium tabular-nums ${state === "overdue" ? "text-red-700" : ""}`}>
                    {balance ? ngn(balance) : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <Badge tone={STATE_BADGE[state].tone}>{paid > 0 && balance > 0 ? "Part paid" : STATE_BADGE[state].label}</Badge>
                  </td>
                  <td className="px-3 py-2">
                    {balance > 0 && (
                      <RecordPaymentButton
                        charge={{
                          id: c.id,
                          label: `${c.lease.tenant.name}, ${c.lease.unit.property.name} — ${c.lease.unit.name}, ${fmtDay(c.periodStart)} – ${fmtDay(c.periodEnd)}`,
                          balance,
                          today: dayInput(today),
                        }}
                      />
                    )}
                  </td>
                </tr>
              ))}
              {shown.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-center text-slate-500">
                    Nothing here.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <section>
          <h2 className="mb-3 text-lg font-semibold">Recent payments (last 50)</h2>
          <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Tenant</th>
                  <th className="px-3 py-2">Unit</th>
                  <th className="px-3 py-2">For period from</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                  <th className="px-3 py-2">Method</th>
                  <th className="px-3 py-2">Reference</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id} className="border-b last:border-0">
                    <td className="whitespace-nowrap px-3 py-2">{p.paidAt ? fmtDay(p.paidAt) : "—"}</td>
                    <td className="px-3 py-2">{p.charge.lease.tenant.name}</td>
                    <td className="px-3 py-2">
                      {p.charge.lease.unit.property.name} — {p.charge.lease.unit.name}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">{fmtDay(p.charge.periodStart)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{ngn(p.amount)}</td>
                    <td className="px-3 py-2">
                      {METHOD_LABELS[p.method]}
                      {p.recordedBy && <span className="block text-xs text-slate-500">by {p.recordedBy.name}</span>}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {p.paystackReference ?? p.reference ?? "—"}
                      {p.note && <span className="block font-sans text-slate-500">{p.note}</span>}
                    </td>
                    <td className="px-3 py-2">
                      {p.method !== "PAYSTACK" && <RemovePaymentButton paymentId={p.id} label={ngn(p.amount)} />}
                    </td>
                  </tr>
                ))}
                {payments.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-3 py-8 text-center text-slate-500">
                      No rent payments yet.
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
