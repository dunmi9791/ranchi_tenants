import { describe, expect, it } from "vitest";
import { blockedMessage, getAccountStatus } from "../account";

const tenant = { role: "TENANT" as const, isPaused: false, pausedReason: null };

describe("getAccountStatus", () => {
  it("is active when not paused", () => {
    expect(getAccountStatus(tenant).state).toBe("active");
  });

  it("is paused with the admin's reason", () => {
    expect(getAccountStatus({ ...tenant, isPaused: true, pausedReason: "rent owed" })).toEqual({
      state: "paused",
      reason: "rent owed",
    });
  });

  it("never pauses admins", () => {
    expect(getAccountStatus({ ...tenant, role: "ADMIN", isPaused: true }).state).toBe("active");
  });

  it("gives tenants a clear message only when blocked", () => {
    expect(blockedMessage({ state: "active" })).toBeNull();
    expect(blockedMessage({ state: "paused", reason: "x" })).toMatch(/paused/);
  });
});
