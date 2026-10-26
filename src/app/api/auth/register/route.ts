import { NextResponse } from "next/server";
import { z } from "zod";
import { hashPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
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
});

export async function POST(req: Request) {
  const res = await register(req);
  return isFormPost(req) ? toFormRedirect(res, "/dashboard", "/register") : res;
}

async function register(req: Request) {
  try {
    const body = schema.parse(await readBody(req));
    const email = body.email.toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: "Email already registered" }, { status: 409 });
    }

    // Meters come with a lease: the property manager adds the tenant's lease on a unit,
    // and the unit's meters then show on their dashboard.
    const user = await prisma.user.create({
      data: {
        email,
        name: body.name,
        phone: cleanPhone(body.phone),
        passwordHash: await hashPassword(body.password),
        role: "TENANT",
      },
    });

    const session = await getSession();
    session.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      companyId: user.companyId,
    };
    await session.save();

    return NextResponse.json({
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: "Registration failed" }, { status: 500 });
  }
}
