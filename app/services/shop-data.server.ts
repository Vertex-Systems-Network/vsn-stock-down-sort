import { withPrismaClient } from "../db.server";

type PurgeCounts = {
  sessions: number;
  collectionSettings: number;
  visibilitySettings: number;
  productVisibilityStates: number;
  activityEvents: number;
  automationRules: number;
  alertSettings: number;
  lowStockAlertStates: number;
  contextVisibilityRules: number;
  contextPublicationStates: number;
  integrationCredentials: number;
  integrationReplayNonces: number;
  supportRequests: number;
};

const EMPTY_PURGE_COUNTS: PurgeCounts = {
  sessions: 0,
  collectionSettings: 0,
  visibilitySettings: 0,
  productVisibilityStates: 0,
  activityEvents: 0,
  automationRules: 0,
  alertSettings: 0,
  lowStockAlertStates: 0,
  contextVisibilityRules: 0,
  contextPublicationStates: 0,
  integrationCredentials: 0,
  integrationReplayNonces: 0,
  supportRequests: 0,
};

/**
 * Removes all app-owned data scoped to one Shopify shop.
 *
 * Customer/order records are not persisted by VSN Stock Down Sort. This purge
 * covers every current Prisma model that owns a `shop` field, plus replay
 * nonces that belong to shop-scoped integration credentials.
 *
 * Keep tests/worker-runtime-contract.test.mjs in sync: it derives the list of
 * shop-scoped Prisma models dynamically and fails if a future model is added
 * without a corresponding delete path here.
 */
export async function purgeShopData(shop: string): Promise<PurgeCounts> {
  if (!shop) return { ...EMPTY_PURGE_COUNTS };

  return withPrismaClient(async (db) => {
    // Shopify may retry this webhook after a non-2xx response. Purge with
    // separate idempotent deleteMany calls instead of one long Prisma batch
    // transaction: Cloudflare's PostgreSQL adapter expires batch transactions
    // at 5 seconds, which caused large shops to fail the entire purge.
    const sessions = await db.session.deleteMany({ where: { shop } });
    const integrationCredentials = await db.integrationCredential.findMany({
      where: { shop },
      select: { id: true },
    });
    const credentialIds = integrationCredentials.map((credential) => credential.id);

    const integrationReplayNonces = await db.integrationReplayNonce.deleteMany({
      where: {
        credentialId: {
          in: credentialIds,
        },
      },
    });
    const contextPublicationStates = await db.contextPublicationState.deleteMany({ where: { shop } });
    const contextVisibilityRules = await db.contextVisibilityRule.deleteMany({ where: { shop } });
    const lowStockAlertStates = await db.lowStockAlertState.deleteMany({ where: { shop } });
    const alertSettings = await db.alertSetting.deleteMany({ where: { shop } });
    const automationRules = await db.automationRule.deleteMany({ where: { shop } });
    const activityEvents = await db.activityEvent.deleteMany({ where: { shop } });
    const productVisibilityStates = await db.productVisibilityState.deleteMany({ where: { shop } });
    const visibilitySettings = await db.visibilitySetting.deleteMany({ where: { shop } });
    const collectionSettings = await db.collectionSetting.deleteMany({ where: { shop } });
    const supportRequests = await db.supportRequest.deleteMany({ where: { shop } });
    const integrationCredentialDeletes = await db.integrationCredential.deleteMany({ where: { shop } });

    return {
      sessions: sessions.count,
      collectionSettings: collectionSettings.count,
      visibilitySettings: visibilitySettings.count,
      productVisibilityStates: productVisibilityStates.count,
      activityEvents: activityEvents.count,
      automationRules: automationRules.count,
      alertSettings: alertSettings.count,
      lowStockAlertStates: lowStockAlertStates.count,
      contextVisibilityRules: contextVisibilityRules.count,
      contextPublicationStates: contextPublicationStates.count,
      integrationCredentials: integrationCredentialDeletes.count,
      integrationReplayNonces: integrationReplayNonces.count,
      supportRequests: supportRequests.count,
    };
  });
}
