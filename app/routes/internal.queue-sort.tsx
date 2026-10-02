import type { ActionFunctionArgs } from "react-router";
import { unauthenticated } from "../shopify.server";
import {
  enableCollection,
  sortEnabledCollections,
} from "../services/collection-sorter.server";
import { reconcileProductVisibility } from "../services/product-visibility.server";
import { processLowStockAlert } from "../services/alerts.server";
import type { SortQueueJob } from "../sort-queue.server";

type QueueConsumerContextLike = {
  cloudflare?: {
    queueConsumer?: boolean;
  };
};

function isQueueConsumer(context: unknown) {
  return (
    (context as QueueConsumerContextLike | undefined)?.cloudflare
      ?.queueConsumer === true
  );
}

function validShop(shop: unknown) {
  return (
    typeof shop === "string" &&
    /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(shop)
  );
}

function isValidJob(value: unknown): value is SortQueueJob {
  if (!value || typeof value !== "object") return false;

  const job = value as Partial<SortQueueJob>;
  if (!validShop(job.shop)) return false;

  if (job.kind === "visibility" || job.kind === "alert") {
    return (
      typeof (job as { productId?: unknown }).productId === "string" &&
      (job as { productId: string }).productId.startsWith(
        "gid://shopify/Product/",
      ) &&
      (job.reason === "inventory-update" || job.reason === "product-update")
    );
  }

  return (
    (job.kind === "sort" || job.kind === "enable") &&
    typeof (job as { collectionId?: unknown }).collectionId === "string" &&
    (job as { collectionId: string }).collectionId.startsWith(
      "gid://shopify/Collection/",
    ) &&
    (job.reason === "inventory-update" ||
      job.reason === "product-update" ||
      job.reason === "bulk-enable" ||
      job.reason === "rules-update")
  );
}

export async function action({ request, context }: ActionFunctionArgs) {
  if (!isQueueConsumer(context)) {
    return new Response("Not found", { status: 404 });
  }

  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const payload = await request.json().catch(() => null);
  if (!isValidJob(payload)) {
    return Response.json({ ok: false, error: "Invalid queue job" }, { status: 400 });
  }

  const { admin } = await unauthenticated.admin(payload.shop);

  if (payload.kind === "visibility") {
    const result = await reconcileProductVisibility(
      admin,
      payload.shop,
      payload.productId,
    );
    return Response.json({ ok: true, result });
  }

  if (payload.kind === "alert") {
    const result = await processLowStockAlert(
      admin,
      payload.shop,
      payload.productId,
      context,
    );
    return Response.json({ ok: true, result });
  }

  if (payload.kind === "enable") {
    const result = await enableCollection(
      admin,
      payload.shop,
      payload.collectionId,
    );
    return Response.json({ ok: true, result });
  }

  const results = await sortEnabledCollections(admin, payload.shop, [
    payload.collectionId,
  ]);

  return Response.json({ ok: true, results });
}
