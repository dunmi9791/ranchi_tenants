import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/session";
import { retryVend } from "@/lib/vend";

const schema = z.object({ confirmedNoToken: z.boolean().optional() });

/** Retry the StronPower vend for a paid purchase that FAILED. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const body = schema.parse(await req.json().catch(() => ({})));

  console.log(`[Admin] ${session.user.email} retrying vend for purchase ${id}`);
  const result = await retryVend(id, { confirmedNoToken: body.confirmedNoToken === true });
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, needsConfirmation: "needsConfirmation" in result ? result.needsConfirmation : false },
      { status: "purchase" in result ? 502 : 409 }
    );
  }
  return NextResponse.json({ status: result.purchase.status, stsPin: result.purchase.stsPin });
}
