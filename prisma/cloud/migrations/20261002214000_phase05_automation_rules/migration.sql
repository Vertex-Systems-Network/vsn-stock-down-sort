-- PHASE-05 rule builder and scheduled automation
CREATE TABLE "AutomationRule" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "scheduleMinutes" INTEGER,
    "minSoldOutProducts" INTEGER,
    "minSoldOutPercent" INTEGER,
    "minTotalProducts" INTEGER,
    "nextRunAt" TIMESTAMP(3),
    "lastRunAt" TIMESTAMP(3),
    "lastOutcome" TEXT,
    "lastError" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AutomationRule_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AutomationRule_shop_enabled_nextRunAt_idx"
ON "AutomationRule"("shop", "enabled", "nextRunAt");

CREATE INDEX "AutomationRule_shop_collectionId_idx"
ON "AutomationRule"("shop", "collectionId");
