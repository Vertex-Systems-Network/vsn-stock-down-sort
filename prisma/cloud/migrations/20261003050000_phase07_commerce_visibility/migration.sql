-- PHASE-07 enterprise commerce publication visibility
CREATE TABLE "CommerceVisibilitySetting" (
    "shop" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "autoRepublish" BOOLEAN NOT NULL DEFAULT true,
    "targets" TEXT NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CommerceVisibilitySetting_pkey" PRIMARY KEY ("shop")
);

CREATE TABLE "ProductPublicationState" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "publicationId" TEXT NOT NULL,
    "contextType" TEXT NOT NULL,
    "previousPublished" BOOLEAN NOT NULL DEFAULT false,
    "merchantOverride" BOOLEAN NOT NULL DEFAULT false,
    "managedUnpublishedAt" TIMESTAMP(3),
    "restoredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProductPublicationState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProductPublicationState_shop_productId_publicationId_key"
ON "ProductPublicationState"("shop", "productId", "publicationId");

CREATE INDEX "ProductPublicationState_shop_productId_idx"
ON "ProductPublicationState"("shop", "productId");

CREATE INDEX "ProductPublicationState_shop_contextType_idx"
ON "ProductPublicationState"("shop", "contextType");
