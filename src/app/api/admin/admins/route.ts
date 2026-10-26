import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { generateTempPassword, hashPassword } from "@/lib/auth";
import { notifyTenantCredentials } from "@/lib/notify";
import { cleanPhone } from "@/lib/notify/phone";

async function assertAdmin() {
  const session = await getSession();
  if (!session.user || session.user.role !== "ADMIN") return null;
  return session;
}

// never return passwordHash to the browser
const adminSelect = { id: true, name: true, email: true, phone: true, createdAt: true } as const;

export async function GET() {
  if (!(await assertAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const admins = await prisma.user.findMany({
    where: { role: "ADMIN" },
    orderBy: { createdAt: "asc" },
    select: adminSelect,
  });
  return NextResponse.json({ admins });
}

const createSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  /** Optional; a temporary password is generated when blank */
  password: z
    .string()
    .optional()
    .nullable()
    .transform((v) => v?.trim() || null)
    .refine((v) => !v || v.length >= 8, "Password must be at least 8 characters"),
  phone: z
    .string()
    .nullable()
    .optional()
    .refine((v) => !v || cleanPhone(v), "Invalid phone number"),
});

/** Create another administrator with full access. They must choose their own password at first login. */
export async function POST(req: Request) {
  const session = await assertAdmin();
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const body = createSchema.parse(await req.json());

    const existing = await prisma.user.findUnique({ where: { email: body.email.toLowerCase() } });
    if (existing) {
      return NextResponse.json({ error: "Email already exists" }, { status: 400 });
    }

    const password = body.password ?? generateTempPassword();
    const admin = await prisma.user.create({
      data: {
        name: body.name,
        email: body.email.toLowerCase(),
        phone: cleanPhone(body.phone),
        passwordHash: await hashPassword(password),
        mustChangePassword: true,
        role: "ADMIN",
      },
      select: adminSelect,
    });
    console.log(`[Admin] ${session.user!.email} created admin ${admin.email}`);

    const welcome = await notifyTenantCredentials(
      "welcome",
      { ...admin, role: "ADMIN" },
      password,
      process.env.APP_URL || new URL(req.url).origin
    );

    // The password is returned once so the creator can share it if the welcome message didn't go out.
    return NextResponse.json({ admin, password, welcome }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: "Create failed" }, { status: 500 });
  }
}
