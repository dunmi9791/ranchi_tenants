"use client";

export type Delivery = { channel: "EMAIL" | "SMS"; to: string; error: string | null };

/** One-time display of a temporary password, plus whether the email / SMS with it went out. */
export function CredentialsNotice({
  intro,
  password,
  deliveries,
  onDone,
}: {
  intro?: string;
  password: string;
  deliveries: Delivery[];
  onDone: () => void;
}) {
  const label = (d: Delivery) => `${d.channel === "EMAIL" ? "email" : "SMS"} to ${d.to}`;
  const sent = deliveries.filter((d) => !d.error);
  return (
    <div className="rounded-md border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-900">
      <p>
        {intro && `${intro} `}Temporary password (shown once):{" "}
        <code className="select-all rounded bg-white px-1 font-mono text-sm">{password}</code>
      </p>
      {sent.length > 0 && <p className="mt-1">Sent by {sent.map(label).join(" and ")}.</p>}
      {deliveries
        .filter((d) => d.error)
        .map((d) => (
          <p key={d.channel + d.to} className="mt-1 text-red-700">
            {label(d)} failed: {d.error}
          </p>
        ))}
      {sent.length === 0 && (
        <p className="mt-1 text-emerald-800">Share it privately; they&apos;ll be asked to change it at next login.</p>
      )}
      <button type="button" onClick={onDone} className="mt-1 underline">
        Done
      </button>
    </div>
  );
}
