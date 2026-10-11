/**
 * @typedef {{ shop: string, collectionId: string }} CollectionSettingKey
 * @typedef {{
 *   collectionSetting: {
 *     updateMany(args: {
 *       where: CollectionSettingKey,
 *       data: { lastSortedAt?: Date, lastError?: string | null }
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
