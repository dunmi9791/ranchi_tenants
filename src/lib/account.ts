import type { User } from "@prisma/client";

/** Leases run to the end of their expiry day in Lagos (UTC+1, no DST). */
const LAGOS_OFFSET_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export type AccountStatus =
  | { state: "active" }
  | { state: "paused"; reason: string | null }
  | { state: "lease_expired"; leaseEndedAt: Date };

/**
 * The instant a lease stops being valid: midnight (Lagos) after the expiry date.
 * leaseExpiryDate is stored as midnight UTC of the chosen calendar day.
 */
export function leaseEndsAt(leaseExpiryDate: Date): Date {
  return new Date(leaseExpiryDate.getTime() + DAY_MS - LAGOS_OFFSET_MS);
}

export function getAccountStatus(
  user: Pick<User, "role" | "isPaused" | "pausedReason" | "leaseExpiryDate">,
  now: Date = new Date()
): AccountStatus {
  // Admins are never paused — otherwise nobody could unpause anyone.
  if (user.role === "ADMIN") return { state: "active" };
  if (user.isPaused) return { state: "paused", reason: user.pausedReason };
  if (user.leaseExpiryDate) {
    const ends = leaseEndsAt(user.leaseExpiryDate);
    if (now >= ends) return { state: "lease_expired", leaseEndedAt: ends };
  }
  return { state: "active" };
}

/** Message shown to a tenant who can't log in. */
export function blockedMessage(status: AccountStatus): string | null {
  switch (status.state) {
    case "active":
      return null;
    case "paused":
      return "Your account has been paused. Please contact your property manager.";
    case "lease_expired":
      return "Your lease has expired, so your account is paused. Please contact your property manager to renew.";
  }
}
