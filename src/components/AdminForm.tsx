"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { CredentialsNotice, type Delivery } from "./CredentialsNotice";

export function AdminForm({
  initialData,
  onSuccess,
}: {
  initialData?: { id: string; name: string; email: string; phone?: string | null };
  onSuccess?: () => void;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [created, setCreated] = useState<{ name: string; email: string; password: string; welcome: Delivery[] } | null>(
    null
  );

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setLoading(true);
    setError(null);
    setCreated(null);
    const fd = new FormData(form);

    const body: Record<string, FormDataEntryValue | null> = {
      name: fd.get("name"),
      email: fd.get("email"),
      phone: fd.get("phone") || null,
    };
    if (!initialData) body.password = fd.get("password") || null;

    const res = await fetch(initialData ? `/api/admin/admins/${initialData.id}` : "/api/admin/admins", {
      method: initialData ? "PATCH" : "POST",
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
      setCreated({ name: data.admin.name, email: data.admin.email, password: data.password, welcome: data.welcome ?? [] });
    }
    router.refresh();
    if (onSuccess) onSuccess();
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-3 rounded-xl border bg-white p-5 shadow-sm sm:grid-cols-2">
      <h2 className="sm:col-span-2 text-lg font-semibold">{initialData ? "Edit admin" : "Add admin"}</h2>
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
          <input name="password" type="text" minLength={8} placeholder="Leave blank to generate one" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" />
        </label>
      )}

      {error && <p className="sm:col-span-2 text-sm text-red-600">{error}</p>}
      {created && (
        <div className="sm:col-span-2">
          <CredentialsNotice
            intro={`Created ${created.name} (${created.email}).`}
            password={created.password}
            deliveries={created.welcome}
            onDone={() => setCreated(null)}
          />
        </div>
      )}
      <div className="sm:col-span-2 flex gap-2">
        <button
          type="submit"
          disabled={loading}
          className="flex-1 rounded-md bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          {loading ? "Saving…" : "Save admin"}
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
