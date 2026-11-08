"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { Modal, inputClass, numOrNull, sendJson, smallBtn } from "./ui";

const ngn = (n: number) => `₦${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

export function RecordPaymentButton({
  charge,
}: {
  charge: { id: string; label: string; balance: number; today: string };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setLoading(true);
    setError(null);
    try {
      await sendJson("/api/admin/rent/payments", "POST", {
        chargeId: charge.id,
        amount: numOrNull(fd.get("amount")),
        method: fd.get("method"),
        paidOn: fd.get("paidOn") || null,
        reference: fd.get("reference") || null,
        note: fd.get("note") || null,
      });
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className={`${smallBtn} border-emerald-600 text-emerald-700 hover:bg-emerald-50`}>
        Record payment
      </button>
      {open && (
        <Modal onClose={() => setOpen(false)}>
          <form onSubmit={onSubmit} className="grid gap-3 rounded-xl border bg-white p-5 shadow-sm sm:grid-cols-2">
            <h2 className="text-lg font-semibold sm:col-span-2">Record rent payment</h2>
            <p className="text-sm text-slate-600 sm:col-span-2">
              {charge.label}. Outstanding: <strong>{ngn(charge.balance)}</strong>. Use this for cash or bank transfers; Paystack
              payments are recorded automatically.
            </p>
            <label className="block text-sm">
              <span className="font-medium">Amount (₦)</span>
              <input name="amount" type="number" min={0.01} max={charge.balance} step="any" required defaultValue={charge.balance} className={inputClass} />
            </label>
            <label className="block text-sm">
              <span className="font-medium">Method</span>
              <select name="method" defaultValue="TRANSFER" className={inputClass}>
                <option value="TRANSFER">Bank transfer</option>
                <option value="CASH">Cash</option>
                <option value="OTHER">Other</option>
              </select>
            </label>
            <label className="block text-sm">
              <span className="font-medium">Date received</span>
              <input name="paidOn" type="date" required defaultValue={charge.today} max={charge.today} className={inputClass} />
            </label>
            <label className="block text-sm">
              <span className="font-medium">Reference (optional)</span>
              <input name="reference" placeholder="Bank ref / receipt no." className={inputClass} />
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="font-medium">Note (optional)</span>
              <input name="note" className={inputClass} />
            </label>
            {error && <p className="text-sm text-red-600 sm:col-span-2">{error}</p>}
            <div className="flex gap-2 sm:col-span-2">
              <button
                type="submit"
                disabled={loading}
                className="flex-1 rounded-md bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                {loading ? "Saving…" : "Record payment"}
              </button>
              <button type="button" onClick={() => setOpen(false)} className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50">
                Cancel
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

export function RemovePaymentButton({ paymentId, label }: { paymentId: string; label: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function remove() {
    if (!window.confirm(`Remove the payment of ${label}? Only for payments recorded by mistake.`)) return;
    setBusy(true);
    setError(null);
    try {
      await sendJson(`/api/admin/rent/payments/${paymentId}`, "DELETE");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button onClick={remove} disabled={busy} className="text-xs text-red-700 underline disabled:opacity-60">
        Remove
      </button>
      {error && <span className="block text-xs text-red-600">{error}</span>}
    </>
  );
}
