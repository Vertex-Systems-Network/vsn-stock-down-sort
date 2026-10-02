-- PHASE-03 product visibility state
CREATE TABLE "VisibilitySetting" (
    "shop" TEXT NOT NULL,
    "productMode" TEXT NOT NULL DEFAULT 'OFF',
    "autoRepublish" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "VisibilitySetting_pkey" PRIMARY KEY ("shop")
);

CREATE TABLE "ProductVisibilityState" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "previousStatus" TEXT,
    "managedStatus" TEXT,
    "hiddenAt" TIMESTAMP(3),
    "restoredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProductVisibilityState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProductVisibilityState_shop_productId_key"
ON "ProductVisibilityState"("shop", "productId");

CREATE INDEX "ProductVisibilityState_shop_managedStatus_idx"
ON "ProductVisibilityState"("shop", "managedStatus");
