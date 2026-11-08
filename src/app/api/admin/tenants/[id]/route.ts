import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
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

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const tenant = await prisma.user.update({
      where: { id, role: "TENANT" },
      data,
      // never return passwordHash to the browser
      select: { id: true, name: true, email: true, phone: true },
    });

    return NextResponse.json({ tenant });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}
