"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

export type MeterWithUser = {
  id: string;
  meterNumber: string;
  label: string | null;
  companyId: string;
  user?: { email: string } | null;
};

export function MeterForm({
  companies,
  editingMeter,
  onCancel,
}: {
  companies: { id: string; name: string }[];
  editingMeter?: MeterWithUser | null;
  onCancel?: () => void;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Form state
  const [meterNumber, setMeterNumber] = useState("");
  const [label, setLabel] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [userEmail, setUserEmail] = useState("");

  useEffect(() => {
    if (editingMeter) {
      setMeterNumber(editingMeter.meterNumber);
      setLabel(editingMeter.label || "");
      setCompanyId(editingMeter.companyId);
      setUserEmail(editingMeter.user?.email || "");
    } else {
      setMeterNumber("");
      setLabel("");
      setCompanyId(companies[0]?.id || "");
      setUserEmail("");
    }
  }, [editingMeter, companies]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    
    const method = editingMeter ? "PATCH" : "POST";
    const body = {
      id: editingMeter?.id,
      meterNumber,
      label: label || undefined,
      companyId,
      userEmail: userEmail || "",
    };

    const res = await fetch("/api/admin/meters", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error || "Failed");
      return;
    }
    
    if (!editingMeter) {
      setMeterNumber("");
      setLabel("");
      setUserEmail("");
    }
    
    if (onCancel) onCancel();
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-3 rounded-xl border bg-white p-5 shadow-sm sm:grid-cols-2">
      <h2 className="sm:col-span-2 text-lg font-semibold">{editingMeter ? "Edit meter" : "Add meter"}</h2>
      <label className="block text-sm">
        <span className="font-medium">Meter number</span>
        <input
          name="meterNumber"
          value={meterNumber}
          onChange={(e) => setMeterNumber(e.target.value)}
          required
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
        />
      </label>
      <label className="block text-sm">
        <span className="font-medium">Label</span>
        <input
          name="label"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
        />
      </label>
      <label className="block text-sm">
        <span className="font-medium">Company</span>
        <select
          name="companyId"
          value={companyId}
          onChange={(e) => setCompanyId(e.target.value)}
          required
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
        >
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        <span className="font-medium">Assign to user email (optional)</span>
        <input
          name="userEmail"
          type="email"
          value={userEmail}
          onChange={(e) => setUserEmail(e.target.value)}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
        />
      </label>
      {error && <p className="sm:col-span-2 text-sm text-red-600">{error}</p>}
      <div className="sm:col-span-2 flex gap-2">
        <button
          type="submit"
          disabled={loading}
          className="flex-1 rounded-md bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          {loading ? "Saving…" : editingMeter ? "Update meter" : "Save meter"}
        </button>
        {editingMeter && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-slate-300 px-4 py-2 font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
