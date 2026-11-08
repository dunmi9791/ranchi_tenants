import type { Settings } from "@prisma/client";
import nodemailer from "nodemailer";

export type EmailConfig = Pick<
  Settings,
  "smtpHost" | "smtpPort" | "smtpSecure" | "smtpUser" | "smtpPassword" | "smtpFromEmail" | "smtpFromName"
>;

export type EmailMessage = { to: string; subject: string; text: string; html?: string };

export function emailConfigError(c: EmailConfig): string | null {
  const missing = [!c.smtpHost && "SMTP host", !c.smtpFromEmail && "from address"].filter(Boolean);
  return missing.length ? `Email needs: ${missing.join(", ")}` : null;
}

export async function sendEmail(c: EmailConfig, msg: EmailMessage): Promise<void> {
  const configError = emailConfigError(c);
  if (configError) throw new Error(configError);
  const transport = nodemailer.createTransport({
    host: c.smtpHost!,
    port: c.smtpPort,
    secure: c.smtpSecure,
    auth: c.smtpUser ? { user: c.smtpUser, pass: c.smtpPassword ?? "" } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
  try {
    await transport.sendMail({
      from: c.smtpFromName ? { name: c.smtpFromName, address: c.smtpFromEmail! } : c.smtpFromEmail!,
      to: msg.to,
      subject: msg.subject,
      text: msg.text,
      html: msg.html,
    });
  } finally {
    transport.close();
  }
}
