import type { ActionFunctionArgs } from "react-router";
import { runWithWorkerLifetime } from "../cloudflare-context.server";
import { authenticate } from "../shopify.server";
import {
  collectionsForProduct,
  sortEnabledCollections,
} from "../services/collection-sorter.server";

type ProductUpdateWebhookPayload = {
  id?: string | number;
};

export async function action({ request, context }: ActionFunctionArgs) {
  const { admin, session, payload } = await authenticate.webhook(request);

  if (!admin || !session) {
    return new Response();
  }

  const numericId = (payload as ProductUpdateWebhookPayload).id;
  if (!numericId) return new Response();

  await runWithWorkerLifetime(context, async () => {
    try {
      const productId = `gid://shopify/Product/${numericId}`;
      const collectionIds = await collectionsForProduct(admin, productId);

      if (collectionIds.length) {
        await sortEnabledCollections(admin, session.shop, collectionIds);
      }
    } catch (error) {
      console.error("products/update sorter error", error);
    }
  });

  return new Response();
}
