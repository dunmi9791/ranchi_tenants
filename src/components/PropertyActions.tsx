"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { PropertyForm, type PropertyData } from "./PropertyForm";
import { UnitForm, type UnitData } from "./UnitForm";
import { Modal, sendJson, smallBtn } from "./ui";

function useDelete(url: string, confirmText: string, after?: () => void) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function remove() {
    if (!window.confirm(confirmText)) return;
    setBusy(true);
    setError(null);
    try {
      await sendJson(url, "DELETE");
      if (after) after();
      else router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return { remove, error, busy };
}

export function PropertyActions({ property, companies }: { property: PropertyData; companies: { id: string; name: string }[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const del = useDelete(`/api/admin/properties/${property.id}`, `Delete ${property.name}?`, () => router.push("/admin/properties"));
  return (
    <div className="space-y-1">
      <div className="flex gap-1">
        <button onClick={() => setEditing(true)} className={`${smallBtn} border-slate-300 hover:bg-slate-100`}>
          Edit property
        </button>
        <button onClick={del.remove} disabled={del.busy} className={`${smallBtn} border-red-300 text-red-700 hover:bg-red-50`}>
          Delete
        </button>
      </div>
      {del.error && <p className="text-xs text-red-600">{del.error}</p>}
      {editing && (
        <Modal onClose={() => setEditing(false)}>
          <PropertyForm companies={companies} initial={property} onDone={() => setEditing(false)} />
        </Modal>
      )}
    </div>
  );
}

export function UnitActions({ unit, propertyId }: { unit: UnitData; propertyId: string }) {
  const [editing, setEditing] = useState(false);
  const del = useDelete(`/api/admin/units/${unit.id}`, `Delete unit ${unit.name}?`);
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-1">
        <a href={`/admin/leases?unitId=${unit.id}#new-lease`} className={`${smallBtn} border-emerald-600 text-emerald-700 hover:bg-emerald-50`}>
          New lease
        </a>
        <button onClick={() => setEditing(true)} className={`${smallBtn} border-slate-300 hover:bg-slate-100`}>
          Edit
        </button>
        <button onClick={del.remove} disabled={del.busy} className={`${smallBtn} border-red-300 text-red-700 hover:bg-red-50`}>
          Delete
        </button>
      </div>
      {del.error && <p className="max-w-[14rem] text-xs text-red-600">{del.error}</p>}
      {editing && (
        <Modal onClose={() => setEditing(false)}>
          <UnitForm propertyId={propertyId} initial={unit} onDone={() => setEditing(false)} />
        </Modal>
      )}
    </div>
  );
}
