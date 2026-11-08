import type { Settings } from "@prisma/client";
import { normalizePhone } from "./phone";

export const SMS_PROVIDERS = ["termii", "africastalking", "twilio", "http"] as const;
export type SmsProvider = (typeof SMS_PROVIDERS)[number];

export type SmsConfig = Pick<
  Settings,
  | "smsProvider"
  | "smsApiKey"
  | "smsUsername"
  | "smsSenderId"
  | "smsBaseUrl"
  | "smsHttpMethod"
  | "smsHttpContentType"
  | "smsHttpBody"
  | "smsHttpHeaders"
  | "smsCountryCode"
>;

export type SmsRequest = {
  url: string;
  method: "GET" | "POST";
  headers: Record<string, string>;
  body?: string;
};

const trimSlash = (u: string) => u.replace(/\/+$/, "");
const form = (fields: Record<string, string | null | undefined>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(fields)) if (v) p.set(k, v);
  return p.toString();
};

/** Replace {name} placeholders, encoding each value for where it lands (URL, JSON string, form, header). */
export function fillTemplate(
  template: string,
  values: Record<string, string>,
  encode: (v: string) => string = (v) => v
): string {
  return template.replace(/\{(\w+)\}/g, (m, key: string) => (key in values ? encode(values[key]) : m));
}

const jsonEscape = (v: string) => JSON.stringify(v).slice(1, -1);

/** Missing settings that stop SMS from being sent with this provider, as a readable message. */
export function smsConfigError(c: SmsConfig): string | null {
  const need = (ok: unknown, what: string) => (ok ? null : what);
  const missing = (() => {
    switch (c.smsProvider as SmsProvider) {
      case "termii":
        return [need(c.smsApiKey, "API key"), need(c.smsSenderId, "sender ID")];
      case "africastalking":
        return [need(c.smsApiKey, "API key"), need(c.smsUsername, "username")];
      case "twilio":
        return [need(c.smsUsername, "Account SID"), need(c.smsApiKey, "auth token"), need(c.smsSenderId, "From number")];
      case "http":
        return [need(c.smsBaseUrl, "gateway URL")];
      default:
        return [`a supported provider (got "${c.smsProvider}")`];
    }
  })().filter(Boolean);
  return missing.length ? `SMS gateway needs: ${missing.join(", ")}` : null;
}

/** Build the HTTP request for one SMS. Pure, so it can be unit tested without a gateway. */
export function buildSmsRequest(c: SmsConfig, to: string, message: string): SmsRequest {
  const configError = smsConfigError(c);
  if (configError) throw new Error(configError);
  const digits = normalizePhone(to, c.smsCountryCode);
  if (!digits) throw new Error(`Invalid phone number: ${to}`);
  const e164 = `+${digits}`;

  switch (c.smsProvider as SmsProvider) {
    case "termii":
      return {
        url: `${trimSlash(c.smsBaseUrl || "https://api.ng.termii.com")}/api/sms/send`,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: c.smsApiKey,
          to: digits,
          from: c.smsSenderId,
          sms: message,
          type: "plain",
          channel: "generic",
        }),
      };
    case "africastalking": {
      const base =
        c.smsBaseUrl ||
        (c.smsUsername === "sandbox" ? "https://api.sandbox.africastalking.com" : "https://api.africastalking.com");
      return {
        url: `${trimSlash(base)}/version1/messaging`,
        method: "POST",
        headers: {
          apiKey: c.smsApiKey!,
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: form({ username: c.smsUsername, to: e164, message, from: c.smsSenderId }),
      };
    }
    case "twilio":
      return {
        url: `${trimSlash(c.smsBaseUrl || "https://api.twilio.com")}/2010-04-01/Accounts/${encodeURIComponent(
          c.smsUsername!
        )}/Messages.json`,
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${c.smsUsername}:${c.smsApiKey}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: form({ To: e164, From: c.smsSenderId, Body: message }),
      };
    case "http": {
      const values = {
        to: digits,
        to_e164: e164,
        message,
        sender: c.smsSenderId ?? "",
        apiKey: c.smsApiKey ?? "",
        username: c.smsUsername ?? "",
      };
      const method = c.smsHttpMethod === "GET" ? "GET" : "POST";
      const headers: Record<string, string> = {};
      for (const line of (c.smsHttpHeaders ?? "").split("\n")) {
        const i = line.indexOf(":");
        if (i > 0) headers[line.slice(0, i).trim()] = fillTemplate(line.slice(i + 1).trim(), values);
      }
      const req: SmsRequest = { url: fillTemplate(c.smsBaseUrl!, values, encodeURIComponent), method, headers };
      if (method === "POST" && c.smsHttpBody) {
        const json = c.smsHttpContentType !== "form";
        req.body = fillTemplate(c.smsHttpBody, values, json ? jsonEscape : encodeURIComponent);
        headers["Content-Type"] ??= json ? "application/json" : "application/x-www-form-urlencoded";
      }
      return req;
    }
  }
  throw new Error(`Unsupported SMS provider: ${c.smsProvider}`);
}

/**
 * Some gateways answer 2xx even when the message was rejected; look inside the body.
 * Returns an error message, or null if the gateway accepted it.
 */
export function smsResponseError(provider: string, status: number, text: string): string | null {
  if (status < 200 || status >= 300) return `Gateway HTTP ${status}: ${text.slice(0, 300)}`;
  if (provider === "africastalking") {
    try {
      const recipients: { status?: string }[] = JSON.parse(text)?.SMSMessageData?.Recipients ?? [];
      const ok = recipients.some((r) => r.status === "Success");
      if (!ok) return `Africa's Talking rejected the message: ${text.slice(0, 300)}`;
    } catch {
      return `Unexpected Africa's Talking response: ${text.slice(0, 300)}`;
    }
  }
  return null;
}

export async function sendSms(c: SmsConfig, to: string, message: string): Promise<void> {
  const req = buildSmsRequest(c, to, message);
  const res = await fetch(req.url, {
    method: req.method,
    headers: req.headers,
    body: req.body,
    signal: AbortSignal.timeout(15_000),
  });
  const text = await res.text();
  const error = smsResponseError(c.smsProvider, res.status, text);
  if (error) throw new Error(error);
}
