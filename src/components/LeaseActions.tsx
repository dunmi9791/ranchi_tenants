"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import type { LeaseState } from "@/lib/leases";
import { LeaseForm, type LeaseData } from "./LeaseForm";
import { Modal, inputClass, sendJson, smallBtn } from "./ui";

export type LeaseRow = LeaseData & {
  unitId: string;
  tenantId: string;
  state: LeaseState;
  hasRenewal: boolean;
  moveOutDate: string;
  /** Proposed renewal term: day after the end, same length */
  renewStart: string;
  renewEnd: string;
  today: string;
};

export function LeaseActions({ lease }: { lease: LeaseRow }) {
  const router = useRouter();
  const [open, setOpen] = useState<"edit" | "renew" | "end" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const canRenew = lease.endDate !== "" && !lease.hasRenewal && (lease.state === "active" || lease.state === "expired");
  const canEnd = lease.state === "active" || lease.state === "expired" || lease.state === "upcoming";

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-1">
        <button onClick={() => setOpen("edit")} className={`${smallBtn} border-slate-300 hover:bg-slate-100`}>
          Edit
        </button>
        {canRenew && (
          <button onClick={() => setOpen("renew")} className={`${smallBtn} border-emerald-600 text-emerald-700 hover:bg-emerald-50`}>
            Renew
          </button>
        )}
        {canEnd && !lease.moveOutDate && (
          <button onClick={() => setOpen("end")} className={`${smallBtn} border-amber-500 text-amber-700 hover:bg-amber-50`}>
            End / move out
          </button>
        )}
        {lease.moveOutDate && (
          <button
            disabled={busy}
            onClick={() =>
              window.confirm("Undo the move-out? The lease runs to its end date again.") &&
              run(() => sendJson(`/api/admin/leases/${lease.id}`, "PATCH", { moveOutDate: null }))
            }
            className={`${smallBtn} border-slate-300 hover:bg-slate-100`}
          >
            Undo move-out
          </button>
        )}
        <button
          disabled={busy}
          onClick={() =>
            window.confirm(`Delete this lease for ${lease.tenantName}? Only for leases entered by mistake.`) &&
            run(() => sendJson(`/api/admin/leases/${lease.id}`, "DELETE"))
          }
          className={`${smallBtn} border-red-300 text-red-700 hover:bg-red-50`}
        >
          Delete
        </button>
      </div>
      {error && <p className="max-w-[16rem] text-xs text-red-600">{error}</p>}

      {open === "edit" && (
        <Modal onClose={() => setOpen(null)}>
          <LeaseForm mode="edit" lease={lease} onDone={() => setOpen(null)} />
        </Modal>
      )}
      {open === "renew" && (
        <Modal onClose={() => setOpen(null)}>
          <LeaseForm
            mode="renew"
            lease={{ ...lease, startDate: lease.renewStart, endDate: lease.renewEnd, notes: null }}
            onDone={() => setOpen(null)}
          />
        </Modal>
      )}
      {open === "end" && (
        <Modal onClose={() => setOpen(null)}>
          <EndLeaseForm lease={lease} onDone={() => setOpen(null)} />
        </Modal>
      )}
    </div>
  );
}

function EndLeaseForm({ lease, onDone }: { lease: LeaseRow; onDone: () => void }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // Default to today, or the end date for a lease that has already run out.
  const defaultDay = lease.state === "expired" ? lease.endDate : lease.today < lease.startDate ? lease.startDate : lease.today;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setLoading(true);
    setError(null);
    try {
      await sendJson(`/api/admin/leases/${lease.id}`, "PATCH", {
        moveOutDate: fd.get("moveOutDate"),
        endReason: fd.get("endReason") || null,
      });
      router.refresh();
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded-xl border bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold">End lease</h2>
      <p className="text-sm text-slate-600">
        {lease.tenantName} · {lease.unitLabel}. From the day after move-out the unit shows as vacant and the tenant can no
        longer buy electricity for it. Unpaid rent for periods after move-out is removed; a part period is pro-rated.
      </p>
      <label className="block text-sm">
        <span className="font-medium">Last day of occupancy</span>
        <input name="moveOutDate" type="date" required defaultValue={defaultDay} className={inputClass} />
      </label>
      <label className="block text-sm">
        <span className="font-medium">Reason (optional)</span>
        <input name="endReason" placeholder="e.g. Tenant gave notice" className={inputClass} />
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={loading}
          className="flex-1 rounded-md bg-amber-600 px-4 py-2 font-medium text-white hover:bg-amber-700 disabled:opacity-60"
        >
          {loading ? "Saving…" : "End lease"}
        </button>
        <button type="button" onClick={onDone} className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50">
          Cancel
        </button>
      </div>
    </form>
  );
}
