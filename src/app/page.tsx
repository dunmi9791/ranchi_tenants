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
            Prepaid electricity made easy
          </p>
          <h1 className="mt-2 text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
            Top up your meter. Keep your home powered.
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-slate-600">
            Buy electricity in a few simple steps with Ranchi Tenants. Choose your amount, pay securely
            with Paystack, and get your electricity token instantly—ready to enter into your meter.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            {/* Signed-in tenants buy from the dashboard; everyone else signs in first. */}
            <Link
              href={session.user ? "/dashboard" : "/login"}
              className="rounded-lg bg-emerald-600 px-5 py-2.5 font-medium text-white hover:bg-emerald-700"
            >
              Top up now
            </Link>
          </div>
        </div>
        <div className="mt-12 grid gap-6 sm:grid-cols-3">
          {[
            [
              "1. Link your meter",
              "Sign in, or register with your meter number. Your property manager sets your meter up first.",
            ],
            [
              "2. Choose your amount",
              "Enter how much you want to spend. You'll see the units you get and the service fee before you pay.",
            ],
            [
              "3. Enter your token",
              "Once your payment is confirmed, your 20-digit token appears on your dashboard. Type it into your meter.",
            ],
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
