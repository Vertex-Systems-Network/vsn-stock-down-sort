import { GraphqlQueryError } from "@shopify/shopify-api";
import {
  BILLING_CATALOG,
  BILLING_PLAN_BY_ID,
  BILLING_PLANS,
  LEGACY_PLAN,
  type PlanId,
} from "../billing-config";
import { getAppEnvironment, isBillingTestMode } from "../environment.server";
import { authenticate } from "../shopify.server";
import {
  getShopifyAppPricingSubscription,
  resolveShopifyAppPricingPlan,
} from "./shopify-app-pricing.server";

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


function normalizeBillingErrorMessage(message: string) {
  const value = message.trim();
  if (
    /without public distribution.*billing api/i.test(value) ||
    /billing api.*public distribution/i.test(value)
  ) {
    return "Shopify Billing API is unavailable for this app identity because it does not use Public distribution. Billing API subscriptions require a Public-distribution app.";
  }
  return value;
}

function parseJsonString(value: string): unknown | null {
  const trimmed = value.trim();
  if (!trimmed || (!trimmed.startsWith("{") && !trimmed.startsWith("["))) {
    return null;
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function objectKeys(value: unknown) {
  if (!value || typeof value !== "object") return [];

  return [
    ...new Set([
      ...Object.keys(value as Record<string, unknown>),
      ...Object.getOwnPropertyNames(value),
    ]),
  ];
}

function firstMessageFromUnknown(
  value: unknown,
  seen = new Set<unknown>(),
  depth = 0,
): string | null {
  if (depth > 8 || value == null) return null;

  if (typeof value === "string") {
    const parsed = parseJsonString(value);
    if (parsed !== null) {
      const nested = firstMessageFromUnknown(parsed, seen, depth + 1);
      if (nested) return nested;
    }

    const trimmed = value.trim();
    return trimmed || null;
  }

  if (typeof value !== "object" || seen.has(value)) return null;
  seen.add(value);

  if (Array.isArray(value)) {
    for (const item of value) {
      const message = firstMessageFromUnknown(item, seen, depth + 1);
      if (message) return message;
    }
    return null;
  }

  const record = value as Record<string, unknown>;
  const preferredKeys = [
    "graphQLErrors",
    "errors",
    "body",
    "response",
    "cause",
    "extensions",
    "message",
  ];

  for (const key of preferredKeys) {
    if (!(key in record)) continue;
    const message = firstMessageFromUnknown(record[key], seen, depth + 1);
    if (message) return message;
  }

  for (const key of objectKeys(value)) {
    if (preferredKeys.includes(key)) continue;

    let nested: unknown;
    try {
      nested = record[key];
    } catch {
      continue;
    }

    const message = firstMessageFromUnknown(nested, seen, depth + 1);
    if (message) return message;
  }

  return null;
}

async function messageFromResponse(value: unknown) {
  if (!(value instanceof Response)) return null;

  try {
    const clone = value.clone();
    const text = await clone.text();
    return firstMessageFromUnknown(text);
  } catch {
    return null;
  }
}

export function getShopifyBillingErrorDiagnostic(error: unknown) {
  if (!error || typeof error !== "object") {
    return {
      type: typeof error,
      keys: [] as string[],
      bodyKeys: [] as string[],
      responseType: null as string | null,
    };
  }

  const record = error as Record<string, unknown>;
  const body = record.body;

  return {
    type:
      (error as { constructor?: { name?: string } }).constructor?.name ??
      "Object",
    keys: objectKeys(error).filter(
      (key) =>
        !/token|secret|authorization|cookie|header/i.test(key),
    ),
    bodyKeys: objectKeys(body).filter(
      (key) =>
        !/token|secret|authorization|cookie|header/i.test(key),
    ),
    responseType:
      record.response && typeof record.response === "object"
        ? (record.response as { constructor?: { name?: string } }).constructor
            ?.name ?? "Object"
        : null,
  };
}

export async function describeShopifyBillingError(error: unknown) {
  if (
    error instanceof GraphqlQueryError ||
    (error &&
      typeof error === "object" &&
      (error as { constructor?: { name?: string } }).constructor?.name ===
        "GraphqlQueryError")
  ) {
    const record = error as unknown as Record<string, unknown>;
    const graphqlMessage = firstMessageFromUnknown(record.body);
    if (graphqlMessage) {
      return normalizeBillingErrorMessage(graphqlMessage);
    }
  }

  if (error instanceof Response) {
    const responseMessage = await messageFromResponse(error);
    if (responseMessage) {
      return normalizeBillingErrorMessage(responseMessage);
    }
  }

  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    const nestedCandidates = [
      record.body,
      record.errors,
      record.response,
      record.cause,
      record.message,
    ];

    for (const candidate of nestedCandidates) {
      const responseMessage = await messageFromResponse(candidate);
      if (responseMessage) {
        return normalizeBillingErrorMessage(responseMessage);
      }

      const message = firstMessageFromUnknown(candidate);
      if (message) return normalizeBillingErrorMessage(message);
    }
  }

  if (error instanceof Error && error.message.trim()) {
    return normalizeBillingErrorMessage(error.message);
  }

  if (typeof error === "string" && error.trim()) {
    return normalizeBillingErrorMessage(error);
  }

  const diagnostic = getShopifyBillingErrorDiagnostic(error);
  return `Shopify subscription request failed (${diagnostic.type}; keys: ${diagnostic.keys.join(", ") || "none"}). See the Local server log for safe diagnostics.`;
}

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

export type SubscriptionMismatchDiagnostic = {
  name: string;
  status: string;
  test: boolean;
  trialDays: number | null;
  amount: number | null;
  currencyCode: string | null;
  interval: string | null;
  candidatePlanId: PlanId | null;
  reasons: string[];
};

export function getSubscriptionMismatchDiagnostic(
  subscription: AppSubscription,
): SubscriptionMismatchDiagnostic | null {
  if (resolveSubscriptionPlan(subscription)) return null;

  const pricing = subscription.lineItems?.[0]?.plan.pricingDetails;
  const amount =
    pricing?.price?.amount == null ? null : Number(pricing.price.amount);
  const currencyCode = pricing?.price?.currencyCode ?? null;
  const interval = pricing?.interval ?? null;
  const currentPlan = BILLING_PLANS.find(
    (plan) => plan.shopify_name === subscription.name,
  );
  const legacyNameMatches = subscription.name === LEGACY_PLAN.legacy_name;
  const reasons: string[] = [];

  if (subscription.status !== "ACTIVE") {
    reasons.push(`Status is ${subscription.status}, not ACTIVE.`);
  }

  if (subscription.test !== isBillingTestMode()) {
    reasons.push(
      `Subscription is ${subscription.test ? "test" : "live"} billing, but this environment expects ${isBillingTestMode() ? "test" : "live"} billing.`,
    );
  }

  if (subscription.lineItems?.length !== 1) {
    reasons.push("Subscription must contain exactly one recurring line item.");
  }

  if (pricing?.__typename !== "AppRecurringPricing") {
    reasons.push("Subscription does not use the expected recurring pricing type.");
  }

  if (currentPlan) {
    if (subscription.trialDays !== currentPlan.trial_days) {
      reasons.push(
        `Trial is ${subscription.trialDays ?? 0} days; ${currentPlan.name} now requires ${currentPlan.trial_days} days.`,
      );
    }
    if (amount !== currentPlan.amount) {
      reasons.push(
        `Price is ${amount == null ? "unavailable" : `${amount.toFixed(2)}`}; ${currentPlan.name} now requires ${currentPlan.amount.toFixed(2)}.`,
      );
    }
    if (currencyCode !== BILLING_CATALOG.currencyCode) {
      reasons.push(
        `Currency is ${currencyCode ?? "unavailable"}; expected ${BILLING_CATALOG.currencyCode}.`,
      );
    }
    if (interval !== BILLING_CATALOG.interval) {
      reasons.push(
        `Billing interval is ${interval ?? "unavailable"}; expected ${BILLING_CATALOG.interval}.`,
      );
    }
  } else if (legacyNameMatches) {
    if (subscription.trialDays !== LEGACY_PLAN.legacy_trial_days) {
      reasons.push(
        `Legacy trial is ${subscription.trialDays ?? 0} days; expected ${LEGACY_PLAN.legacy_trial_days}.`,
      );
    }
    if (amount !== LEGACY_PLAN.legacy_amount) {
      reasons.push(
        `Legacy price is ${amount == null ? "unavailable" : `${amount.toFixed(2)}`}; expected ${LEGACY_PLAN.legacy_amount.toFixed(2)}.`,
      );
    }
    if (currencyCode !== "USD") {
      reasons.push(
        `Legacy currency is ${currencyCode ?? "unavailable"}; expected USD.`,
      );
    }
    if (interval !== "EVERY_30_DAYS") {
      reasons.push(
        `Legacy billing interval is ${interval ?? "unavailable"}; expected EVERY_30_DAYS.`,
      );
    }
  } else {
    reasons.push(
      `Subscription name "${subscription.name}" does not match the current VSN plan catalog.`,
    );
  }

  if (reasons.length === 0) {
    reasons.push(
      "Subscription metadata does not match the current approved billing catalog.",
    );
  }

  return {
    name: subscription.name,
    status: subscription.status,
    test: subscription.test,
    trialDays: subscription.trialDays ?? null,
    amount,
    currencyCode,
    interval,
    candidatePlanId: currentPlan?.id ?? (legacyNameMatches
      ? (LEGACY_PLAN.maps_to_plan_id as PlanId)
      : null),
    reasons,
  };
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

async function getCurrentManualSubscription(admin: AdminClient) {
  const subscriptions = await getActiveSubscriptions(admin);

  return (
    subscriptions.find((subscription) => isCurrentPlanSubscription(subscription)) ??
    null
  );
}

function normalizeShopifyAppPricingSubscription(
  managed: Awaited<ReturnType<typeof getShopifyAppPricingSubscription>>,
  planId: PlanId,
): AppSubscription {
  if (!managed) {
    throw new Error("Shopify App Pricing subscription is required.");
  }

  const plan = BILLING_PLAN_BY_ID[planId];
  const resolved = resolveShopifyAppPricingPlan(managed);
  if (!resolved) {
    throw new Error("Shopify App Pricing subscription does not match the approved VSN catalog.");
  }

  return {
    id:
      managed.legacySubscriptionId ??
      `shopify-app-pricing:${managed.shop.id}`,
    name: plan.shopify_name,
    status: "ACTIVE",
    test: isBillingTestMode(),
    currentPeriodEnd: managed.currentBillingCycle?.endTime ?? null,
    trialDays: managed.trialEndsAt ? plan.trial_days : null,
    lineItems: [
      {
        plan: {
          pricingDetails: {
            __typename: "AppRecurringPricing",
            interval: managed.billingPeriod,
            price: {
              amount: String(resolved.amount),
              currencyCode: resolved.currencyCode,
            },
          },
        },
      },
    ],
  };
}

export async function getCurrentSubscriptionPlan(admin: AdminClient) {
  const managed = await getShopifyAppPricingSubscription(admin);
  if (managed) {
    const resolved = resolveShopifyAppPricingPlan(managed);
    if (!resolved) {
      throw new Error(
        "An active Shopify App Pricing subscription exists but does not match the approved VSN plan catalog.",
      );
    }

    return {
      subscription: normalizeShopifyAppPricingSubscription(
        managed,
        resolved.planId,
      ),
      managedSubscription: managed,
      plan: resolved.plan,
      source: "shopify_app_pricing" as const,
    };
  }

  const subscription = await getCurrentManualSubscription(admin);
  if (!subscription) return null;

  const resolved = resolveSubscriptionPlan(subscription);
  if (!resolved) return null;

  return {
    subscription,
    managedSubscription: null,
    plan: BILLING_PLAN_BY_ID[resolved.planId],
    source: resolved.source,
  };
}

export async function getCurrentSubscription(admin: AdminClient) {
  const current = await getCurrentSubscriptionPlan(admin);
  return current?.subscription ?? null;
}

type CurrentAppHandlePayload = {
  data?: {
    currentAppInstallation?: {
      app?: {
        handle?: string | null;
      } | null;
    } | null;
  };
  errors?: Array<{ message?: string }>;
};

function shopAdminStoreSlug(shop: string) {
  const suffix = ".myshopify.com";
  if (!shop.endsWith(suffix)) {
    throw new Error("Shop domain is not a valid myshopify.com domain.");
  }

  const slug = shop.slice(0, -suffix.length);
  if (!slug) {
    throw new Error("Unable to derive Shopify Admin store slug.");
  }

  return slug;
}

export async function getEmbeddedAdminBillingReturnUrl(
  admin: AdminClient,
  shop: string,
) {
  const response = await admin.graphql(`
    #graphql
    query StockDownSortCurrentAppHandle {
      currentAppInstallation {
        app {
          handle
        }
      }
    }
  `);

  const payload = (await response.json()) as CurrentAppHandlePayload;
  const graphQlError = firstGraphqlError(payload);
  if (graphQlError) throw new Error(graphQlError);

  const handle = payload.data?.currentAppInstallation?.app?.handle?.trim();
  if (!handle) {
    throw new Error("Shopify did not return the current app handle.");
  }

  const storeSlug = shopAdminStoreSlug(shop);
  return `https://admin.shopify.com/store/${encodeURIComponent(
    storeSlug,
  )}/apps/${encodeURIComponent(handle)}/app/plans`;
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
