import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import {
  collectionsForProduct,
  sortEnabledCollections,
} from "../services/collection-sorter.server";

export async function action({ request }: ActionFunctionArgs) {
  const { admin, session, payload } = await authenticate.webhook(request);

  if (!admin || !session) {
    return new Response();
  }

  const numericId = (payload as any).id;
  if (!numericId) return new Response();

  try {
    const productId = `gid://shopify/Product/${numericId}`;
    const collectionIds = await collectionsForProduct(admin, productId);

    if (collectionIds.length) {
      await sortEnabledCollections(admin, session.shop, collectionIds);
    }
  } catch (error) {
    console.error("products/update sorter error", error);
  }

  return new Response();
}
