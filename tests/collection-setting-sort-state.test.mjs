import assert from "node:assert/strict";
import test from "node:test";
import {
  recordCollectionDisabled,
  recordSortFailure,
  recordSortFailureWithActivity,
  recordSortSuccess,
  recordSortSuccessWithActivity,
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
  const settings = new Map([[key.collectionId, { ...key, id: "original", enabled: true }]]);
  const db = {
    collectionSetting: {
      async updateMany({ where, data }) {
        const existing = settings.get(where.collectionId);
        if (!existing || existing.shop !== where.shop || existing.id !== where.id) return { count: 0 };
        settings.set(where.collectionId, { ...existing, ...data });
        return { count: 1 };
      },
    },
  };

  assert.equal(await recordCollectionDisabled(db, { ...key, id: "original" }), true);
  assert.equal(settings.get(key.collectionId)?.enabled, false);
  settings.delete(key.collectionId);
  assert.equal(await recordCollectionDisabled(db, { ...key, id: "original" }), false);
  assert.equal(settings.has(key.collectionId), false);
});

test("a stale disable cannot change a replacement setting", async () => {
  const key = { shop: "race-test.myshopify.com", collectionId: "gid://shopify/Collection/4" };
  let row = { ...key, id: "replacement", enabled: true, lastError: null };
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

  assert.equal(await recordCollectionDisabled(db, { ...key, id: "purged-original" }), false);
  assert.equal(row.enabled, true);
  assert.equal(row.lastError, null);
  assert.equal(await recordCollectionDisabled(db, { ...key, id: "replacement" }), true);
  assert.equal(row.enabled, false);
});

test("sort metadata and activity commit together or not at all", async () => {
  const key = { shop: "race-test.myshopify.com", collectionId: "gid://shopify/Collection/5", id: "original" };
  let row = { ...key, lastSortedAt: null, lastError: null };
  let activities = [];
  const updateSetting = async ({ where, data }) => {
    if (!row || where.id !== row.id) return { count: 0 };
    row = { ...row, ...data };
    return { count: 1 };
  };
  const db = {
    collectionSetting: { updateMany: updateSetting },
    async $transaction(operation) {
      let nextRow = row;
      const nextActivities = [...activities];
      const tx = {
        collectionSetting: {
          async updateMany({ where, data }) {
            if (!nextRow || where.id !== nextRow.id) return { count: 0 };
            nextRow = { ...nextRow, ...data };
            return { count: 1 };
          },
        },
        activityEvent: {
          async create({ data }) {
            nextActivities.push(data);
          },
        },
      };
      const result = await operation(tx);
      row = nextRow;
      activities = nextActivities;
      return result;
    },
  };
  const createActivity = (tx) => tx.activityEvent.create({ data: { shop: key.shop } });

  await recordSortSuccessWithActivity(db, key, createActivity);
  assert.ok(row.lastSortedAt instanceof Date);
  assert.equal(activities.length, 1);

  row = null;
  activities = [];
  await assert.rejects(recordSortSuccessWithActivity(db, key, createActivity), /settings disappeared/);
  assert.equal(await recordSortFailureWithActivity(db, key, "missing", createActivity), false);
  assert.equal(row, null);
  assert.equal(activities.length, 0);

  row = { ...key, lastSortedAt: null, lastError: null };
  await recordSortSuccessWithActivity(db, key, async () => { throw new Error("activity unavailable"); });
  assert.ok(row.lastSortedAt instanceof Date, "activity failure falls back to metadata only");
  assert.equal(activities.length, 0);

  assert.equal(await recordSortFailureWithActivity(db, key, "sort failed", createActivity), true);
  assert.equal(row.lastError, "sort failed");
  assert.equal(activities.length, 1);

  activities = [];
  assert.equal(
    await recordSortFailureWithActivity(db, key, "activity unavailable", async () => {
      throw new Error("activity unavailable");
    }),
    true,
  );
  assert.equal(row.lastError, "activity unavailable");
  assert.equal(activities.length, 0);
});
