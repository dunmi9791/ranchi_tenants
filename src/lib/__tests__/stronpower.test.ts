import { readFileSync } from "fs";
import { join } from "path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createCookieJar,
  cookieHeader,
  buildPreviewParams,
  buildStoreParams,
  extractStsPin,
  parsePreview,
  stronLogin,
  vendStsPin,
  parseRequestVerificationToken,
  parseSetCookie,
  parseStronSegments,
} from "../stronpower";

const fixtures = join(__dirname, "../__fixtures__");

describe("parseRequestVerificationToken", () => {
  it("extracts token from login HTML fixture", () => {
    const html = readFileSync(join(fixtures, "stron-login.html"), "utf8");
    expect(parseRequestVerificationToken(html)).toBe("TOKEN_ABC_123XYZ");
  });

  it("returns null when missing", () => {
    expect(parseRequestVerificationToken("<html></html>")).toBeNull();
  });
});

describe("parseStronSegments / extractStsPin", () => {
  it("parses ^^ delimited vend response and extracts PIN", () => {
    const raw = readFileSync(join(fixtures, "stron-vend-ok.txt"), "utf8");
    const segs = parseStronSegments(raw);
    expect(segs[0]).toBe("48015762931548261234");
    expect(extractStsPin(raw)).toBe("48015762931548261234");
  });

  it("parses comma-delimited vend response", () => {
    const raw = readFileSync(join(fixtures, "stron-vend-comma.txt"), "utf8");
    expect(extractStsPin(raw)).toBe("48015762931548261234");
  });

  it("handles spaced STS tokens", () => {
    const raw = "4801 5762 9315 4826 1234^^2026-09-26 15:04:11";
    expect(extractStsPin(raw)).toBe("4801 5762 9315 4826 1234");
  });

  it("never returns error text or non-token numbers as a PIN", () => {
    expect(extractStsPin("Meter not found^^0")).toBeNull();
    expect(extractStsPin("<!DOCTYPE html><html>Runtime Error</html>")).toBeNull();
    expect(extractStsPin("58103835532^^10")).toBeNull(); // 11-digit meter number
    expect(extractStsPin("")).toBeNull();
  });
});

describe("cookie jar", () => {
  it("stores Set-Cookie pairs", () => {
    const jar = createCookieJar();
    const headers = new Headers();
    // Simulate via append — Node Headers supports getSetCookie when constructed carefully;
    // we also accept single set-cookie.
    Object.defineProperty(headers, "getSetCookie", {
      value: () => [
        "ASP.NET_SessionId=abc123; path=/; HttpOnly",
        ".AspNet.ApplicationCookie=xyz; path=/",
      ],
    });
    parseSetCookie(headers, jar);
    expect(cookieHeader(jar)).toContain("ASP.NET_SessionId=abc123");
    expect(cookieHeader(jar)).toContain(".AspNet.ApplicationCookie=xyz");
  });
});

describe("stronLogin", () => {
  afterEach(() => vi.unstubAllGlobals());

  const creds = {
    stronBaseUrl: "https://stron.test/",
    stronCompanyName: "Co",
    stronUsername: "user",
    stronPassword: "pw",
  };
  const loginHtml = readFileSync(join(fixtures, "stron-login.html"), "utf8");

  function stubFetch(postCookies: string[], postStatus: number) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        const isPost = init?.method === "POST";
        const cookies = isPost ? postCookies : ["__RequestVerificationToken=abc; path=/"];
        const res = new Response(isPost ? "<html>login form</html>" : loginHtml, {
          status: isPost ? postStatus : 200,
        });
        Object.defineProperty(res.headers, "getSetCookie", { value: () => cookies });
        return res;
      })
    );
  }

  it("rejects a failed login even though the login page set a cookie", async () => {
    stubFetch([], 200);
    await expect(stronLogin(creds)).rejects.toThrow(/login rejected/);
  });

  it("accepts a login that issues .ASPXAUTH", async () => {
    stubFetch([".ASPXAUTH=secret; path=/; HttpOnly"], 200);
    const jar = await stronLogin(creds);
    expect(jar.has(".ASPXAUTH")).toBe(true);
  });
});

// Captured from StronPower's own "Unit" vending dialog (server-new.stronpower.com, 2026-09-26).
describe("vending request builders", () => {
  const row = {
    CUST_ID: "CTS-00049",
    METER_ID: "58103835532",
    Categories: "PRICE LIST",
    SStation_ID: "Sta-00001",
    UNIT: "NAIRA",
    PRICE: "800.00",
    TotalUnit: "20.00 kWh",
    METER_TYPE: "Energy Meter",
  };
  const preview = readFileSync(join(fixtures, "stron-preview-ok.txt"), "utf8");

  it("builds the preview form exactly as the StronPower UI sends it", () => {
    expect(buildPreviewParams(row, 10)).toEqual({
      customerIdT: "CTS-00049",
      meterIdT: "58103835532",
      priceT: "PRICE LIST^20.00 kWh",
      amount: "10",
      amountTmp: "10 NAIRA/10 kWh",
      disCount: "",
      debtRatio: "0",
      sourceTmp: "",
    });
  });

  it("builds the store form from the preview exactly as the StronPower UI sends it", () => {
    expect(buildStoreParams(row, 10, parsePreview(preview))).toEqual({
      TokenTime: "2026/9/26 16:05:51",
      DailyCharges: "0",
      DailyChargesDebtNew: "0",
      meterTypeInt: "0",
      varTranNum: "651",
      DebtBalance1: "0.00",
      varPaymentDebtValue: "0.00",
      TranDisplay: "GA651",
      varNetValue: "8000.00",
      varExDuty: "0.00",
      excise_duty: "0",
      varVat: "0.00",
      Categories1: "PRICE LIST",
      newAmountTmp3: "8000.00 NAIRA/10 kWh",
      customerIdT: "CTS-00049",
      meterIdT: "58103835532",
      priceT: "PRICE LIST^0.00 kWh",
      rateT: "0",
      amount: "10",
      amountTmp: "8000.00 NAIRA/10 kWh",
      payType: "Cash",
      SStation_Id: "Sta-00001",
      disCount: "",
      debtRatio: "0",
      sourceTmp: "",
    });
  });

  it("rejects a short/empty preview (e.g. the NaN-amount failure)", () => {
    expect(() => parsePreview("")).toThrow(/expected 45\+ fields/);
  });
});

describe("vendStsPin safety checks", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  const creds = {
    stronBaseUrl: "https://stron.test",
    stronCompanyName: "GraceApartments",
    stronUsername: "u",
    stronPassword: "p",
  };
  const loginHtml = readFileSync(join(fixtures, "stron-login.html"), "utf8");
  const preview = readFileSync(join(fixtures, "stron-preview-ok.txt"), "utf8");
  const row = {
    CUST_ID: "CTS-00049", METER_ID: "58103835532", Categories: "PRICE LIST", SStation_ID: "Sta-00001",
    UNIT: "NAIRA", PRICE: "800.00", VAT: "0.00", TotalUnit: "20.00 kWh", METER_TYPE: "Energy Meter",
  };

  /** Fake StronPower: records which endpoints were hit. */
  function fakeStron(storeBody = "36891427335219798175^^2026/9/26 16:19:59") {
    const hits: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        const path = new URL(url).pathname;
        hits.push(path);
        let body = "";
        let cookies: string[] = [];
        if (path === "/" && init?.method !== "POST") { body = loginHtml; cookies = ["__RequestVerificationToken=a"]; }
        else if (path === "/") { cookies = [".ASPXAUTH=x"]; body = "ok"; }
        else if (path.endsWith("GetStepVending")) body = JSON.stringify({ total: 1, rows: [row] });
        else if (path.endsWith("GenStepVendingUnitInfo")) body = preview;
        else if (path.endsWith("GenStoreVendingData")) body = storeBody;
        const res = new Response(body, { status: 200 });
        Object.defineProperty(res.headers, "getSetCookie", { value: () => cookies });
        return res;
      })
    );
    return hits;
  }

  it("vends and extracts the token when the preview matches", async () => {
    const hits = fakeStron();
    const before: string[] = [];
    const r = await vendStsPin(creds, { meterNumber: "58103835532", kwhAmount: 10 }, {
      expectedTotal: 8000,
      beforeStore: async () => { before.push("called"); },
    });
    expect(r.pin).toBe("36891427335219798175");
    expect(before).toEqual(["called"]);
    expect(hits).toContain("/en/Account/GenStoreVendingData");
  });

  it("refuses to store when StronPower's price differs from what was paid", async () => {
    const hits = fakeStron();
    await expect(
      vendStsPin(creds, { meterNumber: "58103835532", kwhAmount: 10 }, { expectedTotal: 1050 })
    ).rejects.toThrow(/price changed/);
    expect(hits).not.toContain("/en/Account/GenStoreVendingData");
  });

  it("refuses to store when the preview is for different units", async () => {
    const hits = fakeStron();
    await expect(vendStsPin(creds, { meterNumber: "58103835532", kwhAmount: 6.2 })).rejects.toThrow(
      /preview mismatch/
    );
    expect(hits).not.toContain("/en/Account/GenStoreVendingData");
  });

  it("treats a login-page response (expired session) as an error, not a PIN", async () => {
    fakeStron(loginHtml);
    await expect(vendStsPin(creds, { meterNumber: "58103835532", kwhAmount: 10 })).rejects.toThrow(
      /logged out/
    );
  });
});
