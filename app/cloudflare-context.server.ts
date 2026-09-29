type WorkerExecutionContextLike = {
  waitUntil(promise: Promise<unknown>): void;
};

type CloudflareLoadContextLike = {
  cloudflare?: {
    ctx?: WorkerExecutionContextLike;
  };
};

/**
 * Keep long-running webhook work alive without delaying the HTTP response when
 * the app runs inside Cloudflare Workers. Local/non-Worker runtimes fall back
 * to awaiting the task so behavior remains deterministic during development.
 */
export async function runWithWorkerLifetime(
  context: unknown,
  task: () => Promise<void>,
) {
  const promise = task();
  const workerContext = (context as CloudflareLoadContextLike | undefined)
    ?.cloudflare?.ctx;

  if (workerContext) {
    workerContext.waitUntil(promise);
    return;
  }

  await promise;
}
