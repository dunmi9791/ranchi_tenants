import { redirect } from "next/navigation";
import { Nav } from "@/components/Nav";
import { MeterForm } from "@/components/MeterForm";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export default async function AdminMetersPage() {
  const session = await getSession();
  if (!session.user) redirect("/login");
  if (session.user.role !== "ADMIN") redirect("/dashboard");

  const [meters, companies] = await Promise.all([
    prisma.meter.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        company: { select: { name: true } },
        user: { select: { email: true, name: true } },
      },
    }),
    prisma.company.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  return (
    <div>
      <Nav user={session.user} />
      <main className="mx-auto max-w-5xl space-y-8 px-4 py-8">
        <h1 className="text-2xl font-bold">Meters</h1>
        <MeterForm companies={companies} />
        <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b bg-slate-50 text-slate-600">
              <tr>
                <th className="px-3 py-2">Meter</th>
                <th className="px-3 py-2">Label</th>
                <th className="px-3 py-2">Company</th>
                <th className="px-3 py-2">Tenant</th>
              </tr>
            </thead>
            <tbody>
              {meters.map((m) => (
                <tr key={m.id} className="border-b last:border-0">
                  <td className="px-3 py-2 font-mono">{m.meterNumber}</td>
                  <td className="px-3 py-2">{m.label || "—"}</td>
                  <td className="px-3 py-2">{m.company.name}</td>
                  <td className="px-3 py-2">{m.user ? `${m.user.name} (${m.user.email})` : "Unassigned"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
