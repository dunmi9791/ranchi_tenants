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

/** STS tokens are 20 digits; StronPower may group them with spaces or dashes. */
export function isStsToken(value: string): boolean {
  return /^\d{20}$/.test(value.replace(/[\s-]/g, ""));
}

/**
 * Extract the STS token from a GenStoreVendingData response (`token^^date`).
 * Returns null unless a segment is a real 20-digit token — never falls back to
 * arbitrary text, so error messages can't be stored as a PIN.
 */
export function extractStsPin(raw: string): string | null {
  for (const seg of parseStronSegments(raw)) {
    if (isStsToken(seg)) return seg.trim();
  }
  return null;
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

  // The login page sets a __RequestVerificationToken cookie on the first GET,
  // so "got some cookies" proves nothing. A real login redirects and issues
  // the .ASPXAUTH forms-auth cookie.
  if (!jar.has(".ASPXAUTH")) {
    throw new Error(
      `StronPower: login rejected (HTTP ${loginRes.status}) — check company name, username and password`
    );
  }

  return jar;
}

export type VendingPreviewInput = {
  meterNumber: string;
  /** Amount in kWh (unit) */
  kwhAmount: number;
};

/** A row from StronPower's vending grid (GetStepVending). */
export type StronMeterRow = {
  CUST_ID: string;
  METER_ID: string;
  Categories: string;
  SStation_ID: string;
  UNIT: string;
  PRICE: string;
  /** VAT % */
  VAT?: string;
  TotalUnit: string;
  METER_TYPE: string;
};

/**
 * Fields of the GenStepVendingUnitInfo preview response (`^^`-separated),
 * mapped from StronPower's own vending page. Only the ones we use are named.
 */
export const PREVIEW = {
  tokenTime: 1,
  units: 2,
  salesStation: 6,
  tranDisplay: 10,
  totalPaid: 12,
  vat: 26,
  exciseDuty: 27,
  netValue: 28,
  paymentDebtValue: 34,
  debtBalance: 35,
  amountTmp: 36,
  categories: 37,
  exciseDutyInt: 38,
  rate: 39,
  tranNum: 40,
  meterTypeInt: 41,
  dailyCharges: 42,
  dailyChargesDebtNew: 43,
  reTotalUnit: 44,
} as const;

const PREVIEW_MIN_FIELDS = 45;

function formatKwh(kwh: number): string {
  // Match what the StronPower UI sends: "10", "10.5" — never "10.00" or exponent form.
  return String(Number(kwh.toFixed(2)));
}

async function stronAjax(
  creds: CompanyStronCreds,
  jar: CookieJar,
  path: string,
  params: Record<string, string>
): Promise<string> {
  const base = normalizeBaseUrl(creds.stronBaseUrl);
  const res = await stronFetch(`${base}${path}`, jar, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest",
      Referer: `${base}/en/Home/Index`,
    },
    body: new URLSearchParams(params).toString(),
  });
  const name = path.split("/").pop();
  if (res.status >= 400) {
    throw new Error(`StronPower ${name} HTTP ${res.status}: ${res.text.slice(0, 200)}`);
  }
  // An expired/invalid session is redirected to the login page (HTTP 200 HTML).
  if (/name=["']Password["']/i.test(res.text) || /stylelogin\.css/i.test(res.text)) {
    throw new Error(`StronPower ${name}: session was logged out`);
  }
  return res.text;
}

/** Look up the meter's customer/tariff row, as the vending grid does. */
export async function getMeterRow(
  creds: CompanyStronCreds,
  jar: CookieJar,
  meterNumber: string
): Promise<StronMeterRow> {
  const text = await stronAjax(creds, jar, "/en/Account/GetStepVending", {
    page: "1",
    rows: "50",
    searchKey: meterNumber,
  });
  let rows: StronMeterRow[];
  try {
    rows = (JSON.parse(text) as { rows?: StronMeterRow[] }).rows ?? [];
  } catch {
    throw new Error(`StronPower GetStepVending: unexpected response: ${text.slice(0, 200)}`);
  }
  const row = rows.find((r) => r.METER_ID === meterNumber);
  if (!row) throw new Error(`StronPower: meter ${meterNumber} not found for this company`);
  return row;
}

/** Build the preview (GenStepVendingUnitInfo) form, as the "Unit" vending dialog sends it. */
export function buildPreviewParams(row: StronMeterRow, kwhAmount: number): Record<string, string> {
  const kwh = formatKwh(kwhAmount);
  return {
    customerIdT: row.CUST_ID,
    meterIdT: row.METER_ID,
    priceT: `${row.Categories}^${row.TotalUnit}`,
    amount: kwh,
    amountTmp: `${kwh} ${row.UNIT}/${kwh} kWh`,
    disCount: "",
    debtRatio: "0",
    sourceTmp: "",
  };
}

export function parsePreview(raw: string): string[] {
  const f = raw.split("^^");
  if (f.length < PREVIEW_MIN_FIELDS) {
    throw new Error(
      `StronPower preview: expected ${PREVIEW_MIN_FIELDS}+ fields, got ${f.length}: ${raw.slice(0, 200)}`
    );
  }
  return f;
}

/** Build the store (GenStoreVendingData) form from the preview, as "Confirm Payment" sends it. */
export function buildStoreParams(
  row: StronMeterRow,
  kwhAmount: number,
  f: string[]
): Record<string, string> {
  return {
    TokenTime: f[PREVIEW.tokenTime],
    DailyCharges: f[PREVIEW.dailyCharges],
    DailyChargesDebtNew: f[PREVIEW.dailyChargesDebtNew],
    meterTypeInt: f[PREVIEW.meterTypeInt],
    varTranNum: f[PREVIEW.tranNum],
    DebtBalance1: f[PREVIEW.debtBalance],
    varPaymentDebtValue: f[PREVIEW.paymentDebtValue],
    TranDisplay: f[PREVIEW.tranDisplay],
    varNetValue: f[PREVIEW.netValue],
    varExDuty: f[PREVIEW.exciseDuty],
    excise_duty: f[PREVIEW.exciseDutyInt],
    varVat: f[PREVIEW.vat],
    Categories1: f[PREVIEW.categories],
    newAmountTmp3: f[PREVIEW.amountTmp],
    customerIdT: row.CUST_ID,
    meterIdT: row.METER_ID,
    priceT: `${f[PREVIEW.categories]}^${f[PREVIEW.reTotalUnit]}`,
    rateT: f[PREVIEW.rate],
    amount: formatKwh(kwhAmount),
    amountTmp: f[PREVIEW.amountTmp],
    payType: "Cash",
    SStation_Id: f[PREVIEW.salesStation],
    disCount: "",
    debtRatio: "0",
    sourceTmp: "",
  };
}

/**
 * Full vend: login → meter lookup → preview → store, all in one session
 * (StronPower expires idle sessions quickly). Never logs passwords.
 */
export async function vendStsPin(
  creds: CompanyStronCreds,
  input: VendingPreviewInput,
  opts: {
    /** If set, refuse to store unless StronPower's preview total equals this (NGN). */
    expectedTotal?: number;
    /** Called right before the store request — after this a token may exist on StronPower. */
    beforeStore?: (preview: string) => Promise<void>;
  } = {}
): Promise<{ preview: string; store: string; pin: string | null; totalPaid: string }> {
  const jar = await stronLogin(creds);
  const row = await getMeterRow(creds, jar, input.meterNumber);

  const preview = await stronAjax(
    creds,
    jar,
    "/en/Account/GenStepVendingUnitInfo",
    buildPreviewParams(row, input.kwhAmount)
  );
  const f = parsePreview(preview);

  // Refuse to store unless the preview is for exactly what was paid for.
  if (Number(f[PREVIEW.units]) !== Number(formatKwh(input.kwhAmount))) {
    throw new Error(
      `StronPower preview mismatch: asked for ${input.kwhAmount} kWh, preview says ${f[PREVIEW.units]}`
    );
  }

  if (
    opts.expectedTotal != null &&
    Math.abs(Number(f[PREVIEW.totalPaid]) - opts.expectedTotal) > 0.01
  ) {
    throw new Error(
      `StronPower price changed: preview total ₦${f[PREVIEW.totalPaid]} for ${f[PREVIEW.units]} kWh, tenant paid ₦${opts.expectedTotal}`
    );
  }

  await opts.beforeStore?.(preview);

  let store: string;
  if (process.env.STRON_DRY_RUN === "true") {
    // Deterministic 20-digit dry-run token (prefix 99); skips the live store call.
    const fakePin = `99${String(Math.round(input.kwhAmount * 100)).padStart(18, "0")}`;
    store = `${fakePin}^^${new Date().toISOString().slice(0, 19).replace("T", " ")}`;
  } else {
    store = await stronAjax(
      creds,
      jar,
      "/en/Account/GenStoreVendingData",
      buildStoreParams(row, input.kwhAmount, f)
    );
  }

  return { preview, store, pin: extractStsPin(store), totalPaid: f[PREVIEW.totalPaid] };
}
