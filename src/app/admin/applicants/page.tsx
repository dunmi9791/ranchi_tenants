import Link from "next/link";
import { redirect } from "next/navigation";
import type { ApplicantStatus, Prisma } from "@prisma/client";
import { ApplicantActions } from "@/components/ApplicantActions";
import { Nav } from "@/components/Nav";
import { SearchBox } from "@/components/SearchBox";
import { fmtDay, lagosToday } from "@/lib/leases";
import { occupancyLeaseSelect, occupancyOf, occupancyText } from "@/lib/occupancy";
import { prisma } from "@/lib/prisma";
import { searchText, wordsWhere } from "@/lib/search";
import { getSession } from "@/lib/session";

const FILTERS = { PENDING: "Awaiting lease", REJECTED: "Rejected" } as const satisfies Record<ApplicantStatus, string>;

export default async function ApplicantsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSession();
  if (!session.user) redirect("/login");
  if (session.user.role !== "ADMIN") redirect("/dashboard");
  if (session.user.mustChangePassword) redirect("/account/password");

  const sp = await searchParams;
  const statusIn = Array.isArray(sp.status) ? sp.status[0] : sp.status;
  const status: ApplicantStatus = statusIn === "REJECTED" ? "REJECTED" : "PENDING";
  const q = searchText(sp.q);
  const search = wordsWhere<Prisma.ApplicantWhereInput>(q, (c) => [
    { name: c },
    { email: c },
    { phone: c },
    { message: c },
    { unit: { name: c } },
    { unit: { property: { name: c } } },
  ]);

  const [applicants, counts, units] = await Promise.all([
    prisma.applicant.findMany({
      where: { AND: [{ status }, search] },
      include: { unit: { select: { name: true, property: { select: { name: true } } } } },
      orderBy: { createdAt: status === "PENDING" ? "asc" : "desc" },
    }),
    prisma.applicant.groupBy({ by: ["status"], _count: true }),
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
  ]);
  const count = (s: ApplicantStatus) => counts.find((c) => c.status === s)?._count ?? 0;

  const today = lagosToday();
  const unitOptions = units.map((u) => ({
    id: u.id,
    label: `${u.property.name} — ${u.name}`,
    status: occupancyText(occupancyOf(u.leases, today)),
    rentAmount: u.rentAmount,
    rentFrequency: u.rentFrequency,
  }));

  return (
    <div>
      <Nav user={session.user} />
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-8">
        <div>
          <h1 className="text-2xl font-bold">Applicants</h1>
          <p className="text-sm text-slate-600">
            People who registered on the site. They can&apos;t log in yet: add a lease to make them a tenant, and they then log in
            with the password they chose. Tenants you add yourself go on the{" "}
            <Link href="/admin/tenants" className="text-emerald-700 underline">
              Tenants
            </Link>{" "}
            page.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2 text-sm">
            {(Object.keys(FILTERS) as ApplicantStatus[]).map((s) => (
              <Link
                key={s}
                href={`/admin/applicants?${new URLSearchParams({ status: s, ...(q ? { q } : {}) })}`}
                className={`rounded-full border px-3 py-1 ${status === s ? "border-emerald-600 bg-emerald-50 text-emerald-800" : "border-slate-300 hover:bg-slate-50"}`}
              >
                {FILTERS[s]} <span className="text-slate-500">({count(s)})</span>
              </Link>
            ))}
          </div>
          <SearchBox action="/admin/applicants" q={q} placeholder="Search name, email, phone…" keep={{ status }} />
        </div>

        <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b bg-slate-50 text-slate-600">
              <tr>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Apartment</th>
                <th className="px-3 py-2">Message</th>
                <th className="px-3 py-2">Registered</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {applicants.map((a) => (
                <tr key={a.id} className="border-b align-top last:border-0">
                  <td className="px-3 py-2">
                    <span className="font-medium">{a.name}</span>
                    <span className="block text-xs text-slate-500">{a.email}</span>
                    {a.phone && <span className="block text-xs text-slate-500">{a.phone}</span>}
                  </td>
                  <td className="px-3 py-2">
                    {a.unit ? (
                      <>
                        <span className="font-medium">{a.unit.name}</span>
                        <span className="block text-xs text-slate-500">{a.unit.property.name}</span>
                      </>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="max-w-xs px-3 py-2 text-slate-600">
                    {a.message || <span className="text-slate-400">—</span>}
                    {a.status === "REJECTED" && (
                      <span className="block text-xs text-red-700">
                        Rejected {a.rejectedAt ? fmtDay(a.rejectedAt) : ""}
                        {a.rejectedReason ? ` · ${a.rejectedReason}` : ""}
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">{fmtDay(a.createdAt)}</td>
                  <td className="px-3 py-2">
                    <ApplicantActions applicant={{ id: a.id, name: a.name, status: a.status, unitId: a.unitId }} units={unitOptions} />
                  </td>
                </tr>
              ))}
              {applicants.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-slate-500">
                    {q ? `No applicants match "${q}".` : status === "PENDING" ? "No registrations awaiting a lease." : "No rejected registrations."}
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
