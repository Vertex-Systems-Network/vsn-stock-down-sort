import type { ActionFunctionArgs } from "react-router";
import { runWithWorkerLifetime } from "../cloudflare-context.server";
import { authenticate } from "../shopify.server";
import { enqueueSortJobs } from "../sort-queue.server";
import {
  collectionsForInventoryItem,
  sortEnabledCollections,
} from "../services/collection-sorter.server";

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
    const collectionIds = await collectionsForInventoryItem(
      admin,
      inventoryItemId,
    );

    if (collectionIds.length) {
      const queued = await enqueueSortJobs(
        context,
        collectionIds.map((collectionId) => ({
          kind: "sort" as const,
          shop: session.shop,
          collectionId,
          reason: "inventory-update" as const,
        })),
      );

      if (!queued) {
        await runWithWorkerLifetime(context, async () => {
          await sortEnabledCollections(admin, session.shop, collectionIds);
        });
      }
    }

    return new Response();
  } catch (error) {
    console.error("inventory_levels/update queue delivery error", error);
    return new Response("Webhook processing failed", { status: 500 });
  }
}
