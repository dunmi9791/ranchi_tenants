"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import type { RentFrequency } from "@prisma/client";
import { FrequencySelect } from "./UnitForm";
import { inputClass, numOrNull, sendJson } from "./ui";

export type UnitOption = {
  id: string;
  label: string;
  /** e.g. "vacant", "occupied until 31 Dec 2026" */
  status: string;
  rentAmount: number | null;
  rentFrequency: RentFrequency;
};

export type LeaseData = {
  id: string;
  unitLabel: string;
  tenantName: string;
  startDate: string;
  endDate: string;
  rentAmount: number;
  rentFrequency: RentFrequency;
  depositAmount: number | null;
  notes: string | null;
};

type Props =
  | { mode: "create"; units: UnitOption[]; tenants: { id: string; label: string }[]; defaultUnitId?: string; defaultTenantId?: string; onDone?: () => void }
  | { mode: "edit"; lease: LeaseData; onDone: () => void }
  /** lease = the one being renewed, with startDate/endDate already set to the proposed new term */
  | { mode: "renew"; lease: LeaseData & { unitId: string; tenantId: string }; onDone: () => void };

export function LeaseForm(props: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const initial = props.mode === "create" ? null : props.lease;
  const [unitId, setUnitId] = useState(props.mode === "create" ? (props.defaultUnitId ?? "") : "");
  const unit = props.mode === "create" ? props.units.find((u) => u.id === unitId) : undefined;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const terms = {
      startDate: fd.get("startDate"),
      endDate: fd.get("endDate") || null,
      rentAmount: numOrNull(fd.get("rentAmount")) ?? 0,
      rentFrequency: fd.get("rentFrequency"),
      depositAmount: numOrNull(fd.get("depositAmount")),
      notes: fd.get("notes") || null,
    };
    setLoading(true);
    setError(null);
    try {
      if (props.mode === "edit") {
        await sendJson(`/api/admin/leases/${props.lease.id}`, "PATCH", terms);
      } else if (props.mode === "renew") {
        await sendJson("/api/admin/leases", "POST", {
          ...terms,
          unitId: props.lease.unitId,
          tenantId: props.lease.tenantId,
          renewedFromId: props.lease.id,
        });
      } else {
        await sendJson("/api/admin/leases", "POST", { ...terms, unitId, tenantId: fd.get("tenantId") });
        form.reset();
        setUnitId("");
      }
      router.refresh();
      props.onDone?.();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const title =
    props.mode === "create" ? "New lease" : props.mode === "renew" ? "Renew lease" : "Edit lease";

  return (
    <form onSubmit={onSubmit} className="grid gap-3 rounded-xl border bg-white p-5 shadow-sm sm:grid-cols-2">
      <h2 className="text-lg font-semibold sm:col-span-2">{title}</h2>
      {props.mode === "create" ? (
        <>
          <label className="block text-sm">
            <span className="font-medium">Unit</span>
            <select name="unitId" required value={unitId} onChange={(e) => setUnitId(e.target.value)} className={inputClass}>
              <option value="">Choose a unit…</option>
              {props.units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.label} ({u.status})
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="font-medium">Tenant</span>
            <select name="tenantId" required defaultValue={props.defaultTenantId ?? ""} className={inputClass}>
              <option value="">Choose a tenant…</option>
              {props.tenants.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
        </>
      ) : (
        <p className="text-sm text-slate-600 sm:col-span-2">
          {initial!.tenantName} · {initial!.unitLabel}
        </p>
      )}
      <label className="block text-sm">
        <span className="font-medium">Start date</span>
        <input name="startDate" type="date" required defaultValue={initial?.startDate} className={inputClass} />
      </label>
      <label className="block text-sm">
        <span className="font-medium">End date (blank = rolling)</span>
        <input name="endDate" type="date" defaultValue={initial?.endDate} className={inputClass} />
      </label>
      {/* key: re-mount with the chosen unit's standard rent */}
      <label key={`rent-${unitId}`} className="block text-sm">
        <span className="font-medium">Rent (₦ per period)</span>
        <input
          name="rentAmount"
          type="number"
          min={0}
          step="any"
          required
          defaultValue={initial?.rentAmount ?? unit?.rentAmount ?? ""}
          className={inputClass}
        />
      </label>
      <label key={`freq-${unitId}`} className="block text-sm">
        <span className="font-medium">Rent period</span>
        <FrequencySelect defaultValue={initial?.rentFrequency ?? unit?.rentFrequency} />
      </label>
      <label className="block text-sm">
        <span className="font-medium">Deposit (₦, optional)</span>
        <input name="depositAmount" type="number" min={0} step="any" defaultValue={initial?.depositAmount ?? ""} className={inputClass} />
      </label>
      <label className="block text-sm">
        <span className="font-medium">Notes</span>
        <input name="notes" defaultValue={initial?.notes ?? ""} className={inputClass} />
      </label>
      <p className="text-xs text-slate-500 sm:col-span-2">
        Rent is due on the first day of each period and can be paid from a month before. While the lease is in force the tenant can buy electricity for the unit&apos;s meters.
      </p>
      {error && <p className="text-sm text-red-600 sm:col-span-2">{error}</p>}
      <div className="flex gap-2 sm:col-span-2">
        <button
          type="submit"
          disabled={loading}
          className="flex-1 rounded-md bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          {loading ? "Saving…" : props.mode === "renew" ? "Create renewal" : "Save lease"}
        </button>
        {props.mode !== "create" && (
          <button type="button" onClick={props.onDone} className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50">
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
