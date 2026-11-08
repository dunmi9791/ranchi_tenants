import { randomInt } from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import type { SessionUser } from "./session";
import { blockedMessage, getAccountStatus } from "./account";

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

// No 0/O, 1/l/I — easy to read out over the phone.
const TEMP_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

/** Random temporary password for admin-created accounts and resets. */
export function generateTempPassword(length = 10) {
  return Array.from({ length }, () => TEMP_ALPHABET[randomInt(TEMP_ALPHABET.length)]).join("");
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

/**
 * Check credentials. Returns null for a wrong email/password; otherwise the session user
 * plus a message if the account is paused.
 */
export async function authenticateUser(
  email: string,
  password: string
): Promise<{ user: SessionUser; blocked: string | null } | null> {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user) return null;
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) return null;
  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      companyId: user.companyId,
      sessionVersion: user.sessionVersion,
      mustChangePassword: user.mustChangePassword,
    },
    blocked: blockedMessage(getAccountStatus(user)),
  };
}

/**
 * Message for someone who registered on the site but isn't a tenant yet, or null.
 * Only revealed with the right password, so it doesn't leak who has applied.
 */
export async function pendingApplicant(email: string, password: string): Promise<string | null> {
  const applicant = await prisma.applicant.findUnique({ where: { email: email.toLowerCase() } });
  if (!applicant || !(await verifyPassword(password, applicant.passwordHash))) return null;
  return applicant.status === "PENDING"
    ? "Your registration is awaiting approval. You can log in once your property manager has added your lease."
    : "Your registration was not approved. Please contact your property manager.";
}
