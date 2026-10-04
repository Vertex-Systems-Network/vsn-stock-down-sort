import { useState } from "react";
import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData, useLocation } from "react-router";
import { PageShell } from "../components/BrandUi";

import {
  BILLING_CATALOG,
  BILLING_PLANS,
  getImplementedPlanFeatureNames,
  type PlanId,
} from "../billing-config";
import { openBillingConfirmation, submitBilling, type BillingSubmitResult } from "../billing-client";
import { PageIntro } from "../components/Workspace";
import { getAppEnvironment, isBillingTestMode } from "../environment.server";
import { authenticate } from "../shopify.server";
import {
  getAnyActiveSubscription,
  getCurrentSubscriptionPlan,
  getSubscriptionMismatchDiagnostic,
} from "../services/billing.server";
import { resolveSupportEntitlement } from "../services/support";

const ALL_IMPLEMENTED_FEATURES = Array.from(
  new Set(
    BILLING_PLANS.flatMap((plan) => getImplementedPlanFeatureNames(plan.id)),
  ),
);

const PLAN_DESCRIPTIONS: Record<PlanId, string> = {
  starter:
    "Core stock-aware sorting, exclusions and low-stock email alerts for everyday collection maintenance.",
  growth:
    "Add pinning, advanced sort rules, product visibility automation, schedules and Slack alerts.",
  pro:
    "Add multi-location inventory, conditional automation, analytics, history exports and priority support.",
  unlimited:
    "Unlock commerce contexts, external API integrations, unlimited history and 24/7 priority support.",
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
    subscriptionMismatch:
      activeSubscription && !current
        ? getSubscriptionMismatchDiagnostic(activeSubscription)
        : null,
    environment: getAppEnvironment(),
    billingTestMode: isBillingTestMode(),
  };
}

export default function PlansPage() {
  const {
    current,
    activeSubscription,
    subscriptionMismatch,
    environment,
    billingTestMode,
  } = useLoaderData<typeof loader>();
  const location = useLocation();

  const [result, setResult] = useState<BillingSubmitResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [pendingAction, setPendingAction] = useState("");

  const activeKnownPlan = current?.plan ?? null;
  const activeIsUnknown =
    Boolean(activeSubscription) && activeKnownPlan === null;

  async function runBilling(formData: FormData, pending: string) {
    if (submitting) return;

    setSubmitting(true);
    setPendingAction(pending);
    setResult(null);

    try {
      const response = await submitBilling(formData, location.search);
      setResult(response);

      if (response.confirmationUrl) {
        try {
          openBillingConfirmation(response.confirmationUrl);
        } catch (navigationError) {
          setResult({
            ...response,
            error:
              navigationError instanceof Error
                ? navigationError.message
                : "Shopify plan approval could not open automatically.",
          });
        }
      }

      if (response.cancelled) {
        window.location.reload();
      }
    } catch (error) {
      setResult({
        error:
          error instanceof Error
            ? error.message
            : "Billing could not complete. Try again.",
      });
    } finally {
      setSubmitting(false);
      setPendingAction("");
    }
  }

  function choosePlan(planId: PlanId) {
    if (activeIsUnknown) return;

    const plan = BILLING_PLANS.find((candidate) => candidate.id === planId);
    if (!plan) return;

    if (
      activeKnownPlan &&
      !window.confirm(
        "Change from " +
          activeKnownPlan.name +
          " to " +
          plan.name +
          " at $" +
          plan.amount.toFixed(2) +
          " USD every 30 days? Shopify will show the billing details before approval.",
      )
    ) {
      return;
    }

    const formData = new FormData();
    formData.set("actionType", "subscribe");
    formData.set("planId", planId);
    void runBilling(formData, planId);
  }

  function cancelActiveSubscription() {
    if (!activeSubscription?.id) return;

    if (
      !window.confirm(
        activeIsUnknown
          ? "Cancel this incompatible Shopify subscription so you can choose a current VSN plan?"
          : "Cancel this Shopify subscription? Your saved app data will remain.",
      )
    ) {
      return;
    }

    const formData = new FormData();
    formData.set("actionType", "cancel");
    formData.set("id", activeSubscription.id);
    void runBilling(formData, "cancel");
  }

  return (
    <PageShell>
      <PageIntro
        eyebrow="Room to grow"
        title="Choose the right automation level for your store."
        description="Every plan keeps product and collection counts unlimited. Upgrade capabilities as your merchandising workflow grows."
      />

      {billingTestMode ? (
        <div className="vsn-notice">
          <strong>Test billing is enabled.</strong> This {environment} environment
          uses Shopify test subscriptions. No real merchant charge is created.
        </div>
      ) : null}

      {activeKnownPlan?.id === "unlimited" && current?.source === "legacy" ? (
        <div className="vsn-notice warning">
          <strong>Legacy subscription detected.</strong> Your existing legacy
          subscription is treated as Unlimited-compatible access until you
          choose a current plan.
        </div>
      ) : null}

      {activeIsUnknown ? (
        <div className="vsn-notice warning">
          <strong>A previous subscription no longer matches the current catalog.</strong>
          {subscriptionMismatch ? (
            <>
              {" "}
              {subscriptionMismatch.name} ·{" "}
              {subscriptionMismatch.test ? "Test" : "Live"} ·{" "}
              {subscriptionMismatch.amount == null
                ? "price unavailable"
                : "$" +
                  subscriptionMismatch.amount.toFixed(2) +
                  " " +
                  (subscriptionMismatch.currencyCode ?? "")}{" "}
              · {subscriptionMismatch.trialDays ?? 0}-day trial.
              <ul>
                {subscriptionMismatch.reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            </>
          ) : null}
          <button
            className="vsn-button danger"
            type="button"
            disabled={submitting || !activeSubscription}
            onClick={cancelActiveSubscription}
          >
            {submitting && pendingAction === "cancel"
              ? "Cancelling…"
              : "Cancel incompatible subscription"}
          </button>
        </div>
      ) : null}

      {activeKnownPlan ? (
        <div className="vsn-notice success">
          <strong>{activeKnownPlan.name} is active.</strong>{" "}
          {current?.subscription.test ? "Test subscription · " : ""}
          {current?.subscription.currentPeriodEnd
            ? "Current period ends " +
              new Date(
                current.subscription.currentPeriodEnd,
              ).toLocaleDateString() +
              "."
            : "Your plan entitlements are ready."}
        </div>
      ) : null}

      {result?.confirmationUrl ? (
        <div className="vsn-notice" role="status">
          Shopify approval is ready.{" "}
          <a
            className="vsn-approval-link"
            href={result.confirmationUrl}
            target="_top"
            rel="noreferrer"
          >
            Continue to Shopify plan approval
          </a>
          . If Shopify did not open automatically, use this link.
        </div>
      ) : null}

      {result?.error ? (
        <div className="vsn-notice error" role="alert">
          {result.error}
        </div>
      ) : null}

      <div className="vsn-plan-grid">
        {BILLING_PLANS.map((plan) => {
          const currentPlan = activeKnownPlan?.id === plan.id;
          const featured = plan.id === "growth";
          const support = resolveSupportEntitlement(plan);
          const features = getImplementedPlanFeatureNames(plan.id);
          const planIndex = BILLING_PLANS.findIndex(
            (candidate) => candidate.id === plan.id,
          );
          const previousPlan =
            planIndex > 0 ? BILLING_PLANS[planIndex - 1] : null;
          const previousFeatures = new Set(
            previousPlan
              ? getImplementedPlanFeatureNames(previousPlan.id)
              : [],
          );
          const addedFeatures = features.filter(
            (feature) =>
              !previousFeatures.has(feature) &&
              feature !== "Priority support entitlement",
          );

          return (
            <article
              key={plan.id}
              className={["vsn-plan", featured ? "featured" : ""]
                .filter(Boolean)
                .join(" ")}
              aria-label={plan.name + " plan"}
            >
              <div className="vsn-plan-label">
                {currentPlan
                  ? "Your current plan"
                  : featured
                    ? "Most popular · Advanced merchandising"
                    : plan.id === "unlimited"
                      ? "Complete automation suite"
                      : plan.id === "pro"
                        ? "Operations & analytics"
                        : "Start with the essentials"}
              </div>

              <h2>{plan.name}</h2>
              <p>{PLAN_DESCRIPTIONS[plan.id]}</p>

              <div className="vsn-price">
                {"$" + plan.amount.toFixed(2)}
                <span> USD / 30 days</span>
              </div>

              <div className="vsn-trial">
                {activeKnownPlan
                  ? "Plan changes require Shopify approval"
                  : plan.trial_days +
                    "-day trial, then $" +
                    plan.amount.toFixed(2) +
                    " every 30 days"}
              </div>

              <div className="vsn-plan-summary">
                {previousPlan
                  ? "Everything in " +
                    previousPlan.name +
                    ", plus " +
                    addedFeatures.length +
                    " capability" +
                    (addedFeatures.length === 1 ? "" : "ies")
                  : features.length +
                    " core capabilities included from day one"}
              </div>

              <ul>
                <li>{support.label}</li>
                {addedFeatures.map((feature) => (
                  <li key={feature}>{feature}</li>
                ))}
              </ul>

              <button
                className={[
                  "vsn-button",
                  !currentPlan && featured ? "primary" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                type="button"
                disabled={
                  submitting ||
                  activeIsUnknown ||
                  currentPlan ||
                  Boolean(result?.confirmationUrl)
                }
                onClick={() => choosePlan(plan.id)}
              >
                {submitting && pendingAction === plan.id
                  ? "Opening Shopify…"
                  : currentPlan
                    ? "Current plan"
                    : activeKnownPlan
                      ? "Switch to " + plan.name
                      : "Start " + plan.trial_days + "-day trial"}
              </button>

              <div className="vsn-plan-status">
                {plan.history_retention_days == null
                  ? "Unlimited activity history retention"
                  : plan.history_retention_days +
                    "-day activity history retention"}
              </div>
            </article>
          );
        })}
      </div>

      <div className="vsn-table-wrap">
        <table className="vsn-comparison">
          <caption>Compare plans</caption>
          <thead>
            <tr>
              <th scope="col">Capability</th>
              {BILLING_PLANS.map((plan) => (
                <th scope="col" key={plan.id}>
                  {plan.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">Price / 30 days</th>
              {BILLING_PLANS.map((plan) => (
                <td key={plan.id}>{"$" + plan.amount.toFixed(2)}</td>
              ))}
            </tr>
            <tr>
              <th scope="row">Free trial</th>
              {BILLING_PLANS.map((plan) => (
                <td key={plan.id}>{plan.trial_days} days</td>
              ))}
            </tr>
            <tr>
              <th scope="row">Products & collections</th>
              {BILLING_PLANS.map((plan) => (
                <td key={plan.id}>Unlimited</td>
              ))}
            </tr>
            <tr>
              <th scope="row">History retention</th>
              {BILLING_PLANS.map((plan) => (
                <td key={plan.id}>
                  {plan.history_retention_days == null
                    ? "Unlimited"
                    : plan.history_retention_days + " days"}
                </td>
              ))}
            </tr>
            <tr>
              <th scope="row">Support</th>
              {BILLING_PLANS.map((plan) => (
                <td key={plan.id}>{resolveSupportEntitlement(plan).label}</td>
              ))}
            </tr>
            {ALL_IMPLEMENTED_FEATURES.map((feature) => (
              <tr key={feature}>
                <th scope="row">{feature}</th>
                {BILLING_PLANS.map((plan) => {
                  const included =
                    getImplementedPlanFeatureNames(plan.id).includes(feature);

                  return (
                    <td key={plan.id}>
                      <span
                        className={
                          included ? "vsn-feature-check" : "vsn-feature-empty"
                        }
                        aria-label={included ? "Included" : "Not included"}
                      >
                        {included ? "✓ Included" : "—"}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="vsn-notice">
        Every plan includes unlimited products and collections, automatic
        sold-out sorting, manual Sort Now and a {BILLING_CATALOG.trialDays}-day
        trial. Shopify displays the exact billing terms before you approve a
        new subscription or plan change.
      </div>

      {activeSubscription && !activeIsUnknown ? (
        <div className="vsn-hero-actions">
          <button
            className="vsn-button danger"
            type="button"
            disabled={submitting || Boolean(result?.confirmationUrl)}
            onClick={cancelActiveSubscription}
          >
            {submitting && pendingAction === "cancel"
              ? "Cancelling subscription…"
              : "Cancel active subscription"}
          </button>
        </div>
      ) : null}
    </PageShell>
  );
}
