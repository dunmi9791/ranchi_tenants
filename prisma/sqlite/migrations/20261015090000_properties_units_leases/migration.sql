-- CreateTable
CREATE TABLE "Property" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "notes" TEXT,
    "companyId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Property_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Unit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "rentAmount" REAL,
    "rentFrequency" TEXT NOT NULL DEFAULT 'ANNUAL',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Unit_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Lease" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "unitId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME,
    "rentAmount" REAL NOT NULL,
    "rentFrequency" TEXT NOT NULL DEFAULT 'ANNUAL',
    "depositAmount" REAL,
    "notes" TEXT,
    "moveOutDate" DATETIME,
    "endReason" TEXT,
    "renewedFromId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Lease_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Lease_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Lease_renewedFromId_fkey" FOREIGN KEY ("renewedFromId") REFERENCES "Lease" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RentCharge" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "leaseId" TEXT NOT NULL,
    "periodStart" DATETIME NOT NULL,
    "periodEnd" DATETIME NOT NULL,
    "dueDate" DATETIME NOT NULL,
    "amount" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RentCharge_leaseId_fkey" FOREIGN KEY ("leaseId") REFERENCES "Lease" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RentPayment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "chargeId" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "serviceFee" REAL NOT NULL DEFAULT 0,
    "method" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "paystackReference" TEXT,
    "reference" TEXT,
    "note" TEXT,
    "errorMessage" TEXT,
    "recordedById" TEXT,
    "paidAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RentPayment_chargeId_fkey" FOREIGN KEY ("chargeId") REFERENCES "RentCharge" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "RentPayment_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- Move existing data onto the new model (before Meter.userId / User.lease* are dropped):
-- each company with assigned meters gets an "(imported)" property, each assigned meter its own
-- unit, and each tenant + meter a lease from the day the tenant was created to their old
-- lease expiry date (none = rolling). Rent is unknown, so it's 0 until an admin sets it.
-- Dates are epoch milliseconds; lease dates are whole days (midnight UTC).
INSERT INTO "Property" ("id", "name", "companyId", "createdAt", "updatedAt")
SELECT DISTINCT 'imp_' || c."id", c."name" || ' (imported)', c."id",
       CAST(strftime('%s', 'now') AS INTEGER) * 1000, CAST(strftime('%s', 'now') AS INTEGER) * 1000
FROM "Company" c JOIN "Meter" m ON m."companyId" = c."id"
WHERE m."userId" IS NOT NULL;

INSERT INTO "Unit" ("id", "name", "propertyId", "createdAt", "updatedAt")
SELECT 'imp_' || m."id", COALESCE(NULLIF(TRIM(m."label"), ''), 'Meter ' || m."meterNumber"), 'imp_' || m."companyId",
       CAST(strftime('%s', 'now') AS INTEGER) * 1000, CAST(strftime('%s', 'now') AS INTEGER) * 1000
FROM "Meter" m
WHERE m."userId" IS NOT NULL;

INSERT INTO "Lease" ("id", "unitId", "tenantId", "startDate", "endDate", "rentAmount", "rentFrequency", "notes", "createdAt", "updatedAt")
SELECT 'imp_' || m."id", 'imp_' || m."id", u."id",
       (u."createdAt" / 86400000) * 86400000,
       CASE WHEN u."leaseExpiryDate" IS NULL THEN NULL ELSE (u."leaseExpiryDate" / 86400000) * 86400000 END,
       0, 'ANNUAL', u."leaseNotes",
       CAST(strftime('%s', 'now') AS INTEGER) * 1000, CAST(strftime('%s', 'now') AS INTEGER) * 1000
FROM "Meter" m JOIN "User" u ON u."id" = m."userId";

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Meter" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "meterNumber" TEXT NOT NULL,
    "label" TEXT,
    "companyId" TEXT NOT NULL,
    "unitId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Meter_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Meter_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Meter" ("companyId", "createdAt", "id", "label", "meterNumber", "unitId", "updatedAt") SELECT "companyId", "createdAt", "id", "label", "meterNumber", CASE WHEN "userId" IS NOT NULL THEN 'imp_' || "id" END, "updatedAt" FROM "Meter";
DROP TABLE "Meter";
ALTER TABLE "new_Meter" RENAME TO "Meter";
CREATE UNIQUE INDEX "Meter_meterNumber_key" ON "Meter"("meterNumber");
CREATE INDEX "Meter_unitId_idx" ON "Meter"("unitId");
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'TENANT',
    "companyId" TEXT,
    "isPaused" BOOLEAN NOT NULL DEFAULT false,
    "pausedAt" DATETIME,
    "pausedReason" TEXT,
    "sessionVersion" INTEGER NOT NULL DEFAULT 0,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "User_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_User" ("companyId", "createdAt", "email", "id", "isPaused", "mustChangePassword", "name", "passwordHash", "pausedAt", "pausedReason", "phone", "role", "sessionVersion", "updatedAt") SELECT "companyId", "createdAt", "email", "id", "isPaused", "mustChangePassword", "name", "passwordHash", "pausedAt", "pausedReason", "phone", "role", "sessionVersion", "updatedAt" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Property_companyId_idx" ON "Property"("companyId");

-- CreateIndex
CREATE INDEX "Unit_propertyId_idx" ON "Unit"("propertyId");

-- CreateIndex
CREATE UNIQUE INDEX "Lease_renewedFromId_key" ON "Lease"("renewedFromId");

-- CreateIndex
CREATE INDEX "Lease_unitId_idx" ON "Lease"("unitId");

-- CreateIndex
CREATE INDEX "Lease_tenantId_idx" ON "Lease"("tenantId");

-- CreateIndex
CREATE INDEX "RentCharge_dueDate_idx" ON "RentCharge"("dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "RentCharge_leaseId_periodStart_key" ON "RentCharge"("leaseId", "periodStart");

-- CreateIndex
CREATE UNIQUE INDEX "RentPayment_paystackReference_key" ON "RentPayment"("paystackReference");

-- CreateIndex
CREATE INDEX "RentPayment_chargeId_idx" ON "RentPayment"("chargeId");

