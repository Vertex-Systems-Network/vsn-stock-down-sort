export type SortQueueJob =
  | {
      kind: "sort" | "enable";
      shop: string;
      collectionId: string;
      reason:
        | "inventory-update"
        | "product-update"
        | "bulk-enable"
        | "rules-update";
    }
  | {
      kind: "visibility";
      shop: string;
      productId: string;
      reason: "inventory-update" | "product-update";
    }
  | {
      kind: "alert" | "context_visibility";
      shop: string;
      productId: string;
      reason: "inventory-update" | "product-update";
    };

type QueueBindingLike = {
  sendBatch(
    messages: Array<{ body: SortQueueJob }>,
  ): Promise<unknown>;
};

type CloudflareQueueContextLike = {
  cloudflare?: {
    env?: {
      STOCK_SORT_QUEUE?: QueueBindingLike;
    };
  };
};

const QUEUE_BATCH_SIZE = 100;

function getCloudflareQueueContext(context: unknown) {
  return (context as CloudflareQueueContextLike | undefined)?.cloudflare;
}

/**
 * Enqueue hosted stock automation work. Local development has no Queue binding
 * and returns false so callers can use the deterministic direct fallback.
 */
export async function enqueueSortJobs(
  context: unknown,
  jobs: SortQueueJob[],
): Promise<boolean> {
  if (!jobs.length) return true;

  const cloudflare = getCloudflareQueueContext(context);
  if (!cloudflare?.env) return false;

  const queue = cloudflare.env.STOCK_SORT_QUEUE;
  if (!queue) {
    throw new Error(
      "Hosted Worker is missing the required STOCK_SORT_QUEUE binding.",
    );
  }

  for (let index = 0; index < jobs.length; index += QUEUE_BATCH_SIZE) {
    const batch = jobs
      .slice(index, index + QUEUE_BATCH_SIZE)
      .map((body) => ({ body }));

    await queue.sendBatch(batch);
  }

  return true;
}
