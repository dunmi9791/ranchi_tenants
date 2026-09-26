"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { TenantForm } from "./TenantForm";

type Tenant = {
  id: string;
  name: string;
  email: string;
  leaseExpiryDate: string | null;
  leaseNotes: string | null;
  isPaused: boolean;
};

export function TenantActions({ tenant }: { tenant: Tenant }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState(false);

  async function post(path: string, body: object, label: string) {
    setBusy(label);
    setError(null);
    const res = await fetch(`/api/admin/tenants/${tenant.id}/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
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

  async function togglePause() {
    if (tenant.isPaused) {
      await post("status", { paused: false }, "resume");
      return;
    }
    const reason = window.prompt(
      `Pause ${tenant.name}? They'll be logged out and can't sign in until resumed.\n\nReason (optional, admin-only):`,
      ""
    );
    if (reason === null) return;
    await post("status", { paused: true, reason }, "pause");
  }

  async function resetPassword() {
    if (
      !window.confirm(
        `Reset the password for ${tenant.name}? They'll be logged out and must choose a new password at next login.`
      )
    )
      return;
    const data = await post("reset-password", {}, "reset");
    if (data?.password) {
      setTempPassword(data.password);
      setCopied(false);
    }
  }

  const btn = "rounded-md border px-2 py-1 text-xs disabled:opacity-60";

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-1">
        <button onClick={() => setEditing(true)} className={`${btn} border-slate-300 hover:bg-slate-100`}>
          Edit lease
        </button>
        <button
          onClick={togglePause}
          disabled={busy != null}
          className={
            tenant.isPaused
              ? `${btn} border-emerald-600 text-emerald-700 hover:bg-emerald-50`
              : `${btn} border-amber-500 text-amber-700 hover:bg-amber-50`
          }
        >
          {busy === "pause" ? "Pausing…" : busy === "resume" ? "Resuming…" : tenant.isPaused ? "Resume" : "Pause"}
        </button>
        <button
          onClick={resetPassword}
          disabled={busy != null}
          className={`${btn} border-slate-300 hover:bg-slate-100`}
        >
          {busy === "reset" ? "Resetting…" : "Reset password"}
        </button>
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      {tempPassword && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-900">
          <p>
            Temporary password (shown once):{" "}
            <code className="select-all rounded bg-white px-1 font-mono text-sm">{tempPassword}</code>
          </p>
          <div className="mt-1 flex gap-2">
            <button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(tempPassword);
                  setCopied(true);
                } catch {
                  setCopied(false);
                }
              }}
              className="underline"
            >
              {copied ? "Copied" : "Copy"}
            </button>
            <button onClick={() => setTempPassword(null)} className="underline">
              Done
            </button>
          </div>
          <p className="mt-1 text-emerald-800">Share it privately; they&apos;ll be asked to change it.</p>
        </div>
      )}

      {editing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
          onClick={(e) => e.target === e.currentTarget && setEditing(false)}
        >
          <div className="w-full max-w-2xl">
            <TenantForm
              initialData={{
                id: tenant.id,
                name: tenant.name,
                email: tenant.email,
                leaseExpiryDate: tenant.leaseExpiryDate,
                leaseNotes: tenant.leaseNotes,
              }}
              onSuccess={() => setEditing(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
