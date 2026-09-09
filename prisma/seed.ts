import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("password123", 10);

  const company = await prisma.company.upsert({
    where: { id: "seed-company-1" },
    update: {},
    create: {
      id: "seed-company-1",
      name: "Demo Energy Co",
      stronBaseUrl: process.env.STRON_BASE_URL || "https://stronpower.example.com",
      stronCompanyName: process.env.STRON_COMPANY_NAME || "DemoCompany",
      stronUsername: process.env.STRON_USERNAME || "demo_user",
      stronPassword: process.env.STRON_PASSWORD || "demo_pass",
      nairaPerKwh: 105,
    },
  });

  const admin = await prisma.user.upsert({
    where: { email: "admin@ranchi.local" },
    update: {},
    create: {
      email: "admin@ranchi.local",
      name: "Admin",
      passwordHash,
      role: "ADMIN",
      companyId: company.id,
    },
  });

  const tenant = await prisma.user.upsert({
    where: { email: "tenant@ranchi.local" },
    update: {},
    create: {
      email: "tenant@ranchi.local",
      name: "Demo Tenant",
      passwordHash,
      role: "TENANT",
      companyId: company.id,
    },
  });

  await prisma.meter.upsert({
    where: { meterNumber: "04161234567" },
    update: { userId: tenant.id, companyId: company.id },
    create: {
      meterNumber: "04161234567",
      label: "Flat A1",
      companyId: company.id,
      userId: tenant.id,
    },
  });

  console.log("Seeded:");
  console.log("  Admin:  admin@ranchi.local / password123");
  console.log("  Tenant: tenant@ranchi.local / password123");
  console.log("  Company:", company.name);
  console.log("  Meter: 04161234567 linked to tenant");
  void admin;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
