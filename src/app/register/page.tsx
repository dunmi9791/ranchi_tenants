"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { Nav } from "@/components/Nav";

export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Error passed back by the API when the form was submitted before hydration.
  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("error");
    if (fromUrl) setError(fromUrl);
  }, []);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: fd.get("name"),
        email: fd.get("email"),
        password: fd.get("password"),
        meterNumber: String(fd.get("meterNumber") || "") || undefined,
      }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error || "Registration failed");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div>
      <Nav />
      <main className="mx-auto max-w-md px-4 py-12">
        <h1 className="text-2xl font-bold">Create account</h1>
        <p className="mt-1 text-sm text-slate-600">
          Optional: enter a meter number already created by your company admin.
        </p>
        <form method="post" action="/api/auth/register" onSubmit={onSubmit} className="mt-6 space-y-4 rounded-xl border bg-white p-6 shadow-sm">
          <label className="block text-sm">
            <span className="font-medium">Full name</span>
            <input name="name" required className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" />
          </label>
          <label className="block text-sm">
            <span className="font-medium">Email</span>
            <input name="email" type="email" required className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" />
          </label>
          <label className="block text-sm">
            <span className="font-medium">Password</span>
            <input name="password" type="password" minLength={6} required className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" />
          </label>
          <label className="block text-sm">
            <span className="font-medium">Meter number (optional)</span>
            <input name="meterNumber" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" />
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-emerald-600 py-2 font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {loading ? "Creating…" : "Register"}
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-slate-600">
          Already have an account?{" "}
          <Link href="/login" className="text-emerald-700 underline">
            Log in
          </Link>
        </p>
      </main>
    </div>
  );
}
