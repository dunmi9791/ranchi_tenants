"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

export function ChangePasswordForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    if (fd.get("newPassword") !== fd.get("confirmPassword")) {
      setError("New passwords don't match");
      return;
    }
    setLoading(true);
    setError(null);
    const res = await fetch("/api/account/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        currentPassword: fd.get("currentPassword"),
        newPassword: fd.get("newPassword"),
      }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error || "Couldn't change password");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <form method="post" onSubmit={onSubmit} className="mt-6 space-y-4 rounded-xl border bg-white p-6 shadow-sm">
      {(
        [
          ["currentPassword", "Current password", "current-password"],
          ["newPassword", "New password (at least 8 characters)", "new-password"],
          ["confirmPassword", "Confirm new password", "new-password"],
        ] as const
      ).map(([name, label, autoComplete]) => (
        <label key={name} className="block text-sm">
          <span className="font-medium">{label}</span>
          <input
            name={name}
            type="password"
            required
            minLength={name === "currentPassword" ? 1 : 8}
            autoComplete={autoComplete}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
          />
        </label>
      ))}
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-md bg-emerald-600 py-2 font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
      >
        {loading ? "Saving…" : "Change password"}
      </button>
    </form>
  );
}
