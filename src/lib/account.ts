import type { User } from "@prisma/client";

export type AccountStatus = { state: "active" } | { state: "paused"; reason: string | null };

/**
 * Only a manual pause blocks login. An expired lease stops top-ups on that unit's meters
 * (see lib/tenancy.ts) but the tenant can still sign in, e.g. to pay rent or see their tokens.
 */
export function getAccountStatus(
  user: Pick<User, "role" | "isPaused" | "pausedReason">
): AccountStatus {
  // Admins are never paused — otherwise nobody could unpause anyone.
  if (user.role === "ADMIN") return { state: "active" };
  if (user.isPaused) return { state: "paused", reason: user.pausedReason };
  return { state: "active" };
}

/** Message shown to a tenant who can't log in. */
export function blockedMessage(status: AccountStatus): string | null {
  switch (status.state) {
    case "active":
      return null;
    case "paused":
      return "Your account has been paused. Please contact your property manager.";
  }
}
