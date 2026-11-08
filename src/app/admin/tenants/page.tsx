import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge } from "@/components/Badge";
import type { Prisma } from "@prisma/client";
import { Nav } from "@/components/Nav";
import { SearchBox } from "@/components/SearchBox";
import { TenantActions } from "@/components/TenantActions";
import { TenantForm } from "@/components/TenantForm";
import { daysLeft, effectiveEnd, fmtDay, lagosToday, leaseState } from "@/lib/leases";
import { prisma } from "@/lib/prisma";
import { chargeStatus, syncRentCharges } from "@/lib/rent";
import { searchText, wordsWhere } from "@/lib/search";
import { getSession } from "@/lib/session";

const SOON_DAYS = 30;
const ngn = (n: number) => `₦${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

export default async function AdminTenantsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSession();
  if (!session.user) redirect("/login");
  if (session.user.role !== "ADMIN") redirect("/dashboard");
  if (session.user.mustChangePassword) redirect("/account/password");

  const q = searchText((await searchParams).q);
  const search = wordsWhere<Prisma.UserWhereInput>(q, (c) => [
    { name: c },
    { email: c },
    { phone: c },
    { leases: { some: { unit: { OR: [{ name: c }, { property: { name: c } }] } } } },
  ]);

  await syncRentCharges();
  const [tenants, pendingApplicants] = await Promise.all([
    prisma.user.findMany({
      where: { AND: [{ role: "TENANT" }, search] },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        isPaused: true,
        pausedAt: true,
        pausedReason: true,
        mustChangePassword: true,
        leases: {
          orderBy: { startDate: "desc" },
          select: {
            id: true,
            startDate: true,
            endDate: true,
            moveOutDate: true,
            renewal: { select: { id: true } },
            unit: { select: { name: true, property: { select: { name: true } } } },
            rentCharges: { select: { amount: true, dueDate: true, payments: { select: { amount: true, status: true } } } },
          },
        },
      },
    }),
    prisma.applicant.count({ where: { status: "PENDING" } }),
  ]);

  const today = lagosToday();
  const rows = tenants.map((t) => {
    const leases = t.leases.map((l) => ({ ...l, state: leaseState({ ...l, hasRenewal: !!l.renewal }, today) }));
    // What to list: leases in force, about to start, or lapsed without a move-out.
    const current = leases.filter((l) => l.state === "active" || l.state === "upcoming" || l.state === "expired");
    const owed = t.leases
      .flatMap((l) => l.rentCharges.map((c) => chargeStatus(c, today)))
      .filter((c) => c.state === "overdue" || c.state === "due")
      .reduce((s, c) => s + c.balance, 0);
    return { t, current, hasActive: leases.some((l) => l.state === "active"), owed };
  });
  const counts = {
    active: rows.filter((r) => !r.t.isPaused && r.hasActive).length,
    noLease: rows.filter((r) => !r.t.isPaused && !r.hasActive).length,
    paused: rows.filter((r) => r.t.isPaused).length,
  };

  return (
    <div>
      <Nav user={session.user} />
      <main className="mx-auto max-w-6xl space-y-8 px-4 py-8">
        <div>
          <h1 className="text-2xl font-bold">Tenants</h1>
          <p className="text-sm text-slate-600">
            {counts.active} with an active lease · {counts.noLease} without · {counts.paused} paused. Tenants can buy
            electricity only for units they hold an active lease on; manage leases on the{" "}
            <Link href="/admin/leases" className="text-emerald-700 underline">
              Leases
            </Link>{" "}
            page. Pausing blocks login entirely.
          </p>
          {pendingApplicants > 0 && (
            <p className="mt-2 text-sm">
              <Link href="/admin/applicants" className="font-medium text-amber-700 underline">
                {pendingApplicants} registration{pendingApplicants === 1 ? "" : "s"} from the site awaiting a lease
              </Link>
            </p>
          )}
        </div>
        <TenantForm />

        <SearchBox action="/admin/tenants" q={q} placeholder="Search name, email, phone, unit or property…" />

        <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b bg-slate-50 text-slate-600">
              <tr>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Units</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2 text-right">Rent owed</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ t, current, hasActive, owed }) => (
                <tr key={t.id} className="border-b align-top last:border-0">
                  <td className="px-3 py-2">
                    <span className="font-medium">{t.name}</span>
                    <span className="block text-xs text-slate-500">{t.email}</span>
                    {t.phone && <span className="block text-xs text-slate-500">{t.phone}</span>}
                  </td>
                  <td className="space-y-1 px-3 py-2">
                    {current.map((l) => {
                      const end = effectiveEnd(l);
                      const left = daysLeft(l, today);
                      return (
                        <div key={l.id}>
                          <span>
                            {l.unit.property.name} — {l.unit.name}
                          </span>
                          <span
                            className={`block text-xs ${
                              l.state === "expired"
                                ? "text-red-700"
                                : l.state === "active" && left != null && left <= SOON_DAYS
                                  ? "text-amber-700"
                                  : "text-slate-500"
                            }`}
                          >
                            {l.state === "upcoming"
                              ? `starts ${fmtDay(l.startDate)}`
                              : l.state === "expired"
                                ? `lease expired ${fmtDay(end!)}`
                                : end
                                  ? `until ${fmtDay(end)}`
                                  : "rolling"}
                          </span>
                        </div>
                      );
                    })}
                    {current.length === 0 && <span className="text-slate-400">—</span>}
                    <Link href={`/admin/leases?tenant=${t.id}&status=all`} className="block text-xs text-emerald-700 hover:underline">
                      {t.leases.length ? "Lease history" : "Add lease"}
                    </Link>
                  </td>
                  <td className="space-y-1 px-3 py-2">
                    {t.isPaused ? (
                      <Badge tone="slate">Paused</Badge>
                    ) : hasActive ? (
                      <Badge tone="green">Active</Badge>
                    ) : (
                      <Badge tone="amber">No active lease</Badge>
                    )}
                    {t.isPaused && t.pausedReason && (
                      <span className="block max-w-[12rem] text-xs text-slate-500">{t.pausedReason}</span>
                    )}
                    {t.isPaused && t.pausedAt && <span className="block text-xs text-slate-400">since {fmtDay(t.pausedAt)}</span>}
                    {t.mustChangePassword && <span className="block text-xs text-slate-500">Password reset pending</span>}
                  </td>
                  <td className={`whitespace-nowrap px-3 py-2 text-right ${owed > 0 ? "font-medium text-red-700" : "text-slate-500"}`}>
                    {owed > 0 ? (
                      <Link href={`/admin/rent?tenant=${t.id}`} className="hover:underline">
                        {ngn(owed)}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <TenantActions
                      tenant={{ id: t.id, name: t.name, email: t.email, phone: t.phone, isPaused: t.isPaused }}
                    />
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-slate-500">
                    {q ? `No tenants match "${q}".` : "No tenants found."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
