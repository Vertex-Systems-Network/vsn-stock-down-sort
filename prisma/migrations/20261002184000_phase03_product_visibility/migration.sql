-- PHASE-03 product visibility state
CREATE TABLE "VisibilitySetting" (
    "shop" TEXT NOT NULL PRIMARY KEY,
    "productMode" TEXT NOT NULL DEFAULT 'OFF',
    "autoRepublish" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "ProductVisibilityState" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "previousStatus" TEXT,
    "managedStatus" TEXT,
    "hiddenAt" DATETIME,
    "restoredAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "ProductVisibilityState_shop_productId_key"
ON "ProductVisibilityState"("shop", "productId");

CREATE INDEX "ProductVisibilityState_shop_managedStatus_idx"
ON "ProductVisibilityState"("shop", "managedStatus");
