import { redirect } from "next/navigation";
import { Nav } from "@/components/Nav";
import { ChangePasswordForm } from "@/components/ChangePasswordForm";
import { getSession, loginPath } from "@/lib/session";

export default async function ChangePasswordPage() {
  const session = await getSession();
  if (!session.user) redirect(loginPath(session));

  return (
    <div>
      <Nav user={session.user} />
      <main className="mx-auto max-w-md px-4 py-12">
        <h1 className="text-2xl font-bold">Change password</h1>
        {session.user.mustChangePassword && (
          <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            Your password was reset by your property manager. Please choose a new password to continue.
          </p>
        )}
        <ChangePasswordForm />
      </main>
    </div>
  );
}
