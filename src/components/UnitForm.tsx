"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import type { RentFrequency } from "@prisma/client";
import { FREQUENCY_LABELS } from "@/lib/leases";
import { inputClass, numOrNull, sendJson } from "./ui";

export type UnitData = {
  id: string;
  name: string;
  rentAmount: number | null;
  rentFrequency: RentFrequency;
  notes: string | null;
};

export function FrequencySelect({ defaultValue }: { defaultValue?: RentFrequency }) {
  return (
    <select name="rentFrequency" defaultValue={defaultValue ?? "ANNUAL"} className={inputClass}>
      {(Object.keys(FREQUENCY_LABELS) as RentFrequency[]).map((f) => (
        <option key={f} value={f}>
          {FREQUENCY_LABELS[f]}
        </option>
      ))}
    </select>
  );
}

export function UnitForm({ propertyId, initial, onDone }: { propertyId: string; initial?: UnitData; onDone?: () => void }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    setLoading(true);
    setError(null);
    try {
      await sendJson(initial ? `/api/admin/units/${initial.id}` : "/api/admin/units", initial ? "PATCH" : "POST", {
        propertyId,
        name: fd.get("name"),
        rentAmount: numOrNull(fd.get("rentAmount")),
        rentFrequency: fd.get("rentFrequency"),
        notes: fd.get("notes") || null,
      });
      if (!initial) form.reset();
      router.refresh();
      onDone?.();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-3 rounded-xl border bg-white p-5 shadow-sm sm:grid-cols-3">
      <h2 className="text-lg font-semibold sm:col-span-3">{initial ? "Edit unit" : "Add unit"}</h2>
      <label className="block text-sm">
        <span className="font-medium">Unit name</span>
        <input name="name" required defaultValue={initial?.name} placeholder="e.g. Flat A1" className={inputClass} />
      </label>
      <label className="block text-sm">
        <span className="font-medium">Standard rent (₦, optional)</span>
        <input name="rentAmount" type="number" min={0} step="any" defaultValue={initial?.rentAmount ?? ""} className={inputClass} />
      </label>
      <label className="block text-sm">
        <span className="font-medium">Billed</span>
        <FrequencySelect defaultValue={initial?.rentFrequency} />
      </label>
      <label className="block text-sm sm:col-span-3">
        <span className="font-medium">Notes</span>
        <input name="notes" defaultValue={initial?.notes ?? ""} placeholder="e.g. 2-bedroom, ground floor" className={inputClass} />
      </label>
      <p className="text-xs text-slate-500 sm:col-span-3">The standard rent pre-fills new leases; each lease keeps its own rent.</p>
      {error && <p className="text-sm text-red-600 sm:col-span-3">{error}</p>}
      <div className="flex gap-2 sm:col-span-3">
        <button
          type="submit"
          disabled={loading}
          className="flex-1 rounded-md bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          {loading ? "Saving…" : "Save unit"}
        </button>
        {onDone && initial && (
          <button type="button" onClick={onDone} className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50">
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
