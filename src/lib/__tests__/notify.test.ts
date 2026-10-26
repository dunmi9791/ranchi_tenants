import { describe, expect, it } from "vitest";
import { cleanPhone, normalizePhone, splitList } from "../notify/phone";
import { buildSmsRequest, fillTemplate, smsConfigError, smsResponseError, type SmsConfig } from "../notify/sms";
import { escapeHtml, formatPin, vendFailedAdminMessage, vendSuccessMessage, welcomeMessage, passwordResetMessage } from "../notify/templates";

const base: SmsConfig = {
  smsProvider: "termii",
  smsApiKey: "KEY",
  smsUsername: null,
  smsSenderId: "Ranchi",
  smsBaseUrl: null,
  smsHttpMethod: "POST",
  smsHttpContentType: "json",
  smsHttpBody: null,
  smsHttpHeaders: null,
  smsCountryCode: "234",
};

describe("phone numbers", () => {
  it("normalises Nigerian local and international formats", () => {
    expect(normalizePhone("0801 234 5678")).toBe("2348012345678");
    expect(normalizePhone("+234-801-234-5678")).toBe("2348012345678");
    expect(normalizePhone("002348012345678")).toBe("2348012345678");
    expect(normalizePhone("2348012345678")).toBe("2348012345678");
    expect(normalizePhone("0712345678", "+44")).toBe("44712345678");
  });

  it("rejects things that aren't phone numbers", () => {
    expect(cleanPhone("abc")).toBeNull();
    expect(cleanPhone("123")).toBeNull();
    expect(normalizePhone("")).toBeNull();
  });

  it("splits admin recipient lists", () => {
    expect(splitList(" a@x.com, b@x.com;\nc@x.com ,")).toEqual(["a@x.com", "b@x.com", "c@x.com"]);
    expect(splitList(null)).toEqual([]);
  });
});

describe("buildSmsRequest", () => {
  it("builds a Termii request with international digits", () => {
    const req = buildSmsRequest(base, "08012345678", "hi");
    expect(req.url).toBe("https://api.ng.termii.com/api/sms/send");
    expect(JSON.parse(req.body!)).toMatchObject({ api_key: "KEY", to: "2348012345678", from: "Ranchi", sms: "hi" });
  });

  it("uses a Termii base URL override", () => {
    const req = buildSmsRequest({ ...base, smsBaseUrl: "https://v3.api.termii.com/" }, "08012345678", "hi");
    expect(req.url).toBe("https://v3.api.termii.com/api/sms/send");
  });

  it("builds an Africa's Talking request (sandbox host for the sandbox user)", () => {
    const req = buildSmsRequest(
      { ...base, smsProvider: "africastalking", smsUsername: "sandbox", smsSenderId: null },
      "08012345678",
      "hi there"
    );
    expect(req.url).toBe("https://api.sandbox.africastalking.com/version1/messaging");
    expect(req.headers.apiKey).toBe("KEY");
    const body = new URLSearchParams(req.body);
    expect(body.get("to")).toBe("+2348012345678");
    expect(body.get("message")).toBe("hi there");
    expect(body.has("from")).toBe(false);
  });

  it("builds a Twilio request with basic auth", () => {
    const req = buildSmsRequest(
      { ...base, smsProvider: "twilio", smsUsername: "AC123", smsApiKey: "tok", smsSenderId: "+15550001111" },
      "08012345678",
      "hi"
    );
    expect(req.url).toBe("https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json");
    expect(req.headers.Authorization).toBe(`Basic ${Buffer.from("AC123:tok").toString("base64")}`);
    expect(new URLSearchParams(req.body).get("To")).toBe("+2348012345678");
  });

  it("fills a custom GET gateway URL with encoded values", () => {
    const req = buildSmsRequest(
      {
        ...base,
        smsProvider: "http",
        smsHttpMethod: "GET",
        smsBaseUrl: "https://gw.example.com/send?key={apiKey}&to={to}&msg={message}&from={sender}",
      },
      "08012345678",
      "Token: 1234 & more"
    );
    expect(req.method).toBe("GET");
    expect(req.body).toBeUndefined();
    const url = new URL(req.url);
    expect(url.searchParams.get("msg")).toBe("Token: 1234 & more");
    expect(url.searchParams.get("to")).toBe("2348012345678");
  });

  it("JSON-escapes values in a custom JSON body and fills headers", () => {
    const req = buildSmsRequest(
      {
        ...base,
        smsProvider: "http",
        smsBaseUrl: "https://gw.example.com/send",
        smsHttpBody: '{"to":"{to_e164}","text":"{message}"}',
        smsHttpHeaders: "Authorization: Bearer {apiKey}\nX-Unknown: {nope}",
      },
      "08012345678",
      'say "hi"\nbye'
    );
    expect(JSON.parse(req.body!)).toEqual({ to: "+2348012345678", text: 'say "hi"\nbye' });
    expect(req.headers.Authorization).toBe("Bearer KEY");
    expect(req.headers["X-Unknown"]).toBe("{nope}");
    expect(req.headers["Content-Type"]).toBe("application/json");
  });

  it("URL-encodes values in a custom form body", () => {
    const req = buildSmsRequest(
      { ...base, smsProvider: "http", smsBaseUrl: "https://gw.example.com", smsHttpContentType: "form", smsHttpBody: "to={to}&m={message}" },
      "08012345678",
      "a&b=c"
    );
    expect(new URLSearchParams(req.body).get("m")).toBe("a&b=c");
  });

  it("refuses incomplete settings and bad numbers", () => {
    expect(smsConfigError({ ...base, smsApiKey: null })).toMatch(/API key/);
    expect(smsConfigError({ ...base, smsProvider: "twilio", smsUsername: null })).toMatch(/Account SID/);
    expect(() => buildSmsRequest(base, "nope", "hi")).toThrow(/Invalid phone/);
  });
});

describe("smsResponseError", () => {
  it("fails on non-2xx", () => {
    expect(smsResponseError("termii", 401, "bad key")).toMatch(/401/);
  });
  it("checks Africa's Talking recipient status", () => {
    const ok = JSON.stringify({ SMSMessageData: { Recipients: [{ status: "Success" }] } });
    const bad = JSON.stringify({ SMSMessageData: { Recipients: [{ status: "InvalidPhoneNumber" }] } });
    expect(smsResponseError("africastalking", 201, ok)).toBeNull();
    expect(smsResponseError("africastalking", 201, bad)).toMatch(/rejected/);
  });
});

describe("templates", () => {
  const info = {
    brand: "Ranchi",
    tenantName: "Ada <b>",
    meterNumber: "04161234567",
    kwhAmount: 12.5,
    totalPaid: 2600,
    reference: "RT-1",
    stsPin: "12345678901234567890",
    errorMessage: "StronPower timeout",
    appUrl: "https://t.example.com/",
  };

  it("groups STS tokens in fours", () => {
    expect(formatPin("12345678901234567890")).toBe("1234 5678 9012 3456 7890");
    expect(formatPin("DRYRUN-1")).toBe("DRYRUN-1");
  });

  it("puts the token in the SMS and escapes HTML", () => {
    const m = vendSuccessMessage(info);
    expect(m.sms).toContain("1234 5678 9012 3456 7890");
    expect(m.sms).toContain("04161234567");
    expect(m.html).toContain("Ada &lt;b&gt;");
    expect(m.html).not.toContain("<b>");
  });

  it("links admins to the purchases page", () => {
    expect(vendFailedAdminMessage(info).text).toContain("https://t.example.com/admin/purchases");
  });

  it("escapes HTML special characters", () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
  });

  it.each([
    ["welcome", welcomeMessage],
    ["password reset", passwordResetMessage],
  ])("%s message has login URL, email and temporary password", (_, render) => {
    const m = render({
      brand: "Ranchi",
      tenantName: "Ada",
      email: "ada@example.com",
      tempPassword: "Xy7kP2qR9m",
      loginUrl: "https://t.example.com/login",
    });
    for (const part of [m.text, m.html, m.sms]) {
      expect(part).toContain("https://t.example.com/login");
      expect(part).toContain("ada@example.com");
      expect(part).toContain("Xy7kP2qR9m");
    }
  });

  it("fills only known placeholders", () => {
    expect(fillTemplate("{a}-{b}", { a: "1" })).toBe("1-{b}");
  });
});
