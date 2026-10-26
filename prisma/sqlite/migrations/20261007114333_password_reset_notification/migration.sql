-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Settings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
    "serviceFeePercent" REAL NOT NULL DEFAULT 1.5,
    "serviceFeeFlat" REAL NOT NULL DEFAULT 100,
    "serviceFeeCap" REAL DEFAULT 2000,
    "emailEnabled" BOOLEAN NOT NULL DEFAULT false,
    "smtpHost" TEXT,
    "smtpPort" INTEGER NOT NULL DEFAULT 587,
    "smtpSecure" BOOLEAN NOT NULL DEFAULT false,
    "smtpUser" TEXT,
    "smtpPassword" TEXT,
    "smtpFromEmail" TEXT,
    "smtpFromName" TEXT DEFAULT 'Ranchi Tenants',
    "smsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "smsProvider" TEXT NOT NULL DEFAULT 'termii',
    "smsApiKey" TEXT,
    "smsUsername" TEXT,
    "smsSenderId" TEXT,
    "smsBaseUrl" TEXT,
    "smsHttpMethod" TEXT NOT NULL DEFAULT 'POST',
    "smsHttpContentType" TEXT NOT NULL DEFAULT 'json',
    "smsHttpBody" TEXT,
    "smsHttpHeaders" TEXT,
    "smsCountryCode" TEXT NOT NULL DEFAULT '234',
    "notifyTenantOnWelcome" BOOLEAN NOT NULL DEFAULT true,
    "notifyTenantOnPasswordReset" BOOLEAN NOT NULL DEFAULT true,
    "notifyTenantOnVend" BOOLEAN NOT NULL DEFAULT true,
    "notifyTenantOnFailure" BOOLEAN NOT NULL DEFAULT true,
    "notifyAdminOnFailure" BOOLEAN NOT NULL DEFAULT true,
    "adminAlertEmails" TEXT,
    "adminAlertPhones" TEXT,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Settings" ("adminAlertEmails", "adminAlertPhones", "emailEnabled", "id", "notifyAdminOnFailure", "notifyTenantOnFailure", "notifyTenantOnVend", "notifyTenantOnWelcome", "serviceFeeCap", "serviceFeeFlat", "serviceFeePercent", "smsApiKey", "smsBaseUrl", "smsCountryCode", "smsEnabled", "smsHttpBody", "smsHttpContentType", "smsHttpHeaders", "smsHttpMethod", "smsProvider", "smsSenderId", "smsUsername", "smtpFromEmail", "smtpFromName", "smtpHost", "smtpPassword", "smtpPort", "smtpSecure", "smtpUser", "updatedAt") SELECT "adminAlertEmails", "adminAlertPhones", "emailEnabled", "id", "notifyAdminOnFailure", "notifyTenantOnFailure", "notifyTenantOnVend", "notifyTenantOnWelcome", "serviceFeeCap", "serviceFeeFlat", "serviceFeePercent", "smsApiKey", "smsBaseUrl", "smsCountryCode", "smsEnabled", "smsHttpBody", "smsHttpContentType", "smsHttpHeaders", "smsHttpMethod", "smsProvider", "smsSenderId", "smsUsername", "smtpFromEmail", "smtpFromName", "smtpHost", "smtpPassword", "smtpPort", "smtpSecure", "smtpUser", "updatedAt" FROM "Settings";
DROP TABLE "Settings";
ALTER TABLE "new_Settings" RENAME TO "Settings";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
