import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateUser } from "@/lib/auth";
import { getSession } from "@/lib/session";
import { isFormPost, readBody, toFormRedirect } from "@/lib/form-post";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(req: Request) {
  const res = await login(req);
  return isFormPost(req) ? toFormRedirect(res, "/dashboard", "/login") : res;
}

async function login(req: Request) {
  try {
    const body = schema.parse(await readBody(req));
    const auth = await authenticateUser(body.email, body.password);
    if (!auth) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }
    if (auth.blocked) {
      return NextResponse.json({ error: auth.blocked }, { status: 403 });
    }
    const session = await getSession();
    session.user = auth.user;
    await session.save();
    return NextResponse.json({
      user: auth.user,
      redirectTo: auth.user.mustChangePassword ? "/account/password" : "/dashboard",
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: "Login failed" }, { status: 500 });
  }
}
