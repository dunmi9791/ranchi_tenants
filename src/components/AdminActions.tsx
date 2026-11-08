"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AdminForm } from "./AdminForm";
import { CredentialsNotice, type Delivery } from "./CredentialsNotice";

type Admin = { id: string; name: string; email: string; phone: string | null };

export function AdminActions({ admin, isSelf }: { admin: Admin; isSelf: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reset, setReset] = useState<{ password: string; notified: Delivery[] } | null>(null);
  const [editing, setEditing] = useState(false);

  async function call(method: string, path: string, label: string) {
    setBusy(label);
    setError(null);
    const res = await fetch(`/api/admin/admins/${admin.id}${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: method === "POST" ? "{}" : undefined,
    });
    const data = await res.json();
    setBusy(null);
    if (!res.ok) {
      setError(data.error || "Failed");
      return null;
    }
    router.refresh();
    return data;
  }

  async function resetPassword() {
    if (
      !window.confirm(
        `Reset the password for ${admin.name}? They'll be logged out, sent a temporary password by email/SMS (if notifications are on), and must choose a new password at next login.`
      )
    )
      return;
    const data = await call("POST", "/reset-password", "reset");
    if (data?.password) setReset({ password: data.password, notified: data.notified ?? [] });
  }

  async function remove() {
    if (!window.confirm(`Remove ${admin.name} (${admin.email})? They'll be logged out and lose access immediately.`))
      return;
    await call("DELETE", "", "remove");
  }

  const btn = "rounded-md border px-2 py-1 text-xs disabled:opacity-60";

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-1">
        <button onClick={() => setEditing(true)} className={`${btn} border-slate-300 hover:bg-slate-100`}>
          Edit
        </button>
        {!isSelf && (
          <>
            <button onClick={resetPassword} disabled={busy != null} className={`${btn} border-slate-300 hover:bg-slate-100`}>
              {busy === "reset" ? "Resetting…" : "Reset password"}
            </button>
            <button onClick={remove} disabled={busy != null} className={`${btn} border-red-400 text-red-700 hover:bg-red-50`}>
              {busy === "remove" ? "Removing…" : "Remove"}
            </button>
          </>
        )}
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}
      {reset && <CredentialsNotice password={reset.password} deliveries={reset.notified} onDone={() => setReset(null)} />}

      {editing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
          onClick={(e) => e.target === e.currentTarget && setEditing(false)}
        >
          <div className="w-full max-w-2xl">
            <AdminForm initialData={admin} onSuccess={() => setEditing(false)} />
          </div>
        </div>
      )}
    </div>
  );
}
