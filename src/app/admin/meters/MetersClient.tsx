"use client";

import { useState } from "react";
import { Nav } from "@/components/Nav";
import { MeterForm, MeterWithUser } from "@/components/MeterForm";
import { useRouter } from "next/navigation";

export default function MetersClient({
  meters,
  companies,
  user,
}: {
  meters: any[];
  companies: any[];
  user: any;
}) {
  const [editingMeter, setEditingMeter] = useState<MeterWithUser | null>(null);

  return (
    <div>
      <Nav user={user} />
      <main className="mx-auto max-w-5xl space-y-8 px-4 py-8">
        <h1 className="text-2xl font-bold">Meters</h1>
        <MeterForm
          companies={companies}
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
                <th className="px-3 py-2">Tenant</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {meters.map((m) => (
                <tr key={m.id} className="border-b last:border-0">
                  <td className="px-3 py-2 font-mono">{m.meterNumber}</td>
                  <td className="px-3 py-2">{m.label || "—"}</td>
                  <td className="px-3 py-2">{m.company.name}</td>
                  <td className="px-3 py-2">
                    {m.user ? (
                      <div>
                        <div className="font-medium">{m.user.name}</div>
                        <div className="text-xs text-slate-500">{m.user.email}</div>
                      </div>
                    ) : (
                      "Unassigned"
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
