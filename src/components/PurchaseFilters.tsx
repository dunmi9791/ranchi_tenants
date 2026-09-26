"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

type Option = { id: string; label: string };

type Props = {
  range: string;
  from: string;
  to: string;
  groupBy: string;
  status: string;
  tenant: string;
  company: string;
  ranges: Record<string, string>;
  statuses: Record<string, string>;
  tenants: Option[];
  companies: Option[];
};

export function PurchaseFilters(props: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [v, setV] = useState({
    range: props.range,
    from: props.from,
    to: props.to,
    groupBy: props.groupBy,
    status: props.status,
    tenant: props.tenant,
    company: props.company,
  });

  function apply(next: typeof v) {
    setV(next);
    const q = new URLSearchParams();
    q.set("range", next.range);
    if (next.range === "custom") {
      q.set("from", next.from);
      q.set("to", next.to);
    }
    q.set("groupBy", next.groupBy);
    q.set("status", next.status);
    if (next.tenant) q.set("tenant", next.tenant);
    if (next.company) q.set("company", next.company);
    router.push(`${pathname}?${q.toString()}`);
  }

  const sel = "mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm";
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>) =>
    apply({ ...v, [k]: e.target.value });

  return (
    <form
      className="grid gap-3 rounded-xl border bg-white p-4 shadow-sm sm:grid-cols-3 lg:grid-cols-6"
      onSubmit={(e) => {
        e.preventDefault();
        apply(v);
      }}
    >
      <label className="text-xs font-medium text-slate-600">
        Date range
        <select value={v.range} onChange={set("range")} className={sel}>
          {Object.entries(props.ranges).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
      </label>
      {v.range === "custom" && (
        <>
          <label className="text-xs font-medium text-slate-600">
            From
            <input type="date" value={v.from} onChange={set("from")} className={sel} />
          </label>
          <label className="text-xs font-medium text-slate-600">
            To
            <input type="date" value={v.to} onChange={set("to")} className={sel} />
          </label>
        </>
      )}
      <label className="text-xs font-medium text-slate-600">
        Group by
        <select value={v.groupBy} onChange={set("groupBy")} className={sel}>
          <option value="day">Day</option>
          <option value="week">Week</option>
          <option value="month">Month</option>
        </select>
      </label>
      <label className="text-xs font-medium text-slate-600">
        Company
        <select value={v.company} onChange={set("company")} className={sel}>
          <option value="">All companies</option>
          {props.companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </label>
      <label className="text-xs font-medium text-slate-600">
        Tenant
        <select value={v.tenant} onChange={set("tenant")} className={sel}>
          <option value="">All tenants</option>
          {props.tenants.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </label>
      <label className="text-xs font-medium text-slate-600">
        Status
        <select value={v.status} onChange={set("status")} className={sel}>
          {Object.entries(props.statuses).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
      </label>
    </form>
  );
}
