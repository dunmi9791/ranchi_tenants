"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

export function TenantForm({ 
  initialData, 
  onSuccess 
}: { 
  initialData?: { id: string, name: string, email: string, leaseExpiryDate?: string | null, leaseNotes?: string | null },
  onSuccess?: () => void
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setLoading(true);
    setError(null);
    const fd = new FormData(form);
    
    const url = initialData 
      ? `/api/admin/tenants/${initialData.id}` 
      : "/api/admin/tenants";
    const method = initialData ? "PATCH" : "POST";

    const body: Record<string, FormDataEntryValue | null> = {
      name: fd.get("name"),
      email: fd.get("email"),
      leaseExpiryDate: fd.get("leaseExpiryDate") || null,
      leaseNotes: fd.get("leaseNotes") || null,
    };

    if (!initialData) {
      body.password = fd.get("password") || "change-me-123";
    }

    const res = await fetch(url, {
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
    
    if (!initialData) form.reset();
    router.refresh();
    if (onSuccess) onSuccess();
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-3 rounded-xl border bg-white p-5 shadow-sm sm:grid-cols-2">
      <h2 className="sm:col-span-2 text-lg font-semibold">{initialData ? "Edit tenant" : "Add tenant"}</h2>
      <label className="block text-sm">
        <span className="font-medium">Name</span>
        <input name="name" defaultValue={initialData?.name} required className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" />
      </label>
      <label className="block text-sm">
        <span className="font-medium">Email</span>
        <input name="email" type="email" defaultValue={initialData?.email} required className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" />
      </label>
      {!initialData && (
        <label className="block text-sm">
          <span className="font-medium">Initial Password</span>
          <input name="password" type="text" placeholder="change-me-123" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" />
        </label>
      )}
      <label className="block text-sm">
        <span className="font-medium">Lease Expiry Date</span>
        <input 
          name="leaseExpiryDate" 
          type="date" 
          defaultValue={initialData?.leaseExpiryDate ? new Date(initialData.leaseExpiryDate).toISOString().split('T')[0] : ""} 
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" 
        />
      </label>
      <label className="block text-sm sm:col-span-2">
        <span className="font-medium">Lease Notes</span>
        <textarea name="leaseNotes" defaultValue={initialData?.leaseNotes || ""} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" rows={2} />
      </label>
      
      {error && <p className="sm:col-span-2 text-sm text-red-600">{error}</p>}
      <div className="sm:col-span-2 flex gap-2">
        <button
          type="submit"
          disabled={loading}
          className="flex-1 rounded-md bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          {loading ? "Saving…" : "Save tenant"}
        </button>
        {onSuccess && (
            <button
                type="button"
                onClick={onSuccess}
                className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50"
            >
                Cancel
            </button>
        )}
      </div>
    </form>
  );
}
