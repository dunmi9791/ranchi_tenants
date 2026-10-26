import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Badge } from "@/components/Badge";
import { Nav } from "@/components/Nav";
import { PropertyActions, UnitActions } from "@/components/PropertyActions";
import { UnitForm } from "@/components/UnitForm";
import { FREQUENCY_LABELS, daysLeft, effectiveEnd, fmtDay, lagosToday } from "@/lib/leases";
import { occupancyLeaseSelect, occupancyOf } from "@/lib/occupancy";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

const ngn = (n: number) => `₦${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

export default async function PropertyPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session.user) redirect("/login");
  if (session.user.role !== "ADMIN") redirect("/dashboard");
  if (session.user.mustChangePassword) redirect("/account/password");

  const { id } = await params;
  const [property, companies] = await Promise.all([
    prisma.property.findUnique({
      where: { id },
      include: {
        company: { select: { name: true } },
        units: {
          orderBy: { name: "asc" },
          include: {
            meters: { select: { id: true, meterNumber: true } },
            leases: { select: occupancyLeaseSelect },
          },
        },
      },
    }),
    prisma.company.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  if (!property) notFound();

  const today = lagosToday();

  return (
    <div>
      <Nav user={session.user} />
      <main className="mx-auto max-w-6xl space-y-8 px-4 py-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Link href="/admin/properties" className="text-sm text-emerald-700 hover:underline">
              ← Properties
            </Link>
            <h1 className="text-2xl font-bold">{property.name}</h1>
            <p className="text-sm text-slate-600">
              {[property.address, property.company.name].filter(Boolean).join(" · ")}
            </p>
            {property.notes && <p className="mt-1 text-sm text-slate-500">{property.notes}</p>}
          </div>
          <PropertyActions
            property={{ id: property.id, name: property.name, companyId: property.companyId, address: property.address, notes: property.notes }}
            companies={companies}
          />
        </div>

        <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b bg-slate-50 text-slate-600">
              <tr>
                <th className="px-3 py-2">Unit</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Tenant</th>
                <th className="px-3 py-2">Lease ends</th>
                <th className="px-3 py-2 text-right">Rent</th>
                <th className="px-3 py-2">Meters</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {property.units.map((u) => {
                const o = occupancyOf(u.leases, today);
                const left = o.lease ? daysLeft(o.lease, today) : null;
                const end = o.lease ? effectiveEnd(o.lease) : null;
                return (
                  <tr key={u.id} className="border-b align-top last:border-0">
                    <td className="px-3 py-2">
                      <span className="font-medium">{u.name}</span>
                      {u.notes && <span className="block text-xs text-slate-500">{u.notes}</span>}
                    </td>
                    <td className="space-y-1 px-3 py-2">
                      {o.status === "occupied" &&
                        (left != null && left <= 30 ? <Badge tone="amber">Expires in {left} d</Badge> : <Badge tone="green">Occupied</Badge>)}
                      {o.status === "lease_expired" && <Badge tone="red">Lease expired</Badge>}
                      {o.status === "vacant" && <Badge tone="slate">Vacant</Badge>}
                      {o.upcoming && <span className="block text-xs text-slate-500">Let from {fmtDay(o.upcoming.startDate)}</span>}
                    </td>
                    <td className="px-3 py-2">
                      {o.lease ? (
                        <Link href={`/admin/leases?tenant=${o.lease.tenant.id}`} className="hover:underline">
                          {o.lease.tenant.name}
                        </Link>
                      ) : o.upcoming ? (
                        <span className="text-slate-500">{o.upcoming.tenant.name} (incoming)</span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">{end ? fmtDay(end) : o.lease ? "Rolling" : "—"}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right">
                      {o.lease ? (
                        <>
                          {ngn(o.lease.rentAmount)}
                          <span className="block text-xs text-slate-500">{FREQUENCY_LABELS[o.lease.rentFrequency]}</span>
                        </>
                      ) : u.rentAmount != null ? (
                        <span className="text-slate-500">
                          {ngn(u.rentAmount)}
                          <span className="block text-xs">{FREQUENCY_LABELS[u.rentFrequency]} (standard)</span>
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{u.meters.map((m) => m.meterNumber).join(", ") || "—"}</td>
                    <td className="px-3 py-2">
                      <UnitActions
                        propertyId={property.id}
                        unit={{ id: u.id, name: u.name, rentAmount: u.rentAmount, rentFrequency: u.rentFrequency, notes: u.notes }}
                      />
                    </td>
                  </tr>
                );
              })}
              {property.units.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-slate-500">
                    No units yet. Add them below, then attach meters on the Meters page.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <UnitForm propertyId={property.id} />
      </main>
    </div>
  );
}
