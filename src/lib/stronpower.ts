/**
 * StronPower STS vending client.
 * Secrets never leave the server. STRON_DRY_RUN=true skips live GenStoreVendingData.
 */

export type CompanyStronCreds = {
  stronBaseUrl: string;
  stronCompanyName: string;
  stronUsername: string;
  stronPassword: string;
};

export type CookieJar = Map<string, string>;

export function createCookieJar(): CookieJar {
  return new Map();
}

export function parseSetCookie(headers: Headers, jar: CookieJar): void {
  // Node fetch may expose getSetCookie(); fall back to set-cookie header
  const anyHeaders = headers as Headers & { getSetCookie?: () => string[] };
  const cookies =
    typeof anyHeaders.getSetCookie === "function"
      ? anyHeaders.getSetCookie()
      : (() => {
          const single = headers.get("set-cookie");
          return single ? [single] : [];
        })();

  for (const raw of cookies) {
    const part = raw.split(";")[0];
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const name = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (name) jar.set(name, value);
  }
}

export function cookieHeader(jar: CookieJar): string {
  return Array.from(jar.entries())
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

/** Extract ASP.NET antiforgery token from login HTML */
export function parseRequestVerificationToken(html: string): string | null {
  const patterns = [
    /name="__RequestVerificationToken"\s+type="hidden"\s+value="([^"]+)"/i,
    /name='__RequestVerificationToken'\s+type='hidden'\s+value='([^']+)'/i,
    /<input[^>]*name=["']__RequestVerificationToken["'][^>]*value=["']([^"']+)["']/i,
    /<input[^>]*value=["']([^"']+)["'][^>]*name=["']__RequestVerificationToken["']/i,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) return m[1];
  }
  return null;
}

/**
 * Parse StronPower ^^ delimited (or comma-delimited) responses.
 * PIN is typically the first segment after a successful vend.
 */
export function parseStronSegments(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  if (trimmed.includes("^^")) {
    return trimmed.split("^^").map((s) => s.trim()).filter(Boolean);
  }
  // Some environments return comma-separated fields
  if (trimmed.includes(",") && !trimmed.startsWith("<")) {
    return trimmed.split(",").map((s) => s.trim()).filter(Boolean);
  }
  return [trimmed];
}

export function extractStsPin(raw: string): string | null {
  const segments = parseStronSegments(raw);
  if (segments.length === 0) return null;
  // Prefer first segment that looks like an STS token (digits / spaces)
  for (const seg of segments) {
    const cleaned = seg.replace(/\s+/g, "");
    if (/^\d{8,}$/.test(cleaned)) {
      return seg.trim();
    }
  }
  // Fallback: first non-empty segment
  return segments[0] ?? null;
}

function normalizeBaseUrl(base: string): string {
  return base.replace(/\/+$/, "");
}

async function stronFetch(
  url: string,
  jar: CookieJar,
  init: RequestInit = {}
): Promise<{ text: string; headers: Headers; status: number }> {
  const headers = new Headers(init.headers);
  const cookie = cookieHeader(jar);
  if (cookie) headers.set("Cookie", cookie);
  if (!headers.has("User-Agent")) {
    headers.set(
      "User-Agent",
      "Mozilla/5.0 (compatible; RanchiTenants/1.0; +https://localhost)"
    );
  }

  const res = await fetch(url, { ...init, headers, redirect: "manual" });
  parseSetCookie(res.headers, jar);

  // Follow simple redirects while preserving cookies
  if ([301, 302, 303, 307, 308].includes(res.status)) {
    const loc = res.headers.get("location");
    if (loc) {
      const nextUrl = new URL(loc, url).toString();
      const method = res.status === 303 ? "GET" : (init.method ?? "GET");
      return stronFetch(nextUrl, jar, {
        method,
        headers: init.headers,
        body: method === "GET" || method === "HEAD" ? undefined : init.body,
      });
    }
  }

  const text = await res.text();
  parseSetCookie(res.headers, jar);
  return { text, headers: res.headers, status: res.status };
}

export async function stronLogin(creds: CompanyStronCreds): Promise<CookieJar> {
  const base = normalizeBaseUrl(creds.stronBaseUrl);
  const jar = createCookieJar();

  const loginPage = await stronFetch(`${base}/`, jar, { method: "GET" });
  const token = parseRequestVerificationToken(loginPage.text);
  if (!token) {
    throw new Error("StronPower: could not parse __RequestVerificationToken from login page");
  }

  const body = new URLSearchParams({
    Companyname: creds.stronCompanyName,
    Username: creds.stronUsername,
    Password: creds.stronPassword,
    __RequestVerificationToken: token,
  });

  const loginRes = await stronFetch(`${base}/`, jar, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Referer: `${base}/`,
    },
    body: body.toString(),
  });

  // Heuristic: failed login often still shows the login form
  if (
    loginRes.text.includes('name="__RequestVerificationToken"') &&
    (loginRes.text.toLowerCase().includes("invalid") ||
      loginRes.text.toLowerCase().includes("login"))
  ) {
    // Not always fatal — some dashboards still embed a token. Require cookies.
  }
  if (jar.size === 0) {
    throw new Error("StronPower: login produced no session cookies");
  }

  return jar;
}

export type VendingPreviewInput = {
  meterNumber: string;
  /** Amount in kWh (unit) */
  kwhAmount: number;
};

export async function genStepVendingUnitInfo(
  creds: CompanyStronCreds,
  jar: CookieJar,
  input: VendingPreviewInput
): Promise<string> {
  const base = normalizeBaseUrl(creds.stronBaseUrl);
  const body = new URLSearchParams({
    MeterNo: input.meterNumber,
    Amount: String(input.kwhAmount),
  });

  // Many Stron deployments also accept these aliases
  body.set("meterno", input.meterNumber);
  body.set("amount", String(input.kwhAmount));

  const res = await stronFetch(`${base}/en/Account/GenStepVendingUnitInfo`, jar, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "X-Requested-With": "XMLHttpRequest",
      Referer: `${base}/`,
    },
    body: body.toString(),
  });

  if (res.status >= 400) {
    throw new Error(`StronPower GenStepVendingUnitInfo HTTP ${res.status}: ${res.text.slice(0, 200)}`);
  }
  return res.text;
}

export async function genStoreVendingData(
  creds: CompanyStronCreds,
  jar: CookieJar,
  input: VendingPreviewInput & { previewRaw?: string }
): Promise<string> {
  if (process.env.STRON_DRY_RUN === "true") {
    // Deterministic dry-run PIN for tests / staging
    const fakePin = `DRYRUN${String(Math.floor(input.kwhAmount * 100)).padStart(12, "0")}`.slice(0, 20);
    return `${fakePin}^^OK^^${input.meterNumber}^^${input.kwhAmount}`;
  }

  const base = normalizeBaseUrl(creds.stronBaseUrl);
  const body = new URLSearchParams({
    MeterNo: input.meterNumber,
    Amount: String(input.kwhAmount),
  });
  body.set("meterno", input.meterNumber);
  body.set("amount", String(input.kwhAmount));
  if (input.previewRaw) {
    body.set("PreviewData", input.previewRaw);
  }

  const res = await stronFetch(`${base}/en/Account/GenStoreVendingData`, jar, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "X-Requested-With": "XMLHttpRequest",
      Referer: `${base}/`,
    },
    body: body.toString(),
  });

  if (res.status >= 400) {
    throw new Error(`StronPower GenStoreVendingData HTTP ${res.status}: ${res.text.slice(0, 200)}`);
  }
  return res.text;
}

/**
 * Full vend: login → preview → store. Returns raw store response + extracted PIN.
 * Never logs passwords.
 */
export async function vendStsPin(
  creds: CompanyStronCreds,
  input: VendingPreviewInput
): Promise<{ preview: string; store: string; pin: string | null }> {
  const jar = await stronLogin(creds);
  const preview = await genStepVendingUnitInfo(creds, jar, input);
  const store = await genStoreVendingData(creds, jar, { ...input, previewRaw: preview });
  const pin = extractStsPin(store);
  return { preview, store, pin };
}
