-- PHASE-10 in-app support request fulfillment
CREATE TABLE "SupportRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "priority" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "notificationStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "notificationError" TEXT,
    "notifiedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE INDEX "SupportRequest_shop_createdAt_idx"
ON "SupportRequest"("shop", "createdAt");

CREATE INDEX "SupportRequest_shop_status_createdAt_idx"
ON "SupportRequest"("shop", "status", "createdAt");
