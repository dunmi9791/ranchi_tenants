import Link from "next/link";
import { Nav } from "@/components/Nav";
import { getSession } from "@/lib/session";

export default async function HomePage() {
  const session = await getSession();
  return (
    <div>
      <Nav user={session.user} />
      <main className="mx-auto max-w-5xl px-4 py-16">
        <div className="rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-white p-10 shadow-sm">
          <p className="text-sm font-medium uppercase tracking-wide text-emerald-700">
            Prepaid electricity
          </p>
          <h1 className="mt-2 text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
            Top up your meter. Get an STS PIN instantly.
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-slate-600">
            Ranchi Tenants links your account to your company meter, takes payment via Paystack,
            and generates a StronPower STS token server-side — secrets never touch the browser.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            {session.user ? (
              <Link
                href="/dashboard"
                className="rounded-lg bg-emerald-600 px-5 py-2.5 font-medium text-white hover:bg-emerald-700"
              >
                Go to dashboard
              </Link>
            ) : (
              <>
                <Link
                  href="/register"
                  className="rounded-lg bg-emerald-600 px-5 py-2.5 font-medium text-white hover:bg-emerald-700"
                >
                  Create account
                </Link>
                <Link
                  href="/login"
                  className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 font-medium hover:bg-slate-50"
                >
                  Log in
                </Link>
              </>
            )}
          </div>
        </div>
        <div className="mt-12 grid gap-6 sm:grid-cols-3">
          {[
            ["1. Link meter", "Register with your meter number (admin must create it first)."],
            ["2. Buy kWh", "Choose units; NGN is computed from your company rate."],
            ["3. Enter PIN", "After Paystack confirms, we vend an STS PIN for your meter."],
          ].map(([t, d]) => (
            <div key={t} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="font-semibold text-slate-900">{t}</h2>
              <p className="mt-2 text-sm text-slate-600">{d}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
