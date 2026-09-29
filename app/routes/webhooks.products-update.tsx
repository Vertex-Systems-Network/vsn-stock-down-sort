import type { ActionFunctionArgs } from "react-router";
import { runWithWorkerLifetime } from "../cloudflare-context.server";
import { authenticate } from "../shopify.server";
import { enqueueSortJobs } from "../sort-queue.server";
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

  try {
    const productId = `gid://shopify/Product/${numericId}`;
    const collectionIds = await collectionsForProduct(admin, productId);

    if (collectionIds.length) {
      const queued = await enqueueSortJobs(
        context,
        collectionIds.map((collectionId) => ({
          kind: "sort" as const,
          shop: session.shop,
          collectionId,
          reason: "product-update" as const,
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
    console.error("products/update queue delivery error", error);
    return new Response("Webhook processing failed", { status: 500 });
  }
}
