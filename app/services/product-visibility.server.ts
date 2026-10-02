import { withPrismaClient } from "../db.server";
import { getCurrentSubscriptionPlan } from "./billing.server";
import {
  PHASE3_OPTION_IDS,
  parseProductVisibilityMode,
  type ProductVisibilityMode,
} from "./product-visibility";

type AdminClient = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

type ProductStatus = "ACTIVE" | "ARCHIVED" | "DRAFT" | "UNLISTED";

type ProductVisibilitySource = {
  id: string;
  status: ProductStatus;
  totalInventory: number | null;
  tracksInventory: boolean;
};

type ProductQueryResponse = {
  product: ProductVisibilitySource | null;
};

type ProductUpdateResponse = {
  productUpdate?: {
    product?: { id: string; status: ProductStatus } | null;
    userErrors?: Array<{ field?: string[] | null; message: string }>;
  } | null;
};

type InventoryItemProductResponse = {
  inventoryItem: {
    variant?: {
      product?: {
        id: string;
      } | null;
    } | null;
  } | null;
};

export type VisibilitySettingInput = {
  productMode: ProductVisibilityMode;
  autoRepublish: boolean;
};

async function gql<T>(
  admin: AdminClient,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const response = await admin.graphql(query, { variables });
  const payload = (await response.json()) as {
    data?: T;
    errors?: Array<{ message?: string }>;
  };

  const errorMessage = payload.errors?.find((error) => error.message)?.message;
  if (errorMessage) throw new Error(errorMessage);
  if (!payload.data) throw new Error("Shopify GraphQL response had no data.");

  return payload.data;
}

function hasEntitlement(optionIds: readonly string[], optionId: string) {
  return optionIds.includes(optionId);
}

export function assertVisibilityEntitlements(
  input: VisibilitySettingInput,
  optionIds: readonly string[],
) {
  if (
    input.productMode !== "OFF" &&
    !hasEntitlement(optionIds, PHASE3_OPTION_IDS.autoHideProducts)
  ) {
    throw new Error(
      "Your current plan does not include automatic product hiding.",
    );
  }

  if (
    input.productMode === "UNLISTED" &&
    !hasEntitlement(optionIds, PHASE3_OPTION_IDS.seoSafeHide)
  ) {
    throw new Error(
      "Your current plan does not include SEO-safe product hiding.",
    );
  }

  if (
    input.autoRepublish &&
    !hasEntitlement(optionIds, PHASE3_OPTION_IDS.autoRepublish)
  ) {
    throw new Error(
      "Your current plan does not include automatic republishing.",
    );
  }
}

export async function getVisibilitySetting(shop: string) {
  const setting = await withPrismaClient((db) =>
    db.visibilitySetting.findUnique({ where: { shop } }),
  );

  return (
    setting ?? {
      shop,
      productMode: "OFF",
      autoRepublish: true,
      createdAt: null,
      updatedAt: null,
    }
  );
}

export async function saveVisibilitySetting(
  shop: string,
  input: VisibilitySettingInput,
  optionIds: readonly string[],
) {
  const normalized = {
    productMode: parseProductVisibilityMode(input.productMode),
    autoRepublish: Boolean(input.autoRepublish),
  };

  assertVisibilityEntitlements(normalized, optionIds);

  return withPrismaClient((db) =>
    db.visibilitySetting.upsert({
      where: { shop },
      create: { shop, ...normalized },
      update: normalized,
    }),
  );
}

async function currentOptionIds(admin: AdminClient) {
  const current = await getCurrentSubscriptionPlan(
    admin as Parameters<typeof getCurrentSubscriptionPlan>[0],
  );
  return current?.plan.option_ids ?? null;
}

async function getProduct(
  admin: AdminClient,
  productId: string,
): Promise<ProductVisibilitySource | null> {
  const data = await gql<ProductQueryResponse>(
    admin,
    `#graphql
      query ProductVisibilitySource($id: ID!) {
        product(id: $id) {
          id
          status
          totalInventory
          tracksInventory
        }
      }
    `,
    { id: productId },
  );

  return data.product;
}

async function updateProductStatus(
  admin: AdminClient,
  productId: string,
  status: ProductStatus,
) {
  const data = await gql<ProductUpdateResponse>(
    admin,
    `#graphql
      mutation SetProductVisibilityStatus($product: ProductUpdateInput!) {
        productUpdate(product: $product) {
          product {
            id
            status
          }
          userErrors {
            field
            message
          }
        }
      }
    `,
    {
      product: {
        id: productId,
        status,
      },
    },
  );

  const userError = data.productUpdate?.userErrors?.[0]?.message;
  if (userError) throw new Error(userError);

  if (!data.productUpdate?.product) {
    throw new Error("Shopify did not return the updated product.");
  }

  return data.productUpdate.product;
}

function isSoldOut(product: ProductVisibilitySource) {
  if (!product.tracksInventory) return false;
  return (product.totalInventory ?? 0) <= 0;
}

function desiredManagedStatus(mode: ProductVisibilityMode): ProductStatus | null {
  if (mode === "DRAFT") return "DRAFT";
  if (mode === "UNLISTED") return "UNLISTED";
  return null;
}

export async function reconcileProductVisibility(
  admin: AdminClient,
  shop: string,
  productId: string,
  entitledOptionIds?: readonly string[],
) {
  const optionIds = entitledOptionIds ?? (await currentOptionIds(admin));
  if (!optionIds) {
    return { productId, changed: false, reason: "inactive-subscription" };
  }

  const setting = await getVisibilitySetting(shop);
  const mode = parseProductVisibilityMode(setting.productMode);
  const desiredStatus = desiredManagedStatus(mode);

  if (
    !desiredStatus ||
    !hasEntitlement(optionIds, PHASE3_OPTION_IDS.autoHideProducts)
  ) {
    return { productId, changed: false, reason: "visibility-disabled" };
  }

  if (
    desiredStatus === "UNLISTED" &&
    !hasEntitlement(optionIds, PHASE3_OPTION_IDS.seoSafeHide)
  ) {
    return { productId, changed: false, reason: "seo-safe-not-entitled" };
  }

  const [product, state] = await Promise.all([
    getProduct(admin, productId),
    withPrismaClient((db) =>
      db.productVisibilityState.findUnique({
        where: { shop_productId: { shop, productId } },
      }),
    ),
  ]);

  if (!product) {
    return { productId, changed: false, reason: "product-not-found" };
  }

  if (isSoldOut(product)) {
    if (
      state?.managedStatus &&
      product.status === state.managedStatus
    ) {
      return { productId, changed: false, reason: "already-managed-hidden" };
    }

    if (state?.managedStatus && product.status !== state.managedStatus) {
      await withPrismaClient((db) =>
        db.productVisibilityState.update({
          where: { shop_productId: { shop, productId } },
          data: {
            previousStatus: null,
            managedStatus: null,
          },
        }),
      );
      return { productId, changed: false, reason: "merchant-status-override" };
    }

    if (product.status !== "ACTIVE") {
      return { productId, changed: false, reason: "merchant-owned-status" };
    }

    await updateProductStatus(admin, productId, desiredStatus);
    await withPrismaClient((db) =>
      db.productVisibilityState.upsert({
        where: { shop_productId: { shop, productId } },
        create: {
          shop,
          productId,
          previousStatus: product.status,
          managedStatus: desiredStatus,
          hiddenAt: new Date(),
        },
        update: {
          previousStatus: product.status,
          managedStatus: desiredStatus,
          hiddenAt: new Date(),
          restoredAt: null,
        },
      }),
    );

    return {
      productId,
      changed: true,
      action: desiredStatus === "UNLISTED" ? "soft-hidden" : "unpublished",
      status: desiredStatus,
    };
  }

  if (!state?.managedStatus) {
    return { productId, changed: false, reason: "not-managed-by-app" };
  }

  if (product.status !== state.managedStatus) {
    await withPrismaClient((db) =>
      db.productVisibilityState.update({
        where: { shop_productId: { shop, productId } },
        data: {
          previousStatus: null,
          managedStatus: null,
        },
      }),
    );
    return { productId, changed: false, reason: "merchant-status-override" };
  }

  if (
    !setting.autoRepublish ||
    !hasEntitlement(optionIds, PHASE3_OPTION_IDS.autoRepublish)
  ) {
    return { productId, changed: false, reason: "auto-republish-disabled" };
  }

  const restoreStatus =
    state.previousStatus === "ACTIVE" ? "ACTIVE" : null;

  if (!restoreStatus) {
    return { productId, changed: false, reason: "no-safe-restore-status" };
  }

  await updateProductStatus(admin, productId, restoreStatus);
  await withPrismaClient((db) =>
    db.productVisibilityState.update({
      where: { shop_productId: { shop, productId } },
      data: {
        previousStatus: null,
        managedStatus: null,
        restoredAt: new Date(),
      },
    }),
  );

  return {
    productId,
    changed: true,
    action: "restored",
    status: restoreStatus,
  };
}

export async function productIdForInventoryItem(
  admin: AdminClient,
  inventoryItemId: string | number,
) {
  const normalizedId = String(inventoryItemId).startsWith("gid://")
    ? String(inventoryItemId)
    : `gid://shopify/InventoryItem/${inventoryItemId}`;

  const data = await gql<InventoryItemProductResponse>(
    admin,
    `#graphql
      query ProductForInventoryItem($id: ID!) {
        inventoryItem(id: $id) {
          variant {
            product {
              id
            }
          }
        }
      }
    `,
    { id: normalizedId },
  );

  return data.inventoryItem?.variant?.product?.id ?? null;
}
