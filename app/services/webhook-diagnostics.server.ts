type WebhookErrorShape = {
  name?: unknown;
  code?: unknown;
};

function getErrorShape(error: unknown): WebhookErrorShape {
  if (!error || typeof error !== "object") return {};
  const candidate = error as WebhookErrorShape;
  return {
    name: typeof candidate.name === "string" ? candidate.name : undefined,
    code: typeof candidate.code === "string" ? candidate.code : undefined,
  };
}

/**
 * Logs correlation IDs and stable Prisma error codes for shop-data purge
 * failures without logging shop data, SQL, tokens, or database connection URLs.
 */
export function logShopDataPurgeFailure(
  request: Request,
  topic: "app/uninstalled" | "shop/redact",
  error: unknown,
) {
  const { name, code } = getErrorShape(error);
  console.error(
    JSON.stringify({
      event: "shop_data_purge_failed",
      topic,
      shopifyEventId: request.headers.get("x-shopify-event-id"),
      cloudflareRayId: request.headers.get("cf-ray"),
      errorName: name ?? "UnknownError",
      prismaCode: code ?? null,
    }),
  );
}
