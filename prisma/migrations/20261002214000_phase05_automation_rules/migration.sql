-- PHASE-05 rule builder and scheduled automation
CREATE TABLE "AutomationRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "scheduleMinutes" INTEGER,
    "minSoldOutProducts" INTEGER,
    "minSoldOutPercent" INTEGER,
    "minTotalProducts" INTEGER,
    "nextRunAt" DATETIME,
    "lastRunAt" DATETIME,
    "lastOutcome" TEXT,
    "lastError" TEXT,
    "leaseUntil" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE INDEX "AutomationRule_shop_enabled_nextRunAt_idx"
ON "AutomationRule"("shop", "enabled", "nextRunAt");

CREATE INDEX "AutomationRule_shop_collectionId_idx"
ON "AutomationRule"("shop", "collectionId");
