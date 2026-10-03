import type { LoaderFunctionArgs } from "react-router";
import { unauthenticated } from "../shopify.server";
import { getActivityHistory } from "../services/analytics.server";
import {
  authenticateIntegrationApi,
  authorizeIntegrationRuntime,
  integrationErrorResponse,
  integrationJson,
  recordIntegrationRequest,
} from "../services/integrations.server";

export async function loader({ request }: LoaderFunctionArgs) {
  try {
    const auth = await authenticateIntegrationApi(
      request,
      "activity:read",
    );
    const { admin } = await unauthenticated.admin(
      auth.credential.shop,
    );
    const current = await authorizeIntegrationRuntime(admin);

    const url = new URL(request.url);
    const requestedLimit = Number(url.searchParams.get("limit") || "50");
    const limit = Number.isInteger(requestedLimit)
      ? Math.min(Math.max(requestedLimit, 1), 100)
      : 50;

    const events = await getActivityHistory(
      auth.credential.shop,
      current.plan.option_ids,
      current.plan.history_retention_days,
      limit,
    );

    await recordIntegrationRequest(
      auth.credential.shop,
      auth.credential.id,
      "integration.api_activity_read",
      "SUCCESS",
      { limit, returned: events.length },
    );

    return integrationJson({
      ok: true,
      data: { events },
    });
  } catch (error) {
    return integrationErrorResponse(error);
  }
}
