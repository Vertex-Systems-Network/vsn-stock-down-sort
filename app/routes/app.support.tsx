import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { getCurrentSubscriptionPlan } from "../services/billing.server";
import { resolveSupportEntitlement } from "../services/support";

export async function loader({ request }: LoaderFunctionArgs) {
  const { admin } = await authenticate.admin(request);
  const current = await getCurrentSubscriptionPlan(admin);

  return {
    currentPlan: current
      ? {
          id: current.plan.id,
          name: current.plan.name,
        }
      : null,
    support: current
      ? resolveSupportEntitlement(current.plan)
      : null,
  };
}

export default function SupportPage() {
  const { currentPlan, support } = useLoaderData<typeof loader>();

  return (
    <s-page heading="Support entitlement" inlineSize="large">
      <s-section>
        <s-stack gap="base">
          <s-text>
            This page shows the support tier included by your active VSN Stock
            Down Sort plan.
          </s-text>

          {currentPlan && support ? (
            <>
              <s-stack direction="inline" gap="base">
                <s-badge tone="info">{currentPlan.name} plan</s-badge>
                <s-badge tone={support.priority ? "success" : "info"}>
                  {support.label}
                </s-badge>
              </s-stack>

              <s-box
                background="subdued"
                borderRadius="large"
                padding="base"
              >
                <s-stack gap="small-200">
                  <s-heading>{support.label}</s-heading>
                  {support.tier === "STANDARD" ? (
                    <s-text>
                      Starter and Growth include the standard support
                      entitlement.
                    </s-text>
                  ) : support.tier === "PRIORITY" ? (
                    <s-text>
                      Pro includes the priority support entitlement.
                    </s-text>
                  ) : (
                    <s-text>
                      Unlimited includes the catalog&apos;s 24/7 priority
                      support entitlement.
                    </s-text>
                  )}
                </s-stack>
              </s-box>
            </>
          ) : (
            <s-banner tone="warning">
              No recognized active VSN plan is available for support
              entitlement resolution.
            </s-banner>
          )}

          <s-banner tone="info" heading="Operational boundary">
            This repository certifies the commercial support tier only. It
            does not define or publish a response-time SLA, support contact
            method, escalation procedure, or staffing commitment. Those
            operational terms must be configured and published separately.
          </s-banner>
        </s-stack>
      </s-section>
    </s-page>
  );
}
