export type SortQueueJob = {
  kind: "sort" | "enable";
  shop: string;
  collectionId: string;
  reason: "inventory-update" | "product-update" | "bulk-enable";
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

function getQueue(context: unknown) {
  return (context as CloudflareQueueContextLike | undefined)?.cloudflare?.env
    ?.STOCK_SORT_QUEUE;
}

/**
 * Enqueue hosted sorting work. Local development has no Queue binding and
 * returns false so callers can use the deterministic direct fallback.
 */
export async function enqueueSortJobs(
  context: unknown,
  jobs: SortQueueJob[],
): Promise<boolean> {
  if (!jobs.length) return true;

  const queue = getQueue(context);
  if (!queue) return false;

  for (let index = 0; index < jobs.length; index += QUEUE_BATCH_SIZE) {
    const batch = jobs
      .slice(index, index + QUEUE_BATCH_SIZE)
      .map((body) => ({ body }));

    await queue.sendBatch(batch);
  }

  return true;
}
