import { withPrismaClient } from "../db.server";
import { getCurrentSubscriptionPlan } from "./billing.server";
import { recordActivityEventSafe } from "./analytics.server";
import {
  assertContextRuleEntitlement,
  normalizeContextRuleInput,
  type ContextRuleInput,
  type ContextTargetType,
} from "./context-visibility";

type AdminClient = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

type PublicationTarget = {
  publicationId: string;
  targetType: ContextTargetType;
  title: string;
  catalogId: string | null;
  catalogStatus: string | null;
  channelIds: string[];
};

type ProductContextSource = {
  id: string;
  title: string;
  totalInventory: number | null;
  tracksInventory: boolean;
};

const PUBLICATION_MUTATION_LIMIT = 50;

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

async function currentOptionIds(admin: AdminClient) {
  const current = await getCurrentSubscriptionPlan(
    admin as Parameters<typeof getCurrentSubscriptionPlan>[0],
  );
  return current?.plan.option_ids ?? null;
}

function catalogTypeForTarget(targetType: ContextTargetType) {
  if (targetType === "MARKET") return "MARKET";
  if (targetType === "COMPANY_LOCATION") return "COMPANY_LOCATION";
  return "APP";
}

export async function listPublicationTargets(
  admin: AdminClient,
  targetType: ContextTargetType,
): Promise<PublicationTarget[]> {
  const data = await gql<{
    publications: {
      nodes: Array<{
        id: string;
        catalog: {
          __typename: string;
          id: string;
          title: string;
          status: string;
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
      query ContextVisibilityPublications($catalogType: CatalogType!) {
        publications(first: 100, catalogType: $catalogType) {
          nodes {
            id
            catalog {
              __typename
              id
              title
              status
            }
            channels(first: 10) {
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
    { catalogType: catalogTypeForTarget(targetType) },
  );

  return data.publications.nodes.map((publication) => {
    const channelNames =
      publication.channels?.nodes
        .map((channel) => channel.name || channel.handle)
        .filter(Boolean) ?? [];

    return {
      publicationId: publication.id,
      targetType,
      title:
        publication.catalog?.title ||
        channelNames.join(", ") ||
        `Publication ${publication.id.split("/").pop()}`,
      catalogId: publication.catalog?.id ?? null,
      catalogStatus: publication.catalog?.status ?? null,
      channelIds:
        publication.channels?.nodes.map((channel) => channel.id) ?? [],
    };
  });
}

export async function listContextVisibilityRules(shop: string) {
  return withPrismaClient((db) =>
    db.contextVisibilityRule.findMany({
      where: { shop },
      orderBy: [{ targetType: "asc" }, { targetTitle: "asc" }],
    }),
  );
}

export async function saveContextVisibilityRule(
  admin: AdminClient,
  shop: string,
  ruleId: string | null,
  input: Partial<Record<keyof ContextRuleInput, unknown>>,
  entitledOptionIds?: readonly string[],
) {
  const optionIds =
    entitledOptionIds ?? (await currentOptionIds(admin));

  if (!optionIds) {
    throw new Error(
      "An active VSN Stock Down Sort subscription is required.",
    );
  }

  const normalized = normalizeContextRuleInput(input);
  assertContextRuleEntitlement(normalized.targetType, optionIds);

  const targets = await listPublicationTargets(
    admin,
    normalized.targetType,
  );
  const target = targets.find(
    (item) => item.publicationId === normalized.publicationId,
  );
  if (!target) {
    throw new Error(
      "The selected Shopify publication is not available in this context.",
    );
  }

  if (ruleId) {
    const existing = await withPrismaClient((db) =>
      db.contextVisibilityRule.findUnique({ where: { id: ruleId } }),
    );
    if (!existing || existing.shop !== shop) {
      throw new Error("Commerce context rule not found.");
    }

    if (existing.publicationId !== normalized.publicationId) {
      const managed = await withPrismaClient((db) =>
        db.contextPublicationState.count({
          where: { shop, ruleId, managedHidden: true },
        }),
      );
      if (managed > 0) {
        throw new Error(
          "This rule still has VSN-managed hidden products. Let the rule restore them before changing its publication.",
        );
      }
    }
  }

  const data = {
    targetType: normalized.targetType,
    publicationId: normalized.publicationId,
    targetTitle: target.title,
    enabled: normalized.enabled,
    autoRestore: normalized.autoRestore,
  };

  const rule = await withPrismaClient((db) =>
    ruleId
      ? db.contextVisibilityRule.update({
          where: { id: ruleId },
          data,
        })
      : db.contextVisibilityRule.create({
          data: { shop, ...data },
        }),
  );

  await recordActivityEventSafe({
    shop,
    category: "settings",
    action: ruleId
      ? "context_visibility.rule_updated"
      : "context_visibility.rule_created",
    outcome: "SUCCESS",
    source: "context-visibility-settings",
    entityType: "context_visibility_rule",
    entityId: rule.id,
    summary: ruleId
      ? "Commerce context visibility rule updated."
      : "Commerce context visibility rule created.",
    details: {
      targetType: rule.targetType,
      publicationId: rule.publicationId,
      enabled: rule.enabled,
      autoRestore: rule.autoRestore,
    },
  });

  return rule;
}

export async function setContextVisibilityRuleEnabled(
  shop: string,
  ruleId: string,
  enabled: boolean,
  optionIds: readonly string[],
) {
  const existing = await withPrismaClient((db) =>
    db.contextVisibilityRule.findUnique({ where: { id: ruleId } }),
  );
  if (!existing || existing.shop !== shop) {
    throw new Error("Commerce context rule not found.");
  }

  assertContextRuleEntitlement(
    existing.targetType as ContextTargetType,
    optionIds,
  );

  if (!enabled) {
    const managed = await withPrismaClient((db) =>
      db.contextPublicationState.count({
        where: { shop, ruleId, managedHidden: true },
      }),
    );
    if (managed > 0) {
      throw new Error(
        "This rule still has VSN-managed hidden products. Keep it enabled until those products are restored.",
      );
    }
  }

  const rule = await withPrismaClient((db) =>
    db.contextVisibilityRule.update({
      where: { id: ruleId },
      data: { enabled },
    }),
  );

  await recordActivityEventSafe({
    shop,
    category: "settings",
    action: enabled
      ? "context_visibility.rule_enabled"
      : "context_visibility.rule_paused",
    outcome: "SUCCESS",
    source: "context-visibility-settings",
    entityType: "context_visibility_rule",
    entityId: ruleId,
    summary: enabled
      ? "Commerce context visibility rule enabled."
      : "Commerce context visibility rule paused.",
  });

  return rule;
}

export async function deleteContextVisibilityRule(
  shop: string,
  ruleId: string,
) {
  const existing = await withPrismaClient((db) =>
    db.contextVisibilityRule.findUnique({ where: { id: ruleId } }),
  );
  if (!existing || existing.shop !== shop) {
    throw new Error("Commerce context rule not found.");
  }

  const managed = await withPrismaClient((db) =>
    db.contextPublicationState.count({
      where: { shop, ruleId, managedHidden: true },
    }),
  );
  if (managed > 0) {
    throw new Error(
      "Restore or clear VSN-managed publication removals before deleting this rule.",
    );
  }

  await withPrismaClient((db) =>
    db.contextVisibilityRule.delete({ where: { id: ruleId } }),
  );

  await recordActivityEventSafe({
    shop,
    category: "settings",
    action: "context_visibility.rule_deleted",
    outcome: "SUCCESS",
    source: "context-visibility-settings",
    entityType: "context_visibility_rule",
    entityId: ruleId,
    summary: "Commerce context visibility rule deleted.",
  });
}

async function getProductContextSource(
  admin: AdminClient,
  productId: string,
) {
  const data = await gql<{ product: ProductContextSource | null }>(
    admin,
    `#graphql
      query ContextVisibilityProduct($id: ID!) {
        product(id: $id) {
          id
          title
          totalInventory
          tracksInventory
        }
      }
    `,
    { id: productId },
  );

  return data.product;
}

async function productPublishedOnPublication(
  admin: AdminClient,
  productId: string,
  publicationId: string,
) {
  const data = await gql<{
    product: {
      id: string;
      publishedOnPublication: boolean;
    } | null;
  }>(
    admin,
    `#graphql
      query ProductPublicationMembership(
        $productId: ID!
        $publicationId: ID!
      ) {
        product(id: $productId) {
          id
          publishedOnPublication(publicationId: $publicationId)
        }
      }
    `,
    { productId, publicationId },
  );

  return data.product?.publishedOnPublication ?? false;
}

async function updatePublicationMembership(
  admin: AdminClient,
  publicationId: string,
  productIds: string[],
  mode: "add" | "remove",
) {
  if (!productIds.length) return;
  if (productIds.length > PUBLICATION_MUTATION_LIMIT) {
    throw new Error(
      `Publication mutation exceeds Shopify's ${PUBLICATION_MUTATION_LIMIT}-item limit.`,
    );
  }

  const data = await gql<{
    publicationUpdate: {
      publication: { id: string } | null;
      userErrors: Array<{ field?: string[] | null; message: string }>;
    };
  }>(
    admin,
    `#graphql
      mutation UpdateContextPublication(
        $id: ID!
        $input: PublicationUpdateInput!
      ) {
        publicationUpdate(id: $id, input: $input) {
          publication {
            id
          }
          userErrors {
            field
            message
          }
        }
      }
    `,
    {
      id: publicationId,
      input:
        mode === "add"
          ? { publishablesToAdd: productIds }
          : { publishablesToRemove: productIds },
    },
  );

  const userError = data.publicationUpdate.userErrors[0]?.message;
  if (userError) throw new Error(userError);
  if (!data.publicationUpdate.publication) {
    throw new Error("Shopify did not return the updated publication.");
  }
}

function productIsSoldOut(product: ProductContextSource) {
  return (
    product.tracksInventory &&
    (product.totalInventory ?? 0) <= 0
  );
}

async function reconcileRuleForProduct(
  admin: AdminClient,
  shop: string,
  product: ProductContextSource,
  rule: {
    id: string;
    targetType: string;
    publicationId: string;
    targetTitle: string;
    enabled: boolean;
    autoRestore: boolean;
  },
  optionIds: readonly string[],
) {
  const targetType = rule.targetType as ContextTargetType;
  assertContextRuleEntitlement(targetType, optionIds);

  const state = await withPrismaClient((db) =>
    db.contextPublicationState.findUnique({
      where: {
        shop_ruleId_productId: {
          shop,
          ruleId: rule.id,
          productId: product.id,
        },
      },
    }),
  );

  const published = await productPublishedOnPublication(
    admin,
    product.id,
    rule.publicationId,
  );

  if (productIsSoldOut(product)) {
    if (state?.managedHidden) {
      if (published) {
        await withPrismaClient((db) =>
          db.contextPublicationState.update({
            where: {
              shop_ruleId_productId: {
                shop,
                ruleId: rule.id,
                productId: product.id,
              },
            },
            data: {
              managedHidden: false,
              restoredAt: new Date(),
            },
          }),
        );

        return {
          ruleId: rule.id,
          changed: false,
          reason: "merchant-publication-override",
        };
      }

      return {
        ruleId: rule.id,
        changed: false,
        reason: "already-managed-hidden",
      };
    }

    if (!published) {
      return {
        ruleId: rule.id,
        changed: false,
        reason: "merchant-owned-unpublished",
      };
    }

    await updatePublicationMembership(
      admin,
      rule.publicationId,
      [product.id],
      "remove",
    );

    await withPrismaClient((db) =>
      db.contextPublicationState.upsert({
        where: {
          shop_ruleId_productId: {
            shop,
            ruleId: rule.id,
            productId: product.id,
          },
        },
        create: {
          shop,
          ruleId: rule.id,
          productId: product.id,
          publicationId: rule.publicationId,
          managedHidden: true,
          hiddenAt: new Date(),
        },
        update: {
          publicationId: rule.publicationId,
          managedHidden: true,
          hiddenAt: new Date(),
          restoredAt: null,
        },
      }),
    );

    await recordActivityEventSafe({
      shop,
      category: "visibility",
      action: "context_visibility.product_removed",
      outcome: "SUCCESS",
      source: "context-visibility-engine",
      entityType: "product",
      entityId: product.id,
      summary: "Sold-out product removed from a managed commerce context.",
      soldOutProducts: 1,
      details: {
        ruleId: rule.id,
        targetType: rule.targetType,
        publicationId: rule.publicationId,
        targetTitle: rule.targetTitle,
      },
    });

    return {
      ruleId: rule.id,
      changed: true,
      action: "removed",
    };
  }

  if (!state?.managedHidden) {
    return {
      ruleId: rule.id,
      changed: false,
      reason: "not-managed-by-app",
    };
  }

  if (published) {
    await withPrismaClient((db) =>
      db.contextPublicationState.update({
        where: {
          shop_ruleId_productId: {
            shop,
            ruleId: rule.id,
            productId: product.id,
          },
        },
        data: {
          managedHidden: false,
          restoredAt: new Date(),
        },
      }),
    );

    return {
      ruleId: rule.id,
      changed: false,
      reason: "already-restored",
    };
  }

  if (!rule.autoRestore) {
    return {
      ruleId: rule.id,
      changed: false,
      reason: "auto-restore-disabled",
    };
  }

  await updatePublicationMembership(
    admin,
    rule.publicationId,
    [product.id],
    "add",
  );

  await withPrismaClient((db) =>
    db.contextPublicationState.update({
      where: {
        shop_ruleId_productId: {
          shop,
          ruleId: rule.id,
          productId: product.id,
        },
      },
      data: {
        managedHidden: false,
        restoredAt: new Date(),
      },
    }),
  );

  await recordActivityEventSafe({
    shop,
    category: "visibility",
    action: "context_visibility.product_restored",
    outcome: "SUCCESS",
    source: "context-visibility-engine",
    entityType: "product",
    entityId: product.id,
    summary: "Restocked product restored to a VSN-managed commerce context.",
    details: {
      ruleId: rule.id,
      targetType: rule.targetType,
      publicationId: rule.publicationId,
      targetTitle: rule.targetTitle,
    },
  });

  return {
    ruleId: rule.id,
    changed: true,
    action: "restored",
  };
}

export async function reconcileContextVisibilityForProduct(
  admin: AdminClient,
  shop: string,
  productId: string,
  entitledOptionIds?: readonly string[],
) {
  const optionIds =
    entitledOptionIds ?? (await currentOptionIds(admin));
  if (!optionIds) {
    return {
      productId,
      changed: false,
      reason: "inactive-subscription",
      results: [],
    };
  }

  const rules = await withPrismaClient((db) =>
    db.contextVisibilityRule.findMany({
      where: { shop, enabled: true },
      orderBy: [{ targetType: "asc" }, { id: "asc" }],
    }),
  );

  if (!rules.length) {
    return {
      productId,
      changed: false,
      reason: "no-enabled-rules",
      results: [],
    };
  }

  const product = await getProductContextSource(admin, productId);
  if (!product) {
    return {
      productId,
      changed: false,
      reason: "product-not-found",
      results: [],
    };
  }

  if (!product.tracksInventory) {
    return {
      productId,
      changed: false,
      reason: "inventory-not-tracked",
      results: [],
    };
  }

  const results = [];
  for (const rule of rules) {
    try {
      results.push(
        await reconcileRuleForProduct(
          admin,
          shop,
          product,
          rule,
          optionIds,
        ),
      );
    } catch (error) {
      results.push({
        ruleId: rule.id,
        changed: false,
        reason: "rule-error",
        error:
          error instanceof Error
            ? error.message
            : "Commerce context rule failed.",
      });
    }
  }

  return {
    productId,
    changed: results.some((result) => result.changed),
    soldOut: productIsSoldOut(product),
    results,
  };
}

export const CONTEXT_PUBLICATION_MUTATION_LIMIT =
  PUBLICATION_MUTATION_LIMIT;
