-- CreateTable
CREATE TABLE "CollectionSetting" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "previousSortOrder" TEXT,
    "lastSortedAt" DATETIME,
    "lastError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "CollectionSetting_shop_enabled_idx" ON "CollectionSetting"("shop", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "CollectionSetting_shop_collectionId_key" ON "CollectionSetting"("shop", "collectionId");
