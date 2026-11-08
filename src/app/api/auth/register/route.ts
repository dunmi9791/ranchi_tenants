import { NextResponse } from "next/server";
import { z } from "zod";
import { hashPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { cleanPhone } from "@/lib/notify/phone";
import { isFormPost, readBody, toFormRedirect } from "@/lib/form-post";

const schema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  /** Optional mobile number for SMS token notifications */
  phone: z
    .string()
    .optional()
    .refine((v) => !v || cleanPhone(v), "Invalid phone number"),
  /** Optional note for the property manager, e.g. which flat they're moving into */
  message: z.string().trim().max(500).optional(),
  /** Optional unit they occupy or plan to occupy */
  unitId: z.string().optional(),
});

export async function POST(req: Request) {
  const res = await register(req);
  return isFormPost(req) ? toFormRedirect(res, "/register?submitted=1", "/register") : res;
}

/**
 * Self-registration goes to the Applicant table, not User: the person can't log in until
 * an admin gives them a lease on /admin/applicants, which turns them into a tenant.
 */
async function register(req: Request) {
  try {
    const body = schema.parse(await readBody(req));
    const email = body.email.toLowerCase();
    const [user, applicant, unit] = await Promise.all([
      prisma.user.findUnique({ where: { email }, select: { id: true } }),
      prisma.applicant.findUnique({ where: { email }, select: { status: true } }),
      body.unitId ? prisma.unit.findUnique({ where: { id: body.unitId }, select: { id: true } }) : null,
    ]);
    if (body.unitId && !unit) {
      return NextResponse.json({ error: "That apartment is no longer available. Please choose another." }, { status: 400 });
    }
    if (user) {
      return NextResponse.json({ error: "Email already registered. Please log in." }, { status: 409 });
    }
    if (applicant?.status === "PENDING") {
      return NextResponse.json(
        { error: "You've already registered with this email. Your property manager will be in touch." },
        { status: 409 }
      );
    }

    const data = {
      name: body.name,
      phone: cleanPhone(body.phone),
      message: body.message || null,
      unitId: unit?.id ?? null,
      passwordHash: await hashPassword(body.password),
    };
    // A rejected applicant may apply again; their record goes back to pending.
    await prisma.applicant.upsert({
      where: { email },
      create: { email, ...data },
      update: { ...data, status: "PENDING", rejectedAt: null, rejectedReason: null },
    });

    return NextResponse.json({ submitted: true }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: "Registration failed" }, { status: 500 });
  }
}
