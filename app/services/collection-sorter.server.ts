import { withPrismaClient } from "../db.server";

type AdminClient = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

type CollectionProduct = {
  id: string;
  title: string;
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

const PRODUCTS_PAGE_SIZE = 100;
const MAX_REORDER_MOVES = 250;

/**
 * Inventory-first business rule.
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
      { first: 100, after },
    );

    all.push(...data.collections.nodes);
    after = data.collections.pageInfo.hasNextPage
      ? data.collections.pageInfo.endCursor
      : null;
  } while (after);

  return all;
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

async function reorderChunk(
  admin: AdminClient,
  collectionId: string,
  productIds: string[],
  endPosition: number,
) {
  if (!productIds.length) return null;

  const moves = productIds.map((id) => ({
    id,
    // Move to >= product count => Shopify places it at the end.
    newPosition: String(endPosition),
  }));

  const data = await gql<{
    collectionReorderProducts: {
      job: null | { id: string };
      userErrors: Array<{ field: string[] | null; message: string }>;
    };
  }>(
    admin,
    `#graphql
      mutation PushSoldOutProductsDown(
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

  return data.collectionReorderProducts.job?.id ?? null;
}

/**
 * Sorts one collection while preserving relative order:
 *
 * before: [stock A, sold B, stock C, sold D]
 * after:  [stock A, stock C, sold B, sold D]
 *
 * Only sold-out products are sent as moves.
 */
export async function sortCollection(
  admin: AdminClient,
  shop: string,
  collectionId: string,
) {
  try {
    const collection = await getCollection(admin, collectionId);
    if (!collection) throw new Error("Collection not found");

    if (collection.sortOrder !== "MANUAL") {
      throw new Error(
        `Collection must be MANUAL before sorting (currently ${collection.sortOrder})`,
      );
    }

    const products = await listCollectionProducts(admin, collectionId);
    const soldOut = products.filter((product) => !isInStock(product));

    // They are already all at the bottom in the same relative order.
    const expectedSoldOutIds = products
      .slice(products.length - soldOut.length)
      .map((p) => p.id);

    const alreadySorted =
      soldOut.length === 0 ||
      soldOut.every((p, index) => p.id === expectedSoldOutIds[index]);

    const jobIds: string[] = [];

    if (!alreadySorted) {
      for (let i = 0; i < soldOut.length; i += MAX_REORDER_MOVES) {
        const chunk = soldOut
          .slice(i, i + MAX_REORDER_MOVES)
          .map((product) => product.id);

        const jobId = await reorderChunk(
          admin,
          collectionId,
          chunk,
          products.length,
        );
        if (jobId) jobIds.push(jobId);
      }
    }

    await withPrismaClient((db) =>
      db.collectionSetting.update({
        where: {
          shop_collectionId: {
            shop,
            collectionId,
          },
        },
        data: {
          lastSortedAt: new Date(),
          lastError: null,
        },
      }),
    );

    return {
      collectionId,
      totalProducts: products.length,
      soldOutProducts: soldOut.length,
      alreadySorted,
      jobIds,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown sorting error";

    await withPrismaClient((db) =>
      db.collectionSetting.update({
        where: {
          shop_collectionId: {
            shop,
            collectionId,
          },
        },
        data: { lastError: message },
      }),
    ).catch(() => undefined);

    throw error;
  }
}

export async function enableCollection(
  admin: AdminClient,
  shop: string,
  collectionId: string,
) {
  const collection = await getCollection(admin, collectionId);
  if (!collection) throw new Error("Collection not found");

  const existing = await withPrismaClient((db) =>
    db.collectionSetting.findUnique({
      where: { shop_collectionId: { shop, collectionId } },
    }),
  );

  // Preserve the original non-manual sort only once.
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

  return sortCollection(admin, shop, collectionId);
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

  const results = [];
  for (const setting of settings) {
    try {
      results.push(
        await sortCollection(admin, shop, setting.collectionId),
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
      { id: productId, first: 100, after },
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
