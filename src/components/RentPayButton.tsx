"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const ngn = (n: number) => `₦${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

/** Pay one rent charge's balance with Paystack (or the mock checkout in dry-run). */
export function RentPayButton({ chargeId, balance, fee }: { chargeId: string; balance: number; fee: number }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pay() {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/rent/pay", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chargeId }),
    });
    const data = await res.json();
    if (!res.ok) {
      setLoading(false);
      setError(data.error || "Could not start payment");
      return;
    }
    if (data.dryRun) {
      const done = await fetch("/api/paystack/mock-complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference: data.reference }),
      });
      setLoading(false);
      if (!done.ok) setError("Mock payment failed");
      router.refresh();
      return;
    }
    window.location.href = data.authorization_url;
  }

  return (
    <div>
      <button
        onClick={pay}
        disabled={loading}
        className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
      >
        {loading ? "Processing…" : `Pay ${ngn(balance + fee)}`}
      </button>
      {fee > 0 && <span className="mt-0.5 block text-xs text-slate-500">incl. {ngn(fee)} fee</span>}
      {error && <span className="mt-0.5 block text-xs text-red-600">{error}</span>}
    </div>
  );
}
