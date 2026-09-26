"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

type FeeSettings = {
  serviceFeePercent: number;
  serviceFeeFlat: number;
  serviceFeeCap: number | null;
};

const ngn = (n: number) => `₦${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

// Mirrors computeServiceFee in lib/pricing.ts for the live preview.
function fee(energy: number, s: FeeSettings) {
  const rate = Math.min(s.serviceFeePercent, 99) / 100;
  let f = (energy + s.serviceFeeFlat) / (1 - rate) - energy;
  if (s.serviceFeeCap != null) f = Math.min(f, s.serviceFeeCap);
  return Math.max(0, Math.ceil(f - 1e-9));
}

// Paystack local card pricing (Nigeria): 1.5% + ₦100, ₦100 waived under ₦2,500, capped at ₦2,000.
function paystackCharge(total: number) {
  const f = total * 0.015 + (total >= 2500 ? 100 : 0);
  return Math.min(Math.round(f * 100) / 100, 2000);
}

const EXAMPLES = [1000, 5000, 20000, 100000, 200000];

export function SettingsForm({ initial }: { initial: FeeSettings }) {
  const router = useRouter();
  const [s, setS] = useState<FeeSettings>(initial);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSaved(false);
    const res = await fetch("/api/admin/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(s),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error || "Save failed");
      return;
    }
    setSaved(true);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5 rounded-xl border bg-white p-5 shadow-sm">
      <div>
        <h2 className="text-lg font-semibold">Service fee</h2>
        <p className="text-sm text-slate-600">
          Added to every vending purchase to cover Paystack charges. Enter Paystack&apos;s rate: the fee is
          worked out so that after Paystack takes its percent + flat fee from the total, you still receive
          the full electricity amount. Limited to the cap, rounded up to the next naira.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-sm">
          <span className="font-medium">Percent (%)</span>
          <input
            type="number"
            min={0}
            max={20}
            step={0.01}
            required
            value={s.serviceFeePercent}
            onChange={(e) => setS({ ...s, serviceFeePercent: Number(e.target.value) })}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium">Flat fee (₦)</span>
          <input
            type="number"
            min={0}
            step={1}
            required
            value={s.serviceFeeFlat}
            onChange={(e) => setS({ ...s, serviceFeeFlat: Number(e.target.value) })}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium">Cap (₦, blank = none)</span>
          <input
            type="number"
            min={1}
            step={1}
            value={s.serviceFeeCap ?? ""}
            onChange={(e) =>
              setS({ ...s, serviceFeeCap: e.target.value === "" ? null : Number(e.target.value) })
            }
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
          />
        </label>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b text-slate-600">
            <tr>
              <th className="py-1 pr-3">Electricity</th>
              <th className="py-1 pr-3">Service fee</th>
              <th className="py-1 pr-3">Tenant pays</th>
              <th className="py-1 pr-3">Est. Paystack charge</th>
              <th className="py-1">Covered?</th>
            </tr>
          </thead>
          <tbody>
            {EXAMPLES.map((energy) => {
              const f = fee(energy, s);
              const charge = paystackCharge(energy + f);
              const covered = f >= charge;
              return (
                <tr key={energy} className="border-b last:border-0">
                  <td className="py-1 pr-3">{ngn(energy)}</td>
                  <td className="py-1 pr-3">{ngn(f)}</td>
                  <td className="py-1 pr-3">{ngn(energy + f)}</td>
                  <td className="py-1 pr-3">{ngn(charge)}</td>
                  <td className={`py-1 ${covered ? "text-emerald-700" : "text-red-600"}`}>
                    {covered ? "Yes" : `Short ${ngn(charge - f)}`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-slate-500">
          Estimate uses Paystack&apos;s standard Nigerian card pricing (1.5% + ₦100, ₦100 waived under ₦2,500,
          capped at ₦2,000). Check your Paystack dashboard for your actual rate.
        </p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {saved && <p className="text-sm text-emerald-700">Saved. New purchases use this fee.</p>}
      <button
        type="submit"
        disabled={loading}
        className="rounded-md bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
      >
        {loading ? "Saving…" : "Save settings"}
      </button>
    </form>
  );
}
