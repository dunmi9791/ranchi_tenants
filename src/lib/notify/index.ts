import type { NotificationChannel, Settings } from "@prisma/client";
import { prisma } from "../prisma";
import { getSettings } from "../pricing";
import { emailConfigError, sendEmail } from "./email";
import { normalizePhone, splitList } from "./phone";
import { sendSms, smsConfigError } from "./sms";
import {
  type PurchaseInfo,
  type Rendered,
  testMessage,
  passwordResetMessage,
  welcomeMessage,
  vendFailedAdminMessage,
  vendFailedTenantMessage,
  vendSuccessMessage,
} from "./templates";

export type NotificationEvent = "welcome" | "password_reset" | "vend_success" | "vend_failed" | "admin_vend_failed" | "test";

const brandOf = (s: Settings) => s.smtpFromName?.trim() || "Ranchi Tenants";

/** Settings safe to send to the browser: secrets are replaced by "is set" flags. */
export function publicNotificationSettings(s: Settings) {
  return {
    emailEnabled: s.emailEnabled,
    smtpHost: s.smtpHost ?? "",
    smtpPort: s.smtpPort,
    smtpSecure: s.smtpSecure,
    smtpUser: s.smtpUser ?? "",
    hasSmtpPassword: !!s.smtpPassword,
    smtpFromEmail: s.smtpFromEmail ?? "",
    smtpFromName: s.smtpFromName ?? "",
    smsEnabled: s.smsEnabled,
    smsProvider: s.smsProvider,
    hasSmsApiKey: !!s.smsApiKey,
    smsUsername: s.smsUsername ?? "",
    smsSenderId: s.smsSenderId ?? "",
    smsBaseUrl: s.smsBaseUrl ?? "",
    smsHttpMethod: s.smsHttpMethod,
    smsHttpContentType: s.smsHttpContentType,
    smsHttpBody: s.smsHttpBody ?? "",
    smsHttpHeaders: s.smsHttpHeaders ?? "",
    smsCountryCode: s.smsCountryCode,
    notifyTenantOnWelcome: s.notifyTenantOnWelcome,
    notifyTenantOnPasswordReset: s.notifyTenantOnPasswordReset,
    notifyTenantOnVend: s.notifyTenantOnVend,
    notifyTenantOnFailure: s.notifyTenantOnFailure,
    notifyAdminOnFailure: s.notifyAdminOnFailure,
    adminAlertEmails: s.adminAlertEmails ?? "",
    adminAlertPhones: s.adminAlertPhones ?? "",
  };
}
export type PublicNotificationSettings = ReturnType<typeof publicNotificationSettings>;

type Delivery = {
  channel: NotificationChannel;
  event: NotificationEvent;
  to: string;
  message: Rendered;
  purchaseId?: string;
};

/** Send one email/SMS and record the outcome. Never throws; returns the error message, if any. */
async function deliver(s: Settings, d: Delivery): Promise<string | null> {
  let error: string | null = null;
  try {
    if (d.channel === "EMAIL") {
      await sendEmail(s, { to: d.to, subject: d.message.subject, text: d.message.text, html: d.message.html });
    } else {
      await sendSms(s, d.to, d.message.sms);
    }
  } catch (err) {
    error = (err instanceof Error ? err.message : String(err)).slice(0, 1000);
    console.error(`[Notify] ${d.channel} ${d.event} to ${d.to} failed: ${error}`);
  }
  await prisma.notificationLog
    .create({
      data: {
        channel: d.channel,
        event: d.event,
        recipient: d.to,
        subject: d.channel === "EMAIL" ? d.message.subject : null,
        status: error ? "FAILED" : "SENT",
        error,
        purchaseId: d.purchaseId ?? null,
      },
    })
    .catch((err) => console.error("[Notify] could not write log", err));
  return error;
}

export type DeliveryResult = { channel: NotificationChannel; to: string; error: string | null };

/** Email + SMS to the given recipients over whichever channels are enabled and configured. */
async function fanOut(
  s: Settings,
  event: NotificationEvent,
  message: Rendered,
  recipients: { emails: string[]; phones: string[] },
  purchaseId?: string
): Promise<DeliveryResult[]> {
  const targets: { channel: NotificationChannel; to: string }[] = [];
  if (s.emailEnabled && !emailConfigError(s)) {
    for (const to of recipients.emails) targets.push({ channel: "EMAIL", to });
  }
  if (s.smsEnabled && !smsConfigError(s)) {
    for (const to of recipients.phones) if (normalizePhone(to, s.smsCountryCode)) targets.push({ channel: "SMS", to });
  }
  return Promise.all(
    targets.map(async (t) => ({ ...t, error: await deliver(s, { ...t, event, message, purchaseId }) }))
  );
}

/**
 * Send a tenant their login URL, email and temporary password, either as a welcome (admin just
 * created them) or after an admin password reset. Returns what was attempted (empty when that
 * message type or both channels are off). Never throws.
 */
export async function notifyTenantCredentials(
  kind: "welcome" | "password_reset",
  tenant: { name: string; email: string; phone: string | null; role?: "ADMIN" | "TENANT" },
  tempPassword: string,
  appUrl: string
): Promise<DeliveryResult[]> {
  try {
    const s = await getSettings();
    if (!(kind === "welcome" ? s.notifyTenantOnWelcome : s.notifyTenantOnPasswordReset)) return [];
    const render = kind === "welcome" ? welcomeMessage : passwordResetMessage;
    const message = render({
      brand: brandOf(s),
      tenantName: tenant.name,
      email: tenant.email,
      tempPassword,
      loginUrl: `${appUrl.replace(/\/+$/, "")}/login`,
      isAdmin: tenant.role === "ADMIN",
    });
    return await fanOut(s, kind, message, { emails: [tenant.email], phones: tenant.phone ? [tenant.phone] : [] });
  } catch (err) {
    console.error(`[Notify] ${kind} for ${tenant.email} failed`, err);
    return [];
  }
}

/**
 * Tell the tenant (and on failure, the admins) how a paid purchase ended.
 * Called after fulfillPurchase settles the purchase; never throws, so it can't affect vending.
 */
export async function notifyPurchaseOutcome(purchaseId: string): Promise<void> {
  try {
    const [s, p] = await Promise.all([
      getSettings(),
      prisma.purchase.findUnique({
        where: { id: purchaseId },
        include: { user: { select: { name: true, email: true, phone: true } }, meter: { select: { meterNumber: true } } },
      }),
    ]);
    if (!p || (!s.emailEnabled && !s.smsEnabled)) return;

    const info: PurchaseInfo = {
      brand: brandOf(s),
      tenantName: p.user.name,
      meterNumber: p.meter.meterNumber,
      kwhAmount: p.kwhAmount,
      totalPaid: p.nairaAmount + p.serviceFee,
      reference: p.paystackReference,
      stsPin: p.stsPin,
      errorMessage: p.errorMessage,
      appUrl: process.env.APP_URL,
    };
    const tenant = { emails: [p.user.email], phones: p.user.phone ? [p.user.phone] : [] };

    if (p.status === "VENDED" && p.stsPin) {
      if (s.notifyTenantOnVend) await fanOut(s, "vend_success", vendSuccessMessage(info), tenant, p.id);
      return;
    }
    if (p.status !== "FAILED" || !p.paidAt) return;

    const jobs: Promise<unknown>[] = [];
    if (s.notifyTenantOnFailure) {
      // Admin retries can fail again; the tenant only needs to hear about the delay once.
      const alreadyTold = await prisma.notificationLog.count({
        where: { purchaseId: p.id, event: "vend_failed", status: "SENT" },
      });
      if (!alreadyTold) jobs.push(fanOut(s, "vend_failed", vendFailedTenantMessage(info), tenant, p.id));
    }
    if (s.notifyAdminOnFailure) {
      const admins = { emails: splitList(s.adminAlertEmails), phones: splitList(s.adminAlertPhones) };
      jobs.push(fanOut(s, "admin_vend_failed", vendFailedAdminMessage(info), admins, p.id));
    }
    await Promise.all(jobs);
  } catch (err) {
    console.error(`[Notify] purchase ${purchaseId} notification failed`, err);
  }
}

/** Admin "send test" button. Uses the saved settings even if the channel is switched off. */
export async function sendTestNotification(channel: NotificationChannel, to: string): Promise<string | null> {
  const s = await getSettings();
  const configError = channel === "EMAIL" ? emailConfigError(s) : smsConfigError(s);
  if (configError) return configError;
  return deliver(s, { channel, event: "test", to, message: testMessage(brandOf(s)) });
}
