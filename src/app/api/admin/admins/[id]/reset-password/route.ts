import { NextResponse } from "next/server";
import { z } from "zod";
import { generateTempPassword, hashPassword } from "@/lib/auth";
import { notifyTenantCredentials } from "@/lib/notify";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

const schema = z.object({
  /** Optional; a temporary password is generated when omitted */
  password: z.string().min(8).max(100).optional(),
});

/**
 * Reset another admin's password (e.g. they're locked out). They must choose a new one at
 * next login and their existing sessions end. Your own password is changed on /account/password.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  if (id === session.user.id) {
    return NextResponse.json({ error: "Change your own password on the Password page" }, { status: 400 });
  }
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }

  const admin = await prisma.user.findFirst({
    where: { id, role: "ADMIN" },
    select: { id: true, name: true, email: true, phone: true },
  });
  if (!admin) return NextResponse.json({ error: "Admin not found" }, { status: 404 });

  const password = parsed.data.password ?? generateTempPassword();
  await prisma.user.update({
    where: { id },
    data: {
      passwordHash: await hashPassword(password),
      mustChangePassword: true,
      sessionVersion: { increment: 1 },
    },
  });
  console.log(`[Admin] ${session.user.email} reset password for admin ${id}`);
  const notified = await notifyTenantCredentials(
    "password_reset",
    { ...admin, role: "ADMIN" },
    password,
    process.env.APP_URL || new URL(req.url).origin
  );
  return NextResponse.json({ password, notified });
}
