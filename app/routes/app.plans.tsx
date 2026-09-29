import { useEffect } from "react";
import type { LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { PRO_PLAN, PRO_PLAN_FEATURES } from "../billing-config";
import { getAppEnvironment, isBillingTestMode } from "../environment.server";
import { authenticate } from "../shopify.server";
import { getCurrentSubscription } from "../services/billing.server";

type SubscriptionActionResult = {
  ok?: boolean;
  confirmationUrl?: string;
  cancelled?: boolean;
  error?: string;
};

export async function loader({ request }: LoaderFunctionArgs) {
  const { admin } = await authenticate.admin(request);
  const subscription = await getCurrentSubscription(admin);

  return {
    subscription,
    environment: getAppEnvironment(),
    billingTestMode: isBillingTestMode(),
  };
}

export default function PlansPage() {
  const { subscription, environment, billingTestMode } =
    useLoaderData<typeof loader>();
  const fetcher = useFetcher<SubscriptionActionResult>();
  const isLoading = fetcher.state !== "idle";
  const isProActive =
    subscription?.status === "ACTIVE" && subscription.name === PRO_PLAN.name;

  useEffect(() => {
    if (!fetcher.data?.confirmationUrl) return;

    if (window.top) {
      window.top.location.href = fetcher.data.confirmationUrl;
      return;
    }

    window.location.href = fetcher.data.confirmationUrl;
  }, [fetcher.data?.confirmationUrl]);

  useEffect(() => {
    if (fetcher.data?.cancelled) {
      window.location.reload();
    }
  }, [fetcher.data?.cancelled]);

  function submitSubscriptionAction(actionType: "create" | "cancel") {
    const formData = new FormData();
    formData.set("actionType", actionType);

    const params = new URLSearchParams(window.location.search);
    const host = params.get("host");
    if (host) {
      formData.set("host", host);
    }

    if (actionType === "cancel" && subscription?.id) {
      formData.set("id", subscription.id);
    }

    fetcher.submit(formData, {
      method: "post",
      action: `/app/api/subscription${window.location.search}`,
    });
  }

  return (
    <s-page heading="Plans" inlineSize="large">
      {billingTestMode ? (
        <s-banner tone="info" heading="Test billing is enabled">
          This {environment} environment creates Shopify test subscriptions and
          does not create a real merchant charge.
        </s-banner>
      ) : null}

      {fetcher.data?.error ? (
        <s-banner tone="critical" heading="Subscription update failed">
          {fetcher.data.error}
        </s-banner>
      ) : null}

      <s-grid gridTemplateColumns="repeat(12, 1fr)" gap="base">
        <s-grid-item gridColumn="span 8" gridRow="span 1">
          <s-section>
            <s-box
              padding="large-300"
              background="base"
              borderRadius="base"
              borderWidth="base"
              borderColor="base"
            >
              <s-stack gap="base">
                <s-stack direction="inline" gap="base">
                  <s-heading>Pro Plan</s-heading>
                  {isProActive ? (
                    <s-badge tone="success">Active plan</s-badge>
                  ) : (
                    <s-badge tone="info">{PRO_PLAN.trialDays}-day free trial</s-badge>
                  )}
                </s-stack>

                <s-heading>
                  ${PRO_PLAN.amount} USD every 30 days
                </s-heading>

                <s-text>
                  Start with a {PRO_PLAN.trialDays}-day free trial. Shopify
                  begins recurring billing after the trial according to the
                  approved subscription.
                </s-text>

                <s-stack gap="small-300">
                  {PRO_PLAN_FEATURES.map((feature) => (
                    <s-text key={feature}>✓ {feature}</s-text>
                  ))}
                </s-stack>

                {subscription?.currentPeriodEnd ? (
                  <s-text>
                    Current billing period ends:{" "}
                    {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
                  </s-text>
                ) : null}

                {isProActive ? (
                  <s-stack gap="small-300">
                    <s-text tone="success">
                      VSN Stock Down Sort Pro is active for this shop.
                    </s-text>
                    <s-button
                      tone="critical"
                      loading={isLoading}
                      disabled={isLoading}
                      onClick={() => submitSubscriptionAction("cancel")}
                    >
                      Cancel subscription
                    </s-button>
                  </s-stack>
                ) : (
                  <s-button
                    variant="primary"
                    loading={isLoading}
                    disabled={isLoading || Boolean(subscription)}
                    onClick={() => submitSubscriptionAction("create")}
                  >
                    Start {PRO_PLAN.trialDays}-day free trial
                  </s-button>
                )}

                {subscription && !isProActive ? (
                  <s-banner tone="warning">
                    Another active subscription is attached to this app. Cancel
                    it before starting the Pro plan.
                  </s-banner>
                ) : null}
              </s-stack>
            </s-box>
          </s-section>
        </s-grid-item>

        <s-grid-item gridColumn="span 4" gridRow="span 1">
          <s-section heading="What is included">
            <s-stack gap="base">
              <s-text>
                There are no VSN-imposed product or collection limits on this
                plan.
              </s-text>
              <s-text>
                Inventory and product webhooks keep enabled collections updated
                after changes in Shopify.
              </s-text>
              <s-text>
                Support is available 24/7 for subscription and sorting issues.
              </s-text>
            </s-stack>
          </s-section>
        </s-grid-item>
      </s-grid>
    </s-page>
  );
}
