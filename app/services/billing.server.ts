import { PRO_PLAN } from "../billing-config";
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

  if (graphQlError) {
    throw new Error(graphQlError);
  }

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

function hasCurrentPlanPricing(subscription: AppSubscription) {
  if (subscription.lineItems?.length !== 1) {
    return false;
  }

  const pricing = subscription.lineItems[0]?.plan.pricingDetails;

  if (
    pricing?.__typename !== "AppRecurringPricing" ||
    !pricing.price ||
    !pricing.interval
  ) {
    return false;
  }

  return (
    Number(pricing.price.amount) === PRO_PLAN.amount &&
    pricing.price.currencyCode === PRO_PLAN.currencyCode &&
    pricing.interval === PRO_PLAN.interval
  );
}

export function isCurrentPlanSubscription(subscription: AppSubscription) {
  return (
    subscription.status === "ACTIVE" &&
    subscription.name === PRO_PLAN.name &&
    subscription.test === isBillingTestMode() &&
    subscription.trialDays === PRO_PLAN.trialDays &&
    hasCurrentPlanPricing(subscription)
  );
}

export async function getCurrentSubscription(admin: AdminClient) {
  const subscriptions = await getActiveSubscriptions(admin);

  return subscriptions.find(isCurrentPlanSubscription) ?? null;
}

export async function createProSubscription(
  admin: AdminClient,
  returnUrl: string,
) {
  const response = await admin.graphql(
    `#graphql
      mutation StockDownSortCreateSubscription(
        $name: String!
        $returnUrl: URL!
        $test: Boolean!
        $trialDays: Int
        $lineItems: [AppSubscriptionLineItemInput!]!
      ) {
        appSubscriptionCreate(
          name: $name
          returnUrl: $returnUrl
          test: $test
          trialDays: $trialDays
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
        name: PRO_PLAN.name,
        returnUrl,
        test: isBillingTestMode(),
        trialDays: PRO_PLAN.trialDays,
        lineItems: [
          {
            plan: {
              appRecurringPricingDetails: {
                price: {
                  amount: PRO_PLAN.amount,
                  currencyCode: PRO_PLAN.currencyCode,
                },
                interval: PRO_PLAN.interval,
              },
            },
          },
        ],
      },
    },
  );

  const payload = (await response.json()) as CreateSubscriptionPayload;
  const graphQlError = firstGraphqlError(payload);

  if (graphQlError) {
    throw new Error(graphQlError);
  }

  const result = payload.data?.appSubscriptionCreate;
  const userError = result?.userErrors?.[0]?.message;

  if (userError) {
    throw new Error(userError);
  }

  if (!result?.confirmationUrl) {
    throw new Error("Shopify did not return a subscription confirmation URL.");
  }

  return {
    confirmationUrl: result.confirmationUrl,
    subscription: result.appSubscription ?? null,
  };
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

  if (graphQlError) {
    throw new Error(graphQlError);
  }

  const result = payload.data?.appSubscriptionCancel;
  const userError = result?.userErrors?.[0]?.message;

  if (userError) {
    throw new Error(userError);
  }

  return result?.appSubscription ?? null;
}
