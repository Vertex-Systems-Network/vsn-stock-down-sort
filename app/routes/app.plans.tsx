import { useEffect, useRef } from "react";
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
import { resolveSupportEntitlement } from "../services/support";

type SubscriptionActionResult = {
  ok?: boolean;
  cancelled?: boolean;
  planId?: PlanId;
  confirmationUrl?: string;
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
  const errorRef = useRef<HTMLDivElement | null>(null);
  const isLoading = fetcher.state !== "idle";
  const activeKnownPlan = current?.plan ?? null;
  const activeIsUnknown =
    Boolean(activeSubscription) && activeKnownPlan === null;

  useEffect(() => {
    if (fetcher.data?.cancelled) window.location.reload();
  }, [fetcher.data?.cancelled]);

  useEffect(() => {
    if (!fetcher.data?.confirmationUrl) return;

    open(fetcher.data.confirmationUrl, "_top");
  }, [fetcher.data?.confirmationUrl]);

  useEffect(() => {
    if (!fetcher.data?.error || !errorRef.current) return;

    window.requestAnimationFrame(() => {
      errorRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
      errorRef.current?.focus({ preventScroll: true });
    });
  }, [fetcher.data?.error]);

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
      defaultShouldRevalidate: false,
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
    <s-page heading="Packages">
      <s-stack gap="large-300">
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
          <div ref={errorRef} tabIndex={-1}>
            <s-banner tone="critical" heading="Subscription update failed">
              {fetcher.data.error}
            </s-banner>
          </div>
        ) : null}

        <s-box
          background="subdued"
          border="base base solid"
          borderRadius="large"
          padding="large-400"
        >
          <s-stack gap="base">
            <s-heading>Unlimited catalog. Simple plans.</s-heading>
            <s-text>
              Every plan includes unlimited products and collections, automatic
              sold-out sorting, and a {BILLING_CATALOG.trialDays}-day free trial.
              Choose the capability level that fits your store today.
            </s-text>
            <s-stack direction="inline" gap="small-200">
              <s-badge tone="success">
                {BILLING_CATALOG.trialDays}-day free trial
              </s-badge>
              <s-badge tone="info">Unlimited products</s-badge>
              <s-badge tone="info">Unlimited collections</s-badge>
              <s-badge tone="info">Support included</s-badge>
            </s-stack>
          </s-stack>
        </s-box>

        <s-grid
          gridTemplateColumns="repeat(auto-fit, minmax(250px, 1fr))"
          gap="base"
        >
          {BILLING_PLANS.map((plan) => {
            const support = resolveSupportEntitlement(plan);
            const isCurrent = activeKnownPlan?.id === plan.id;
            const isFeatured = plan.id === "growth";
            const implementedFeatures = getImplementedPlanFeatureNames(plan.id);
            const roadmapFeatures = plan.featureNames.filter(
              (feature) => !implementedFeatures.includes(feature),
            );

            return (
              <s-box
                key={plan.id}
                background={isFeatured ? "subdued" : "base"}
                border="base base solid"
                borderRadius="large"
                padding="large-300"
              >
                <s-stack gap="base">
                  <s-stack direction="inline" gap="small-200">
                    <s-heading>{plan.name}</s-heading>
                    {isFeatured && !isCurrent ? (
                      <s-badge tone="success">Most popular</s-badge>
                    ) : null}
                    {isCurrent ? (
                      <s-badge tone="success">Current plan</s-badge>
                    ) : null}
                  </s-stack>

                  <s-stack gap="small-100">
                    <s-heading>{`$${plan.amount.toFixed(2)}`}</s-heading>
                    <s-text>USD every 30 days</s-text>
                  </s-stack>

                  <s-badge tone="info">
                    {plan.trial_days}-day free trial
                  </s-badge>

                  <s-text>
                    Unlimited products · unlimited collections · {support.label}
                  </s-text>

                  <s-divider />

                  <s-stack gap="small-300">
                    <s-text type="strong">Included now</s-text>
                    {implementedFeatures.map((feature) => (
                      <s-stack key={feature} direction="inline" gap="small-200">
                        <s-icon
                          type="check-circle"
                          tone="success"
                          size="small"
                        />
                        <s-text>{feature}</s-text>
                      </s-stack>
                    ))}
                  </s-stack>

                  {roadmapFeatures.length > 0 ? (
                    <s-box
                      background="subdued"
                      borderRadius="base"
                      padding="base"
                    >
                      <s-stack gap="small-200">
                        <s-text type="strong">Coming with this tier</s-text>
                        {roadmapFeatures.map((feature) => (
                          <s-text key={feature}>• {feature}</s-text>
                        ))}
                      </s-stack>
                    </s-box>
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
                        : `Start ${plan.trial_days}-day free trial`}
                  </s-button>
                </s-stack>
              </s-box>
            );
          })}
        </s-grid>

        <s-box
          background="subdued"
          borderRadius="large"
          padding="large-300"
        >
          <s-stack gap="small-300">
            <s-heading>What every plan includes</s-heading>
            <s-grid
              gridTemplateColumns="repeat(auto-fit, minmax(180px, 1fr))"
              gap="small"
            >
              <s-text>✓ Unlimited products</s-text>
              <s-text>✓ Unlimited collections</s-text>
              <s-text>✓ Automatic sold-out sorting</s-text>
              <s-text>✓ Manual Sort Now</s-text>
              <s-text>✓ Bulk collection controls</s-text>
              <s-text>✓ Restore previous sort order</s-text>
            </s-grid>
          </s-stack>
        </s-box>

        {activeSubscription ? (
          <s-box
            border="base base solid"
            borderRadius="large"
            padding="large-300"
          >
            <s-stack gap="small-300">
              <s-heading>Subscription controls</s-heading>
              <s-text>Active subscription: {activeSubscription.name}</s-text>
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
                disabled={isLoading || activeIsUnknown}
                onClick={cancelActiveSubscription}
              >
                Cancel subscription
              </s-button>
            </s-stack>
          </s-box>
        ) : null}
      </s-stack>
    </s-page>
  );
}
