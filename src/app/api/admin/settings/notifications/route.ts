import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { getSettings } from "@/lib/pricing";
import { publicNotificationSettings } from "@/lib/notify";
import { emailConfigError } from "@/lib/notify/email";
import { cleanPhone, splitList } from "@/lib/notify/phone";
import { SMS_PROVIDERS, smsConfigError } from "@/lib/notify/sms";

async function assertAdmin() {
  const session = await getSession();
  if (!session.user || session.user.role !== "ADMIN") return null;
  return session;
}

export async function GET() {
  if (!(await assertAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json({ settings: publicNotificationSettings(await getSettings()) });
}

const text = (max = 500) =>
  z
    .string()
    .max(max)
    .transform((v) => v.trim() || null);

const updateSchema = z.object({
  emailEnabled: z.boolean(),
  smtpHost: text(),
  smtpPort: z.number().int().min(1).max(65535),
  smtpSecure: z.boolean(),
  smtpUser: text(),
  /** Blank keeps the saved password; clearSmtpPassword removes it */
  smtpPassword: z.string().max(500).optional(),
  clearSmtpPassword: z.boolean().optional(),
  smtpFromEmail: z.union([z.literal(""), z.string().email()]).transform((v) => v || null),
  smtpFromName: text(100),

  smsEnabled: z.boolean(),
  smsProvider: z.enum(SMS_PROVIDERS),
  /** Blank keeps the saved key; clearSmsApiKey removes it */
  smsApiKey: z.string().max(500).optional(),
  clearSmsApiKey: z.boolean().optional(),
  smsUsername: text(),
  smsSenderId: text(50),
  smsBaseUrl: text(2000),
  smsHttpMethod: z.enum(["GET", "POST"]),
  smsHttpContentType: z.enum(["json", "form"]),
  smsHttpBody: text(4000),
  smsHttpHeaders: text(4000),
  smsCountryCode: z.string().regex(/^\+?\d{1,4}$/, "Country code must be 1-4 digits").transform((v) => v.replace("+", "")),

  notifyTenantOnWelcome: z.boolean(),
  notifyTenantOnPasswordReset: z.boolean(),
  notifyTenantOnVend: z.boolean(),
  notifyTenantOnFailure: z.boolean(),
  notifyAdminOnFailure: z.boolean(),
  adminAlertEmails: text(1000),
  adminAlertPhones: text(1000),
});

export async function PUT(req: Request) {
  const session = await assertAdmin();
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const parsed = updateSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json(
      { error: issue ? `${issue.path.join(".") || "input"}: ${issue.message}` : "Invalid input" },
      { status: 400 }
    );
  }
  const { smtpPassword, clearSmtpPassword, smsApiKey, clearSmsApiKey, ...body } = parsed.data;

  const badEmail = splitList(body.adminAlertEmails).find((e) => !z.string().email().safeParse(e).success);
  if (badEmail) return NextResponse.json({ error: `Invalid admin email: ${badEmail}` }, { status: 400 });
  const badPhone = splitList(body.adminAlertPhones).find((p) => !cleanPhone(p));
  if (badPhone) return NextResponse.json({ error: `Invalid admin phone: ${badPhone}` }, { status: 400 });
  if (body.smsProvider === "http" && body.smsBaseUrl && !/^https?:\/\//i.test(body.smsBaseUrl)) {
    return NextResponse.json({ error: "Gateway URL must start with http:// or https://" }, { status: 400 });
  }

  const current = await getSettings();
  const data = {
    ...body,
    smtpPassword: clearSmtpPassword ? null : smtpPassword ? smtpPassword : current.smtpPassword,
    smsApiKey: clearSmsApiKey ? null : smsApiKey?.trim() ? smsApiKey.trim() : current.smsApiKey,
  };

  // Don't let a channel be switched on with settings that can't possibly send.
  const merged = { ...current, ...data };
  const emailError = data.emailEnabled ? emailConfigError(merged) : null;
  if (emailError) return NextResponse.json({ error: emailError }, { status: 400 });
  const smsError = data.smsEnabled ? smsConfigError(merged) : null;
  if (smsError) return NextResponse.json({ error: smsError }, { status: 400 });

  const settings = await prisma.settings.update({ where: { id: "default" }, data });
  console.log(`[Admin] ${session.user!.email} updated notification settings`);
  return NextResponse.json({ settings: publicNotificationSettings(settings) });
}
