import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

async function assertAdmin() {
  const session = await getSession();
  if (!session.user || session.user.role !== "ADMIN") return null;
  return session;
}

const updateSchema = z.object({
  name: z.string().min(2).optional(),
  email: z.string().email().optional(),
  leaseExpiryDate: z.string().optional().nullable(),
  leaseNotes: z.string().optional().nullable(),
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
    if (body.leaseExpiryDate !== undefined) {
      data.leaseExpiryDate = body.leaseExpiryDate ? new Date(body.leaseExpiryDate) : null;
    }
    if (body.leaseNotes !== undefined) {
      data.leaseNotes = body.leaseNotes;
    }

    const tenant = await prisma.user.update({
      where: { id, role: "TENANT" },
      data,
      // never return passwordHash to the browser
      select: { id: true, name: true, email: true, leaseExpiryDate: true, leaseNotes: true },
    });

    return NextResponse.json({ tenant });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}
