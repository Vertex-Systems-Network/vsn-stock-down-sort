import type { ActionFunctionArgs } from "react-router";
import { runWithWorkerLifetime } from "../cloudflare-context.server";
import { authenticate } from "../shopify.server";
import { enqueueSortJobs } from "../sort-queue.server";
import {
  collectionsForInventoryItem,
  sortEnabledCollections,
} from "../services/collection-sorter.server";
import {
  productIdForInventoryItem,
  reconcileProductVisibility,
} from "../services/product-visibility.server";
import { processLowStockAlert } from "../services/alerts.server";
import { reconcileCommerceVisibilitySafe } from "../services/commerce-visibility.server";

type InventoryLevelWebhookPayload = {
  inventory_item_id?: string | number;
  inventoryItemId?: string | number;
};

export async function action({ request, context }: ActionFunctionArgs) {
  const { admin, session, payload } = await authenticate.webhook(request);

  if (!admin || !session) {
    return new Response();
  }

  const inventoryPayload = payload as InventoryLevelWebhookPayload;
  const inventoryItemId =
    inventoryPayload.inventory_item_id ?? inventoryPayload.inventoryItemId;

  if (!inventoryItemId) {
    return new Response();
  }

  try {
    const [collectionIds, productId] = await Promise.all([
      collectionsForInventoryItem(admin, inventoryItemId),
      productIdForInventoryItem(admin, inventoryItemId),
    ]);

    const jobs = [
      ...(productId
        ? [
            {
              kind: "visibility" as const,
              shop: session.shop,
              productId,
              reason: "inventory-update" as const,
            },
            {
              kind: "alert" as const,
              shop: session.shop,
              productId,
              reason: "inventory-update" as const,
            },
          ]
        : []),
      ...collectionIds.map((collectionId) => ({
        kind: "sort" as const,
        shop: session.shop,
        collectionId,
        reason: "inventory-update" as const,
      })),
    ];

    if (!jobs.length) return new Response();

    const queued = await enqueueSortJobs(context, jobs);

    if (!queued) {
      await runWithWorkerLifetime(context, async () => {
        if (productId) {
          await reconcileProductVisibility(admin, session.shop, productId);
          await reconcileCommerceVisibilitySafe(
            admin,
            session.shop,
            productId,
          );
          await processLowStockAlert(
            admin,
            session.shop,
            productId,
            context,
          );
        }
        if (collectionIds.length) {
          await sortEnabledCollections(admin, session.shop, collectionIds);
        }
      });
    }

    return new Response();
  } catch (error) {
    console.error("inventory_levels/update stock automation error", error);
    return new Response("Webhook processing failed", { status: 500 });
  }
}
