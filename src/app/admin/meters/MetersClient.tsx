"use client";

import { useState } from "react";
import { Nav } from "@/components/Nav";
import { MeterForm, type MeterRow, type UnitChoice } from "@/components/MeterForm";
import type { SessionUser } from "@/lib/session";

export default function MetersClient({
  meters,
  companies,
  units,
  user,
}: {
  meters: (MeterRow & { companyName: string; unitLabel: string | null; tenant: { name: string; email: string } | null })[];
  companies: { id: string; name: string }[];
  units: UnitChoice[];
  user: SessionUser;
}) {
  const [editingMeter, setEditingMeter] = useState<MeterRow | null>(null);

  return (
    <div>
      <Nav user={user} />
      <main className="mx-auto max-w-5xl space-y-8 px-4 py-8">
        <div>
          <h1 className="text-2xl font-bold">Meters</h1>
          <p className="text-sm text-slate-600">
            Place each meter in the unit it supplies. The tenant holding that unit&apos;s active lease can buy electricity for it.
          </p>
        </div>
        <MeterForm
          companies={companies}
          units={units}
          editingMeter={editingMeter}
          onCancel={() => setEditingMeter(null)}
        />
        <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b bg-slate-50 text-slate-600">
              <tr>
                <th className="px-3 py-2">Meter</th>
                <th className="px-3 py-2">Label</th>
                <th className="px-3 py-2">Company</th>
                <th className="px-3 py-2">Unit</th>
                <th className="px-3 py-2">Current tenant</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {meters.map((m) => (
                <tr key={m.id} className="border-b last:border-0">
                  <td className="px-3 py-2 font-mono">{m.meterNumber}</td>
                  <td className="px-3 py-2">{m.label || "—"}</td>
                  <td className="px-3 py-2">{m.companyName}</td>
                  <td className="px-3 py-2">{m.unitLabel ?? <span className="text-slate-400">Not in a unit</span>}</td>
                  <td className="px-3 py-2">
                    {m.tenant ? (
                      <div>
                        <div className="font-medium">{m.tenant.name}</div>
                        <div className="text-xs text-slate-500">{m.tenant.email}</div>
                      </div>
                    ) : (
                      <span className="text-slate-400">{m.unitLabel ? "Vacant" : "—"}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      onClick={() => setEditingMeter(m)}
                      className="rounded-md bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-200"
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
