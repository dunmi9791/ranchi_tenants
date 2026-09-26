"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

type Meter = {
  id: string;
  meterNumber: string;
  label: string | null;
  company: { name: string };
};

type Quote = {
  kwh: number;
  unitPrice: number;
  energyAmount: number;
  serviceFee: number;
  total: number;
};

const ngn = (n: number) => `₦${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

export function BuyForm({ meters }: { meters: Meter[] }) {
  const router = useRouter();
  const [meterId, setMeterId] = useState(meters[0]?.id ?? "");
  const [naira, setNaira] = useState(5000);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [minNaira, setMinNaira] = useState<number | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Live quote at StronPower's current price, debounced while typing.
  useEffect(() => {
    if (!meterId || !(naira > 0)) {
      setQuote(null);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setQuoting(true);
      setQuoteError(null);
      try {
        const res = await fetch(`/api/quote?meterId=${encodeURIComponent(meterId)}&naira=${naira}`, {
          signal: ctrl.signal,
        });
        const data = await res.json();
        if (!res.ok) {
          setQuote(null);
          setQuoteError(data.error || "Couldn't get a price");
        } else {
          setQuote(data.quote);
          setMinNaira(data.minNaira);
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") setQuoteError("Couldn't get a price");
      } finally {
        if (!ctrl.signal.aborted) setQuoting(false);
      }
    }, 400);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [meterId, naira]);

  const belowMin = minNaira != null && quote != null && quote.kwh < 1;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);
    const res = await fetch("/api/paystack/initialize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ meterId, nairaAmount: naira }),
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
        <span className="font-medium">Amount to spend on electricity (₦)</span>
        <input
          type="number"
          min={1}
          step={100}
          value={Number.isFinite(naira) ? naira : ""}
          onChange={(e) => setNaira(Number(e.target.value))}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
          required
        />
      </label>

      <div className="rounded-md bg-slate-50 p-3 text-sm text-slate-700">
        {quoting && !quote && <p>Getting current price…</p>}
        {quoteError && <p className="text-red-600">{quoteError}</p>}
        {quote && (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
            <dt>Units</dt>
            <dd className="text-right font-semibold text-slate-900">{quote.kwh} kWh</dd>
            <dt>Rate</dt>
            <dd className="text-right">{ngn(quote.unitPrice)}/kWh</dd>
            <dt>Electricity</dt>
            <dd className="text-right">{ngn(quote.energyAmount)}</dd>
            <dt>Service fee</dt>
            <dd className="text-right">{ngn(quote.serviceFee)}</dd>
            <dt className="border-t pt-1 font-medium">You pay</dt>
            <dd className="border-t pt-1 text-right font-semibold text-slate-900">{ngn(quote.total)}</dd>
          </dl>
        )}
        {quote && quote.energyAmount < naira && !belowMin && (
          <p className="mt-2 text-xs text-slate-500">
            Units are sold in 0.1 kWh steps, so you&apos;re charged for exactly {quote.kwh} kWh.
          </p>
        )}
        {belowMin && <p className="mt-2 text-red-600">Minimum purchase is 1 kWh ({ngn(minNaira!)}).</p>}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {message && <p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-900">{message}</p>}
      <button
        type="submit"
        disabled={loading || !quote || quoting || belowMin}
        className="rounded-md bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
      >
        {loading ? "Processing…" : quote ? `Pay ${ngn(quote.total)} with Paystack` : "Pay with Paystack"}
      </button>
    </form>
  );
}
