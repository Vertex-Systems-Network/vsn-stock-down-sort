import { withPrismaClient } from "../db.server";
import { getCurrentSubscriptionPlan } from "./billing.server";
import { recordActivityEventSafe } from "./analytics.server";
import {
  assertCollectionRuleEntitlements,
  effectiveCollectionRules,
  normalizeCollectionRuleInput,
  parseRuleList,
  type AvailableSortMode,
  type CollectionRuleInput,
  type InventoryMode,
} from "./collection-sort-rules";

type AdminClient = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

type CollectionProduct = {
  id: string;
  title: string;
  handle: string;
  vendor: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  totalInventory: number | null;
  tracksInventory: boolean;
};

type CollectionListItem = {
  id: string;
  title: string;
  handle: string;
  sortOrder: string;
  productsCount: { count: number };
};

export type ShopLocation = {
  id: string;
  name: string;
};

type CollectionListResponse = {
  collections: {
    nodes: CollectionListItem[];
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
  };
};

type CollectionProductsResponse = {
  collection: null | {
    products: {
      nodes: CollectionProduct[];
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
    };
  };
};

type ProductCollectionsResponse = {
  product: null | {
    collections: {
      nodes: Array<{ id: string }>;
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
    };
  };
};

type InventoryLevelNode = {
  location: { id: string };
  quantities: Array<{ name: string; quantity: number }>;
};

type InventoryLevelsConnection = {
  nodes: InventoryLevelNode[];
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
};

type ProductInventoryResponse = {
  product: null | {
    variants: {
      nodes: Array<{
        inventoryItem: {
          id: string;
          inventoryLevels: InventoryLevelsConnection;
        };
      }>;
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
    };
  };
};

type InventoryItemLevelsResponse = {
  inventoryItem: null | {
    inventoryLevels: InventoryLevelsConnection;
  };
};

type EvaluatedProduct = {
  product: CollectionProduct;
  originalIndex: number;
  inStock: boolean;
  effectiveInventory: number;
  excluded: boolean;
  pinnedRank: number | null;
};

type ReorderMove = {
  id: string;
  newPosition: string;
};

const PRODUCTS_PAGE_SIZE = 250;
const VARIANTS_PAGE_SIZE = 250;
const INVENTORY_LEVELS_PAGE_SIZE = 250;
const MAX_REORDER_MOVES = 250;
const JOB_POLL_INTERVAL_MS = 500;
const MAX_JOB_POLL_ATTEMPTS = 40;
const LOCATION_INVENTORY_CONCURRENCY = 5;

/**
 * Aggregate inventory-first base rule.
 *
 * Untracked products remain in the available group.
 * Tracked products are considered in stock only when aggregate inventory > 0.
 */
export function isInStock(product: CollectionProduct): boolean {
  if (!product.tracksInventory) return true;
  return (product.totalInventory ?? 0) > 0;
}

async function gql<T>(
  admin: AdminClient,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const response = await admin.graphql(query, { variables });
  const json = (await response.json()) as {
    data?: T;
    errors?: Array<{ message?: string }>;
  };

  if (json.errors?.length) {
    throw new Error(
      json.errors
        .map((error) => error.message ?? "Unknown GraphQL error")
        .join("; "),
    );
  }

  if (json.data === undefined) {
    throw new Error("GraphQL response did not include data.");
  }

  return json.data;
}

async function currentEntitledOptionIds(admin: AdminClient) {
  const current = await getCurrentSubscriptionPlan(
    admin as Parameters<typeof getCurrentSubscriptionPlan>[0],
  );
  return current?.plan.option_ids ?? null;
}

export async function getCollection(
  admin: AdminClient,
  collectionId: string,
) {
  const data = await gql<{
    collection: null | {
      id: string;
      title: string;
      sortOrder: string;
      productsCount: { count: number };
    };
  }>(
    admin,
    `#graphql
      query CollectionForStockSorter($id: ID!) {
        collection(id: $id) {
          id
          title
          sortOrder
          productsCount {
            count
          }
        }
      }
    `,
    { id: collectionId },
  );

  return data.collection;
}

export async function listAllCollections(admin: AdminClient) {
  const all: CollectionListItem[] = [];
  let after: string | null = null;

  do {
    const data: CollectionListResponse = await gql<CollectionListResponse>(
      admin,
      `#graphql
        query CollectionsForStockSorter($first: Int!, $after: String) {
          collections(first: $first, after: $after, sortKey: TITLE) {
            nodes {
              id
              title
              handle
              sortOrder
              productsCount {
                count
              }
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      `,
      { first: 250, after },
    );

    all.push(...data.collections.nodes);
    after = data.collections.pageInfo.hasNextPage
      ? data.collections.pageInfo.endCursor
      : null;
  } while (after);

  return all;
}

export async function listAllLocations(
  admin: AdminClient,
): Promise<ShopLocation[]> {
  const locations: ShopLocation[] = [];
  let after: string | null = null;

  do {
    const data: {
      locations: {
        nodes: ShopLocation[];
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
      };
    } = await gql<{
      locations: {
        nodes: ShopLocation[];
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
      };
    }>(
      admin,
      `#graphql
        query StockSorterLocations($first: Int!, $after: String) {
          locations(first: $first, after: $after) {
            nodes {
              id
              name
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      `,
      { first: 250, after },
    );

    locations.push(...data.locations.nodes);
    after = data.locations.pageInfo.hasNextPage
      ? data.locations.pageInfo.endCursor
      : null;
  } while (after);

  return locations;
}

async function listCollectionProducts(
  admin: AdminClient,
  collectionId: string,
): Promise<CollectionProduct[]> {
  const products: CollectionProduct[] = [];
  let after: string | null = null;

  do {
    const data: CollectionProductsResponse =
      await gql<CollectionProductsResponse>(
        admin,
        `#graphql
          query CollectionProductsForStockSorter(
            $id: ID!
            $first: Int!
            $after: String
          ) {
            collection(id: $id) {
              products(first: $first, after: $after) {
                nodes {
                  id
                  title
                  handle
                  vendor
                  tags
                  createdAt
                  updatedAt
                  totalInventory
                  tracksInventory
                }
                pageInfo {
                  hasNextPage
                  endCursor
                }
              }
            }
          }
        `,
        {
          id: collectionId,
          first: PRODUCTS_PAGE_SIZE,
          after,
        },
      );

    if (!data.collection) throw new Error("Collection not found");

    products.push(...data.collection.products.nodes);
    after = data.collection.products.pageInfo.hasNextPage
      ? data.collection.products.pageInfo.endCursor
      : null;
  } while (after);

  return products;
}

function availableQuantity(level: InventoryLevelNode) {
  return (
    level.quantities.find((quantity) => quantity.name === "available")
      ?.quantity ?? 0
  );
}

function addSelectedInventoryLevels(
  totals: Map<string, number>,
  selectedLocationIds: Set<string>,
  levels: InventoryLevelNode[],
) {
  for (const level of levels) {
    if (!selectedLocationIds.has(level.location.id)) continue;
    totals.set(
      level.location.id,
      (totals.get(level.location.id) ?? 0) + availableQuantity(level),
    );
  }
}

async function appendRemainingInventoryLevels(
  admin: AdminClient,
  inventoryItemId: string,
  after: string,
  selectedLocationIds: Set<string>,
  totals: Map<string, number>,
) {
  let cursor: string | null = after;

  while (cursor) {
    const data: InventoryItemLevelsResponse =
      await gql<InventoryItemLevelsResponse>(
      admin,
      `#graphql
        query InventoryItemLevelsForStockSorter(
          $id: ID!
          $first: Int!
          $after: String
        ) {
          inventoryItem(id: $id) {
            inventoryLevels(first: $first, after: $after) {
              nodes {
                location {
                  id
                }
                quantities(names: ["available"]) {
                  name
                  quantity
                }
              }
              pageInfo {
                hasNextPage
                endCursor
              }
            }
          }
        }
      `,
      {
        id: inventoryItemId,
        first: INVENTORY_LEVELS_PAGE_SIZE,
        after: cursor,
      },
    );

    if (!data.inventoryItem) {
      throw new Error(`Inventory item not found: ${inventoryItemId}`);
    }

    const connection: InventoryLevelsConnection =
      data.inventoryItem.inventoryLevels;
    addSelectedInventoryLevels(
      totals,
      selectedLocationIds,
      connection.nodes,
    );
    cursor = connection.pageInfo.hasNextPage
      ? connection.pageInfo.endCursor
      : null;
  }
}

async function selectedLocationInventoryForProduct(
  admin: AdminClient,
  productId: string,
  locationIds: string[],
) {
  const selectedLocationIds = new Set(locationIds);
  const totals = new Map(locationIds.map((id) => [id, 0]));
  let after: string | null = null;

  do {
    const data: ProductInventoryResponse =
      await gql<ProductInventoryResponse>(
      admin,
      `#graphql
        query ProductLocationInventoryForStockSorter(
          $id: ID!
          $variantsFirst: Int!
          $variantsAfter: String
          $levelsFirst: Int!
        ) {
          product(id: $id) {
            variants(first: $variantsFirst, after: $variantsAfter) {
              nodes {
                inventoryItem {
                  id
                  inventoryLevels(first: $levelsFirst) {
                    nodes {
                      location {
                        id
                      }
                      quantities(names: ["available"]) {
                        name
                        quantity
                      }
                    }
                    pageInfo {
                      hasNextPage
                      endCursor
                    }
                  }
                }
              }
              pageInfo {
                hasNextPage
                endCursor
              }
            }
          }
        }
      `,
      {
        id: productId,
        variantsFirst: VARIANTS_PAGE_SIZE,
        variantsAfter: after,
        levelsFirst: INVENTORY_LEVELS_PAGE_SIZE,
      },
    );

    if (!data.product) {
      throw new Error(`Product not found while resolving inventory: ${productId}`);
    }

    for (const variant of data.product.variants.nodes) {
      const connection = variant.inventoryItem.inventoryLevels;
      addSelectedInventoryLevels(
        totals,
        selectedLocationIds,
        connection.nodes,
      );

      if (
        connection.pageInfo.hasNextPage &&
        connection.pageInfo.endCursor
      ) {
        await appendRemainingInventoryLevels(
          admin,
          variant.inventoryItem.id,
          connection.pageInfo.endCursor,
          selectedLocationIds,
          totals,
        );
      }
    }

    after = data.product.variants.pageInfo.hasNextPage
      ? data.product.variants.pageInfo.endCursor
      : null;
  } while (after);

  return totals;
}

function normalized(value: string) {
  return value.trim().toLocaleLowerCase();
}

function productMatchesSelector(product: CollectionProduct, selector: string) {
  const value = normalized(selector);
  return value === normalized(product.id) || value === normalized(product.handle);
}

function isExcludedProduct(
  product: CollectionProduct,
  rules: CollectionRuleInput,
) {
  const tags = new Set(product.tags.map(normalized));
  const vendor = normalized(product.vendor);

  if (
    parseRuleList(rules.excludedTags).some((tag) => tags.has(normalized(tag)))
  ) {
    return true;
  }

  if (
    parseRuleList(rules.excludedVendors).some(
      (excludedVendor) => normalized(excludedVendor) === vendor,
    )
  ) {
    return true;
  }

  return parseRuleList(rules.excludedProducts).some((selector) =>
    productMatchesSelector(product, selector),
  );
}

function pinnedRankForProduct(
  product: CollectionProduct,
  rules: CollectionRuleInput,
) {
  const selectors = parseRuleList(rules.pinnedProducts);
  const index = selectors.findIndex((selector) =>
    productMatchesSelector(product, selector),
  );
  return index >= 0 ? index : null;
}

function compareAvailableProducts(
  left: EvaluatedProduct,
  right: EvaluatedProduct,
  mode: AvailableSortMode,
) {
  let result = 0;

  switch (mode) {
    case "TITLE_ASC":
      result = left.product.title.localeCompare(right.product.title);
      break;
    case "TITLE_DESC":
      result = right.product.title.localeCompare(left.product.title);
      break;
    case "INVENTORY_DESC":
      result = right.effectiveInventory - left.effectiveInventory;
      break;
    case "INVENTORY_ASC":
      result = left.effectiveInventory - right.effectiveInventory;
      break;
    case "NEWEST":
      result =
        new Date(right.product.createdAt).getTime() -
        new Date(left.product.createdAt).getTime();
      break;
    case "OLDEST":
      result =
        new Date(left.product.createdAt).getTime() -
        new Date(right.product.createdAt).getTime();
      break;
    case "PRESERVE":
    default:
      result = 0;
      break;
  }

  return result || left.originalIndex - right.originalIndex;
}

function stockProfile(
  product: CollectionProduct,
  inventoryMode: InventoryMode,
  selectedLocationIds: string[],
  locationInventory?: Map<string, number>,
) {
  if (!product.tracksInventory) {
    return { inStock: true, effectiveInventory: 0 };
  }

  if (
    inventoryMode === "ALL_LOCATIONS" ||
    selectedLocationIds.length === 0 ||
    !locationInventory
  ) {
    const effectiveInventory = product.totalInventory ?? 0;
    return {
      inStock: effectiveInventory > 0,
      effectiveInventory,
    };
  }

  const quantities = selectedLocationIds.map(
    (locationId) => locationInventory.get(locationId) ?? 0,
  );

  return {
    inStock:
      inventoryMode === "ALL_SELECTED_LOCATIONS"
        ? quantities.every((quantity) => quantity > 0)
        : quantities.some((quantity) => quantity > 0),
    effectiveInventory: quantities.reduce(
      (sum, quantity) => sum + quantity,
      0,
    ),
  };
}

async function evaluateProducts(
  admin: AdminClient,
  products: CollectionProduct[],
  rules: CollectionRuleInput,
) {
  const selectedLocationIds = parseRuleList(rules.inventoryLocationIds);
  const locationInventory = new Map<string, Map<string, number>>();

  if (
    rules.inventoryMode !== "ALL_LOCATIONS" &&
    selectedLocationIds.length > 0
  ) {
    const trackedProducts = products.filter(
      (product) => product.tracksInventory,
    );

    for (
      let index = 0;
      index < trackedProducts.length;
      index += LOCATION_INVENTORY_CONCURRENCY
    ) {
      const batch = trackedProducts.slice(
        index,
        index + LOCATION_INVENTORY_CONCURRENCY,
      );

      await Promise.all(
        batch.map(async (product) => {
          locationInventory.set(
            product.id,
            await selectedLocationInventoryForProduct(
              admin,
              product.id,
              selectedLocationIds,
            ),
          );
        }),
      );
    }
  }

  return products.map((product, originalIndex): EvaluatedProduct => {
    const profile = stockProfile(
      product,
      rules.inventoryMode,
      selectedLocationIds,
      locationInventory.get(product.id),
    );

    return {
      product,
      originalIndex,
      inStock: profile.inStock,
      effectiveInventory: profile.effectiveInventory,
      excluded: isExcludedProduct(product, rules),
      pinnedRank: pinnedRankForProduct(product, rules),
    };
  });
}

/**
 * Rule precedence:
 * 1. Excluded products stay fixed at their exact original indices.
 * 2. Pinned movable products come first, ordered by configured pin priority.
 * 3. Remaining in-stock movable products use the selected advanced sort mode.
 * 4. Remaining sold-out movable products keep their relative order at the end.
 */
export function buildTargetProductOrder(
  evaluated: EvaluatedProduct[],
  availableSortMode: AvailableSortMode,
) {
  const movable = evaluated.filter((item) => !item.excluded);

  const pinned = movable
    .filter((item) => item.pinnedRank !== null)
    .sort(
      (left, right) =>
        (left.pinnedRank ?? Number.MAX_SAFE_INTEGER) -
          (right.pinnedRank ?? Number.MAX_SAFE_INTEGER) ||
        left.originalIndex - right.originalIndex,
    );

  const unpinned = movable.filter((item) => item.pinnedRank === null);
  const available = unpinned
    .filter((item) => item.inStock)
    .sort((left, right) =>
      compareAvailableProducts(left, right, availableSortMode),
    );
  const soldOut = unpinned
    .filter((item) => !item.inStock)
    .sort((left, right) => left.originalIndex - right.originalIndex);

  const orderedMovable = [...pinned, ...available, ...soldOut];
  let movableIndex = 0;

  return evaluated.map((item) => {
    if (item.excluded) return item.product;
    const replacement = orderedMovable[movableIndex];
    movableIndex += 1;
    return replacement.product;
  });
}

/**
 * Build the minimal left-to-right move sequence needed to transform the
 * current order into the target order. Shopify applies moves sequentially,
 * so positions here are valid even when the list is split into 250-move jobs.
 */
export function buildSequentialMoves(
  currentIds: string[],
  targetIds: string[],
): ReorderMove[] {
  if (currentIds.length !== targetIds.length) {
    throw new Error("Current and target collection orders have different lengths.");
  }

  const working = [...currentIds];
  const moves: ReorderMove[] = [];

  for (let targetIndex = 0; targetIndex < targetIds.length; targetIndex += 1) {
    const targetId = targetIds[targetIndex];
    if (working[targetIndex] === targetId) continue;

    const currentIndex = working.indexOf(targetId, targetIndex + 1);
    if (currentIndex < 0) {
      throw new Error(`Target product is missing from the collection: ${targetId}`);
    }

    moves.push({
      id: targetId,
      newPosition: String(targetIndex),
    });

    working.splice(currentIndex, 1);
    working.splice(targetIndex, 0, targetId);
  }

  return moves;
}

async function setCollectionSortOrder(
  admin: AdminClient,
  collectionId: string,
  sortOrder: string,
) {
  const data = await gql<{
    collectionUpdate: {
      collection: null | { id: string; sortOrder: string };
      userErrors: Array<{ field: string[] | null; message: string }>;
    };
  }>(
    admin,
    `#graphql
      mutation SetCollectionSortOrder(
        $id: ID!
        $sortOrder: CollectionSortOrder!
      ) {
        collectionUpdate(input: { id: $id, sortOrder: $sortOrder }) {
          collection {
            id
            sortOrder
          }
          userErrors {
            field
            message
          }
        }
      }
    `,
    { id: collectionId, sortOrder },
  );

  if (data.collectionUpdate.userErrors.length) {
    throw new Error(
      data.collectionUpdate.userErrors.map((e) => e.message).join("; "),
    );
  }

  return data.collectionUpdate.collection;
}

async function waitForJob(admin: AdminClient, jobId: string) {
  for (let attempt = 1; attempt <= MAX_JOB_POLL_ATTEMPTS; attempt += 1) {
    const data = await gql<{
      job: null | {
        id: string;
        done: boolean;
      };
    }>(
      admin,
      `#graphql
        query ReorderJobStatus($id: ID!) {
          job(id: $id) {
            id
            done
          }
        }
      `,
      { id: jobId },
    );

    if (!data.job) {
      throw new Error(`Shopify reorder job not found: ${jobId}`);
    }

    if (data.job.done) return;

    if (attempt < MAX_JOB_POLL_ATTEMPTS) {
      await new Promise((resolve) =>
        setTimeout(resolve, JOB_POLL_INTERVAL_MS),
      );
    }
  }

  throw new Error(
    `Shopify reorder job did not complete after ${MAX_JOB_POLL_ATTEMPTS} polls: ${jobId}`,
  );
}

async function reorderChunk(
  admin: AdminClient,
  collectionId: string,
  moves: ReorderMove[],
) {
  if (!moves.length) {
    throw new Error("Cannot reorder an empty move chunk.");
  }

  if (moves.length > MAX_REORDER_MOVES) {
    throw new Error(
      `Shopify supports at most ${MAX_REORDER_MOVES} collection moves per mutation.`,
    );
  }

  const data = await gql<{
    collectionReorderProducts: {
      job: null | { id: string };
      userErrors: Array<{ field: string[] | null; message: string }>;
    };
  }>(
    admin,
    `#graphql
      mutation ApplyStockSorterMoves(
        $id: ID!
        $moves: [MoveInput!]!
      ) {
        collectionReorderProducts(id: $id, moves: $moves) {
          job {
            id
          }
          userErrors {
            field
            message
          }
        }
      }
    `,
    { id: collectionId, moves },
  );

  if (data.collectionReorderProducts.userErrors.length) {
    throw new Error(
      data.collectionReorderProducts.userErrors
        .map((e) => e.message)
        .join("; "),
    );
  }

  const jobId = data.collectionReorderProducts.job?.id;

  if (!jobId) {
    throw new Error("Shopify did not return a reorder job ID.");
  }

  return jobId;
}

async function sortCollectionWithEntitlements(
  admin: AdminClient,
  shop: string,
  collectionId: string,
  entitledOptionIds: readonly string[],
) {
  try {
    const collection = await getCollection(admin, collectionId);
    if (!collection) throw new Error("Collection not found");

    if (collection.sortOrder !== "MANUAL") {
      throw new Error(
        `Collection must be MANUAL before sorting (currently ${collection.sortOrder})`,
      );
    }

    const setting = await withPrismaClient((db) =>
      db.collectionSetting.findUnique({
        where: { shop_collectionId: { shop, collectionId } },
      }),
    );

    if (!setting) {
      throw new Error("Collection sorting settings were not found. Refresh the page and enable this collection before sorting.");
    }

    const rules = effectiveCollectionRules(setting, entitledOptionIds);
    const products = await listCollectionProducts(admin, collectionId);
    const evaluated = await evaluateProducts(admin, products, rules);
    const targetProducts = buildTargetProductOrder(
      evaluated,
      rules.availableSortMode,
    );

    const moves = buildSequentialMoves(
      products.map((product) => product.id),
      targetProducts.map((product) => product.id),
    );

    const jobIds: string[] = [];

    for (let index = 0; index < moves.length; index += MAX_REORDER_MOVES) {
      const chunk = moves.slice(index, index + MAX_REORDER_MOVES);
      const jobId = await reorderChunk(admin, collectionId, chunk);
      jobIds.push(jobId);
      await waitForJob(admin, jobId);
    }

    const soldOutProducts = evaluated.filter(
      (product) => !product.inStock && product.pinnedRank === null,
    ).length;

    const settingUpdate = await withPrismaClient((db) =>
      db.collectionSetting.updateMany({
        where: { shop, collectionId },
        data: {
          lastSortedAt: new Date(),
          lastError: null,
        },
      }),
    );
    if (settingUpdate.count !== 1) {
      throw new Error(
        "Collection sorting settings disappeared during sorting. Refresh the page and enable the collection before trying again.",
      );
    }

    const result = {
      collectionId,
      totalProducts: products.length,
      soldOutProducts,
      excludedProducts: evaluated.filter((product) => product.excluded).length,
      pinnedProducts: evaluated.filter(
        (product) => product.pinnedRank !== null && !product.excluded,
      ).length,
      movedProducts: moves.length,
      alreadySorted: moves.length === 0,
      availableSortMode: rules.availableSortMode,
      inventoryMode: rules.inventoryMode,
      locationAware: rules.inventoryMode !== "ALL_LOCATIONS",
      jobIds,
    };

    await recordActivityEventSafe({
      shop,
      category: "sorting",
      action: "collection.sorted",
      outcome: "SUCCESS",
      source: "sorting-engine",
      entityType: "collection",
      entityId: collectionId,
      summary:
        moves.length === 0
          ? "Collection already matched the configured stock order."
          : `Reordered ${moves.length} collection products.`,
      details: {
        excludedProducts: result.excludedProducts,
        pinnedProducts: result.pinnedProducts,
        alreadySorted: result.alreadySorted,
        availableSortMode: result.availableSortMode,
        inventoryMode: result.inventoryMode,
        locationAware: result.locationAware,
        jobCount: result.jobIds.length,
      },
      totalProducts: result.totalProducts,
      soldOutProducts: result.soldOutProducts,
      movedProducts: result.movedProducts,
    });

    return result;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown sorting error";

    await withPrismaClient((db) =>
      db.collectionSetting.updateMany({
        where: { shop, collectionId },
        data: { lastError: message },
      }),
    ).catch(() => undefined);

    await recordActivityEventSafe({
      shop,
      category: "sorting",
      action: "collection.sort_failed",
      outcome: "ERROR",
      source: "sorting-engine",
      entityType: "collection",
      entityId: collectionId,
      summary: message,
    });

    throw error;
  }
}

export async function getCollectionStockSummary(
  admin: AdminClient,
  shop: string,
  collectionId: string,
  entitledOptionIds?: readonly string[],
) {
  const entitlements =
    entitledOptionIds ?? (await currentEntitledOptionIds(admin));

  if (!entitlements) {
    throw new Error(
      "An active VSN Stock Down Sort subscription is required to evaluate collection stock.",
    );
  }

  const setting = await withPrismaClient((db) =>
    db.collectionSetting.findUnique({
      where: { shop_collectionId: { shop, collectionId } },
    }),
  );

  if (!setting?.enabled) {
    throw new Error(
      "Enable this collection in VSN Stock Down Sort before using automation rules.",
    );
  }

  const collection = await getCollection(admin, collectionId);
  if (!collection) throw new Error("Collection not found");

  const rules = effectiveCollectionRules(setting, entitlements);
  const products = await listCollectionProducts(admin, collectionId);
  const evaluated = await evaluateProducts(admin, products, rules);
  const soldOutProducts = evaluated.filter((product) => !product.inStock).length;
  const totalProducts = evaluated.length;

  return {
    collectionId,
    collectionTitle: collection.title,
    totalProducts,
    inStockProducts: Math.max(0, totalProducts - soldOutProducts),
    soldOutProducts,
    soldOutPercent:
      totalProducts === 0
        ? 0
        : Math.round((soldOutProducts / totalProducts) * 100),
    inventoryMode: rules.inventoryMode,
    evaluatedAt: new Date().toISOString(),
  };
}

export async function sortCollection(
  admin: AdminClient,
  shop: string,
  collectionId: string,
  entitledOptionIds?: readonly string[],
) {
  const entitlements =
    entitledOptionIds ?? (await currentEntitledOptionIds(admin));

  if (!entitlements) {
    throw new Error(
      "An active VSN Stock Down Sort subscription is required to sort collections.",
    );
  }

  return sortCollectionWithEntitlements(
    admin,
    shop,
    collectionId,
    entitlements,
  );
}

export async function enableCollection(
  admin: AdminClient,
  shop: string,
  collectionId: string,
  entitledOptionIds?: readonly string[],
) {
  const entitlements =
    entitledOptionIds ?? (await currentEntitledOptionIds(admin));

  if (!entitlements) {
    throw new Error(
      "An active VSN Stock Down Sort subscription is required to enable sorting.",
    );
  }

  const collection = await getCollection(admin, collectionId);
  if (!collection) throw new Error("Collection not found");

  const existing = await withPrismaClient((db) =>
    db.collectionSetting.findUnique({
      where: { shop_collectionId: { shop, collectionId } },
    }),
  );

  const previousSortOrder =
    existing?.previousSortOrder ??
    (collection.sortOrder === "MANUAL" ? null : collection.sortOrder);

  await withPrismaClient((db) =>
    db.collectionSetting.upsert({
      where: { shop_collectionId: { shop, collectionId } },
      create: {
        shop,
        collectionId,
        enabled: true,
        previousSortOrder,
      },
      update: {
        enabled: true,
        previousSortOrder,
        lastError: null,
      },
    }),
  );

  if (collection.sortOrder !== "MANUAL") {
    await setCollectionSortOrder(admin, collectionId, "MANUAL");
  }

  const result = await sortCollectionWithEntitlements(
    admin,
    shop,
    collectionId,
    entitlements,
  );

  await recordActivityEventSafe({
    shop,
    category: "settings",
    action: "collection.enabled",
    outcome: "SUCCESS",
    source: "collection-settings",
    entityType: "collection",
    entityId: collectionId,
    summary: "Collection stock sorting enabled.",
  });

  return result;
}

export async function saveCollectionRules(
  admin: AdminClient,
  shop: string,
  collectionId: string,
  input: Partial<Record<keyof CollectionRuleInput, string | null | undefined>>,
  entitledOptionIds?: readonly string[],
) {
  const entitlements =
    entitledOptionIds ?? (await currentEntitledOptionIds(admin));

  if (!entitlements) {
    throw new Error(
      "An active VSN Stock Down Sort subscription is required to save sorting rules.",
    );
  }

  const collection = await getCollection(admin, collectionId);
  if (!collection) throw new Error("Collection not found");

  const rules = normalizeCollectionRuleInput(input);
  assertCollectionRuleEntitlements(rules, entitlements);

  const setting = await withPrismaClient((db) =>
    db.collectionSetting.upsert({
      where: { shop_collectionId: { shop, collectionId } },
      create: {
        shop,
        collectionId,
        enabled: false,
        ...rules,
      },
      update: {
        ...rules,
        lastError: null,
      },
    }),
  );

  await recordActivityEventSafe({
    shop,
    category: "settings",
    action: "collection.rules_saved",
    outcome: "SUCCESS",
    source: "collection-settings",
    entityType: "collection",
    entityId: collectionId,
    summary: "Collection sorting rules updated.",
    details: {
      enabled: setting.enabled,
      availableSortMode: rules.availableSortMode,
      inventoryMode: rules.inventoryMode,
      hasTagExclusions: Boolean(rules.excludedTags),
      hasVendorExclusions: Boolean(rules.excludedVendors),
      hasProductExclusions: Boolean(rules.excludedProducts),
      hasPinnedProducts: Boolean(rules.pinnedProducts),
      selectedLocationCount: parseRuleList(rules.inventoryLocationIds).length,
    },
  });

  return {
    collectionId,
    saved: true,
    enabled: setting.enabled,
    rules,
  };
}

export async function disableCollection(
  admin: AdminClient,
  shop: string,
  collectionId: string,
  restorePreviousSort = false,
) {
  const setting = await withPrismaClient((db) =>
    db.collectionSetting.findUnique({
      where: { shop_collectionId: { shop, collectionId } },
    }),
  );

  if (!setting) return;

  await withPrismaClient((db) =>
    db.collectionSetting.update({
      where: { shop_collectionId: { shop, collectionId } },
      data: {
        enabled: false,
        lastError: null,
      },
    }),
  );

  if (restorePreviousSort && setting.previousSortOrder) {
    await setCollectionSortOrder(
      admin,
      collectionId,
      setting.previousSortOrder,
    );
  }

  await recordActivityEventSafe({
    shop,
    category: "settings",
    action: "collection.disabled",
    outcome: "SUCCESS",
    source: "collection-settings",
    entityType: "collection",
    entityId: collectionId,
    summary: restorePreviousSort
      ? "Collection stock sorting disabled and previous Shopify sort restored."
      : "Collection stock sorting disabled.",
    details: {
      restoredPreviousSort: Boolean(
        restorePreviousSort && setting.previousSortOrder,
      ),
    },
  });
}

export async function sortEnabledCollections(
  admin: AdminClient,
  shop: string,
  collectionIds?: string[],
) {
  const settings = await withPrismaClient((db) =>
    db.collectionSetting.findMany({
      where: {
        shop,
        enabled: true,
        ...(collectionIds?.length
          ? { collectionId: { in: collectionIds } }
          : {}),
      },
    }),
  );

  const entitlements = await currentEntitledOptionIds(admin);
  if (!entitlements) {
    return settings.map((setting) => ({
      collectionId: setting.collectionId,
      skipped: true,
      reason: "inactive-subscription",
    }));
  }

  const results = [];
  for (const setting of settings) {
    try {
      results.push(
        await sortCollectionWithEntitlements(
          admin,
          shop,
          setting.collectionId,
          entitlements,
        ),
      );
    } catch (error) {
      results.push({
        collectionId: setting.collectionId,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  return results;
}

export async function collectionsForProduct(
  admin: AdminClient,
  productId: string,
) {
  const ids: string[] = [];
  let after: string | null = null;

  do {
    const data: ProductCollectionsResponse =
      await gql<ProductCollectionsResponse>(
        admin,
        `#graphql
          query ProductCollections(
            $id: ID!
            $first: Int!
            $after: String
          ) {
            product(id: $id) {
              collections(first: $first, after: $after) {
                nodes {
                  id
                }
                pageInfo {
                  hasNextPage
                  endCursor
                }
              }
            }
          }
        `,
        { id: productId, first: 250, after },
      );

    if (!data.product) return [];

    ids.push(...data.product.collections.nodes.map((c) => c.id));
    after = data.product.collections.pageInfo.hasNextPage
      ? data.product.collections.pageInfo.endCursor
      : null;
  } while (after);

  return ids;
}

/**
 * Resolve an inventory_item_id received from inventory_levels/update
 * to its product and that product's collections.
 */
export async function collectionsForInventoryItem(
  admin: AdminClient,
  inventoryItemNumericId: string | number,
) {
  const inventoryItemId = `gid://shopify/InventoryItem/${inventoryItemNumericId}`;

  const data = await gql<{
    inventoryItem: null | {
      variant: null | {
        product: {
          id: string;
        };
      };
    };
  }>(
    admin,
    `#graphql
      query InventoryItemProduct($id: ID!) {
        inventoryItem(id: $id) {
          variant {
            product {
              id
            }
          }
        }
      }
    `,
    { id: inventoryItemId },
  );

  const productId = data.inventoryItem?.variant?.product?.id;
  if (!productId) return [];

  return collectionsForProduct(admin, productId);
}
