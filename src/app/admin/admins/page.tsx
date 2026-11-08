import { redirect } from "next/navigation";
import { AdminActions } from "@/components/AdminActions";
import { AdminForm } from "@/components/AdminForm";
import { Nav } from "@/components/Nav";
import { prisma } from "@/lib/prisma";
import { getSession, loginPath } from "@/lib/session";

const fmtDate = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

export default async function AdminAdminsPage() {
  const session = await getSession();
  if (!session.user) redirect(loginPath(session));
  if (session.user.role !== "ADMIN") redirect("/dashboard");
  if (session.user.mustChangePassword) redirect("/account/password");

  const admins = await prisma.user.findMany({
    where: { role: "ADMIN" },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, email: true, phone: true, mustChangePassword: true, createdAt: true },
  });

  return (
    <div>
      <Nav user={session.user} />
      <main className="mx-auto max-w-6xl space-y-8 px-4 py-8">
        <div>
          <h1 className="text-2xl font-bold">Admins</h1>
          <p className="text-sm text-slate-600">
            Admins have full access: companies, meters, tenants, purchases, settings and other admins. New admins get
            a temporary password and must choose their own at first login.
          </p>
        </div>
        <AdminForm />

        <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b bg-slate-50 text-slate-600">
              <tr>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Added</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {admins.map((a) => {
                const isSelf = a.id === session.user!.id;
                return (
                  <tr key={a.id} className="border-b align-top last:border-0">
                    <td className="px-3 py-2">
                      <span className="font-medium">{a.name}</span>
                      {isSelf && <span className="ml-1 text-xs text-slate-500">(you)</span>}
                      <span className="block text-xs text-slate-500">{a.email}</span>
                      {a.phone && <span className="block text-xs text-slate-500">{a.phone}</span>}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">{fmtDate(a.createdAt)}</td>
                    <td className="px-3 py-2 text-xs text-slate-500">
                      {a.mustChangePassword ? "Password change pending" : "Active"}
                    </td>
                    <td className="px-3 py-2">
                      <AdminActions admin={{ id: a.id, name: a.name, email: a.email, phone: a.phone }} isSelf={isSelf} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
