/**
 * @typedef {{ shop: string, collectionId: string, id?: string }} CollectionSettingKey
 * @typedef {{
 *   collectionSetting: {
 *     updateMany(args: {
 *       where: CollectionSettingKey,
 *       data: { enabled?: boolean, lastSortedAt?: Date, lastError?: string | null }
 *     }): Promise<{ count: number }>
 *   }
 * }} SortStateDatabase
 */

/**
 * Persist successful sort metadata only while the setting still exists.
 * @param {SortStateDatabase} db
 * @param {CollectionSettingKey} key
 */
export async function recordSortSuccess(db, key) {
  const result = await db.collectionSetting.updateMany({
    where: key,
    data: { lastSortedAt: new Date(), lastError: null },
  });

  if (result.count !== 1) {
    throw new Error(
      "Collection sorting settings disappeared during sorting. Refresh the page and enable the collection before trying again.",
    );
  }
}

/** Commit sort metadata and its activity event under one short row lock. */
export async function recordSortSuccessWithActivity(db, key, createActivity) {
  let activityFailed = false;
  try {
    await db.$transaction(async (tx) => {
      await recordSortSuccess(tx, key);
      try {
        await createActivity(tx);
      } catch (error) {
        activityFailed = true;
        throw error;
      }
    });
  } catch (error) {
    if (!activityFailed) throw error;
    console.error("activity event persistence failed", error instanceof Error ? error.message : "Unknown activity persistence error");
    // Activity is best-effort. The transaction rolled back; persist only
    // metadata, still bound to the original row ID.
    await recordSortSuccess(db, key);
  }
}

/**
 * Persist an error without recreating a setting removed by a privacy purge.
 * Persistence failure is intentionally ignored so the original sort error is preserved.
 * Returns whether the setting still existed, allowing callers to avoid recreating
 * shop-scoped activity after a privacy purge.
 * @param {SortStateDatabase} db
 * @param {CollectionSettingKey} key
 * @param {string} message
 */
export async function recordSortFailure(db, key, message) {
  const result = await db.collectionSetting.updateMany({
    where: key,
    data: { lastError: message },
  }).catch(() => ({ count: 0 }));
  return result.count === 1;
}

/** Preserve the original sort error even if failure activity cannot be saved. */
export async function recordSortFailureWithActivity(db, key, message, createActivity) {
  let activityFailed = false;
  try {
    return await db.$transaction(async (tx) => {
      const exists = await recordSortFailure(tx, key, message);
      if (exists) {
        try {
          await createActivity(tx);
        } catch (error) {
          activityFailed = true;
          throw error;
        }
      }
      return exists;
    });
  } catch (error) {
    if (activityFailed) {
      console.error("activity event persistence failed", error instanceof Error ? error.message : "Unknown activity persistence error");
    }
    return activityFailed ? recordSortFailure(db, key, message) : false;
  }
}

/**
 * Disable an existing setting without recreating it after a concurrent privacy purge.
 * @param {SortStateDatabase} db
 * @param {CollectionSettingKey} key
 * @returns {Promise<boolean>} Whether the setting was still present.
 */
export async function recordCollectionDisabled(db, key) {
  const result = await db.collectionSetting.updateMany({
    where: key,
    data: { enabled: false, lastError: null },
  });
  return result.count === 1;
}
