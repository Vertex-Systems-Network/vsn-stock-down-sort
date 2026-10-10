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
 * @param {SortStateDatabase} db
 * @param {CollectionSettingKey} key
 * @param {string} message
 */
export async function recordSortFailure(db, key, message) {
  await db.collectionSetting.updateMany({
    where: key,
    data: { lastError: message },
  }).catch(() => undefined);
}
