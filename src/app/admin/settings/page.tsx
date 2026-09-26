import { redirect } from "next/navigation";
import { Nav } from "@/components/Nav";
import { SettingsForm } from "@/components/SettingsForm";
import { getSession } from "@/lib/session";
import { getSettings } from "@/lib/pricing";

export default async function AdminSettingsPage() {
  const session = await getSession();
  if (!session.user) redirect("/login");
  if (session.user.role !== "ADMIN") redirect("/dashboard");

  const settings = await getSettings();

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
      </main>
    </div>
  );
}
