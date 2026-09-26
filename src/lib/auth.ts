import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import type { SessionUser } from "./session";
import { blockedMessage, getAccountStatus } from "./account";

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

/**
 * Check credentials. Returns null for a wrong email/password; otherwise the session user
 * plus a message if the account is paused or the lease has expired.
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
