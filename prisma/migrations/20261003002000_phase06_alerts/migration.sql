-- PHASE-06 low-stock alert settings and cooldown state
CREATE TABLE "AlertSetting" (
    "shop" TEXT NOT NULL PRIMARY KEY,
    "threshold" INTEGER NOT NULL DEFAULT 5,
    "cooldownMinutes" INTEGER NOT NULL DEFAULT 360,
    "emailEnabled" BOOLEAN NOT NULL DEFAULT false,
    "emailRecipients" TEXT NOT NULL DEFAULT '',
    "slackEnabled" BOOLEAN NOT NULL DEFAULT false,
    "slackWebhookCiphertext" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "LowStockAlertState" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "lastInventory" INTEGER,
    "lastObservedAt" DATETIME,
    "lastEmailAlertAt" DATETIME,
    "lastSlackAlertAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "LowStockAlertState_shop_productId_key"
ON "LowStockAlertState"("shop", "productId");

CREATE INDEX "LowStockAlertState_shop_lastObservedAt_idx"
ON "LowStockAlertState"("shop", "lastObservedAt");
