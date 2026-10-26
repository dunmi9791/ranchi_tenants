import { redirect } from "next/navigation";
import { Nav } from "@/components/Nav";
import { NotificationSettingsForm } from "@/components/NotificationSettingsForm";
import { SettingsForm } from "@/components/SettingsForm";
import { publicNotificationSettings } from "@/lib/notify";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { getSettings } from "@/lib/pricing";

const EVENT_LABELS: Record<string, string> = {
  welcome: "Welcome",
  password_reset: "Password reset",
  vend_success: "Token sent",
  vend_failed: "Token delayed",
  admin_vend_failed: "Admin alert",
  test: "Test",
};

export default async function AdminSettingsPage() {
  const session = await getSession();
  if (!session.user) redirect("/login");
  if (session.user.role !== "ADMIN") redirect("/dashboard");
  if (session.user.mustChangePassword) redirect("/account/password");

  const [settings, log] = await Promise.all([
    getSettings(),
    prisma.notificationLog.findMany({ orderBy: { createdAt: "desc" }, take: 25 }),
  ]);

  return (
    <div>
      <Nav user={session.user} />
      <main className="mx-auto max-w-5xl space-y-8 px-4 py-8">
        <h1 className="text-2xl font-bold">Settings</h1>
        <SettingsForm
          initial={{
            serviceFeePercent: settings.serviceFeePercent,
            serviceFeeFlat: settings.serviceFeeFlat,
            serviceFeeCap: settings.serviceFeeCap,
          }}
        />
        <NotificationSettingsForm initial={publicNotificationSettings(settings)} />

        <section className="rounded-xl border bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold">Recent notifications</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b text-slate-600">
                <tr>
                  <th className="py-1 pr-3">When</th>
                  <th className="py-1 pr-3">Channel</th>
                  <th className="py-1 pr-3">Event</th>
                  <th className="py-1 pr-3">To</th>
                  <th className="py-1">Result</th>
                </tr>
              </thead>
              <tbody>
                {log.map((n) => (
                  <tr key={n.id} className="border-b align-top last:border-0">
                    <td className="whitespace-nowrap py-1 pr-3 text-slate-500">
                      {n.createdAt.toLocaleString("en-GB", { timeZone: "Africa/Lagos" })}
                    </td>
                    <td className="py-1 pr-3">{n.channel === "EMAIL" ? "Email" : "SMS"}</td>
                    <td className="py-1 pr-3">{EVENT_LABELS[n.event] ?? n.event}</td>
                    <td className="py-1 pr-3 break-all">{n.recipient}</td>
                    <td className={`py-1 ${n.status === "SENT" ? "text-emerald-700" : "text-red-600"}`}>
                      {n.status === "SENT" ? "Sent" : `Failed: ${n.error ?? ""}`}
                    </td>
                  </tr>
                ))}
                {log.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-4 text-center text-slate-500">
                      Nothing sent yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
