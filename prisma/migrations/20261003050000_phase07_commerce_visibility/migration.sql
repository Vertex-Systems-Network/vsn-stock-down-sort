-- PHASE-07 enterprise commerce publication visibility
CREATE TABLE "CommerceVisibilitySetting" (
    "shop" TEXT NOT NULL PRIMARY KEY,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "autoRepublish" BOOLEAN NOT NULL DEFAULT true,
    "targets" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "ProductPublicationState" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "publicationId" TEXT NOT NULL,
    "contextType" TEXT NOT NULL,
    "previousPublished" BOOLEAN NOT NULL DEFAULT false,
    "merchantOverride" BOOLEAN NOT NULL DEFAULT false,
    "managedUnpublishedAt" DATETIME,
    "restoredAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "ProductPublicationState_shop_productId_publicationId_key"
ON "ProductPublicationState"("shop", "productId", "publicationId");

CREATE INDEX "ProductPublicationState_shop_productId_idx"
ON "ProductPublicationState"("shop", "productId");

CREATE INDEX "ProductPublicationState_shop_contextType_idx"
ON "ProductPublicationState"("shop", "contextType");
