import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/session";
import { sendTestNotification } from "@/lib/notify";
import { cleanPhone } from "@/lib/notify/phone";

const schema = z.object({
  channel: z.enum(["EMAIL", "SMS"]),
  to: z.string().trim().min(1).max(200),
});

/** Send a test email / SMS with the saved settings and report the gateway's answer. */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Enter a recipient" }, { status: 400 });
  const { channel, to } = parsed.data;
  if (channel === "EMAIL" && !z.string().email().safeParse(to).success) {
    return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 });
  }
  if (channel === "SMS" && !cleanPhone(to)) {
    return NextResponse.json({ error: "Enter a valid phone number" }, { status: 400 });
  }

  const error = await sendTestNotification(channel, to);
  if (error) return NextResponse.json({ error }, { status: 502 });
  return NextResponse.json({ ok: true });
}
