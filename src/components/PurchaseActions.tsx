"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  id: string;
  status: "PENDING" | "PAID" | "VENDED" | "FAILED";
  paid: boolean;
  storeAttempted: boolean;
};

export function PurchaseActions({ id, status, paid, storeAttempted }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [needsConfirm, setNeedsConfirm] = useState(storeAttempted);
  const [checked, setChecked] = useState(false);

  async function call(path: string, body?: object) {
    setBusy(true);
    setMsg(null);
    const res = await fetch(`/api/admin/purchases/${id}/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      if (data.needsConfirmation) setNeedsConfirm(true);
      setMsg(data.error || "Failed");
    } else {
      setMsg(data.stsPin ? `Vended: ${data.stsPin}` : `Now ${data.status}${data.note ? ` (${data.note})` : ""}`);
    }
    router.refresh();
  }

  if (status === "PENDING") {
    return (
      <div className="space-y-1">
        <button
          onClick={() => call("verify")}
          disabled={busy}
          className="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100 disabled:opacity-60"
        >
          {busy ? "Checking…" : "Verify payment"}
        </button>
        {msg && <p className="text-xs text-slate-600">{msg}</p>}
      </div>
    );
  }

  if (status === "FAILED" && paid) {
    return (
      <div className="space-y-1">
        {needsConfirm && (
          <label className="flex items-start gap-1 text-xs text-amber-800">
            <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
            <span>I checked StronPower&apos;s vending records: no token was issued for this purchase.</span>
          </label>
        )}
        <button
          onClick={() => call("retry", { confirmedNoToken: checked })}
          disabled={busy || (needsConfirm && !checked)}
          className="rounded-md bg-emerald-600 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          {busy ? "Vending…" : "Retry vend"}
        </button>
        {msg && <p className="text-xs text-slate-600">{msg}</p>}
      </div>
    );
  }

  return null;
}
