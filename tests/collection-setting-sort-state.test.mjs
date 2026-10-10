import assert from "node:assert/strict";
import test from "node:test";
import {
  recordSortFailure,
  recordSortSuccess,
} from "../app/services/collection-setting-sort-state.server.mjs";

test("a settings deletion during sort is reported without recreating the purged row", async () => {
  const key = { shop: "race-test.myshopify.com", collectionId: "gid://shopify/Collection/1" };
  const settings = new Map([[key.collectionId, { shop: key.shop, collectionId: key.collectionId }]]);
  let successfulMetadataWrites = 0;
  let failureMetadataWrites = 0;

  const db = {
    collectionSetting: {
      async findUnique() {
        return settings.get(key.collectionId) ?? null;
      },
      async updateMany({ where, data }) {
        const existing = settings.get(where.collectionId);
        if (!existing || existing.shop !== where.shop) return { count: 0 };

        if ("lastSortedAt" in data) successfulMetadataWrites += 1;
        if (typeof data.lastError === "string") failureMetadataWrites += 1;
        settings.set(where.collectionId, { ...existing, ...data });
        return { count: 1 };
      },
    },
  };

  // Sort has already loaded its settings, then an uninstall privacy purge deletes them.
  assert.ok(await db.collectionSetting.findUnique({ where: key }));
  settings.delete(key.collectionId);

  await assert.rejects(
    recordSortSuccess(db, key),
    /Collection sorting settings disappeared during sorting/,
  );
  await recordSortFailure(db, key, "Collection sorting settings disappeared during sorting.");

  assert.equal(settings.has(key.collectionId), false, "deleted settings stay deleted");
  assert.equal(successfulMetadataWrites, 0, "success is not recorded for the deleted row");
  assert.equal(failureMetadataWrites, 0, "failure metadata cannot recreate the deleted row");
});
