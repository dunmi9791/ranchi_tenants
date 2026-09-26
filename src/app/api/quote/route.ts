import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { MIN_KWH, getSettings, getTariff, quoteForNaira } from "@/lib/pricing";

const schema = z.object({
  meterId: z.string().min(1),
  naira: z.coerce.number().positive().max(10_000_000),
});

/** GET /api/quote?meterId=…&naira=… — kWh and total for a naira amount at StronPower's price. */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = schema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const meter = await prisma.meter.findUnique({
    where: { id: parsed.data.meterId },
    include: { company: true },
  });
  if (!meter || meter.userId !== session.user.id) {
    return NextResponse.json({ error: "Meter not found" }, { status: 404 });
  }

  try {
    const [tariff, settings] = await Promise.all([
      getTariff(meter.company, meter.meterNumber),
      getSettings(),
    ]);
    const quote = quoteForNaira(parsed.data.naira, tariff, settings);
    return NextResponse.json({
      quote,
      minKwh: MIN_KWH,
      minNaira: Math.ceil(MIN_KWH * tariff.unitPrice),
    });
  } catch (err) {
    console.error("[Quote]", err);
    return NextResponse.json({ error: "Couldn't get the current price. Try again shortly." }, { status: 502 });
  }
}
