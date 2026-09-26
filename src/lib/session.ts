import { getIronSession, SessionOptions } from "iron-session";
import { cookies } from "next/headers";
import type { Role } from "@prisma/client";
import { blockedMessage, getAccountStatus } from "./account";
import { prisma } from "./prisma";

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
  companyId: string | null;
  /** Must match User.sessionVersion; bumped on pause / password reset. Missing = 0. */
  sessionVersion?: number;
  mustChangePassword?: boolean;
};

export type SessionData = {
  user?: SessionUser;
};

export const sessionOptions: SessionOptions = {
  password: process.env.SESSION_SECRET || "complex_password_at_least_32_characters_long",
  cookieName: "ranchi_session",
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7,
  },
};

const blockedReasons = new WeakMap<object, string>();

/**
 * Load the session and re-check the account on every request, so pausing a tenant,
 * an expired lease, or a password reset takes effect immediately rather than when the
 * 7-day cookie expires. A rejected session is logged out in memory for this request;
 * getBlockedReason() says why.
 */
export async function getSession() {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
  if (!session.user) return session;

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      role: true,
      name: true,
      email: true,
      companyId: true,
      isPaused: true,
      pausedReason: true,
      leaseExpiryDate: true,
      sessionVersion: true,
      mustChangePassword: true,
    },
  });

  // Account status first so a paused tenant sees why, not just "session ended".
  const message = user
    ? blockedMessage(getAccountStatus(user))
    : "Your session has ended. Please log in again.";
  if (message) {
    blockedReasons.set(session, message);
    session.user = undefined;
    return session;
  }
  if (user!.sessionVersion !== (session.user.sessionVersion ?? 0)) {
    blockedReasons.set(session, "Your session has ended. Please log in again.");
    session.user = undefined;
    return session;
  }

  // Keep role/name fresh from the database rather than trusting the cookie.
  session.user = {
    ...session.user,
    role: user!.role,
    name: user!.name,
    email: user!.email,
    companyId: user!.companyId,
    mustChangePassword: user!.mustChangePassword,
  };
  return session;
}

/** Why getSession() rejected an existing cookie (paused, lease expired, reset), if it did. */
export function getBlockedReason(session: object): string | null {
  return blockedReasons.get(session) ?? null;
}

export async function requireUser() {
  const session = await getSession();
  if (!session.user) {
    throw new Error("UNAUTHORIZED");
  }
  return session;
}

export async function requireAdmin() {
  const session = await requireUser();
  if (session.user!.role !== "ADMIN") {
    throw new Error("FORBIDDEN");
  }
  return session;
}

/** Where to send a visitor with no valid session, carrying the reason if they were blocked. */
export function loginPath(session: object): string {
  const reason = getBlockedReason(session);
  return reason ? `/login?error=${encodeURIComponent(reason)}` : "/login";
}
