import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import {
  createCookieJar,
  cookieHeader,
  extractStsPin,
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
    expect(segs[0]).toBe("4801576293154826");
    expect(extractStsPin(raw)).toBe("4801576293154826");
  });

  it("parses comma-delimited vend response", () => {
    const raw = readFileSync(join(fixtures, "stron-vend-comma.txt"), "utf8");
    expect(extractStsPin(raw)).toBe("4801576293154826");
  });

  it("handles spaced STS tokens", () => {
    const raw = "4801 5762 9315 4826^^OK";
    expect(extractStsPin(raw)).toBe("4801 5762 9315 4826");
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
