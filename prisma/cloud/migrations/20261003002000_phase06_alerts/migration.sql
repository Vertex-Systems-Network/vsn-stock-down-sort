-- PHASE-06 low-stock alert settings and cooldown state
CREATE TABLE "AlertSetting" (
    "shop" TEXT NOT NULL,
    "threshold" INTEGER NOT NULL DEFAULT 5,
    "cooldownMinutes" INTEGER NOT NULL DEFAULT 360,
    "emailEnabled" BOOLEAN NOT NULL DEFAULT false,
    "emailRecipients" TEXT NOT NULL DEFAULT '',
    "slackEnabled" BOOLEAN NOT NULL DEFAULT false,
    "slackWebhookCiphertext" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AlertSetting_pkey" PRIMARY KEY ("shop")
);

CREATE TABLE "LowStockAlertState" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "lastInventory" INTEGER,
    "lastObservedAt" TIMESTAMP(3),
    "lastEmailAlertAt" TIMESTAMP(3),
    "lastSlackAlertAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LowStockAlertState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LowStockAlertState_shop_productId_key"
ON "LowStockAlertState"("shop", "productId");

CREATE INDEX "LowStockAlertState_shop_lastObservedAt_idx"
ON "LowStockAlertState"("shop", "lastObservedAt");
