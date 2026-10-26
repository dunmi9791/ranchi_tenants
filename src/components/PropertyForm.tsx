"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { inputClass, sendJson } from "./ui";

export type PropertyData = { id: string; name: string; companyId: string; address: string | null; notes: string | null };

export function PropertyForm({
  companies,
  initial,
  onDone,
}: {
  companies: { id: string; name: string }[];
  initial?: PropertyData;
  onDone?: () => void;
}) {
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
      await sendJson(initial ? `/api/admin/properties/${initial.id}` : "/api/admin/properties", initial ? "PATCH" : "POST", {
        name: fd.get("name"),
        companyId: fd.get("companyId"),
        address: fd.get("address") || null,
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
    <form onSubmit={onSubmit} className="grid gap-3 rounded-xl border bg-white p-5 shadow-sm sm:grid-cols-2">
      <h2 className="text-lg font-semibold sm:col-span-2">{initial ? "Edit property" : "Add property"}</h2>
      <label className="block text-sm">
        <span className="font-medium">Name</span>
        <input name="name" required defaultValue={initial?.name} placeholder="e.g. Grace Court" className={inputClass} />
      </label>
      <label className="block text-sm">
        <span className="font-medium">Company (vends its meters)</span>
        <select name="companyId" required defaultValue={initial?.companyId ?? companies[0]?.id} className={inputClass}>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm sm:col-span-2">
        <span className="font-medium">Address</span>
        <input name="address" defaultValue={initial?.address ?? ""} className={inputClass} />
      </label>
      <label className="block text-sm sm:col-span-2">
        <span className="font-medium">Notes</span>
        <textarea name="notes" rows={2} defaultValue={initial?.notes ?? ""} className={inputClass} />
      </label>
      {error && <p className="text-sm text-red-600 sm:col-span-2">{error}</p>}
      <div className="flex gap-2 sm:col-span-2">
        <button
          type="submit"
          disabled={loading || companies.length === 0}
          className="flex-1 rounded-md bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          {loading ? "Saving…" : "Save property"}
        </button>
        {onDone && initial && (
          <button type="button" onClick={onDone} className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50">
            Cancel
          </button>
        )}
      </div>
      {companies.length === 0 && <p className="text-sm text-amber-700 sm:col-span-2">Add a company first.</p>}
    </form>
  );
}
