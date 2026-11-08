import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { searchText, wordsWhere } from "@/lib/search";
import { getSession } from "@/lib/session";
import { activeLeaseWhere } from "@/lib/tenancy";
import MetersClient from "./MetersClient";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSession();
  if (!session.user) redirect("/login");
  if (session.user.role !== "ADMIN") redirect("/dashboard");
  if (session.user.mustChangePassword) redirect("/account/password");

  const q = searchText((await searchParams).q);
  const [meters, companies, units] = await Promise.all([
    prisma.meter.findMany({
      where: wordsWhere<Prisma.MeterWhereInput>(q, (c) => [
        { meterNumber: c },
        { label: c },
        { company: { name: c } },
        { unit: { OR: [{ name: c }, { property: { name: c } }] } },
        { unit: { leases: { some: { AND: [activeLeaseWhere(), { tenant: { OR: [{ name: c }, { email: c }] } }] } } } },
      ]),
      orderBy: { createdAt: "desc" },
      include: {
        company: { select: { id: true, name: true } },
        unit: {
          select: {
            id: true,
            name: true,
            property: { select: { name: true } },
            // Whoever can top up this meter today
            leases: { where: activeLeaseWhere(), select: { tenant: { select: { name: true, email: true } } } },
          },
        },
      },
    }),
    prisma.company.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.unit.findMany({
      orderBy: [{ property: { name: "asc" } }, { name: "asc" }],
      select: { id: true, name: true, property: { select: { name: true, companyId: true } } },
    }),
  ]);

  return (
    <MetersClient
      meters={meters.map((m) => ({
        id: m.id,
        meterNumber: m.meterNumber,
        label: m.label,
        companyId: m.companyId,
        companyName: m.company.name,
        unitId: m.unitId,
        unitLabel: m.unit ? `${m.unit.property.name} — ${m.unit.name}` : null,
        tenant: m.unit?.leases[0]?.tenant ?? null,
      }))}
      companies={companies}
      units={units.map((u) => ({ id: u.id, label: `${u.property.name} — ${u.name}`, companyId: u.property.companyId }))}
      user={session.user}
      q={q}
    />
  );
}
