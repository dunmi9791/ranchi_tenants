"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LeaseForm, type UnitOption } from "./LeaseForm";
import { Modal, sendJson, smallBtn } from "./ui";

export function ApplicantActions({
  applicant,
  units,
}: {
  applicant: { id: string; name: string; status: "PENDING" | "REJECTED"; unitId: string | null };
  units: UnitOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
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

  function reject() {
    const reason = window.prompt(`Reject ${applicant.name}'s registration? They won't be able to log in.\n\nReason (optional, admin-only):`, "");
    if (reason === null) return;
    run(() => sendJson(`/api/admin/applicants/${applicant.id}`, "PATCH", { action: "reject", reason }));
  }

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-1">
        {applicant.status === "PENDING" ? (
          <>
            <button onClick={() => setOpen(true)} className={`${smallBtn} border-emerald-600 text-emerald-700 hover:bg-emerald-50`}>
              Add lease
            </button>
            <button disabled={busy} onClick={reject} className={`${smallBtn} border-amber-500 text-amber-700 hover:bg-amber-50`}>
              Reject
            </button>
          </>
        ) : (
          <button
            disabled={busy}
            onClick={() => run(() => sendJson(`/api/admin/applicants/${applicant.id}`, "PATCH", { action: "reopen" }))}
            className={`${smallBtn} border-slate-300 hover:bg-slate-100`}
          >
            Move back to pending
          </button>
        )}
        <button
          disabled={busy}
          onClick={() =>
            window.confirm(`Delete ${applicant.name}'s registration? They would have to register again.`) &&
            run(() => sendJson(`/api/admin/applicants/${applicant.id}`, "DELETE"))
          }
          className={`${smallBtn} border-red-300 text-red-700 hover:bg-red-50`}
        >
          Delete
        </button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      {open && (
        <Modal onClose={() => setOpen(false)}>
          <LeaseForm mode="approve" applicant={applicant} units={units} onDone={() => setOpen(false)} />
        </Modal>
      )}
    </div>
  );
}
