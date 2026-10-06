import { BILLING_CATALOG, BILLING_PLANS } from "../billing-config";
import { authenticate } from "../shopify.server";

type AdminClient = Awaited<ReturnType<typeof authenticate.admin>>["admin"];

export type ShopifyBillingMode = "manual_legacy" | "shopify_app_pricing";

type PartnerFlatRatePrice = {
  __typename: "FlatRatePrice";
  active: boolean;
  currency: string;
  amount: string;
};

type PartnerSubscriptionItem = {
  handle: string;
  description?: string | null;
  price: PartnerFlatRatePrice | {
    __typename: string;
    active?: boolean;
    currency?: string;
  };
};

export type ShopifyAppPricingSubscription = {
  shop: {
    id: string;
    myshopifyDomain: string;
  };
  billingPeriod: string;
  cancelAtEndOfCycle: boolean;
  trialEndsAt?: string | null;
  currentBillingCycle?: {
    startTime: string;
    endTime: string;
  } | null;
  items: PartnerSubscriptionItem[];
  pendingUpdate?: {
    billingPeriod?: string | null;
    items?: Array<{
      handle: string;
      price?: {
        __typename?: string;
        amount?: string;
      } | null;
    }> | null;
    legacySubscriptionId?: string | null;
  } | null;
  legacySubscriptionId?: string | null;
};

type PartnerApiPayload = {
  data?: {
    activeSubscription?: ShopifyAppPricingSubscription | null;
  };
  errors?: Array<{ message?: string }>;
};

type ShopIdPayload = {
  data?: {
    shop?: {
      id?: string | null;
    } | null;
  };
  errors?: Array<{ message?: string }>;
};

type AppHandlePayload = {
  data?: {
    currentAppInstallation?: {
      app?: {
        handle?: string | null;
      } | null;
    } | null;
  };
  errors?: Array<{ message?: string }>;
};

function firstGraphqlError(payload: { errors?: Array<{ message?: string }> }) {
  return payload.errors?.find((error) => error.message)?.message;
}

export function getShopifyBillingMode(): ShopifyBillingMode {
  const value = process.env.SHOPIFY_BILLING_MODE?.trim().toLowerCase();

  if (!value || value === "manual_legacy") {
    return "manual_legacy";
  }
  if (value === "shopify_app_pricing") {
    return "shopify_app_pricing";
  }

  throw new Error(
    "SHOPIFY_BILLING_MODE must be manual_legacy or shopify_app_pricing.",
  );
}

export function isShopifyAppPricingMode() {
  return getShopifyBillingMode() === "shopify_app_pricing";
}

function requireAppPricingConfig() {
  const orgId = process.env.SHOPIFY_PARTNER_ORG_ID?.trim();
  const accessToken = process.env.SHOPIFY_PARTNER_API_ACCESS_TOKEN?.trim();
  const appId = process.env.SHOPIFY_APP_GID?.trim();

  const missing = [
    !orgId ? "SHOPIFY_PARTNER_ORG_ID" : null,
    !accessToken ? "SHOPIFY_PARTNER_API_ACCESS_TOKEN" : null,
    !appId ? "SHOPIFY_APP_GID" : null,
  ].filter(Boolean);

  if (missing.length) {
    throw new Error(
      `Shopify App Pricing is enabled but Partner API configuration is incomplete: ${missing.join(", ")}.`,
    );
  }

  if (!/^gid:\/\/shopify\/App\/\d+$/.test(appId!)) {
    throw new Error("SHOPIFY_APP_GID must be a Shopify App GID.");
  }

  return { orgId: orgId!, accessToken: accessToken!, appId: appId! };
}

async function getShopId(admin: AdminClient) {
  const response = await admin.graphql(`
    #graphql
    query StockDownSortShopIdForAppPricing {
      shop {
        id
      }
    }
  `);

  const payload = (await response.json()) as ShopIdPayload;
  const error = firstGraphqlError(payload);
  if (error) throw new Error(error);

  const shopId = payload.data?.shop?.id?.trim();
  if (!shopId) {
    throw new Error("Shopify Admin API did not return the shop GID.");
  }

  return shopId;
}

export function resolveShopifyAppPricingPlan(
  subscription: ShopifyAppPricingSubscription,
) {
  if (subscription.billingPeriod !== BILLING_CATALOG.interval) {
    return null;
  }

  const flatRateItems = subscription.items.filter(
    (item): item is PartnerSubscriptionItem & { price: PartnerFlatRatePrice } =>
      item.price.__typename === "FlatRatePrice" &&
      item.price.active === true &&
      typeof (item.price as PartnerFlatRatePrice).amount === "string" &&
      typeof item.price.currency === "string",
  );

  if (flatRateItems.length !== 1) return null;

  const item = flatRateItems[0];
  const plan = BILLING_PLANS.find((candidate) => candidate.id === item.handle);
  const effectiveAmount = Number(item.price.amount);

  // Shopify lets development stores test App Pricing plans at no charge.
  // The active subscription therefore reports an effective amount of 0 even
  // though its plan handle and configured catalog price remain unchanged.
  if (
    !plan ||
    item.price.currency !== BILLING_CATALOG.currencyCode ||
    !Number.isFinite(effectiveAmount) ||
    (effectiveAmount !== 0 && effectiveAmount !== plan.amount)
  ) {
    return null;
  }

  return {
    planId: plan.id,
    plan,
    itemHandle: item.handle,
    amount: plan.amount,
    effectiveAmount,
    currencyCode: item.price.currency,
  };
}

export async function getShopifyAppPricingSubscription(
  admin: AdminClient,
): Promise<ShopifyAppPricingSubscription | null> {
  if (!isShopifyAppPricingMode()) return null;

  const { orgId, accessToken, appId } = requireAppPricingConfig();
  const shopId = await getShopId(admin);
  const response = await fetch(
    `https://partners.shopify.com/${encodeURIComponent(orgId)}/api/2026-07/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": accessToken,
      },
      body: JSON.stringify({
        query: `#graphql
          query StockDownSortActiveAppPricingSubscription($appId: ID!, $shopId: ID!) {
            activeSubscription(appId: $appId, shopId: $shopId) {
              shop {
                id
                myshopifyDomain
              }
              billingPeriod
              cancelAtEndOfCycle
              trialEndsAt
              currentBillingCycle {
                startTime
                endTime
              }
              items {
                handle
                description
                price {
                  __typename
                  active
                  currency
                  ... on FlatRatePrice {
                    amount
                  }
                }
              }
              pendingUpdate {
                billingPeriod
                items {
                  handle
                  price {
                    __typename
                    ... on FlatRatePrice {
                      amount
                    }
                  }
                }
                legacySubscriptionId
              }
              legacySubscriptionId
            }
          }
        `,
        variables: { appId, shopId },
      }),
    },
  );

  if (!response.ok) {
    throw new Error(
      `Shopify Partner API activeSubscription request failed with HTTP ${response.status}.`,
    );
  }

  const payload = (await response.json()) as PartnerApiPayload;
  const graphqlError = firstGraphqlError(payload);
  if (graphqlError) {
    throw new Error(`Shopify Partner API: ${graphqlError}`);
  }

  return payload.data?.activeSubscription ?? null;
}

function shopAdminStoreSlug(shop: string) {
  const suffix = ".myshopify.com";
  if (!shop.endsWith(suffix)) {
    throw new Error("Shop domain is not a valid myshopify.com domain.");
  }
  const slug = shop.slice(0, -suffix.length);
  if (!slug) throw new Error("Unable to derive Shopify Admin store slug.");
  return slug;
}

export async function getShopifyAppPricingPlanSelectionUrl(
  admin: AdminClient,
  shop: string,
) {
  const response = await admin.graphql(`
    #graphql
    query StockDownSortCurrentAppHandleForPricing {
      currentAppInstallation {
        app {
          handle
        }
      }
    }
  `);

  const payload = (await response.json()) as AppHandlePayload;
  const error = firstGraphqlError(payload);
  if (error) throw new Error(error);

  const handle = payload.data?.currentAppInstallation?.app?.handle?.trim();
  if (!handle) {
    throw new Error("Shopify did not return the current app handle.");
  }

  const storeSlug = shopAdminStoreSlug(shop);
  return `https://admin.shopify.com/store/${encodeURIComponent(
    storeSlug,
  )}/charges/${encodeURIComponent(handle)}/pricing_plans`;
}
