import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge } from "@/components/Badge";
import { LeaseActions } from "@/components/LeaseActions";
import { LeaseForm } from "@/components/LeaseForm";
import { Nav } from "@/components/Nav";
import {
  DAY_MS,
  FREQUENCY_LABELS,
  FREQUENCY_MONTHS,
  type LeaseState,
  addDays,
  addMonths,
  dayInput,
  daysLeft,
  effectiveEnd,
  fmtDay,
  lagosToday,
  leaseState,
} from "@/lib/leases";
import { occupancyLeaseSelect, occupancyOf, occupancyText } from "@/lib/occupancy";
import { prisma } from "@/lib/prisma";
import { chargeStatus, syncRentCharges } from "@/lib/rent";
import { getSession } from "@/lib/session";

const ngn = (n: number) => `₦${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

const FILTERS = {
  current: "Current",
  expiring: "Expiring",
  expired: "Lease expired",
  upcoming: "Upcoming",
  ended: "Ended / renewed",
  all: "All",
} as const;
type Filter = keyof typeof FILTERS;
const WINDOWS = [30, 60, 90] as const;

const STATE_BADGE: Record<LeaseState, { tone: "green" | "red" | "amber" | "slate" | "blue"; label: string }> = {
  active: { tone: "green", label: "Active" },
  upcoming: { tone: "blue", label: "Upcoming" },
  expired: { tone: "red", label: "Lease expired" },
  renewed: { tone: "slate", label: "Renewed" },
  ended: { tone: "slate", label: "Ended" },
};

export default async function LeasesPage({
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
  const filter: Filter = (one("status") as Filter) in FILTERS ? (one("status") as Filter) : "current";
  const windowDays = WINDOWS.find((w) => String(w) === one("days")) ?? 30;
  const tenantFilter = one("tenant") || null;
  const unitIdParam = one("unitId");

  await syncRentCharges();
  const today = lagosToday();
  const [leases, units, tenants] = await Promise.all([
    prisma.lease.findMany({
      where: tenantFilter ? { tenantId: tenantFilter } : {},
      orderBy: { startDate: "desc" },
      include: {
        tenant: { select: { id: true, name: true, email: true } },
        unit: { select: { id: true, name: true, property: { select: { id: true, name: true } } } },
        renewal: { select: { id: true } },
        rentCharges: { select: { amount: true, dueDate: true, payments: { select: { amount: true, status: true } } } },
      },
    }),
    prisma.unit.findMany({
      orderBy: [{ property: { name: "asc" } }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        rentAmount: true,
        rentFrequency: true,
        property: { select: { name: true } },
        leases: { select: occupancyLeaseSelect },
      },
    }),
    prisma.user.findMany({ where: { role: "TENANT" }, orderBy: { name: "asc" }, select: { id: true, name: true, email: true } }),
  ]);

  const rows = leases.map((l) => {
    const state = leaseState({ ...l, hasRenewal: !!l.renewal }, today);
    const left = daysLeft(l, today);
    // Rent owed now: overdue or due today
    const owed = l.rentCharges
      .map((c) => chargeStatus(c, today))
      .filter((s) => s.state === "overdue" || s.state === "due")
      .reduce((sum, s) => sum + s.balance, 0);
    return { l, state, left, owed };
  });

  const matches = (r: (typeof rows)[number], f: Filter) => {
    switch (f) {
      case "current":
        return r.state === "active" || r.state === "expired" || r.state === "upcoming";
      case "expiring":
        return r.state === "active" && r.left != null && r.left <= windowDays;
      case "expired":
        return r.state === "expired";
      case "upcoming":
        return r.state === "upcoming";
      case "ended":
        return r.state === "ended" || r.state === "renewed";
      case "all":
        return true;
    }
  };
  const counts = Object.fromEntries((Object.keys(FILTERS) as Filter[]).map((f) => [f, rows.filter((r) => matches(r, f)).length]));
  const shown = rows.filter((r) => matches(r, filter));
  if (filter === "expiring" || filter === "current") {
    // Soonest to end first; rolling leases last.
    shown.sort((a, b) => (a.left ?? Infinity) - (b.left ?? Infinity));
  }

  const query = (patch: Record<string, string | null>) => {
    const q = new URLSearchParams();
    const merged = { status: filter, days: String(windowDays), tenant: tenantFilter, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) q.set(k, v);
    return `/admin/leases?${q}`;
  };
  const filteredTenant = tenantFilter ? tenants.find((t) => t.id === tenantFilter) : null;

  return (
    <div>
      <Nav user={session.user} />
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-8">
        <div>
          <h1 className="text-2xl font-bold">Leases</h1>
          <p className="text-sm text-slate-600">
            Who holds each unit and until when. A tenant can buy electricity for a unit&apos;s meters only while their lease on it
            is active.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-sm">
          {(Object.keys(FILTERS) as Filter[]).map((f) => (
            <Link
              key={f}
              href={query({ status: f })}
              className={`rounded-full border px-3 py-1 ${filter === f ? "border-emerald-600 bg-emerald-50 text-emerald-800" : "border-slate-300 hover:bg-slate-50"}`}
            >
              {FILTERS[f]}
              {f === "expiring" ? ` ≤${windowDays}d` : ""} <span className="text-slate-500">({counts[f]})</span>
            </Link>
          ))}
          {filter === "expiring" && (
            <span className="ml-2 flex gap-1">
              {WINDOWS.map((w) => (
                <Link
                  key={w}
                  href={query({ days: String(w) })}
                  className={`rounded-md px-2 py-0.5 ${w === windowDays ? "bg-slate-800 text-white" : "bg-slate-100 hover:bg-slate-200"}`}
                >
                  {w} days
                </Link>
              ))}
            </span>
          )}
          {filteredTenant && (
            <span className="ml-2 rounded-full bg-slate-100 px-3 py-1">
              Tenant: {filteredTenant.name}{" "}
              <Link href={query({ tenant: null })} className="text-emerald-700 underline">
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
                <th className="px-3 py-2">Term</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2 text-right">Rent</th>
                <th className="px-3 py-2 text-right">Rent owed</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {shown.map(({ l, state, left, owed }) => {
                const end = effectiveEnd(l);
                const badge = STATE_BADGE[state];
                // Renewal proposal: same length as this lease, starting the day after it ends.
                const renewStart = l.endDate ? addDays(l.endDate, 1) : null;
                const termMonths = l.endDate
                  ? Math.max(1, Math.round((l.endDate.getTime() + DAY_MS - l.startDate.getTime()) / (30.4375 * DAY_MS)))
                  : FREQUENCY_MONTHS[l.rentFrequency];
                const renewEnd = renewStart ? addDays(addMonths(renewStart, termMonths), -1) : null;
                return (
                  <tr key={l.id} className="border-b align-top last:border-0">
                    <td className="px-3 py-2">
                      <Link href={query({ tenant: l.tenant.id, status: "all" })} className="font-medium hover:underline">
                        {l.tenant.name}
                      </Link>
                      <span className="block text-xs text-slate-500">{l.tenant.email}</span>
                    </td>
                    <td className="px-3 py-2">
                      <Link href={`/admin/properties/${l.unit.property.id}`} className="hover:underline">
                        {l.unit.property.name}
                      </Link>
                      <span className="block text-xs text-slate-500">{l.unit.name}</span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      {fmtDay(l.startDate)} – {l.endDate ? fmtDay(l.endDate) : "rolling"}
                      {l.moveOutDate && (
                        <span className="block text-xs text-slate-500">
                          Moved out {fmtDay(l.moveOutDate)}
                          {l.endReason ? ` · ${l.endReason}` : ""}
                        </span>
                      )}
                      {l.notes && <span className="block max-w-[14rem] whitespace-normal text-xs text-slate-500">{l.notes}</span>}
                    </td>
                    <td className="space-y-1 px-3 py-2">
                      {state === "active" && left != null && left <= windowDays ? (
                        <Badge tone="amber">{left === 0 ? "Ends today" : `Ends in ${left} d`}</Badge>
                      ) : (
                        <Badge tone={badge.tone}>{badge.label}</Badge>
                      )}
                      {state === "expired" && end && (
                        <span className="block text-xs text-red-700">{-left!} days ago</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right">
                      {l.rentAmount > 0 ? ngn(l.rentAmount) : <span className="text-amber-700">not set</span>}
                      <span className="block text-xs text-slate-500">{FREQUENCY_LABELS[l.rentFrequency]}</span>
                    </td>
                    <td className={`whitespace-nowrap px-3 py-2 text-right ${owed > 0 ? "font-medium text-red-700" : "text-slate-500"}`}>
                      {owed > 0 ? <Link href={`/admin/rent?tenant=${l.tenant.id}`} className="hover:underline">{ngn(owed)}</Link> : "—"}
                    </td>
                    <td className="px-3 py-2">
                      <LeaseActions
                        lease={{
                          id: l.id,
                          unitId: l.unit.id,
                          tenantId: l.tenant.id,
                          unitLabel: `${l.unit.property.name} — ${l.unit.name}`,
                          tenantName: l.tenant.name,
                          startDate: dayInput(l.startDate),
                          endDate: dayInput(l.endDate),
                          moveOutDate: dayInput(l.moveOutDate),
                          rentAmount: l.rentAmount,
                          rentFrequency: l.rentFrequency,
                          depositAmount: l.depositAmount,
                          notes: l.notes,
                          state,
                          hasRenewal: !!l.renewal,
                          renewStart: dayInput(renewStart),
                          renewEnd: dayInput(renewEnd),
                          today: dayInput(today),
                        }}
                      />
                    </td>
                  </tr>
                );
              })}
              {shown.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-slate-500">
                    No leases here.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div id="new-lease">
          <LeaseForm
            mode="create"
            defaultUnitId={unitIdParam && units.some((u) => u.id === unitIdParam) ? unitIdParam : undefined}
            defaultTenantId={filteredTenant?.id}
            units={units.map((u) => ({
              id: u.id,
              label: `${u.property.name} — ${u.name}`,
              status: occupancyText(occupancyOf(u.leases, today)),
              rentAmount: u.rentAmount,
              rentFrequency: u.rentFrequency,
            }))}
            tenants={tenants.map((t) => ({ id: t.id, label: `${t.name} (${t.email})` }))}
          />
          {tenants.length === 0 && (
            <p className="mt-2 text-sm text-amber-700">
              Add the tenant on the <Link href="/admin/tenants" className="underline">Tenants</Link> page first.
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
