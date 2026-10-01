import { useEffect } from "react";
import type { LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import {
  BILLING_CATALOG,
  BILLING_PLANS,
  getImplementedPlanFeatureNames,
  type PlanId,
} from "../billing-config";
import { getAppEnvironment, isBillingTestMode } from "../environment.server";
import { authenticate } from "../shopify.server";
import {
  getAnyActiveSubscription,
  getCurrentSubscriptionPlan,
} from "../services/billing.server";

type SubscriptionActionResult = {
  ok?: boolean;
  confirmationUrl?: string;
  cancelled?: boolean;
  planId?: PlanId;
  error?: string;
};

export async function loader({ request }: LoaderFunctionArgs) {
  const { admin } = await authenticate.admin(request);
  const [current, activeSubscription] = await Promise.all([
    getCurrentSubscriptionPlan(admin),
    getAnyActiveSubscription(admin),
  ]);

  return {
    current,
    activeSubscription,
    environment: getAppEnvironment(),
    billingTestMode: isBillingTestMode(),
  };
}

export default function PlansPage() {
  const { current, activeSubscription, environment, billingTestMode } =
    useLoaderData<typeof loader>();
  const fetcher = useFetcher<SubscriptionActionResult>();
  const isLoading = fetcher.state !== "idle";
  const activeKnownPlan = current?.plan ?? null;
  const activeIsUnknown =
    Boolean(activeSubscription) && activeKnownPlan === null;

  useEffect(() => {
    if (!fetcher.data?.confirmationUrl) return;
    if (window.top) {
      window.top.location.href = fetcher.data.confirmationUrl;
      return;
    }
    window.location.href = fetcher.data.confirmationUrl;
  }, [fetcher.data?.confirmationUrl]);

  useEffect(() => {
    if (fetcher.data?.cancelled) window.location.reload();
  }, [fetcher.data?.cancelled]);

  function submitPlan(planId: PlanId) {
    const formData = new FormData();
    formData.set("actionType", "subscribe");
    formData.set("planId", planId);

    const params = new URLSearchParams(window.location.search);
    const host = params.get("host");
    if (host) formData.set("host", host);

    fetcher.submit(formData, {
      method: "post",
      action: `/app/api/subscription${window.location.search}`,
    });
  }

  function cancelActiveSubscription() {
    if (!activeSubscription?.id) return;

    const formData = new FormData();
    formData.set("actionType", "cancel");
    formData.set("id", activeSubscription.id);

    const params = new URLSearchParams(window.location.search);
    const host = params.get("host");
    if (host) formData.set("host", host);

    fetcher.submit(formData, {
      method: "post",
      action: `/app/api/subscription${window.location.search}`,
    });
  }

  return (
    <s-page heading="Plans" inlineSize="large">
      {billingTestMode ? (
        <s-banner tone="info" heading="Test billing is enabled">
          This {environment} environment uses Shopify test subscriptions. No
          real merchant charge is created in Local or Staging.
        </s-banner>
      ) : null}

      {activeKnownPlan?.id === "unlimited" && current?.source === "legacy" ? (
        <s-banner tone="warning" heading="Legacy subscription detected">
          Your existing legacy subscription is being treated as
          Unlimited-compatible access. You can switch to a current plan below;
          Shopify will ask you to approve the replacement.
        </s-banner>
      ) : null}

      {activeIsUnknown ? (
        <s-banner tone="critical" heading="Subscription needs review">
          An active Shopify subscription is attached to this app, but it does
          not match an approved VSN plan. Plan changes are blocked until that
          subscription is reviewed.
        </s-banner>
      ) : null}

      {fetcher.data?.error ? (
        <s-banner tone="critical" heading="Subscription update failed">
          {fetcher.data.error}
        </s-banner>
      ) : null}

      <s-section heading="Choose your plan">
        <s-stack gap="base">
          <s-text>
            Every plan includes unlimited products and collections, a{" "}
            {BILLING_CATALOG.trialDays}-day free trial, and recurring billing
            every 30 days. Higher tiers unlock additional capabilities as they
            are implemented and certified.
          </s-text>

          <s-query-container>
            <s-grid
              gridTemplateColumns="@container (inline-size > 1050px) repeat(4, 1fr), @container (inline-size > 650px) repeat(2, 1fr), 1fr"
              gap="base"
            >
              {BILLING_PLANS.map((plan) => {
                const isCurrent = activeKnownPlan?.id === plan.id;
                const implementedFeatures = getImplementedPlanFeatureNames(
                  plan.id,
                );
                const roadmapFeatures = plan.featureNames.filter(
                  (feature) => !implementedFeatures.includes(feature),
                );

                return (
                  <s-grid-item key={plan.id}>
                    <s-box
                      padding="large-300"
                      background="base"
                      borderRadius="base"
                      borderWidth="base"
                      borderColor="base"
                    >
                      <s-stack gap="base">
                        <s-stack direction="inline" gap="small-200">
                          <s-heading>{plan.name}</s-heading>
                          {isCurrent ? (
                            <s-badge tone="success">Current</s-badge>
                          ) : null}
                        </s-stack>

                        <s-heading>
                          ${"$"}{plan.amount.toFixed(2)} USD / 30 days
                        </s-heading>

                        <s-badge tone="info">
                          {plan.trial_days}-day free trial
                        </s-badge>

                        <s-text>
                          {plan.support} support · unlimited products ·
                          unlimited collections
                        </s-text>

                        <s-divider />

                        <s-text type="strong">Available now</s-text>
                        <s-stack gap="small-200">
                          {implementedFeatures.map((feature) => (
                            <s-text key={feature}>✓ {feature}</s-text>
                          ))}
                        </s-stack>

                        {roadmapFeatures.length > 0 ? (
                          <>
                            <s-text type="strong">Planned capabilities</s-text>
                            <s-stack gap="small-200">
                              {roadmapFeatures.map((feature) => (
                                <s-text key={feature}>• {feature}</s-text>
                              ))}
                            </s-stack>
                          </>
                        ) : null}

                        <s-button
                          variant={isCurrent ? "secondary" : "primary"}
                          loading={isLoading}
                          disabled={isLoading || activeIsUnknown || isCurrent}
                          onClick={() => submitPlan(plan.id)}
                        >
                          {isCurrent
                            ? "Current plan"
                            : activeKnownPlan
                              ? `Switch to ${plan.name}`
                              : `Start ${plan.trial_days}-day trial`}
                        </s-button>
                      </s-stack>
                    </s-box>
                  </s-grid-item>
                );
              })}
            </s-grid>
          </s-query-container>

          {activeSubscription ? (
            <s-section heading="Subscription controls">
              <s-stack gap="small-300">
                <s-text>
                  Active subscription: {activeSubscription.name}
                </s-text>
                {activeSubscription.currentPeriodEnd ? (
                  <s-text>
                    Current period ends:{" "}
                    {new Date(
                      activeSubscription.currentPeriodEnd,
                    ).toLocaleDateString()}
                  </s-text>
                ) : null}
                <s-button
                  tone="critical"
                  loading={isLoading}
                  disabled={isLoading}
                  onClick={cancelActiveSubscription}
                >
                  Cancel subscription
                </s-button>
              </s-stack>
            </s-section>
          ) : null}
        </s-stack>
      </s-section>
    </s-page>
  );
}
