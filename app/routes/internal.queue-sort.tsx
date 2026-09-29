import type { ActionFunctionArgs } from "react-router";
import { unauthenticated } from "../shopify.server";
import {
  enableCollection,
  sortEnabledCollections,
} from "../services/collection-sorter.server";
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

function isValidJob(value: unknown): value is SortQueueJob {
  if (!value || typeof value !== "object") return false;

  const job = value as Partial<SortQueueJob>;

  return (
    (job.kind === "sort" || job.kind === "enable") &&
    typeof job.shop === "string" &&
    /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(job.shop) &&
    typeof job.collectionId === "string" &&
    job.collectionId.startsWith("gid://shopify/Collection/") &&
    (job.reason === "inventory-update" ||
      job.reason === "product-update" ||
      job.reason === "bulk-enable")
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
