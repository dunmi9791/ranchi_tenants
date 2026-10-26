// Create the first ADMIN user from ADMIN_EMAIL / ADMIN_PASSWORD, only if no admin exists yet.
// Runs on every container start; does nothing once an admin exists, and never changes passwords.
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD;
const prisma = new PrismaClient();

try {
  const admins = await prisma.user.count({ where: { role: "ADMIN" } });
  if (admins > 0) {
    console.log(`[bootstrap] ${admins} admin account(s) found; nothing to do.`);
  } else if (!email || !password) {
    console.warn("[bootstrap] No admin account exists. Set ADMIN_EMAIL and ADMIN_PASSWORD to create one.");
  } else if (password.length < 8) {
    console.error("[bootstrap] ADMIN_PASSWORD must be at least 8 characters; admin not created.");
  } else if (await prisma.user.findUnique({ where: { email } })) {
    console.error(`[bootstrap] ${email} already exists as a tenant; choose a different ADMIN_EMAIL.`);
  } else {
    await prisma.user.create({
      data: { email, name: "Admin", role: "ADMIN", passwordHash: await bcrypt.hash(password, 10) },
    });
    console.log(`[bootstrap] Created admin ${email}. You can remove ADMIN_PASSWORD from the environment now.`);
  }
} finally {
  await prisma.$disconnect();
}
