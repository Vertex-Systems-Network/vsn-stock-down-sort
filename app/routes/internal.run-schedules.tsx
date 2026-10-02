import type { ActionFunctionArgs } from "react-router";
import { unauthenticated } from "../shopify.server";
import {
  AUTOMATION_SCHEDULER_BATCH_LIMIT,
  claimDueAutomationRules,
  executeAutomationRule,
  failClaimedAutomationRule,
} from "../services/automation.server";

type ScheduledContextLike = {
  cloudflare?: {
    scheduledConsumer?: boolean;
  };
};

function isScheduledConsumer(context: unknown) {
  return (
    (context as ScheduledContextLike | undefined)?.cloudflare
      ?.scheduledConsumer === true
  );
}

export async function action({ request, context }: ActionFunctionArgs) {
  if (!isScheduledConsumer(context)) {
    return new Response("Not found", { status: 404 });
  }

  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const claimed = await claimDueAutomationRules(
    new Date(),
    AUTOMATION_SCHEDULER_BATCH_LIMIT,
  );

  const results = [];

  for (const rule of claimed) {
    try {
      const { admin } = await unauthenticated.admin(rule.shop);
      const result = await executeAutomationRule(
        admin,
        rule.shop,
        rule.id,
        undefined,
        "scheduled",
      );
      results.push(result);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Scheduled automation failed.";
      await failClaimedAutomationRule(rule.shop, rule.id, message);
      results.push({
        ruleId: rule.id,
        executed: false,
        outcome: "ERROR",
        error: message,
      });
    }
  }

  return Response.json({
    ok: true,
    claimed: claimed.length,
    processed: results.length,
    results,
  });
}
