import { redirect } from "next/navigation";
import { Nav } from "@/components/Nav";
import { TenantActions } from "@/components/TenantActions";
import { TenantForm } from "@/components/TenantForm";
import { getAccountStatus, leaseEndsAt } from "@/lib/account";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

const SOON_MS = 14 * 24 * 60 * 60 * 1000;

// Lease dates are stored as midnight UTC of the calendar day; format in UTC to avoid off-by-one.
const fmtDate = (d: Date) =>
  d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

function Badge({ tone, children }: { tone: "green" | "red" | "amber" | "slate"; children: React.ReactNode }) {
  const tones = {
    green: "bg-green-100 text-green-800",
    red: "bg-red-100 text-red-800",
    amber: "bg-amber-100 text-amber-800",
    slate: "bg-slate-100 text-slate-700",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}

export default async function AdminTenantsPage() {
  const session = await getSession();
  if (!session.user) redirect("/login");
  if (session.user.role !== "ADMIN") redirect("/dashboard");

  const tenants = await prisma.user.findMany({
    where: { role: "TENANT" },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      role: true,
      name: true,
      email: true,
      leaseExpiryDate: true,
      leaseNotes: true,
      isPaused: true,
      pausedAt: true,
      pausedReason: true,
      mustChangePassword: true,
      meters: { select: { id: true, meterNumber: true, label: true } },
    },
  });

  const now = new Date();
  const counts = { active: 0, paused: 0, lease_expired: 0 };
  for (const t of tenants) counts[getAccountStatus(t, now).state]++;

  return (
    <div>
      <Nav user={session.user} />
      <main className="mx-auto max-w-6xl space-y-8 px-4 py-8">
        <div>
          <h1 className="text-2xl font-bold">Tenants</h1>
          <p className="text-sm text-slate-600">
            {counts.active} active · {counts.paused} paused · {counts.lease_expired} lease expired. Tenants are
            paused automatically at the end of their lease expiry day; extend the lease to reactivate them.
          </p>
        </div>
        <TenantForm />

        <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b bg-slate-50 text-slate-600">
              <tr>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Meters</th>
                <th className="px-3 py-2">Lease expiry</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((t) => {
                const status = getAccountStatus(t, now);
                const endsSoon =
                  status.state === "active" &&
                  t.leaseExpiryDate != null &&
                  leaseEndsAt(t.leaseExpiryDate).getTime() - now.getTime() < SOON_MS;
                return (
                  <tr key={t.id} className="border-b align-top last:border-0">
                    <td className="px-3 py-2">
                      <span className="font-medium">{t.name}</span>
                      <span className="block text-xs text-slate-500">{t.email}</span>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {t.meters.map((m) => m.meterNumber).join(", ") || "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      {t.leaseExpiryDate ? fmtDate(t.leaseExpiryDate) : <span className="text-slate-400">No lease date</span>}
                      {t.leaseNotes && <span className="block max-w-[14rem] text-xs text-slate-500">{t.leaseNotes}</span>}
                    </td>
                    <td className="space-y-1 px-3 py-2">
                      {status.state === "active" &&
                        (endsSoon ? <Badge tone="amber">Lease ends soon</Badge> : <Badge tone="green">Active</Badge>)}
                      {status.state === "paused" && <Badge tone="slate">Paused</Badge>}
                      {status.state === "lease_expired" && <Badge tone="red">Lease expired</Badge>}
                      {t.isPaused && t.pausedReason && (
                        <span className="block max-w-[12rem] text-xs text-slate-500">{t.pausedReason}</span>
                      )}
                      {t.isPaused && t.pausedAt && (
                        <span className="block text-xs text-slate-400">since {fmtDate(t.pausedAt)}</span>
                      )}
                      {t.mustChangePassword && (
                        <span className="block text-xs text-slate-500">Password reset pending</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <TenantActions
                        tenant={{
                          id: t.id,
                          name: t.name,
                          email: t.email,
                          leaseExpiryDate: t.leaseExpiryDate?.toISOString() ?? null,
                          leaseNotes: t.leaseNotes,
                          isPaused: t.isPaused,
                        }}
                      />
                    </td>
                  </tr>
                );
              })}
              {tenants.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-slate-500">
                    No tenants found.
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
