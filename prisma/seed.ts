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

  const property = await prisma.property.upsert({
    where: { id: "seed-property-1" },
    update: {},
    create: { id: "seed-property-1", name: "Demo Court", address: "1 Demo Street", companyId: company.id },
  });

  const unit = await prisma.unit.upsert({
    where: { id: "seed-unit-a1" },
    update: {},
    create: { id: "seed-unit-a1", name: "Flat A1", propertyId: property.id, rentAmount: 1_200_000, rentFrequency: "ANNUAL" },
  });

  await prisma.meter.upsert({
    where: { meterNumber: "04161234567" },
    update: { unitId: unit.id, companyId: company.id },
    create: {
      meterNumber: "04161234567",
      label: "Flat A1",
      companyId: company.id,
      unitId: unit.id,
    },
  });

  // One-year lease from the start of this month, so the tenant can top up straight away.
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear() + 1, now.getUTCMonth(), 0));
  await prisma.lease.upsert({
    where: { id: "seed-lease-a1" },
    update: {},
    create: {
      id: "seed-lease-a1",
      unitId: unit.id,
      tenantId: tenant.id,
      startDate: start,
      endDate: end,
      rentAmount: 1_200_000,
      rentFrequency: "ANNUAL",
    },
  });

  console.log("Seeded:");
  console.log("  Admin:  admin@ranchi.local / password123");
  console.log("  Tenant: tenant@ranchi.local / password123");
  console.log("  Company:", company.name);
  console.log("  Property: Demo Court, unit Flat A1 (meter 04161234567) leased to the tenant");
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
