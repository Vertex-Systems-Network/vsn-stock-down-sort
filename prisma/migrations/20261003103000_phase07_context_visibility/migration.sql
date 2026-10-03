-- PHASE-07 contextual publication visibility
CREATE TABLE "ContextVisibilityRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "publicationId" TEXT NOT NULL,
    "targetTitle" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "autoRestore" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "ContextVisibilityRule_shop_publicationId_key"
ON "ContextVisibilityRule"("shop", "publicationId");

CREATE INDEX "ContextVisibilityRule_shop_targetType_enabled_idx"
ON "ContextVisibilityRule"("shop", "targetType", "enabled");

CREATE TABLE "ContextPublicationState" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "publicationId" TEXT NOT NULL,
    "managedHidden" BOOLEAN NOT NULL DEFAULT false,
    "hiddenAt" DATETIME,
    "restoredAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "ContextPublicationState_shop_ruleId_productId_key"
ON "ContextPublicationState"("shop", "ruleId", "productId");

CREATE INDEX "ContextPublicationState_shop_publicationId_managedHidden_idx"
ON "ContextPublicationState"("shop", "publicationId", "managedHidden");
