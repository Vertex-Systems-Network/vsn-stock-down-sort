ALTER TABLE "CollectionSetting" ADD COLUMN "excludedTags" TEXT NOT NULL DEFAULT '';
ALTER TABLE "CollectionSetting" ADD COLUMN "excludedVendors" TEXT NOT NULL DEFAULT '';
ALTER TABLE "CollectionSetting" ADD COLUMN "excludedProducts" TEXT NOT NULL DEFAULT '';
ALTER TABLE "CollectionSetting" ADD COLUMN "pinnedProducts" TEXT NOT NULL DEFAULT '';
ALTER TABLE "CollectionSetting" ADD COLUMN "availableSortMode" TEXT NOT NULL DEFAULT 'PRESERVE';
ALTER TABLE "CollectionSetting" ADD COLUMN "inventoryMode" TEXT NOT NULL DEFAULT 'ALL_LOCATIONS';
ALTER TABLE "CollectionSetting" ADD COLUMN "inventoryLocationIds" TEXT NOT NULL DEFAULT '';
