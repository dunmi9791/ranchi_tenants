import Link from "next/link";
import { redirect } from "next/navigation";
import { Nav } from "@/components/Nav";
import { PurchaseActions } from "@/components/PurchaseActions";
import { PurchaseFilters } from "@/components/PurchaseFilters";
import { PurchasesChart } from "@/components/PurchasesChart";
import {
  RANGE_LABELS,
  STATUS_LABELS,
  type Totals,
  filtersToQuery,
  groupByKey,
  groupByPeriod,
  lagosDay,
  parseFilters,
  purchaseWhere,
  summarize,
} from "@/lib/analytics";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

const ngn = (n: number) =>
  `₦${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const LIST_LIMIT = 200;
const DAY_MS = 24 * 60 * 60 * 1000;

function Tile({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "warn";
}) {
  return (
    <div
      className={`rounded-xl border p-4 shadow-sm ${tone === "warn" ? "border-amber-200 bg-amber-50" : "bg-white"}`}
    >
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-semibold text-slate-900">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

function TotalsCells({ t }: { t: Totals }) {
  return (
    <>
      <td className="px-3 py-2 text-right tabular-nums">{t.paidCount}</td>
      <td className="px-3 py-2 text-right tabular-nums">
        {t.kwh.toLocaleString()}
      </td>
      <td className="px-3 py-2 text-right tabular-nums">
        {ngn(t.electricity)}
      </td>
      <td className="px-3 py-2 text-right tabular-nums">{ngn(t.fees)}</td>
      <td className="px-3 py-2 text-right font-medium tabular-nums">
        {ngn(t.collected)}
      </td>
    </>
  );
}

const TOTALS_HEAD = (
  <>
    <th className="px-3 py-2 text-right">Paid</th>
    <th className="px-3 py-2 text-right">kWh vended</th>
    <th className="px-3 py-2 text-right">Electricity</th>
    <th className="px-3 py-2 text-right">Fees</th>
    <th className="px-3 py-2 text-right">Collected</th>
  </>
);

export default async function AdminPurchasesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSession();
  if (!session.user) redirect("/login");
  if (session.user.role !== "ADMIN") redirect("/dashboard");

  const f = parseFilters(await searchParams);

  const [purchases, tenants, companies] = await Promise.all([
    prisma.purchase.findMany({
      where: purchaseWhere(f),
      orderBy: { createdAt: "desc" },
      include: {
        meter: { select: { meterNumber: true } },
        user: { select: { id: true, name: true, email: true } },
        company: { select: { id: true, name: true } },
      },
    }),
    prisma.user.findMany({
      where: { role: "TENANT" },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    }),
    prisma.company.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const totals = summarize(purchases);
  const periods = groupByPeriod(purchases, f);
  const byCompany = groupByKey(purchases, (p) => ({
    id: p.company.id,
    label: p.company.name,
  }));
  const byTenant = groupByKey(purchases, (p) => ({
    id: p.user.id,
    label: p.user.name,
  }));
  const lastDay = new Date(f.to.getTime() - DAY_MS);
  const rangeText =
    lagosDay(f.from) === lagosDay(lastDay)
      ? lagosDay(f.from)
      : `${lagosDay(f.from)} → ${lagosDay(lastDay)}`;
  const baseQuery = filtersToQuery(f);
  const withParam = (k: string, v: string) => {
    const q = new URLSearchParams(baseQuery);
    q.set(k, v);
    return `?${q.toString()}`;
  };

  return (
    <div>
      <Nav user={session.user} />
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-8">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h1 className="text-2xl font-bold">Purchases</h1>
            <p className="text-sm text-slate-600">
              {RANGE_LABELS[f.range]} ({rangeText}, Lagos time) ·{" "}
              {STATUS_LABELS[f.status].toLowerCase()}
            </p>
          </div>
          <a
            href={`/api/admin/purchases/export?${baseQuery}`}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50"
          >
            Export CSV
          </a>
        </div>

        <PurchaseFilters
          range={f.range}
          from={lagosDay(f.from)}
          to={lagosDay(lastDay)}
          groupBy={f.groupBy}
          status={f.status}
          tenant={f.tenantId ?? ""}
          company={f.companyId ?? ""}
          ranges={RANGE_LABELS}
          statuses={STATUS_LABELS}
          tenants={tenants.map((t) => ({
            id: t.id,
            label: `${t.name} (${t.email})`,
          }))}
          companies={companies.map((c) => ({ id: c.id, label: c.name }))}
        />

        <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Tile
            label="Collected"
            value={ngn(totals.collected)}
            sub={`${totals.paidCount} paid purchases`}
          />
          <Tile
            label="Electricity sold"
            value={ngn(totals.electricity)}
            sub={
              totals.owedCount > 0
                ? `incl. ${ngn(totals.owedAmount)} not yet vended`
                : "recorded on StronPower"
            }
          />
          <Tile label="Service fees" value={ngn(totals.fees)} />
          <Tile label="kWh vended" value={totals.kwh.toLocaleString()} />
          {totals.owedCount > 0 ? (
            <Tile
              tone="warn"
              label="Paid, not vended"
              value={String(totals.owedCount)}
              sub={`${ngn(totals.owedAmount)} of electricity owed`}
            />
          ) : (
            <Tile label="Paid, not vended" value="0" />
          )}
        </section>

        <PurchasesChart
          title={`Collected per ${f.groupBy}`}
          points={periods.map((b) => ({
            label: b.label,
            collected: b.totals.collected,
            electricity: b.totals.electricity,
            fees: b.totals.fees,
            kwh: b.totals.kwh,
            count: b.totals.paidCount,
          }))}
        />

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="overflow-x-auto rounded-xl border bg-white shadow-sm">
            <h2 className="border-b px-3 py-2 text-sm font-semibold">
              By company
            </h2>
            <table className="min-w-full text-left text-sm">
              <thead className="border-b bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-3 py-2">Company</th>
                  {TOTALS_HEAD}
                </tr>
              </thead>
              <tbody>
                {byCompany.map((g) => (
                  <tr key={g.id} className="border-b last:border-0">
                    <td className="px-3 py-2">
                      <Link
                        href={withParam("company", g.id)}
                        className="text-emerald-700 hover:underline"
                      >
                        {g.label}
                      </Link>
                    </td>
                    <TotalsCells t={g.totals} />
                  </tr>
                ))}
                {byCompany.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-3 py-4 text-center text-slate-500"
                    >
                      No purchases
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>

          <section className="overflow-x-auto rounded-xl border bg-white shadow-sm">
            <h2 className="border-b px-3 py-2 text-sm font-semibold">
              By tenant
            </h2>
            <table className="min-w-full text-left text-sm">
              <thead className="border-b bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-3 py-2">Tenant</th>
                  {TOTALS_HEAD}
                </tr>
              </thead>
              <tbody>
                {byTenant.slice(0, 50).map((g) => (
                  <tr key={g.id} className="border-b last:border-0">
                    <td className="px-3 py-2">
                      <Link
                        href={withParam("tenant", g.id)}
                        className="text-emerald-700 hover:underline"
                      >
                        {g.label}
                      </Link>
                    </td>
                    <TotalsCells t={g.totals} />
                  </tr>
                ))}
                {byTenant.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-3 py-4 text-center text-slate-500"
                    >
                      No purchases
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>
        </div>

        <section className="overflow-x-auto rounded-xl border bg-white shadow-sm">
          <h2 className="border-b px-3 py-2 text-sm font-semibold">
            By {f.groupBy}{" "}
            <span className="font-normal text-slate-500">
              (periods with purchases; the chart shows every period)
            </span>
          </h2>
          <table className="min-w-full text-left text-sm">
            <thead className="border-b bg-slate-50 text-slate-600">
              <tr>
                <th className="px-3 py-2">
                  {f.groupBy === "day"
                    ? "Day"
                    : f.groupBy === "week"
                      ? "Week"
                      : "Month"}
                </th>
                {TOTALS_HEAD}
              </tr>
            </thead>
            <tbody>
              {[...periods]
                .reverse()
                .filter((b) => b.totals.count > 0)
                .map((b) => (
                  <tr key={b.key} className="border-b last:border-0">
                    <td className="whitespace-nowrap px-3 py-2">{b.label}</td>
                    <TotalsCells t={b.totals} />
                  </tr>
                ))}
            </tbody>
            <tfoot className="border-t bg-slate-50 font-medium">
              <tr>
                <td className="px-3 py-2">Total</td>
                <TotalsCells t={totals} />
              </tr>
            </tfoot>
          </table>
        </section>

        <section className="overflow-x-auto rounded-xl border bg-white shadow-sm">
          <h2 className="border-b px-3 py-2 text-sm font-semibold">
            Purchases ({purchases.length}
            {purchases.length > LIST_LIMIT
              ? `, showing latest ${LIST_LIMIT} — export CSV for all`
              : ""}
            )
          </h2>
          <table className="min-w-full text-left text-sm">
            <thead className="border-b bg-slate-50 text-slate-600">
              <tr>
                <th className="px-3 py-2">Date (UTC)</th>
                <th className="px-3 py-2">Tenant</th>
                <th className="px-3 py-2">Company / meter</th>
                <th className="px-3 py-2">kWh</th>
                <th className="px-3 py-2">Paid</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">PIN / error</th>
                <th className="px-3 py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {purchases.slice(0, LIST_LIMIT).map((p) => (
                <tr key={p.id} className="border-b align-top last:border-0">
                  <td className="whitespace-nowrap px-3 py-2">
                    {p.createdAt.toISOString().slice(0, 16).replace("T", " ")}
                    <span className="block font-mono text-xs text-slate-400">
                      {p.paystackReference}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {p.user.name}
                    <span className="block text-xs text-slate-500">
                      {p.user.email}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {p.company.name}
                    <span className="block font-mono text-xs text-slate-500">
                      {p.meter.meterNumber}
                    </span>
                  </td>
                  <td className="px-3 py-2">{p.kwhAmount}</td>
                  <td className="whitespace-nowrap px-3 py-2">
                    {ngn(p.nairaAmount + p.serviceFee)}
                    {p.serviceFee > 0 && (
                      <span className="block text-xs text-slate-500">
                        {ngn(p.nairaAmount)} + {ngn(p.serviceFee)} fee
                      </span>
                    )}
                    {p.unitPrice == null && (
                      <span className="block text-xs text-amber-700">
                        old pricing
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
                  <td className="max-w-xs px-3 py-2">
                    {p.stsPin ? (
                      <span className="font-mono font-semibold">
                        {p.stsPin}
                      </span>
                    ) : (
                      <span className="break-words text-xs text-slate-600">
                        {p.errorMessage?.slice(0, 160)}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <PurchaseActions
                      id={p.id}
                      status={p.status}
                      paid={p.paidAt != null}
                      storeAttempted={p.storeAttemptedAt != null}
                    />
                  </td>
                </tr>
              ))}
              {purchases.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    className="px-3 py-8 text-center text-slate-500"
                  >
                    No purchases match these filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      </main>
    </div>
  );
}
