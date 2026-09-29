import { withPrismaClient } from "../db.server";

/**
 * Removes all app-owned data scoped to one Shopify shop.
 *
 * VSN Stock Down Sort doesn't store customer/order records. Its shop-scoped
 * persisted data is Shopify session state plus collection sorting settings.
 */
export async function purgeShopData(shop: string) {
  if (!shop) return { collectionSettings: 0, sessions: 0 };

  return withPrismaClient(async (db) => {
    const [collectionSettings, sessions] = await db.$transaction([
      db.collectionSetting.deleteMany({ where: { shop } }),
      db.session.deleteMany({ where: { shop } }),
    ]);

    return {
      collectionSettings: collectionSettings.count,
      sessions: sessions.count,
    };
  });
}
