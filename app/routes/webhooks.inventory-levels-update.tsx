import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import {
  collectionsForInventoryItem,
  sortEnabledCollections,
} from "../services/collection-sorter.server";

type InventoryLevelWebhookPayload = {
  inventory_item_id?: string | number;
  inventoryItemId?: string | number;
};

export async function action({ request }: ActionFunctionArgs) {
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
      await sortEnabledCollections(admin, session.shop, collectionIds);
    }
  } catch (error) {
    console.error("inventory_levels/update sorter error", error);
    // Return 200 after logging to avoid a retry storm for a business-logic error.
  }

  return new Response();
}
