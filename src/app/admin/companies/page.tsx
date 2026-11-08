import { redirect } from "next/navigation";
import { Nav } from "@/components/Nav";
import { CompanyForm } from "@/components/CompanyForm";
import { CompanyPriceForm } from "@/components/CompanyPriceForm";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export default async function AdminCompaniesPage() {
  const session = await getSession();
  if (!session.user) redirect("/login");
  if (session.user.role !== "ADMIN") redirect("/dashboard");
  if (session.user.mustChangePassword) redirect("/account/password");

  const companies = await prisma.company.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      stronBaseUrl: true,
      stronCompanyName: true,
      stronUsername: true,
      nairaPerKwh: true,
      _count: { select: { meters: true, users: true } },
    },
  });

  return (
    <div>
      <Nav user={session.user} />
      <main className="mx-auto max-w-5xl space-y-8 px-4 py-8">
        <h1 className="text-2xl font-bold">Companies</h1>
        <p className="text-sm text-slate-600">
          Each company has its own StronPower base URL and credentials (never sent to the browser).
          Tenants pay the company&apos;s price per kWh set here; the naira amount is converted to kWh
          at this price and only the kWh is sent to StronPower. Price changes apply from the next quote.
        </p>
        <CompanyForm />
        <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b bg-slate-50 text-slate-600">
              <tr>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Stron base</th>
                <th className="px-3 py-2">Company / user</th>
                <th className="px-3 py-2">Price ₦/kWh</th>
                <th className="px-3 py-2">Meters</th>
              </tr>
            </thead>
            <tbody>
              {companies.map((c) => (
                <tr key={c.id} className="border-b last:border-0">
                  <td className="px-3 py-2 font-medium">{c.name}</td>
                  <td className="px-3 py-2 font-mono text-xs">{c.stronBaseUrl}</td>
                  <td className="px-3 py-2">
                    {c.stronCompanyName} / {c.stronUsername}
                  </td>
                  <td className="px-3 py-2">
                    <CompanyPriceForm companyId={c.id} nairaPerKwh={c.nairaPerKwh} />
                  </td>
                  <td className="px-3 py-2">{c._count.meters}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
