import type { ActionFunctionArgs } from "react-router";
import { unauthenticated } from "../shopify.server";
import { sortEnabledCollections } from "../services/collection-sorter.server";
import {
  authenticateSignedWebhook,
  authorizeIntegrationRuntime,
  IntegrationHttpError,
  integrationErrorResponse,
  integrationJson,
  parseIntegrationJsonBody,
  recordIntegrationRequest,
  requireCollectionId,
} from "../services/integrations.server";

export async function action({ request }: ActionFunctionArgs) {
  try {
    const rawBody = await request.text();
    const { credential } = await authenticateSignedWebhook(
      request,
      rawBody,
    );
    const body = parseIntegrationJsonBody(rawBody);

    const { admin } = await unauthenticated.admin(credential.shop);
    await authorizeIntegrationRuntime(admin);

    const event = String(body.event || "").trim();
    if (event !== "collection.sort") {
      throw new IntegrationHttpError(
        400,
        "unsupported_event",
        "Supported webhook event: collection.sort.",
      );
    }

    const collectionId = requireCollectionId(body.collectionId);
    const results = await sortEnabledCollections(
      admin,
      credential.shop,
      [collectionId],
    );

    if (!results.length) {
      throw new IntegrationHttpError(
        409,
        "collection_not_enabled",
        "The collection is not enabled in VSN Stock Down Sort.",
      );
    }

    const result = results[0];
    if ("error" in result && result.error) {
      throw new IntegrationHttpError(
        422,
        "sort_failed",
        String(result.error).slice(0, 500),
      );
    }

    await recordIntegrationRequest(
      credential.shop,
      credential.id,
      "integration.webhook_collection_sort",
      "SUCCESS",
      { event, collectionId },
    );

    return integrationJson({
      ok: true,
      data: { event, collectionId, result },
    });
  } catch (error) {
    return integrationErrorResponse(error);
  }
}
