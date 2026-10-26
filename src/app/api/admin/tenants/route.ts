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

export async function GET() {
  if (!(await assertAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const tenants = await prisma.user.findMany({
    where: { role: "TENANT" },
    orderBy: { createdAt: "desc" },
    // never return passwordHash to the browser
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      isPaused: true,
      createdAt: true,
    },
  });
  return NextResponse.json({ tenants });
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
    .refine((v) => !v || v.length >= 6, "Password must be at least 6 characters"),
  phone: z
    .string()
    .nullable()
    .optional()
    .refine((v) => !v || cleanPhone(v), "Invalid phone number"),
});

export async function POST(req: Request) {
  if (!(await assertAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const body = createSchema.parse(await req.json());
    
    const existing = await prisma.user.findUnique({
      where: { email: body.email.toLowerCase() },
    });
    if (existing) {
      return NextResponse.json({ error: "Email already exists" }, { status: 400 });
    }

    // Either way it's a temporary password: the tenant must choose their own at first login.
    const password = body.password ?? generateTempPassword();
    const tenant = await prisma.user.create({
      data: {
        name: body.name,
        email: body.email.toLowerCase(),
        phone: cleanPhone(body.phone),
        passwordHash: await hashPassword(password),
        mustChangePassword: true,
        role: "TENANT",
      },
      // never return passwordHash to the browser
      select: { id: true, name: true, email: true, phone: true },
    });

    const welcome = await notifyTenantCredentials("welcome", tenant, password, process.env.APP_URL || new URL(req.url).origin);

    // The password is returned once so the admin can share it if the welcome message didn't go out.
    return NextResponse.json({ tenant, password, welcome }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: "Create failed" }, { status: 500 });
  }
}
