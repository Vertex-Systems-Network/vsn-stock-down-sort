import type { ActionFunctionArgs } from "react-router";
import { unauthenticated } from "../shopify.server";
import { sortEnabledCollections } from "../services/collection-sorter.server";
import {
  authenticateIntegrationApi,
  authorizeIntegrationRuntime,
  IntegrationHttpError,
  integrationErrorResponse,
  integrationJson,
  readIntegrationJson,
  recordIntegrationRequest,
  requireCollectionId,
} from "../services/integrations.server";

export async function action({ request }: ActionFunctionArgs) {
  try {
    const { credential } = await authenticateIntegrationApi(
      request,
      "collections:sort",
    );
    const { admin } = await unauthenticated.admin(credential.shop);
    await authorizeIntegrationRuntime(admin);

    const body = await readIntegrationJson(request);
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
      "integration.api_collection_sort",
      "SUCCESS",
      { collectionId },
    );

    return integrationJson({
      ok: true,
      data: { collectionId, result },
    });
  } catch (error) {
    return integrationErrorResponse(error);
  }
}
