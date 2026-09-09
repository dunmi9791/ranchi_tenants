"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

export function MeterForm({ companies }: { companies: { id: string; name: string }[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const res = await fetch("/api/admin/meters", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        meterNumber: fd.get("meterNumber"),
        label: fd.get("label") || undefined,
        companyId: fd.get("companyId"),
        userEmail: String(fd.get("userEmail") || "") || undefined,
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
      <h2 className="sm:col-span-2 text-lg font-semibold">Add meter</h2>
      <label className="block text-sm">
        <span className="font-medium">Meter number</span>
        <input name="meterNumber" required className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" />
      </label>
      <label className="block text-sm">
        <span className="font-medium">Label</span>
        <input name="label" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" />
      </label>
      <label className="block text-sm">
        <span className="font-medium">Company</span>
        <select name="companyId" required className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2">
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        <span className="font-medium">Assign to user email (optional)</span>
        <input name="userEmail" type="email" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" />
      </label>
      {error && <p className="sm:col-span-2 text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="sm:col-span-2 rounded-md bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
      >
        {loading ? "Saving…" : "Save meter"}
      </button>
    </form>
  );
}
