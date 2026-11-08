"use client";

import { useRouter } from "next/navigation";
import { FormEvent, ReactNode, useState } from "react";
import type { PublicNotificationSettings } from "@/lib/notify";

type Provider = "termii" | "africastalking" | "twilio" | "http";

// Field labels per provider; null hides the field.
const PROVIDERS: Record<
  Provider,
  { label: string; apiKey: string; username: string | null; sender: string; baseUrl: string; help: string }
> = {
  termii: {
    label: "Termii",
    apiKey: "API key",
    username: null,
    sender: "Sender ID",
    baseUrl: "Base URL (optional, e.g. your account's https://v3.api.termii.com)",
    help: "Uses Termii's /api/sms/send on the generic channel. The sender ID must be approved in your Termii dashboard.",
  },
  africastalking: {
    label: "Africa's Talking",
    apiKey: "API key",
    username: "Username (\"sandbox\" for testing)",
    sender: "Sender ID / short code (optional)",
    baseUrl: "Base URL (optional)",
    help: "Uses the /version1/messaging API. With username \"sandbox\" messages go to the AT simulator.",
  },
  twilio: {
    label: "Twilio",
    apiKey: "Auth token",
    username: "Account SID",
    sender: "From number (+1…) or Messaging Service SID",
    baseUrl: "Base URL (optional)",
    help: "Sends through Twilio's Messages API.",
  },
  http: {
    label: "Custom HTTP gateway",
    apiKey: "API key / token (as {apiKey})",
    username: "Username (as {username}, optional)",
    sender: "Sender ID (as {sender}, optional)",
    baseUrl: "Gateway URL",
    help:
      "For any other provider (BulkSMSNigeria, Multitexter, SMSLive247, …). Placeholders work in the URL, body and headers: " +
      "{to} = 2348012345678, {to_e164} = +2348012345678, {message}, {sender}, {apiKey}, {username}. " +
      "Any HTTP 2xx response counts as sent.",
  },
};

const input = "mt-1 w-full rounded-md border border-slate-300 px-3 py-2";

function Field({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <label className={`block text-sm ${wide ? "sm:col-span-2" : ""}`}>
      <span className="font-medium">{label}</span>
      {children}
    </label>
  );
}

function Check({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <label className="flex items-start gap-2 text-sm">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5" />
      <span>{children}</span>
    </label>
  );
}

function SecretField({
  label,
  isSet,
  value,
  clear,
  onChange,
  onClear,
}: {
  label: string;
  isSet: boolean;
  value: string;
  clear: boolean;
  onChange: (v: string) => void;
  onClear: (v: boolean) => void;
}) {
  return (
    <div className="text-sm">
      <Field label={label}>
        <input
          type="password"
          autoComplete="new-password"
          value={value}
          disabled={clear}
          placeholder={isSet ? "•••••••• saved; leave blank to keep" : ""}
          onChange={(e) => onChange(e.target.value)}
          className={input}
        />
      </Field>
      {isSet && (
        <label className="mt-1 flex items-center gap-1 text-xs text-slate-500">
          <input type="checkbox" checked={clear} onChange={(e) => onClear(e.target.checked)} /> Remove saved value
        </label>
      )}
    </div>
  );
}

function TestSend({ channel, placeholder }: { channel: "EMAIL" | "SMS"; placeholder: string }) {
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  async function send() {
    setBusy(true);
    setResult(null);
    const res = await fetch("/api/admin/settings/notifications/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel, to }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    setResult(res.ok ? { ok: true, msg: "Sent. Check that it arrived." } : { ok: false, msg: data.error || "Failed" });
  }

  return (
    <div className="rounded-md bg-slate-50 p-3 text-sm sm:col-span-2">
      <p className="mb-2 text-xs text-slate-600">Send a test using the saved settings (save first).</p>
      <div className="flex flex-wrap gap-2">
        <input
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder={placeholder}
          className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-1.5"
        />
        <button
          type="button"
          onClick={send}
          disabled={busy || !to.trim()}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 hover:bg-slate-100 disabled:opacity-60"
        >
          {busy ? "Sending…" : `Send test ${channel === "EMAIL" ? "email" : "SMS"}`}
        </button>
      </div>
      {result && (
        <p className={`mt-2 break-words text-xs ${result.ok ? "text-emerald-700" : "text-red-600"}`}>{result.msg}</p>
      )}
    </div>
  );
}

export function NotificationSettingsForm({ initial }: { initial: PublicNotificationSettings }) {
  const router = useRouter();
  const [s, setS] = useState(initial);
  const [secrets, setSecrets] = useState({ smtpPassword: "", smsApiKey: "", clearSmtpPassword: false, clearSmsApiKey: false });
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);

  const set = <K extends keyof PublicNotificationSettings>(key: K, value: PublicNotificationSettings[K]) =>
    setS((prev) => ({ ...prev, [key]: value }));
  const provider = PROVIDERS[s.smsProvider as Provider] ?? PROVIDERS.termii;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSaved(false);
    const res = await fetch("/api/admin/settings/notifications", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...s, ...secrets }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(data.error || "Save failed");
      return;
    }
    setS(data.settings);
    setSecrets({ smtpPassword: "", smsApiKey: "", clearSmtpPassword: false, clearSmsApiKey: false });
    setSaved(true);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6 rounded-xl border bg-white p-5 shadow-sm">
      <div>
        <h2 className="text-lg font-semibold">Notifications</h2>
        <p className="text-sm text-slate-600">
          Email and SMS sent to tenants when their token is ready or delayed, and alerts to admins when a paid
          purchase fails to vend. Tenants get SMS at the phone number on their tenant record.
        </p>
      </div>

      <section className="space-y-2">
        <h3 className="font-medium">When to notify</h3>
        <Check checked={s.notifyTenantOnWelcome} onChange={(v) => set("notifyTenantOnWelcome", v)}>
          Welcome new tenants (created by an admin) with the login link, their email and temporary password
        </Check>
        <Check checked={s.notifyTenantOnPasswordReset} onChange={(v) => set("notifyTenantOnPasswordReset", v)}>
          Send tenants their new temporary password when an admin resets it
        </Check>
        <Check checked={s.notifyTenantOnVend} onChange={(v) => set("notifyTenantOnVend", v)}>
          Send the tenant their token when it is generated
        </Check>
        <Check checked={s.notifyTenantOnFailure} onChange={(v) => set("notifyTenantOnFailure", v)}>
          Tell the tenant when payment succeeded but the token is delayed (once per purchase)
        </Check>
        <Check checked={s.notifyAdminOnFailure} onChange={(v) => set("notifyAdminOnFailure", v)}>
          Alert admins when a paid purchase fails to vend
        </Check>
        <div className="grid gap-3 pt-1 sm:grid-cols-2">
          <Field label="Admin alert emails (comma-separated)">
            <input value={s.adminAlertEmails} onChange={(e) => set("adminAlertEmails", e.target.value)} className={input} />
          </Field>
          <Field label="Admin alert phones (comma-separated)">
            <input value={s.adminAlertPhones} onChange={(e) => set("adminAlertPhones", e.target.value)} className={input} />
          </Field>
        </div>
      </section>

      <section className="space-y-3 border-t pt-5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-medium">Email (SMTP)</h3>
          <Check checked={s.emailEnabled} onChange={(v) => set("emailEnabled", v)}>
            Enabled
          </Check>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="SMTP host">
            <input value={s.smtpHost} onChange={(e) => set("smtpHost", e.target.value)} placeholder="smtp.gmail.com" className={input} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Port">
              <input
                type="number"
                min={1}
                max={65535}
                required
                value={s.smtpPort}
                onChange={(e) => {
                  const port = Number(e.target.value);
                  setS((prev) => ({ ...prev, smtpPort: port, smtpSecure: port === 465 ? true : port === 587 ? false : prev.smtpSecure }));
                }}
                className={input}
              />
            </Field>
            <Field label="Encryption">
              <select
                value={s.smtpSecure ? "ssl" : "starttls"}
                onChange={(e) => set("smtpSecure", e.target.value === "ssl")}
                className={input}
              >
                <option value="starttls">STARTTLS (587)</option>
                <option value="ssl">SSL/TLS (465)</option>
              </select>
            </Field>
          </div>
          <Field label="Username">
            <input value={s.smtpUser} autoComplete="off" onChange={(e) => set("smtpUser", e.target.value)} className={input} />
          </Field>
          <SecretField
            label="Password"
            isSet={s.hasSmtpPassword}
            value={secrets.smtpPassword}
            clear={secrets.clearSmtpPassword}
            onChange={(v) => setSecrets({ ...secrets, smtpPassword: v })}
            onClear={(v) => setSecrets({ ...secrets, clearSmtpPassword: v })}
          />
          <Field label="From address">
            <input
              type="email"
              value={s.smtpFromEmail}
              onChange={(e) => set("smtpFromEmail", e.target.value)}
              placeholder="no-reply@example.com"
              className={input}
            />
          </Field>
          <Field label="Sender name (also starts each SMS)">
            <input value={s.smtpFromName} onChange={(e) => set("smtpFromName", e.target.value)} placeholder="Ranchi Tenants" className={input} />
          </Field>
          <TestSend channel="EMAIL" placeholder="you@example.com" />
        </div>
      </section>

      <section className="space-y-3 border-t pt-5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-medium">SMS gateway</h3>
          <Check checked={s.smsEnabled} onChange={(v) => set("smsEnabled", v)}>
            Enabled
          </Check>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Provider">
            <select value={s.smsProvider} onChange={(e) => set("smsProvider", e.target.value)} className={input}>
              {(Object.keys(PROVIDERS) as Provider[]).map((p) => (
                <option key={p} value={p}>
                  {PROVIDERS[p].label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Country code for numbers starting with 0">
            <input value={s.smsCountryCode} onChange={(e) => set("smsCountryCode", e.target.value)} className={input} />
          </Field>
          <p className="text-xs text-slate-500 sm:col-span-2">{provider.help}</p>
          <SecretField
            label={provider.apiKey}
            isSet={s.hasSmsApiKey}
            value={secrets.smsApiKey}
            clear={secrets.clearSmsApiKey}
            onChange={(v) => setSecrets({ ...secrets, smsApiKey: v })}
            onClear={(v) => setSecrets({ ...secrets, clearSmsApiKey: v })}
          />
          {provider.username && (
            <Field label={provider.username}>
              <input value={s.smsUsername} autoComplete="off" onChange={(e) => set("smsUsername", e.target.value)} className={input} />
            </Field>
          )}
          <Field label={provider.sender}>
            <input value={s.smsSenderId} onChange={(e) => set("smsSenderId", e.target.value)} className={input} />
          </Field>
          <Field label={provider.baseUrl} wide={s.smsProvider === "http"}>
            <input
              value={s.smsBaseUrl}
              onChange={(e) => set("smsBaseUrl", e.target.value)}
              placeholder={
                s.smsProvider === "http" ? "https://gateway.example.com/api/send?apikey={apiKey}&to={to}&msg={message}" : ""
              }
              className={input}
            />
          </Field>
          {s.smsProvider === "http" && (
            <>
              <Field label="Method">
                <select value={s.smsHttpMethod} onChange={(e) => set("smsHttpMethod", e.target.value)} className={input}>
                  <option value="POST">POST</option>
                  <option value="GET">GET</option>
                </select>
              </Field>
              {s.smsHttpMethod === "POST" && (
                <Field label="Body format">
                  <select
                    value={s.smsHttpContentType}
                    onChange={(e) => set("smsHttpContentType", e.target.value)}
                    className={input}
                  >
                    <option value="json">JSON</option>
                    <option value="form">Form (x-www-form-urlencoded)</option>
                  </select>
                </Field>
              )}
              {s.smsHttpMethod === "POST" && (
                <Field label="Body template" wide>
                  <textarea
                    rows={4}
                    value={s.smsHttpBody}
                    onChange={(e) => set("smsHttpBody", e.target.value)}
                    placeholder={
                      s.smsHttpContentType === "form"
                        ? "username={username}&apikey={apiKey}&sender={sender}&recipient={to}&message={message}"
                        : '{"api_key":"{apiKey}","from":"{sender}","to":"{to}","body":"{message}"}'
                    }
                    className={`${input} font-mono text-xs`}
                  />
                </Field>
              )}
              <Field label="Extra headers (one “Name: value” per line)" wide>
                <textarea
                  rows={2}
                  value={s.smsHttpHeaders}
                  onChange={(e) => set("smsHttpHeaders", e.target.value)}
                  placeholder="Authorization: Bearer {apiKey}"
                  className={`${input} font-mono text-xs`}
                />
              </Field>
            </>
          )}
          <TestSend channel="SMS" placeholder="08012345678" />
        </div>
      </section>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {saved && <p className="text-sm text-emerald-700">Notification settings saved.</p>}
      <button
        type="submit"
        disabled={loading}
        className="rounded-md bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
      >
        {loading ? "Saving…" : "Save notification settings"}
      </button>
    </form>
  );
}
