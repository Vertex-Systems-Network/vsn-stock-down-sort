import {
  BILLING_CATALOG,
  BILLING_PLAN_BY_ID,
  BILLING_PLANS,
  LEGACY_PLAN,
  type PlanId,
} from "../billing-config";
import { getAppEnvironment, isBillingTestMode } from "../environment.server";
import { authenticate } from "../shopify.server";

type AdminClient = Awaited<ReturnType<typeof authenticate.admin>>["admin"];

type AppPricingDetails = {
  __typename: string;
  interval?: string;
  price?: {
    amount: string;
    currencyCode: string;
  };
};

type AppSubscriptionLineItem = {
  plan: {
    pricingDetails: AppPricingDetails;
  };
};

export type AppSubscription = {
  id: string;
  name: string;
  status: string;
  test: boolean;
  currentPeriodEnd?: string | null;
  trialDays?: number | null;
  lineItems?: AppSubscriptionLineItem[];
};

export type ResolvedSubscriptionPlan = {
  planId: PlanId;
  source: "current" | "legacy";
};

type SubscriptionQueryPayload = {
  data?: {
    currentAppInstallation?: {
      activeSubscriptions?: AppSubscription[];
    };
  };
  errors?: Array<{ message?: string }>;
};

type CreateSubscriptionPayload = {
  data?: {
    appSubscriptionCreate?: {
      confirmationUrl?: string | null;
      appSubscription?: AppSubscription | null;
      userErrors?: Array<{ field?: string[] | null; message: string }>;
    };
  };
  errors?: Array<{ message?: string }>;
};

type CancelSubscriptionPayload = {
  data?: {
    appSubscriptionCancel?: {
      appSubscription?: AppSubscription | null;
      userErrors?: Array<{ field?: string[] | null; message: string }>;
    };
  };
  errors?: Array<{ message?: string }>;
};

function firstGraphqlError(payload: { errors?: Array<{ message?: string }> }) {
  return payload.errors?.find((error) => error.message)?.message;
}

function hasPlanPricing(
  subscription: AppSubscription,
  plan: (typeof BILLING_PLANS)[number],
) {
  if (subscription.lineItems?.length !== 1) return false;

  const pricing = subscription.lineItems[0]?.plan.pricingDetails;

  if (
    pricing?.__typename !== "AppRecurringPricing" ||
    !pricing.price ||
    !pricing.interval
  ) {
    return false;
  }

  return (
    Number(pricing.price.amount) === plan.amount &&
    pricing.price.currencyCode === BILLING_CATALOG.currencyCode &&
    pricing.interval === BILLING_CATALOG.interval
  );
}


function matchesPlan(
  subscription: AppSubscription,
  plan: (typeof BILLING_PLANS)[number],
) {
  return (
    subscription.status === "ACTIVE" &&
    subscription.name === plan.shopify_name &&
    subscription.test === isBillingTestMode() &&
    subscription.trialDays === plan.trial_days &&
    hasPlanPricing(subscription, plan)
  );
}

function matchesLegacyUnlimited(subscription: AppSubscription) {
  if (subscription.status !== "ACTIVE") return false;
  if (subscription.name !== LEGACY_PLAN.legacy_name) return false;
  if (subscription.test !== isBillingTestMode()) return false;
  if (subscription.trialDays !== LEGACY_PLAN.legacy_trial_days) return false;

  if (subscription.lineItems?.length !== 1) return false;
  const pricing = subscription.lineItems[0]?.plan.pricingDetails;

  return (
    pricing?.__typename === "AppRecurringPricing" &&
    pricing.price?.currencyCode === "USD" &&
    Number(pricing.price.amount) === LEGACY_PLAN.legacy_amount &&
    pricing.interval === "EVERY_30_DAYS"
  );
}

export function resolveSubscriptionPlan(
  subscription: AppSubscription,
): ResolvedSubscriptionPlan | null {
  const current = BILLING_PLANS.find((plan) => matchesPlan(subscription, plan));
  if (current) return { planId: current.id, source: "current" };

  if (matchesLegacyUnlimited(subscription)) {
    return {
      planId: LEGACY_PLAN.maps_to_plan_id as PlanId,
      source: "legacy",
    };
  }

  return null;
}

export function getPlanForSubscription(
  subscription: AppSubscription | null | undefined,
) {
  if (!subscription) return null;
  const resolved = resolveSubscriptionPlan(subscription);
  return resolved ? BILLING_PLAN_BY_ID[resolved.planId] : null;
}

export async function getActiveSubscriptions(admin: AdminClient) {
  const response = await admin.graphql(`
    #graphql
    query StockDownSortActiveSubscriptions {
      currentAppInstallation {
        activeSubscriptions {
          id
          name
          status
          test
          currentPeriodEnd
          trialDays
          lineItems {
            plan {
              pricingDetails {
                __typename
                ... on AppRecurringPricing {
                  interval
                  price {
                    amount
                    currencyCode
                  }
                }
              }
            }
          }
        }
      }
    }
  `);

  const payload = (await response.json()) as SubscriptionQueryPayload;
  const graphQlError = firstGraphqlError(payload);

  if (graphQlError) throw new Error(graphQlError);

  const subscriptions =
    payload.data?.currentAppInstallation?.activeSubscriptions ?? [];

  return getAppEnvironment() === "production"
    ? subscriptions.filter((subscription) => !subscription.test)
    : subscriptions;
}

export async function getAnyActiveSubscription(admin: AdminClient) {
  const subscriptions = await getActiveSubscriptions(admin);

  return (
    subscriptions.find((subscription) => subscription.status === "ACTIVE") ??
    null
  );
}

export function isCurrentPlanSubscription(subscription: AppSubscription) {
  return resolveSubscriptionPlan(subscription) !== null;
}

export async function getCurrentSubscription(admin: AdminClient) {
  const subscriptions = await getActiveSubscriptions(admin);

  return (
    subscriptions.find((subscription) => isCurrentPlanSubscription(subscription)) ??
    null
  );
}

export async function getCurrentSubscriptionPlan(admin: AdminClient) {
  const subscription = await getCurrentSubscription(admin);
  if (!subscription) return null;

  const resolved = resolveSubscriptionPlan(subscription);
  if (!resolved) return null;

  return {
    subscription,
    plan: BILLING_PLAN_BY_ID[resolved.planId],
    source: resolved.source,
  };
}

export async function createSubscription(
  admin: AdminClient,
  planId: PlanId,
  returnUrl: string,
) {
  const plan = BILLING_PLAN_BY_ID[planId];
  if (!plan) {
    throw new Error(`Unknown billing plan: ${planId}`);
  }

  const response = await admin.graphql(
    `#graphql
      mutation StockDownSortCreateSubscription(
        $name: String!
        $returnUrl: URL!
        $test: Boolean!
        $trialDays: Int
        $replacementBehavior: AppSubscriptionReplacementBehavior
        $lineItems: [AppSubscriptionLineItemInput!]!
      ) {
        appSubscriptionCreate(
          name: $name
          returnUrl: $returnUrl
          test: $test
          trialDays: $trialDays
          replacementBehavior: $replacementBehavior
          lineItems: $lineItems
        ) {
          confirmationUrl
          appSubscription {
            id
            name
            status
            test
            currentPeriodEnd
            trialDays
          }
          userErrors {
            field
            message
          }
        }
      }`,
    {
      variables: {
        name: plan.shopify_name,
        returnUrl,
        test: isBillingTestMode(),
        trialDays: plan.trial_days,
        replacementBehavior: "STANDARD",
        lineItems: [
          {
            plan: {
              appRecurringPricingDetails: {
                price: {
                  amount: plan.amount,
                  currencyCode: BILLING_CATALOG.currencyCode,
                },
                interval: BILLING_CATALOG.interval,
              },
            },
          },
        ],
      },
    },
  );

  const payload = (await response.json()) as CreateSubscriptionPayload;
  const graphQlError = firstGraphqlError(payload);
  if (graphQlError) throw new Error(graphQlError);

  const result = payload.data?.appSubscriptionCreate;
  const userError = result?.userErrors?.[0]?.message;
  if (userError) throw new Error(userError);

  if (!result?.confirmationUrl) {
    throw new Error("Shopify did not return a subscription confirmation URL.");
  }

  return {
    confirmationUrl: result.confirmationUrl,
    subscription: result.appSubscription ?? null,
    plan,
  };
}

export async function createProSubscription(
  admin: AdminClient,
  returnUrl: string,
) {
  return createSubscription(admin, "unlimited", returnUrl);
}

export async function cancelSubscription(
  admin: AdminClient,
  subscriptionId: string,
) {
  const response = await admin.graphql(
    `#graphql
      mutation StockDownSortCancelSubscription($id: ID!) {
        appSubscriptionCancel(id: $id, prorate: true) {
          appSubscription {
            id
            name
            status
            test
            currentPeriodEnd
            trialDays
          }
          userErrors {
            field
            message
          }
        }
      }`,
    { variables: { id: subscriptionId } },
  );

  const payload = (await response.json()) as CancelSubscriptionPayload;
  const graphQlError = firstGraphqlError(payload);
  if (graphQlError) throw new Error(graphQlError);

  const result = payload.data?.appSubscriptionCancel;
  const userError = result?.userErrors?.[0]?.message;
  if (userError) throw new Error(userError);

  return result?.appSubscription ?? null;
}
