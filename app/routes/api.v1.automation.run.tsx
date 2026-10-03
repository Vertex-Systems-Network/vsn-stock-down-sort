import type { ActionFunctionArgs } from "react-router";
import { unauthenticated } from "../shopify.server";
import { executeAutomationRule } from "../services/automation.server";
import {
  authenticateIntegrationApi,
  authorizeIntegrationRuntime,
  IntegrationHttpError,
  integrationErrorResponse,
  integrationJson,
  readIntegrationJson,
  recordIntegrationRequest,
  requireAutomationRuleId,
} from "../services/integrations.server";

export async function action({ request }: ActionFunctionArgs) {
  try {
    const { credential } = await authenticateIntegrationApi(
      request,
      "automation:run",
    );
    const { admin } = await unauthenticated.admin(credential.shop);
    const current = await authorizeIntegrationRuntime(admin);

    const body = await readIntegrationJson(request);
    const ruleId = requireAutomationRuleId(body.ruleId);
    const result = await executeAutomationRule(
      admin,
      credential.shop,
      ruleId,
      current.plan.option_ids,
      "api",
    );

    if (
      result.outcome === "ERROR" ||
      result.outcome === "ENTITLEMENT_BLOCKED"
    ) {
      throw new IntegrationHttpError(
        422,
        "automation_failed",
        result.error || "Automation rule could not run.",
      );
    }

    await recordIntegrationRequest(
      credential.shop,
      credential.id,
      "integration.api_automation_run",
      "SUCCESS",
      { ruleId, outcome: result.outcome },
    );

    return integrationJson({
      ok: true,
      data: { ruleId, result },
    });
  } catch (error) {
    return integrationErrorResponse(error);
  }
}
