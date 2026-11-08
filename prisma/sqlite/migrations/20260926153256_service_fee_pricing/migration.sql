-- CreateTable
CREATE TABLE "Settings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
    "serviceFeePercent" REAL NOT NULL DEFAULT 1.5,
    "serviceFeeFlat" REAL NOT NULL DEFAULT 100,
    "serviceFeeCap" REAL DEFAULT 2000,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Purchase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "meterId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "kwhAmount" REAL NOT NULL,
    "nairaAmount" REAL NOT NULL,
    "serviceFee" REAL NOT NULL DEFAULT 0,
    "unitPrice" REAL,
    "paystackReference" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "stsPin" TEXT,
    "stronPreview" TEXT,
    "stronResponse" TEXT,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "paidAt" DATETIME,
    "storeAttemptedAt" DATETIME,
    "vendedAt" DATETIME,
    CONSTRAINT "Purchase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Purchase_meterId_fkey" FOREIGN KEY ("meterId") REFERENCES "Meter" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Purchase_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Purchase" ("companyId", "createdAt", "errorMessage", "id", "kwhAmount", "meterId", "nairaAmount", "paidAt", "paystackReference", "status", "stronPreview", "stronResponse", "stsPin", "updatedAt", "userId", "vendedAt") SELECT "companyId", "createdAt", "errorMessage", "id", "kwhAmount", "meterId", "nairaAmount", "paidAt", "paystackReference", "status", "stronPreview", "stronResponse", "stsPin", "updatedAt", "userId", "vendedAt" FROM "Purchase";
DROP TABLE "Purchase";
ALTER TABLE "new_Purchase" RENAME TO "Purchase";
CREATE UNIQUE INDEX "Purchase_paystackReference_key" ON "Purchase"("paystackReference");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
