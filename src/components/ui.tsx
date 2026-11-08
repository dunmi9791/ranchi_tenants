"use client";

import type { ReactNode } from "react";

/** Shared bits for the admin rental screens. */

export const inputClass = "mt-1 w-full rounded-md border border-slate-300 px-3 py-2";
export const smallBtn = "rounded-md border px-2 py-1 text-xs disabled:opacity-60";

export function Modal({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/40 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-2xl">{children}</div>
    </div>
  );
}

/** JSON request; resolves to the parsed body or throws with the API's error message. */
export async function sendJson<T = Record<string, unknown>>(url: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data as T;
}

/** "" → null, otherwise a number (form inputs give strings) */
export function numOrNull(v: FormDataEntryValue | null): number | null {
  const s = String(v ?? "").replace(/,/g, "").trim();
  return s === "" ? null : Number(s);
}
