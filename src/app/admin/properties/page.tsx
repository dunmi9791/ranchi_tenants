import Link from "next/link";
import { redirect } from "next/navigation";
import { Nav } from "@/components/Nav";
import { PropertyForm } from "@/components/PropertyForm";
import { SearchBox } from "@/components/SearchBox";
import { prisma } from "@/lib/prisma";
import { propertyRows } from "@/lib/properties";
import { searchText } from "@/lib/search";
import { getSession } from "@/lib/session";

function Tile({ label, value, sub, tone }: { label: string; value: string | number; sub?: string; tone?: "warn" }) {
  return (
    <div className={`rounded-xl border p-4 shadow-sm ${tone === "warn" ? "border-amber-200 bg-amber-50" : "bg-white"}`}>
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-semibold text-slate-900">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

export default async function PropertiesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSession();
  if (!session.user) redirect("/login");
  if (session.user.role !== "ADMIN") redirect("/dashboard");
  if (session.user.mustChangePassword) redirect("/account/password");

  const q = searchText((await searchParams).q);
  const [rows, companies] = await Promise.all([
    propertyRows(q),
    prisma.company.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const total = rows.reduce(
    (t, r) => ({
      units: t.units + r.p.units.length,
      occupied: t.occupied + r.counts.occupied,
      lease_expired: t.lease_expired + r.counts.lease_expired,
      vacant: t.vacant + r.counts.vacant,
      expiring: t.expiring + r.counts.expiring,
    }),
    { units: 0, occupied: 0, lease_expired: 0, vacant: 0, expiring: 0 }
  );
  const pct = (n: number, of: number) => (of ? `${Math.round((n / of) * 100)}%` : "—");

  return (
    <div>
      <Nav user={session.user} />
      <main className="mx-auto max-w-6xl space-y-8 px-4 py-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Properties</h1>
            <p className="text-sm text-slate-600">Buildings and their units. Open a property to manage its units and see who lives where.</p>
          </div>
          <div className="flex gap-2">
            <a
              href={`/api/admin/properties/export${q ? `?${new URLSearchParams({ q })}` : ""}`}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50"
            >
              Export CSV
            </a>
            <a
              href={`/api/admin/properties/occupants${q ? `?${new URLSearchParams({ q })}` : ""}`}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50"
            >
              Export occupants
            </a>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-5">
          <Tile label="Units" value={total.units} />
          <Tile label="Occupied" value={total.occupied} sub={`${pct(total.occupied, total.units)} occupancy`} />
          <Tile label="Vacant" value={total.vacant} />
          <Tile label="Lease expired" value={total.lease_expired} sub="tenant not renewed or moved out" tone={total.lease_expired ? "warn" : undefined} />
          <Tile label="Expiring in 30 days" value={total.expiring} tone={total.expiring ? "warn" : undefined} />
        </div>

        <SearchBox action="/admin/properties" q={q} placeholder="Search property, address, company or unit…" />

        <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b bg-slate-50 text-slate-600">
              <tr>
                <th className="px-3 py-2">Property</th>
                <th className="px-3 py-2">Company</th>
                <th className="px-3 py-2 text-right">Units</th>
                <th className="px-3 py-2 text-right">Occupied</th>
                <th className="px-3 py-2 text-right">Vacant</th>
                <th className="px-3 py-2 text-right">Lease expired</th>
                <th className="px-3 py-2 text-right">Occupancy</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ p, counts }) => (
                <tr key={p.id} className="border-b last:border-0">
                  <td className="px-3 py-2">
                    <Link href={`/admin/properties/${p.id}`} className="font-medium text-emerald-700 hover:underline">
                      {p.name}
                    </Link>
                    {p.address && <span className="block text-xs text-slate-500">{p.address}</span>}
                  </td>
                  <td className="px-3 py-2">{p.company.name}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{p.units.length}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{counts.occupied}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{counts.vacant}</td>
                  <td className={`px-3 py-2 text-right tabular-nums ${counts.lease_expired ? "font-medium text-red-700" : ""}`}>
                    {counts.lease_expired}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{pct(counts.occupied, p.units.length)}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-slate-500">
                    {q ? `No properties match "${q}".` : "No properties yet. Add your first building below."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <PropertyForm companies={companies} />
      </main>
    </div>
  );
}
