"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

/** Inline ₦/kWh editor for one company row on /admin/companies. */
export function CompanyPriceForm({ companyId, nairaPerKwh }: { companyId: string; nairaPerKwh: number }) {
  const router = useRouter();
  const [value, setValue] = useState(String(nairaPerKwh));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const dirty = Number(value) !== nairaPerKwh;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/admin/companies/${companyId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nairaPerKwh: Number(value) }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(data.error || "Failed");
      return;
    }
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex items-center gap-2">
      <input
        type="number"
        min="0.01"
        step="0.01"
        required
        value={value}
        onChange={(e) => setValue(e.target.value)}
        aria-label="Price per kWh (₦)"
        className="w-24 rounded-md border border-slate-300 px-2 py-1"
      />
      <button
        type="submit"
        disabled={loading || !dirty}
        className="rounded-md bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-40"
      >
        {loading ? "Saving…" : "Save"}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </form>
  );
}
