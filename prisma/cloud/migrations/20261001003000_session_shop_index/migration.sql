-- Add a shop lookup index for Shopify session storage.
-- This is additive and preserves existing session data.
CREATE INDEX "Session_shop_idx" ON "Session"("shop");
