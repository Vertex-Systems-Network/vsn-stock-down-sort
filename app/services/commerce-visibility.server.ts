import { withPrismaClient } from "../db.server";
import { getCurrentSubscriptionPlan } from "./billing.server";
import { recordActivityEventSafe } from "./analytics.server";
import {
  ENTERPRISE_OPTIONAL_SCOPES,
  MAX_COMMERCE_PUBLICATION_TARGETS,
  assertCommerceEntitlements,
  missingOptionalScopes,
  normalizeCommerceTargets,
  normalizeCommerceVisibilityInput,
  parseStoredCommerceTargets,
  requiredOptionalScopes,
  serializeCommerceTargets,
  type CommercePublicationTarget,
  type CommercePublicationTargetOption,
  type CommerceTargetType,
} from "./commerce-visibility";

type AdminClient = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

type ProductStatus = "ACTIVE" | "ARCHIVED" | "DRAFT" | "UNLISTED";

type ProductCore = {
  id: string;
  status: ProductStatus;
  totalInventory: number | null;
  tracksInventory: boolean;
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

export async function getGrantedCommerceScopes(admin: AdminClient) {
  const data = await gql<{
    currentAppInstallation: {
      accessScopes: Array<{ handle: string }>;
    } | null;
  }>(
    admin,
    `#graphql
      query CurrentEnterpriseAccessScopes {
        currentAppInstallation {
          accessScopes {
            handle
          }
        }
      }
    `,
  );

  return (
    data.currentAppInstallation?.accessScopes.map((scope) => scope.handle) ?? []
  );
}

async function publicationTargetsForCatalogType(
  admin: AdminClient,
  catalogType: "APP" | "MARKET" | "COMPANY_LOCATION" | "NONE",
  type: CommerceTargetType,
) {
  const data = await gql<{
    publications: {
      nodes: Array<{
        id: string;
        autoPublish: boolean;
        catalog: {
          id: string;
          title: string;
          __typename: string;
        } | null;
        channels: {
          nodes: Array<{
            id: string;
            name: string;
            handle: string;
          }>;
        } | null;
      }>;
    };
  }>(
    admin,
    `#graphql
      query EnterprisePublicationTargets($catalogType: CatalogType!) {
        publications(first: 100, catalogType: $catalogType) {
          nodes {
            id
            autoPublish
            catalog {
              __typename
              id
              title
            }
            channels(first: 5) {
              nodes {
                id
                name
                handle
              }
            }
          }
        }
      }
    `,
    { catalogType },
  );

  return data.publications.nodes.map((publication) => {
    const channelLabel =
      publication.channels?.nodes
        .map((channel) => channel.name)
        .filter(Boolean)
        .join(", ") || null;

    return {
      publicationId: publication.id,
      type,
      autoPublish: publication.autoPublish,
      label:
        publication.catalog?.title ??
        channelLabel ??
        `Shopify publication ${publication.id.split("/").at(-1) ?? ""}`,
    } satisfies CommercePublicationTargetOption;
  });
}

export async function listCommercePublicationTargets(
  admin: AdminClient,
  grantedScopes?: readonly string[],
) {
  const granted =
    grantedScopes ?? (await getGrantedCommerceScopes(admin));
  const set = new Set(granted);
  const targets: CommercePublicationTargetOption[] = [];
  const warnings: string[] = [];

  if (!set.has(ENTERPRISE_OPTIONAL_SCOPES.publications)) {
    return {
      targets,
      warnings,
      missingBaseScope: true,
    };
  }

  const requests: Array<{
    catalogType: "APP" | "MARKET" | "COMPANY_LOCATION" | "NONE";
    type: CommerceTargetType;
    allowed: boolean;
  }> = [
    { catalogType: "APP", type: "CHANNEL", allowed: true },
    { catalogType: "NONE", type: "CHANNEL", allowed: true },
    {
      catalogType: "MARKET",
      type: "MARKET",
      allowed: set.has(ENTERPRISE_OPTIONAL_SCOPES.markets),
    },
    {
      catalogType: "COMPANY_LOCATION",
      type: "B2B",
      allowed: set.has(ENTERPRISE_OPTIONAL_SCOPES.companies),
    },
  ];

  for (const request of requests) {
    if (!request.allowed) continue;

    try {
      targets.push(
        ...(await publicationTargetsForCatalogType(
          admin,
          request.catalogType,
          request.type,
        )),
      );
    } catch (error) {
      warnings.push(
        error instanceof Error
          ? `${request.type}: ${error.message}`
          : `${request.type}: publication discovery failed.`,
      );
    }
  }

  const deduped = [
    ...new Map(targets.map((target) => [target.publicationId, target])).values(),
  ].slice(0, 100);

  return {
    targets: deduped,
    warnings,
    missingBaseScope: false,
  };
}

export async function getCommerceVisibilitySetting(shop: string) {
  const setting = await withPrismaClient((db) =>
    db.commerceVisibilitySetting.findUnique({ where: { shop } }),
  );

  return {
    shop,
    enabled: setting?.enabled ?? false,
    autoRepublish: setting?.autoRepublish ?? true,
    targets: parseStoredCommerceTargets(setting?.targets),
    createdAt: setting?.createdAt ?? null,
    updatedAt: setting?.updatedAt ?? null,
  };
}

export async function saveCommerceVisibilitySetting(
  shop: string,
  input: {
    enabled?: unknown;
    autoRepublish?: unknown;
    targetValues?: unknown[];
  },
  optionIds: readonly string[],
  grantedScopes: readonly string[],
  availableTargets: readonly CommercePublicationTargetOption[],
) {
  const normalized = normalizeCommerceVisibilityInput(input);
  assertCommerceEntitlements(normalized.targets, optionIds);

  const missing = missingOptionalScopes(normalized.targets, grantedScopes);
  if (missing.length) {
    throw new Error(
      `Grant the required Shopify optional scopes first: ${missing.join(", ")}.`,
    );
  }

  const available = new Map(
    availableTargets.map((target) => [target.publicationId, target]),
  );

  for (const target of normalized.targets) {
    const discovered = available.get(target.publicationId);
    if (!discovered || discovered.type !== target.type) {
      throw new Error(
        "One or more selected publication targets are no longer available.",
      );
    }
  }

  const setting = await withPrismaClient((db) =>
    db.commerceVisibilitySetting.upsert({
      where: { shop },
      create: {
        shop,
        enabled: normalized.enabled,
        autoRepublish: normalized.autoRepublish,
        targets: serializeCommerceTargets(normalized.targets),
      },
      update: {
        enabled: normalized.enabled,
        autoRepublish: normalized.autoRepublish,
        targets: serializeCommerceTargets(normalized.targets),
      },
    }),
  );

  await recordActivityEventSafe({
    shop,
    category: "settings",
    action: "commerce_visibility.settings_saved",
    outcome: "SUCCESS",
    source: "commerce-visibility-settings",
    summary: "Enterprise publication visibility settings updated.",
    details: {
      enabled: setting.enabled,
      autoRepublish: setting.autoRepublish,
      targetCount: normalized.targets.length,
      targetTypes: [...new Set(normalized.targets.map((target) => target.type))],
      requiredOptionalScopes: requiredOptionalScopes(normalized.targets),
    },
  });

  return {
    ...setting,
    targets: normalized.targets,
  };
}

async function currentOptionIds(admin: AdminClient) {
  const current = await getCurrentSubscriptionPlan(
    admin as Parameters<typeof getCurrentSubscriptionPlan>[0],
  );
  return current?.plan.option_ids ?? null;
}

async function getProductCore(
  admin: AdminClient,
  productId: string,
): Promise<ProductCore | null> {
  const data = await gql<{ product: ProductCore | null }>(
    admin,
    `#graphql
      query EnterpriseVisibilityProduct($id: ID!) {
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

async function getPublishedStates(
  admin: AdminClient,
  productId: string,
  publicationIds: string[],
) {
  const states = new Map<string, boolean>();

  for (
    let offset = 0;
    offset < publicationIds.length;
    offset += MAX_COMMERCE_PUBLICATION_TARGETS
  ) {
    const chunk = publicationIds.slice(
      offset,
      offset + MAX_COMMERCE_PUBLICATION_TARGETS,
    );
    if (!chunk.length) continue;

    const variableDefinitions = ["$id: ID!"];
    const fields: string[] = [];
    const variables: Record<string, unknown> = { id: productId };

    chunk.forEach((publicationId, index) => {
      const variable = `publication${index}`;
      variableDefinitions.push(`$${variable}: ID!`);
      fields.push(
        `p${index}: publishedOnPublication(publicationId: $${variable})`,
      );
      variables[variable] = publicationId;
    });

    const data = await gql<{
      product: ({ id: string } & Record<string, boolean>) | null;
    }>(
      admin,
      `query EnterprisePublishedStates(${variableDefinitions.join(", ")}) {
        product(id: $id) {
          id
          ${fields.join("\n")}
        }
      }`,
      variables,
    );

    if (!data.product) {
      throw new Error("Shopify product was not found.");
    }

    chunk.forEach((publicationId, index) => {
      states.set(publicationId, Boolean(data.product?.[`p${index}`]));
    });
  }

  return states;
}

async function mutatePublicationState(
  admin: AdminClient,
  productId: string,
  publicationIds: string[],
  action: "publish" | "unpublish",
) {
  if (!publicationIds.length) return;

  const mutation =
    action === "publish"
      ? "publishablePublish"
      : "publishableUnpublish";
  const payload =
    action === "publish"
      ? "publishablePublish"
      : "publishableUnpublish";

  const data = await gql<
    Record<
      string,
      {
        userErrors: Array<{ field?: string[] | null; message: string }>;
      }
    >
  >(
    admin,
    `mutation EnterprisePublicationMutation(
      $id: ID!
      $input: [PublicationInput!]!
    ) {
      ${mutation}(id: $id, input: $input) {
        userErrors {
          field
          message
        }
      }
    }`,
    {
      id: productId,
      input: publicationIds.map((publicationId) => ({ publicationId })),
    },
  );

  const userError = data[payload]?.userErrors?.[0]?.message;
  if (userError) throw new Error(userError);
}

function targetOptionId(target: CommercePublicationTarget) {
  return target.type === "MARKET"
    ? "OPT-MARKETS"
    : target.type === "B2B"
      ? "OPT-B2B-CATALOGS"
      : "OPT-SALES-CHANNEL-RULES";
}

function targetScopeGranted(
  target: CommercePublicationTarget,
  granted: Set<string>,
) {
  if (!granted.has(ENTERPRISE_OPTIONAL_SCOPES.publications)) return false;
  if (
    target.type === "MARKET" &&
    !granted.has(ENTERPRISE_OPTIONAL_SCOPES.markets)
  ) {
    return false;
  }
  if (
    target.type === "B2B" &&
    !granted.has(ENTERPRISE_OPTIONAL_SCOPES.companies)
  ) {
    return false;
  }
  return true;
}

export async function reconcileCommerceVisibility(
  admin: AdminClient,
  shop: string,
  productId: string,
  entitledOptionIds?: readonly string[],
) {
  const [settingRecord, managedStates, optionIds, grantedScopes] =
    await Promise.all([
      withPrismaClient((db) =>
        db.commerceVisibilitySetting.findUnique({ where: { shop } }),
      ),
      withPrismaClient((db) =>
        db.productPublicationState.findMany({
          where: { shop, productId },
        }),
      ),
      entitledOptionIds
        ? Promise.resolve([...entitledOptionIds])
        : currentOptionIds(admin),
      getGrantedCommerceScopes(admin),
    ]);

  const selectedTargets =
    settingRecord?.enabled
      ? parseStoredCommerceTargets(settingRecord.targets)
      : [];

  const targetByPublication = new Map<string, CommercePublicationTarget>();
  for (const target of selectedTargets) {
    targetByPublication.set(target.publicationId, target);
  }
  for (const state of managedStates) {
    if (!targetByPublication.has(state.publicationId)) {
      targetByPublication.set(state.publicationId, {
        publicationId: state.publicationId,
        type: state.contextType as CommerceTargetType,
      });
    }
  }

  const allTargets = [...targetByPublication.values()];
  if (!allTargets.length) {
    return {
      productId,
      changed: false,
      reason: "enterprise-visibility-disabled",
    };
  }

  const granted = new Set(grantedScopes);
  if (!granted.has(ENTERPRISE_OPTIONAL_SCOPES.publications)) {
    return {
      productId,
      changed: false,
      reason: "write-publications-scope-missing",
    };
  }

  const product = await getProductCore(admin, productId);
  if (!product) {
    return { productId, changed: false, reason: "product-not-found" };
  }

  const publishedStates = await getPublishedStates(
    admin,
    productId,
    allTargets.map((target) => target.publicationId),
  );
  const stateByPublication = new Map(
    managedStates.map((state) => [state.publicationId, state]),
  );
  const soldOut =
    product.tracksInventory && (product.totalInventory ?? 0) <= 0;

  if (soldOut) {
    if (!settingRecord?.enabled || !optionIds) {
      return {
        productId,
        changed: false,
        reason: !settingRecord?.enabled
          ? "enterprise-visibility-disabled"
          : "inactive-subscription",
      };
    }

    const toUnpublish: CommercePublicationTarget[] = [];
    const overrides: string[] = [];

    for (const target of selectedTargets) {
      if (!optionIds.includes(targetOptionId(target))) continue;
      if (!targetScopeGranted(target, granted)) continue;

      const state = stateByPublication.get(target.publicationId);
      const currentlyPublished =
        publishedStates.get(target.publicationId) ?? false;

      if (state?.merchantOverride) continue;

      if (state?.managedUnpublishedAt) {
        if (currentlyPublished) {
          overrides.push(target.publicationId);
          await withPrismaClient((db) =>
            db.productPublicationState.update({
              where: {
                shop_productId_publicationId: {
                  shop,
                  productId,
                  publicationId: target.publicationId,
                },
              },
              data: {
                previousPublished: false,
                merchantOverride: true,
                managedUnpublishedAt: null,
              },
            }),
          );
        }
        continue;
      }

      if (currentlyPublished) toUnpublish.push(target);
    }

    if (toUnpublish.length) {
      await mutatePublicationState(
        admin,
        productId,
        toUnpublish.map((target) => target.publicationId),
        "unpublish",
      );

      const now = new Date();
      for (const target of toUnpublish) {
        await withPrismaClient((db) =>
          db.productPublicationState.upsert({
            where: {
              shop_productId_publicationId: {
                shop,
                productId,
                publicationId: target.publicationId,
              },
            },
            create: {
              shop,
              productId,
              publicationId: target.publicationId,
              contextType: target.type,
              previousPublished: true,
              merchantOverride: false,
              managedUnpublishedAt: now,
            },
            update: {
              contextType: target.type,
              previousPublished: true,
              merchantOverride: false,
              managedUnpublishedAt: now,
              restoredAt: null,
            },
          }),
        );
      }
    }

    if (toUnpublish.length || overrides.length) {
      await recordActivityEventSafe({
        shop,
        category: "visibility",
        action: "commerce_visibility.reconciled_sold_out",
        outcome: "SUCCESS",
        source: "commerce-visibility-engine",
        entityType: "product",
        entityId: productId,
        summary: "Enterprise publication visibility reconciled for sold-out product.",
        soldOutProducts: 1,
        details: {
          unpublishedCount: toUnpublish.length,
          merchantOverrideCount: overrides.length,
          targetTypes: [
            ...new Set(toUnpublish.map((target) => target.type)),
          ],
        },
      });
    }

    return {
      productId,
      changed: toUnpublish.length > 0,
      action: toUnpublish.length ? "unpublished" : "none",
      unpublishedCount: toUnpublish.length,
      merchantOverrideCount: overrides.length,
    };
  }

  const toPublish: string[] = [];
  let clearedOverrides = 0;

  for (const state of managedStates) {
    const currentlyPublished =
      publishedStates.get(state.publicationId) ?? false;

    if (state.merchantOverride) {
      clearedOverrides += 1;
      await withPrismaClient((db) =>
        db.productPublicationState.update({
          where: {
            shop_productId_publicationId: {
              shop,
              productId,
              publicationId: state.publicationId,
            },
          },
          data: {
            previousPublished: false,
            merchantOverride: false,
            managedUnpublishedAt: null,
            restoredAt: new Date(),
          },
        }),
      );
      continue;
    }

    if (!state.managedUnpublishedAt || !state.previousPublished) continue;

    if (currentlyPublished) {
      await withPrismaClient((db) =>
        db.productPublicationState.update({
          where: {
            shop_productId_publicationId: {
              shop,
              productId,
              publicationId: state.publicationId,
            },
          },
          data: {
            previousPublished: false,
            managedUnpublishedAt: null,
            restoredAt: new Date(),
          },
        }),
      );
      continue;
    }

    if (
      settingRecord?.autoRepublish &&
      product.status === "ACTIVE"
    ) {
      toPublish.push(state.publicationId);
    }
  }

  if (toPublish.length) {
    await mutatePublicationState(admin, productId, toPublish, "publish");
    const now = new Date();

    for (const publicationId of toPublish) {
      await withPrismaClient((db) =>
        db.productPublicationState.update({
          where: {
            shop_productId_publicationId: {
              shop,
              productId,
              publicationId,
            },
          },
          data: {
            previousPublished: false,
            merchantOverride: false,
            managedUnpublishedAt: null,
            restoredAt: now,
          },
        }),
      );
    }
  }

  if (toPublish.length || clearedOverrides) {
    await recordActivityEventSafe({
      shop,
      category: "visibility",
      action: "commerce_visibility.reconciled_restock",
      outcome: "SUCCESS",
      source: "commerce-visibility-engine",
      entityType: "product",
      entityId: productId,
      summary: "Enterprise publication visibility reconciled for restocked product.",
      details: {
        restoredPublicationCount: toPublish.length,
        clearedMerchantOverrideCount: clearedOverrides,
      },
    });
  }

  return {
    productId,
    changed: toPublish.length > 0,
    action: toPublish.length ? "restored" : "none",
    restoredPublicationCount: toPublish.length,
    clearedMerchantOverrideCount: clearedOverrides,
  };
}

export async function reconcileCommerceVisibilitySafe(
  admin: AdminClient,
  shop: string,
  productId: string,
  entitledOptionIds?: readonly string[],
) {
  try {
    return await reconcileCommerceVisibility(
      admin,
      shop,
      productId,
      entitledOptionIds,
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Enterprise publication visibility reconciliation failed.";

    await recordActivityEventSafe({
      shop,
      category: "visibility",
      action: "commerce_visibility.failed",
      outcome: "ERROR",
      source: "commerce-visibility-engine",
      entityType: "product",
      entityId: productId,
      summary: message,
    });

    return {
      productId,
      changed: false,
      reason: "enterprise-visibility-error",
      error: message,
    };
  }
}

export function normalizeSelectedTargetValues(values: unknown[]) {
  return normalizeCommerceTargets(values);
}
