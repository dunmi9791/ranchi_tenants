/** Message text for each notification. Pure functions so they can be unit tested. */

export type PurchaseInfo = {
  brand: string;
  tenantName: string;
  meterNumber: string;
  kwhAmount: number;
  /** Energy + service fee, what the tenant paid */
  totalPaid: number;
  reference: string;
  stsPin?: string | null;
  errorMessage?: string | null;
  /** Link to the app, if APP_URL is set */
  appUrl?: string | null;
};

export type Rendered = { subject: string; text: string; html: string; sms: string };

const ngn = (n: number) => `NGN ${n.toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;

/** 20-digit STS token in groups of 4, the way meters display it. */
export function formatPin(pin: string): string {
  const digits = pin.replace(/\D/g, "");
  return digits.length >= 16 ? digits.match(/.{1,4}/g)!.join(" ") : pin;
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function html(lines: (string | [label: string, value: string])[]): string {
  const body = lines
    .map((l) =>
      typeof l === "string"
        ? `<p>${escapeHtml(l)}</p>`
        : `<tr><td style="padding:2px 12px 2px 0;color:#64748b">${escapeHtml(l[0])}</td><td style="padding:2px 0"><strong>${escapeHtml(l[1])}</strong></td></tr>`
    )
    .join("")
    .replace(/(<tr>.*?<\/tr>)+/g, (rows) => `<table style="border-collapse:collapse;margin:8px 0">${rows}</table>`);
  return `<div style="font-family:Arial,sans-serif;font-size:14px;color:#0f172a">${body}</div>`;
}

function text(lines: (string | [string, string])[]): string {
  return lines.map((l) => (typeof l === "string" ? l : `${l[0]}: ${l[1]}`)).join("\n");
}

export function vendSuccessMessage(p: PurchaseInfo): Rendered {
  const pin = formatPin(p.stsPin ?? "");
  const lines: (string | [string, string])[] = [
    `Hello ${p.tenantName},`,
    `Your electricity token is ready. Enter it on your meter keypad.`,
    ["Token", pin],
    ["Meter", p.meterNumber],
    ["Units", `${p.kwhAmount} kWh`],
    ["Amount paid", ngn(p.totalPaid)],
    ["Reference", p.reference],
    `Thank you, ${p.brand}`,
  ];
  return {
    subject: `Your electricity token for meter ${p.meterNumber}`,
    text: text(lines),
    html: html(lines),
    sms: `${p.brand}: Token for meter ${p.meterNumber}: ${pin} (${p.kwhAmount} kWh). Ref ${p.reference}`,
  };
}

export function vendFailedTenantMessage(p: PurchaseInfo): Rendered {
  const lines: (string | [string, string])[] = [
    `Hello ${p.tenantName},`,
    `We received your payment, but your electricity token could not be generated yet. Our team has been notified and will resolve it; you don't need to pay again.`,
    ["Meter", p.meterNumber],
    ["Units", `${p.kwhAmount} kWh`],
    ["Amount paid", ngn(p.totalPaid)],
    ["Reference", p.reference],
    `${p.brand}`,
  ];
  return {
    subject: `Your token for meter ${p.meterNumber} is delayed`,
    text: text(lines),
    html: html(lines),
    sms: `${p.brand}: Payment received for meter ${p.meterNumber} but the token is delayed. We're fixing it - no need to pay again. Ref ${p.reference}`,
  };
}

export function vendFailedAdminMessage(p: PurchaseInfo): Rendered {
  const link = p.appUrl ? `${p.appUrl.replace(/\/+$/, "")}/admin/purchases` : null;
  const lines: (string | [string, string])[] = [
    `A paid purchase failed to vend and needs attention.`,
    ["Tenant", p.tenantName],
    ["Meter", p.meterNumber],
    ["Units", `${p.kwhAmount} kWh`],
    ["Amount paid", ngn(p.totalPaid)],
    ["Reference", p.reference],
    ["Error", p.errorMessage || "unknown"],
    link ? `Retry or verify it on ${link}` : `Retry or verify it on Admin → Purchases.`,
  ];
  return {
    subject: `[${p.brand}] Vend FAILED for meter ${p.meterNumber}`,
    text: text(lines),
    html: html(lines),
    sms: `${p.brand} ALERT: vend failed for ${p.tenantName}, meter ${p.meterNumber}, ${p.kwhAmount} kWh, ref ${p.reference}. ${(
      p.errorMessage || ""
    ).slice(0, 60)}`,
  };
}

export type WelcomeInfo = {
  brand: string;
  tenantName: string;
  email: string;
  tempPassword: string;
  loginUrl: string;
  /** Admin accounts get admin wording instead of the tenant's */
  isAdmin?: boolean;
};

export function welcomeMessage(w: WelcomeInfo): Rendered {
  const lines: (string | [string, string])[] = [
    `Hello ${w.tenantName},`,
    w.isAdmin
      ? `An administrator account has been created for you on ${w.brand}. You can now manage tenants, meters, companies and purchases.`
      : `Your ${w.brand} account has been created. You can now buy electricity for your meter online.`,
    ["Login at", w.loginUrl],
    ["Email", w.email],
    ["Temporary password", w.tempPassword],
    `You'll be asked to choose a new password when you first log in. Don't share this password with anyone.`,
    `Welcome, ${w.brand}`,
  ];
  return {
    subject: `Welcome to ${w.brand}: your login details`,
    text: text(lines),
    html: html(lines),
    sms: `Welcome to ${w.brand}! Log in at ${w.loginUrl} with email ${w.email} and temporary password ${w.tempPassword}. You'll set a new password on first login.`,
  };
}

export function passwordResetMessage(w: WelcomeInfo): Rendered {
  const lines: (string | [string, string])[] = [
    `Hello ${w.tenantName},`,
    `Your ${w.brand} password has been reset by an administrator.`,
    ["Login at", w.loginUrl],
    ["Email", w.email],
    ["Temporary password", w.tempPassword],
    `You'll be asked to choose a new password when you log in. If you didn't ask for this, contact ${
      w.isAdmin ? "another administrator" : "your property manager"
    }.`,
    `${w.brand}`,
  ];
  return {
    subject: `${w.brand}: your password has been reset`,
    text: text(lines),
    html: html(lines),
    sms: `${w.brand}: your password was reset. Log in at ${w.loginUrl} with email ${w.email} and temporary password ${w.tempPassword}, then set a new one.`,
  };
}

export function testMessage(brand: string): Rendered {
  const lines = [`This is a test message from ${brand}.`, `If you can read this, notifications are set up correctly.`];
  return {
    subject: `${brand} test notification`,
    text: text(lines),
    html: html(lines),
    sms: `${brand}: test SMS. Notifications are set up correctly.`,
  };
}
