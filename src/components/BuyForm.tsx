"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

type Meter = {
  id: string;
  meterNumber: string;
  label: string | null;
  company: { name: string; nairaPerKwh: number };
};

export function BuyForm({ meters }: { meters: Meter[] }) {
  const router = useRouter();
  const [meterId, setMeterId] = useState(meters[0]?.id ?? "");
  const [kwh, setKwh] = useState(10);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const selected = meters.find((m) => m.id === meterId);
  const naira = selected ? Number((kwh * selected.company.nairaPerKwh).toFixed(2)) : 0;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);
    const res = await fetch("/api/paystack/initialize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ meterId, kwhAmount: kwh }),
    });
    const data = await res.json();
    if (!res.ok) {
      setLoading(false);
      setError(data.error || "Could not start payment");
      return;
    }

    if (data.dryRun) {
      const complete = await fetch("/api/paystack/mock-complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference: data.reference }),
      });
      const done = await complete.json();
      setLoading(false);
      if (!complete.ok) {
        setError(done.error || "Mock payment failed");
        return;
      }
      setMessage(
        done.purchase?.stsPin
          ? `Payment simulated. STS PIN: ${done.purchase.stsPin}`
          : `Payment simulated. Status: ${done.purchase?.status}. ${done.purchase?.errorMessage || ""}`
      );
      router.refresh();
      return;
    }

    window.location.href = data.authorization_url;
  }

  if (meters.length === 0) {
    return (
      <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        No meters linked to your account yet. Ask your company admin to assign one, or register with a meter number.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-xl border bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold">Buy prepaid units</h2>
      <label className="block text-sm">
        <span className="font-medium">Meter</span>
        <select
          value={meterId}
          onChange={(e) => setMeterId(e.target.value)}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
        >
          {meters.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label ? `${m.label} — ` : ""}
              {m.meterNumber} ({m.company.name})
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        <span className="font-medium">Amount (kWh)</span>
        <input
          type="number"
          min={0.1}
          step={0.1}
          value={kwh}
          onChange={(e) => setKwh(Number(e.target.value))}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
          required
        />
      </label>
      <p className="text-sm text-slate-600">
        Rate: ₦{selected?.company.nairaPerKwh ?? "—"}/kWh →{" "}
        <span className="font-semibold text-slate-900">₦{naira.toLocaleString()}</span>
      </p>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {message && <p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-900">{message}</p>}
      <button
        type="submit"
        disabled={loading}
        className="rounded-md bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
      >
        {loading ? "Processing…" : "Pay with Paystack"}
      </button>
    </form>
  );
}
