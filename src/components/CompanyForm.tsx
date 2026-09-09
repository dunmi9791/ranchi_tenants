"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

export function CompanyForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const res = await fetch("/api/admin/companies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: fd.get("name"),
        stronBaseUrl: fd.get("stronBaseUrl"),
        stronCompanyName: fd.get("stronCompanyName"),
        stronUsername: fd.get("stronUsername"),
        stronPassword: fd.get("stronPassword"),
        nairaPerKwh: Number(fd.get("nairaPerKwh")),
      }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error || "Failed");
      return;
    }
    e.currentTarget.reset();
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-3 rounded-xl border bg-white p-5 shadow-sm sm:grid-cols-2">
      <h2 className="sm:col-span-2 text-lg font-semibold">Add company</h2>
      {(
        [
          ["name", "Display name", "text"],
          ["stronBaseUrl", "StronPower base URL", "url"],
          ["stronCompanyName", "Stron Companyname", "text"],
          ["stronUsername", "Stron Username", "text"],
          ["stronPassword", "Stron Password", "password"],
          ["nairaPerKwh", "Naira per kWh", "number"],
        ] as const
      ).map(([name, label, type]) => (
        <label key={name} className="block text-sm">
          <span className="font-medium">{label}</span>
          <input
            name={name}
            type={type}
            required
            step={type === "number" ? "0.01" : undefined}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
          />
        </label>
      ))}
      {error && <p className="sm:col-span-2 text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="sm:col-span-2 rounded-md bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
      >
        {loading ? "Saving…" : "Save company"}
      </button>
    </form>
  );
}
