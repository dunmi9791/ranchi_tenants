import { describe, expect, it } from "vitest";
import { blockedMessage, getAccountStatus, leaseEndsAt } from "../account";

const tenant = {
  role: "TENANT" as const,
  isPaused: false,
  pausedReason: null,
  leaseExpiryDate: null as Date | null,
};
// Lease dates are stored as midnight UTC of the chosen day (from <input type="date">).
const lease30Sep = new Date("2026-09-30T00:00:00Z");

describe("getAccountStatus", () => {
  it("is active with no lease date and not paused", () => {
    expect(getAccountStatus(tenant).state).toBe("active");
  });

  it("stays active through the whole expiry day in Lagos", () => {
    const lastMinute = new Date("2026-09-30T22:59:00Z"); // 23:59 WAT on 30 Sep
    expect(getAccountStatus({ ...tenant, leaseExpiryDate: lease30Sep }, lastMinute).state).toBe("active");
  });

  it("pauses automatically at midnight Lagos after the expiry day", () => {
    const midnight = new Date("2026-09-30T23:00:00Z"); // 00:00 WAT on 1 Oct
    const s = getAccountStatus({ ...tenant, leaseExpiryDate: lease30Sep }, midnight);
    expect(s.state).toBe("lease_expired");
    expect(leaseEndsAt(lease30Sep).toISOString()).toBe("2026-09-30T23:00:00.000Z");
  });

  it("manual pause wins over an active lease", () => {
    const s = getAccountStatus({ ...tenant, isPaused: true, pausedReason: "rent owed", leaseExpiryDate: lease30Sep },
      new Date("2026-09-01T00:00:00Z"));
    expect(s).toEqual({ state: "paused", reason: "rent owed" });
  });

  it("never pauses admins, even with an expired date or pause flag", () => {
    expect(getAccountStatus({ ...tenant, role: "ADMIN", isPaused: true, leaseExpiryDate: new Date(0) }).state)
      .toBe("active");
  });

  it("gives tenants a clear message only when blocked", () => {
    expect(blockedMessage({ state: "active" })).toBeNull();
    expect(blockedMessage({ state: "paused", reason: "x" })).toMatch(/paused/);
    expect(blockedMessage({ state: "lease_expired", leaseEndedAt: new Date() })).toMatch(/lease has expired/);
  });
});
