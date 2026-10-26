"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

type Created = {
  name: string;
  email: string;
  password: string;
  welcome: { channel: "EMAIL" | "SMS"; to: string; error: string | null }[];
};

export function TenantForm({ 
  initialData, 
  onSuccess 
}: { 
  initialData?: { id: string, name: string, email: string, phone?: string | null },
  onSuccess?: () => void
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [created, setCreated] = useState<Created | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setLoading(true);
    setError(null);
    setCreated(null);
    const fd = new FormData(form);
    
    const url = initialData 
      ? `/api/admin/tenants/${initialData.id}` 
      : "/api/admin/tenants";
    const method = initialData ? "PATCH" : "POST";

    const body: Record<string, FormDataEntryValue | null> = {
      name: fd.get("name"),
      email: fd.get("email"),
      phone: fd.get("phone") || null,
    };

    if (!initialData) {
      body.password = fd.get("password") || null;
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
    
    if (!initialData) {
      form.reset();
      setCreated({ name: data.tenant.name, email: data.tenant.email, password: data.password, welcome: data.welcome ?? [] });
    }
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
      <label className="block text-sm">
        <span className="font-medium">Phone (for SMS)</span>
        <input name="phone" type="tel" defaultValue={initialData?.phone ?? ""} placeholder="08012345678" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" />
      </label>
      {!initialData && (
        <label className="block text-sm">
          <span className="font-medium">Temporary password</span>
          <input name="password" type="text" minLength={6} placeholder="Leave blank to generate one" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" />
        </label>
      )}
      {error && <p className="sm:col-span-2 text-sm text-red-600">{error}</p>}
      {created && <CreatedNotice created={created} onDone={() => setCreated(null)} />}
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

function CreatedNotice({ created, onDone }: { created: Created; onDone: () => void }) {
  const sent = created.welcome.filter((w) => !w.error);
  const failed = created.welcome.filter((w) => w.error);
  const label = (w: Created["welcome"][number]) => `${w.channel === "EMAIL" ? "email" : "SMS"} to ${w.to}`;
  return (
    <div className="sm:col-span-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
      <p>
        Created {created.name} ({created.email}). Temporary password (shown once):{" "}
        <code className="select-all rounded bg-white px-1 font-mono">{created.password}</code>
      </p>
      {sent.length > 0 && <p className="mt-1">Welcome sent by {sent.map(label).join(" and ")}.</p>}
      {failed.map((w) => (
        <p key={w.channel + w.to} className="mt-1 text-red-700">
          Welcome {label(w)} failed: {w.error}
        </p>
      ))}
      {created.welcome.length === 0 && (
        <p className="mt-1 text-emerald-800">
          No welcome message was sent (notifications are off). Share the login details privately.
        </p>
      )}
      <p className="mt-1 text-emerald-800">They&apos;ll be asked to choose a new password at first login.</p>
      <button type="button" onClick={onDone} className="mt-1 underline">
        Done
      </button>
    </div>
  );
}
