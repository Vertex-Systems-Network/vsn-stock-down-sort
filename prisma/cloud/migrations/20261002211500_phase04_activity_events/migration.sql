-- PHASE-04 activity and analytics event stream
CREATE TABLE "ActivityEvent" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "outcome" TEXT NOT NULL DEFAULT 'SUCCESS',
    "source" TEXT NOT NULL DEFAULT 'runtime',
    "entityType" TEXT,
    "entityId" TEXT,
    "summary" TEXT,
    "details" TEXT NOT NULL DEFAULT '{}',
    "totalProducts" INTEGER,
    "soldOutProducts" INTEGER,
    "movedProducts" INTEGER,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ActivityEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ActivityEvent_shop_occurredAt_idx"
ON "ActivityEvent"("shop", "occurredAt");

CREATE INDEX "ActivityEvent_shop_category_occurredAt_idx"
ON "ActivityEvent"("shop", "category", "occurredAt");

CREATE INDEX "ActivityEvent_shop_action_occurredAt_idx"
ON "ActivityEvent"("shop", "action", "occurredAt");
