import assert from "node:assert/strict";
import test from "node:test";
import {
  recordCollectionDisabled,
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
  assert.equal(await recordSortFailure(db, key, "Collection sorting settings disappeared during sorting."), false);

  assert.equal(settings.has(key.collectionId), false, "deleted settings stay deleted");
  assert.equal(successfulMetadataWrites, 0, "success is not recorded for the deleted row");
  assert.equal(failureMetadataWrites, 0, "failure metadata cannot recreate the deleted row");
});

test("failure metadata reports an existing setting without recreating a row", async () => {
  const db = { collectionSetting: { updateMany: async () => ({ count: 1 }) } };
  assert.equal(await recordSortFailure(db, { shop: "fixture", collectionId: "fixture" }, "error"), true);
});

test("a stale sort cannot write metadata to a replacement setting", async () => {
  const key = { shop: "race-test.myshopify.com", collectionId: "gid://shopify/Collection/3" };
  let row = { ...key, id: "replacement", lastError: null, lastSortedAt: null };
  const db = {
    collectionSetting: {
      async updateMany({ where, data }) {
        if (where.shop !== row.shop || where.collectionId !== row.collectionId || where.id !== row.id) {
          return { count: 0 };
        }
        row = { ...row, ...data };
        return { count: 1 };
      },
    },
  };

  const staleKey = { ...key, id: "purged-original" };
  await assert.rejects(recordSortSuccess(db, staleKey), /settings disappeared during sorting/);
  assert.equal(await recordSortFailure(db, staleKey, "stale sort failed"), false);
  assert.equal(row.id, "replacement");
  assert.equal(row.lastError, null);
  assert.equal(row.lastSortedAt, null);

  await recordSortSuccess(db, { ...key, id: "replacement" });
  assert.ok(row.lastSortedAt instanceof Date);
});


test("disabling a setting deleted by a concurrent privacy purge does not recreate it", async () => {
  const key = { shop: "race-test.myshopify.com", collectionId: "gid://shopify/Collection/2" };
  const settings = new Map([[key.collectionId, { ...key, enabled: true }]]);
  const db = {
    collectionSetting: {
      async updateMany({ where, data }) {
        const existing = settings.get(where.collectionId);
        if (!existing || existing.shop !== where.shop) return { count: 0 };
        settings.set(where.collectionId, { ...existing, ...data });
        return { count: 1 };
      },
    },
  };

  assert.equal(await recordCollectionDisabled(db, key), true);
  assert.equal(settings.get(key.collectionId)?.enabled, false);
  settings.delete(key.collectionId);
  assert.equal(await recordCollectionDisabled(db, key), false);
  assert.equal(settings.has(key.collectionId), false);
});
