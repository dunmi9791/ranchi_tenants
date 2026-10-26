import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { cleanPhone } from "@/lib/notify/phone";

async function assertAdmin() {
  const session = await getSession();
  if (!session.user || session.user.role !== "ADMIN") return null;
  return session;
}

const updateSchema = z.object({
  name: z.string().min(2).optional(),
  email: z.string().email().optional(),
  phone: z
    .string()
    .nullable()
    .optional()
    .refine((v) => !v || cleanPhone(v), "Invalid phone number"),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await assertAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;

  try {
    const body = updateSchema.parse(await req.json());

    const data: Prisma.UserUpdateInput = {};
    if (body.name) data.name = body.name;
    if (body.email) data.email = body.email.toLowerCase();
    if (body.phone !== undefined) data.phone = cleanPhone(body.phone);

    const admin = await prisma.user.update({
      where: { id, role: "ADMIN" },
      data,
      // never return passwordHash to the browser
      select: { id: true, name: true, email: true, phone: true },
    });
    return NextResponse.json({ admin });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === "P2002") return NextResponse.json({ error: "Email already exists" }, { status: 400 });
      if (err.code === "P2025") return NextResponse.json({ error: "Admin not found" }, { status: 404 });
    }
    console.error(err);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}

/**
 * Remove an administrator. Their sessions end immediately (getSession finds no user).
 * You can't remove yourself, so at least one admin always remains.
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await assertAdmin();
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  if (id === session.user!.id) {
    return NextResponse.json({ error: "You can't remove your own admin account" }, { status: 400 });
  }

  const admin = await prisma.user.findFirst({
    where: { id, role: "ADMIN" },
    select: { id: true, email: true, _count: { select: { purchases: true, leases: true } } },
  });
  if (!admin) return NextResponse.json({ error: "Admin not found" }, { status: 404 });
  if (admin._count.purchases > 0 || admin._count.leases > 0) {
    return NextResponse.json(
      { error: "This admin has leases or purchases on record and can't be deleted" },
      { status: 400 }
    );
  }

  await prisma.user.delete({ where: { id } });
  console.log(`[Admin] ${session.user!.email} removed admin ${admin.email}`);
  return NextResponse.json({ ok: true });
}
