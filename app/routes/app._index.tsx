import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import {
  useActionData,
  useLoaderData,
  useNavigation,
  useSubmit,
} from "react-router";
import { useMemo, useState } from "react";
import { authenticate } from "../shopify.server";
import { enqueueSortJobs } from "../sort-queue.server";
import { withPrismaClient } from "../db.server";
import { getCurrentSubscriptionPlan } from "../services/billing.server";
import {
  AVAILABLE_SORT_MODES,
  INVENTORY_MODES,
  PHASE2_OPTION_IDS,
  parseRuleList,
} from "../services/collection-sort-rules";
import {
  disableCollection,
  enableCollection,
  listAllCollections,
  listAllLocations,
  saveCollectionRules,
  sortCollection,
} from "../services/collection-sorter.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);
  const current = await getCurrentSubscriptionPlan(admin);
  const planOptionIds = current?.plan.option_ids ?? [];
  const canUseMultiLocation = planOptionIds.includes(
    PHASE2_OPTION_IDS.multiLocation,
  );

  const [collections, settings, locations] = await Promise.all([
    listAllCollections(admin),
    withPrismaClient((db) =>
      db.collectionSetting.findMany({
        where: { shop: session.shop },
      }),
    ),
    canUseMultiLocation ? listAllLocations(admin) : Promise.resolve([]),
  ]);

  const settingsMap = Object.fromEntries(
    settings.map((setting) => [setting.collectionId, setting]),
  );

  return {
    currentPlan: current
      ? {
          id: current.plan.id,
          name: current.plan.name,
        }
      : null,
    planOptionIds,
    locations,
    collections: collections.map((collection) => ({
      ...collection,
      setting: settingsMap[collection.id] ?? null,
    })),
  };
}

export async function action({ request, context }: ActionFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);
  const current = await getCurrentSubscriptionPlan(admin);

  if (!current) {
    return {
      ok: false,
      message:
        "An active VSN Stock Down Sort subscription is required to manage collection sorting.",
    };
  }

  const entitlements = current.plan.option_ids;
  const formData = await request.formData();
  const intent = String(formData.get("intent") || "");
  const collectionId = String(formData.get("collectionId") || "");

  try {
    if (intent === "enable" && collectionId) {
      const result = await enableCollection(
        admin,
        session.shop,
        collectionId,
        entitlements,
      );
      return {
        ok: true,
        message:
          "Collection enabled. Its saved sorting rules were applied immediately.",
        result,
      };
    }

    if (intent === "disable" && collectionId) {
      const restore = formData.get("restorePreviousSort") === "true";
      await disableCollection(admin, session.shop, collectionId, restore);
      return {
        ok: true,
        message: restore
          ? "Auto-sort disabled and the previous Shopify sort order was restored."
          : "Collection auto-sort disabled.",
      };
    }

    if (intent === "sort" && collectionId) {
      const result = await sortCollection(
        admin,
        session.shop,
        collectionId,
        entitlements,
      );
      return {
        ok: true,
        message: result.alreadySorted
          ? "This collection already matches its configured rules."
          : \`Collection sorted. \${result.movedProducts} product position\${result.movedProducts === 1 ? "" : "s"} changed.\`,
        result,
      };
    }

    if (intent === "saveRules" && collectionId) {
      const saved = await saveCollectionRules(
        admin,
        session.shop,
        collectionId,
        {
          excludedTags: String(formData.get("excludedTags") || ""),
          excludedVendors: String(formData.get("excludedVendors") || ""),
          excludedProducts: String(formData.get("excludedProducts") || ""),
          pinnedProducts: String(formData.get("pinnedProducts") || ""),
          availableSortMode: String(
            formData.get("availableSortMode") || "PRESERVE",
          ),
          inventoryMode: String(
            formData.get("inventoryMode") || "ALL_LOCATIONS",
          ),
          inventoryLocationIds: formData
            .getAll("inventoryLocationIds")
            .map(String)
            .join("\n"),
        },
        entitlements,
      );

      if (!saved.enabled) {
        return {
          ok: true,
          message:
            "Rules saved. They will apply when this collection is enabled.",
        };
      }

      const queued = await enqueueSortJobs(context, [
        {
          kind: "sort",
          shop: session.shop,
          collectionId,
          reason: "rules-update",
        },
      ]);

      if (queued) {
        return {
          ok: true,
          message:
            "Rules saved. The enabled collection was queued for re-sorting.",
        };
      }

      const result = await sortCollection(
        admin,
        session.shop,
        collectionId,
        entitlements,
      );

      return {
        ok: true,
        message: result.alreadySorted
          ? "Rules saved. The collection already matches them."
          : "Rules saved and applied to the collection.",
        result,
      };
    }

    if (intent === "enableAll") {
      const collections = await listAllCollections(admin);
      const queued = await enqueueSortJobs(
        context,
        collections.map((collection) => ({
          kind: "enable" as const,
          shop: session.shop,
          collectionId: collection.id,
          reason: "bulk-enable" as const,
        })),
      );

      if (queued) {
        return {
          ok: true,
          message: \`Queued auto-sort enablement for \${collections.length} collection\${collections.length === 1 ? "" : "s"}.\`,
        };
      }

      const results = [];

      for (const collection of collections) {
        try {
          results.push(
            await enableCollection(
              admin,
              session.shop,
              collection.id,
              entitlements,
            ),
          );
        } catch (error) {
          results.push({
            collectionId: collection.id,
            error: error instanceof Error ? error.message : "Unknown error",
          });
        }
      }

      const failed = results.filter(
        (result) => "error" in result && result.error,
      ).length;

      return {
        ok: failed === 0,
        message:
          failed === 0
            ? "Auto-sort enabled for all collections."
            : \`Finished with \${failed} collection\${failed === 1 ? "" : "s"} needing attention.\`,
        results,
      };
    }

    if (intent === "disableAll") {
      const result = await withPrismaClient((db) =>
        db.collectionSetting.updateMany({
          where: { shop: session.shop, enabled: true },
          data: {
            enabled: false,
            lastError: null,
          },
        }),
      );

      return {
        ok: true,
        message:
          result.count === 0
            ? "No enabled collections needed to be disabled."
            : \`Auto-sort disabled for \${result.count} collection\${result.count === 1 ? "" : "s"}.\`,
      };
    }

    return { ok: false, message: "Unknown action." };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

function formatDate(value?: string | Date | null) {
  if (!value) return "Never";
  return new Date(value).toLocaleString();
}

type StatusFilter = "all" | "enabled" | "disabled" | "attention";

const SORT_MODE_LABELS = {
  PRESERVE: "Preserve current in-stock order",
  TITLE_ASC: "Title A → Z",
  TITLE_DESC: "Title Z → A",
  INVENTORY_DESC: "Inventory high → low",
  INVENTORY_ASC: "Inventory low → high",
  NEWEST: "Newest products first",
  OLDEST: "Oldest products first",
} as const;

const INVENTORY_MODE_LABELS = {
  ALL_LOCATIONS: "Aggregate inventory across all locations",
  ANY_SELECTED_LOCATION: "In stock at any selected location",
  ALL_SELECTED_LOCATIONS: "In stock at every selected location",
} as const;

function fieldStyle() {
  return {
    width: "100%",
    boxSizing: "border-box" as const,
    padding: "10px 12px",
    border: "1px solid #8c9196",
    borderRadius: "8px",
    font: "inherit",
    background: "white",
  };
}

export default function AppIndex() {
  const { collections, currentPlan, planOptionIds, locations } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const submit = useSubmit();

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [editingCollectionId, setEditingCollectionId] = useState<string | null>(
    null,
  );

  const busy = navigation.state !== "idle";
  const submittedIntent = navigation.formData?.get("intent");
  const submittedCollectionId = navigation.formData?.get("collectionId");

  const enabledCount = collections.filter(
    (collection) => collection.setting?.enabled,
  ).length;

  const attentionCount = collections.filter(
    (collection) => Boolean(collection.setting?.lastError),
  ).length;

  const canUseExclusions = planOptionIds.includes(
    PHASE2_OPTION_IDS.exclusions,
  );
  const canUsePinnedProducts = planOptionIds.includes(
    PHASE2_OPTION_IDS.pinnedProducts,
  );
  const canUseAdvancedSort = planOptionIds.includes(
    PHASE2_OPTION_IDS.advancedSort,
  );
  const canUseMultiLocation = planOptionIds.includes(
    PHASE2_OPTION_IDS.multiLocation,
  );

  const filteredCollections = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return collections.filter((collection) => {
      const enabled = Boolean(collection.setting?.enabled);
      const hasError = Boolean(collection.setting?.lastError);

      const matchesQuery =
        !normalizedQuery ||
        collection.title.toLowerCase().includes(normalizedQuery) ||
        collection.handle.toLowerCase().includes(normalizedQuery);

      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "enabled" && enabled) ||
        (statusFilter === "disabled" && !enabled) ||
        (statusFilter === "attention" && hasError);

      return matchesQuery && matchesStatus;
    });
  }, [collections, query, statusFilter]);

  const editingCollection =
    collections.find(
      (collection) => collection.id === editingCollectionId,
    ) ?? null;

  const selectedLocationIds = new Set(
    parseRuleList(editingCollection?.setting?.inventoryLocationIds),
  );

  function runAction(
    intent: string,
    collectionId?: string,
    restorePreviousSort?: boolean,
  ) {
    const formData = new FormData();
    formData.set("intent", intent);

    if (collectionId) {
      formData.set("collectionId", collectionId);
    }

    if (restorePreviousSort !== undefined) {
      formData.set(
        "restorePreviousSort",
        restorePreviousSort ? "true" : "false",
      );
    }

    submit(formData, { method: "post" });
  }

  return (
    <s-page heading="Stock First" inlineSize="large">
      <s-button
        slot="primary-action"
        variant="primary"
        onClick={() => runAction("enableAll")}
        loading={busy && submittedIntent === "enableAll"}
        disabled={busy}
      >
        Enable all
      </s-button>

      <s-button
        slot="secondary-actions"
        variant="secondary"
        onClick={() => runAction("disableAll")}
        loading={busy && submittedIntent === "disableAll"}
        disabled={busy || enabledCount === 0}
      >
        Disable all
      </s-button>

      <s-section>
        <s-stack gap="base">
          <s-text>
            Keep available products first, pin priority products, exclude
            products from automation, and choose how in-stock products are
            ordered in each Shopify collection.
          </s-text>

          <s-stack direction="inline" gap="base">
            <s-badge tone="info">{collections.length} collections</s-badge>
            <s-badge tone="success">{enabledCount} enabled</s-badge>
            {currentPlan ? (
              <s-badge tone="info">{currentPlan.name} plan</s-badge>
            ) : null}
            {attentionCount > 0 ? (
              <s-badge tone="critical">{attentionCount} need attention</s-badge>
            ) : (
              <s-badge>0 errors</s-badge>
            )}
          </s-stack>
        </s-stack>
      </s-section>

      {actionData?.message ? (
        <s-banner
          tone={actionData.ok ? "success" : "critical"}
          heading={actionData.ok ? "Update complete" : "Action failed"}
          dismissible
        >
          {actionData.message}
        </s-banner>
      ) : null}

      <s-section padding="none">
        <s-table loading={busy}>
          <s-stack slot="filters" direction="inline" gap="base">
            <s-search-field
              label="Search collections"
              labelAccessibilityVisibility="exclusive"
              placeholder="Search collections"
              value={query}
              onInput={(event) => setQuery(event.currentTarget.value)}
            />

            <s-select
              label="Status"
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.currentTarget.value as StatusFilter)
              }
            >
              <s-option value="all">All statuses</s-option>
              <s-option value="enabled">Enabled</s-option>
              <s-option value="disabled">Disabled</s-option>
              <s-option value="attention">Needs attention</s-option>
            </s-select>
          </s-stack>

          <s-table-header-row>
            <s-table-header listSlot="primary">Collection</s-table-header>
            <s-table-header listSlot="inline">Auto-sort</s-table-header>
            <s-table-header listSlot="labeled">Products</s-table-header>
            <s-table-header listSlot="labeled">Shopify sort</s-table-header>
            <s-table-header listSlot="labeled">Last sorted</s-table-header>
            <s-table-header listSlot="labeled">Actions</s-table-header>
          </s-table-header-row>

          <s-table-body>
            {filteredCollections.map((collection) => {
              const enabled = Boolean(collection.setting?.enabled);
              const error = collection.setting?.lastError;
              const rowBusy =
                busy && submittedCollectionId === collection.id;

              return (
                <s-table-row key={collection.id}>
                  <s-table-cell>
                    <s-stack gap="small-200">
                      <s-text type="strong">{collection.title}</s-text>
                      <s-text>/{collection.handle}</s-text>
                      {error ? <s-text tone="critical">{error}</s-text> : null}
                    </s-stack>
                  </s-table-cell>

                  <s-table-cell>
                    {error ? (
                      <s-badge tone="critical">Attention</s-badge>
                    ) : enabled ? (
                      <s-badge tone="success">Enabled</s-badge>
                    ) : (
                      <s-badge>Disabled</s-badge>
                    )}
                  </s-table-cell>

                  <s-table-cell>{collection.productsCount.count}</s-table-cell>

                  <s-table-cell>
                    <s-text>{collection.sortOrder}</s-text>
                  </s-table-cell>

                  <s-table-cell>
                    <s-text>
                      {formatDate(collection.setting?.lastSortedAt)}
                    </s-text>
                  </s-table-cell>

                  <s-table-cell>
                    <s-button-group>
                      {enabled ? (
                        <>
                          <s-button
                            variant="secondary"
                            onClick={() => runAction("sort", collection.id)}
                            loading={rowBusy && submittedIntent === "sort"}
                            disabled={busy}
                          >
                            Sort now
                          </s-button>

                          <s-button
                            variant="tertiary"
                            tone="critical"
                            onClick={() =>
                              runAction("disable", collection.id, false)
                            }
                            loading={rowBusy && submittedIntent === "disable"}
                            disabled={busy}
                          >
                            Disable
                          </s-button>

                          {collection.setting?.previousSortOrder ? (
                            <s-button
                              variant="tertiary"
                              onClick={() =>
                                runAction("disable", collection.id, true)
                              }
                              disabled={busy}
                            >
                              Disable & restore
                            </s-button>
                          ) : null}
                        </>
                      ) : (
                        <s-button
                          variant="primary"
                          onClick={() => runAction("enable", collection.id)}
                          loading={rowBusy && submittedIntent === "enable"}
                          disabled={busy}
                        >
                          Enable
                        </s-button>
                      )}

                      <s-button
                        variant="secondary"
                        onClick={() =>
                          setEditingCollectionId(
                            editingCollectionId === collection.id
                              ? null
                              : collection.id,
                          )
                        }
                        disabled={busy}
                      >
                        {editingCollectionId === collection.id
                          ? "Close rules"
                          : "Rules"}
                      </s-button>
                    </s-button-group>
                  </s-table-cell>
                </s-table-row>
              );
            })}
          </s-table-body>
        </s-table>

        {filteredCollections.length === 0 ? (
          <s-box padding="large-300">
            <s-stack gap="base">
              <s-heading>No collections found</s-heading>
              <s-text>Try a different search term or status filter.</s-text>
            </s-stack>
          </s-box>
        ) : null}
      </s-section>

      {editingCollection ? (
        <s-section heading={\`Rules — \${editingCollection.title}\`}>
          <form
            key={\`\${editingCollection.id}:\${String(
              editingCollection.setting?.updatedAt ?? "new",
            )}\`}
            onSubmit={(event) => {
              event.preventDefault();
              submit(new FormData(event.currentTarget), { method: "post" });
            }}
          >
            <input type="hidden" name="intent" value="saveRules" />
            <input
              type="hidden"
              name="collectionId"
              value={editingCollection.id}
            />

            <s-stack gap="large-200">
              <s-box
                background="subdued"
                borderRadius="large"
                padding="base"
              >
                <s-stack gap="small-200">
                  <s-text type="strong">Rule precedence</s-text>
                  <s-text>
                    Excluded products stay fixed. Pinned products come next.
                    Remaining in-stock products use the advanced sort mode, then
                    sold-out products are placed last.
                  </s-text>
                </s-stack>
              </s-box>

              <s-grid
                gridTemplateColumns="repeat(auto-fit, minmax(260px, 1fr))"
                gap="base"
              >
                <div>
                  <label htmlFor="excludedTags">
                    <strong>Excluded tags</strong>
                  </label>
                  <textarea
                    id="excludedTags"
                    name="excludedTags"
                    defaultValue={editingCollection.setting?.excludedTags ?? ""}
                    disabled={!canUseExclusions}
                    placeholder="clearance, preorder"
                    style={{ ...fieldStyle(), minHeight: "90px" }}
                  />
                  <small>
                    One value per line or comma separated. Starter and above.
                  </small>
                </div>

                <div>
                  <label htmlFor="excludedVendors">
                    <strong>Excluded vendors</strong>
                  </label>
                  <textarea
                    id="excludedVendors"
                    name="excludedVendors"
                    defaultValue={
                      editingCollection.setting?.excludedVendors ?? ""
                    }
                    disabled={!canUseExclusions}
                    placeholder="Vendor A, Vendor B"
                    style={{ ...fieldStyle(), minHeight: "90px" }}
                  />
                  <small>Matching is case-insensitive.</small>
                </div>

                <div>
                  <label htmlFor="excludedProducts">
                    <strong>Excluded products</strong>
                  </label>
                  <textarea
                    id="excludedProducts"
                    name="excludedProducts"
                    defaultValue={
                      editingCollection.setting?.excludedProducts ?? ""
                    }
                    disabled={!canUseExclusions}
                    placeholder="product-handle or gid://shopify/Product/..."
                    style={{ ...fieldStyle(), minHeight: "90px" }}
                  />
                  <small>Use product handles or Shopify product GIDs.</small>
                </div>

                <div>
                  <label htmlFor="pinnedProducts">
                    <strong>Pinned products</strong>
                  </label>
                  <textarea
                    id="pinnedProducts"
                    name="pinnedProducts"
                    defaultValue={
                      editingCollection.setting?.pinnedProducts ?? ""
                    }
                    disabled={!canUsePinnedProducts}
                    placeholder="first-product&#10;second-product"
                    style={{ ...fieldStyle(), minHeight: "90px" }}
                  />
                  <small>
                    Order in this list is pin priority. Growth and above.
                  </small>
                </div>
              </s-grid>

              <div>
                <label htmlFor="availableSortMode">
                  <strong>In-stock product order</strong>
                </label>
                <select
                  id="availableSortMode"
                  name="availableSortMode"
                  defaultValue={
                    editingCollection.setting?.availableSortMode ?? "PRESERVE"
                  }
                  disabled={!canUseAdvancedSort}
                  style={fieldStyle()}
                >
                  {AVAILABLE_SORT_MODES.map((mode) => (
                    <option key={mode} value={mode}>
                      {SORT_MODE_LABELS[mode]}
                    </option>
                  ))}
                </select>
                <small>
                  Advanced sorting is available on Growth and above.
                </small>
              </div>

              <div>
                <label htmlFor="inventoryMode">
                  <strong>Inventory rule</strong>
                </label>
                <select
                  id="inventoryMode"
                  name="inventoryMode"
                  defaultValue={
                    editingCollection.setting?.inventoryMode ?? "ALL_LOCATIONS"
                  }
                  disabled={!canUseMultiLocation}
                  style={fieldStyle()}
                >
                  {INVENTORY_MODES.map((mode) => (
                    <option key={mode} value={mode}>
                      {INVENTORY_MODE_LABELS[mode]}
                    </option>
                  ))}
                </select>
                <small>
                  Selected-location rules are available on Pro and Unlimited.
                  Aggregate inventory remains the default for every plan.
                </small>
              </div>

              {canUseMultiLocation ? (
                <s-box
                  border="base base solid"
                  borderRadius="large"
                  padding="base"
                >
                  <s-stack gap="small-300">
                    <s-text type="strong">Inventory locations</s-text>
                    {locations.length ? (
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns:
                            "repeat(auto-fit, minmax(220px, 1fr))",
                          gap: "10px",
                        }}
                      >
                        {locations.map((location) => (
                          <label key={location.id}>
                            <input
                              type="checkbox"
                              name="inventoryLocationIds"
                              value={location.id}
                              defaultChecked={selectedLocationIds.has(
                                location.id,
                              )}
                            />{" "}
                            {location.name}
                          </label>
                        ))}
                      </div>
                    ) : (
                      <s-text>No active Shopify locations were returned.</s-text>
                    )}
                  </s-stack>
                </s-box>
              ) : null}

              <s-stack direction="inline" gap="base">
                <s-button
                  type="submit"
                  variant="primary"
                  loading={
                    busy &&
                    submittedIntent === "saveRules" &&
                    submittedCollectionId === editingCollection.id
                  }
                  disabled={busy}
                >
                  Save rules
                </s-button>
                <s-text>
                  Saved rules are re-applied automatically when an enabled
                  collection receives inventory/product webhooks.
                </s-text>
              </s-stack>
            </s-stack>
          </form>
        </s-section>
      ) : null}

      <s-section heading="How PHASE-02 sorting works">
        <s-stack gap="base">
          <s-text>
            Exclusion rules keep matching products at their exact collection
            positions. Pinned products take priority among all other products.
          </s-text>
          <s-text>
            Remaining available products can preserve their current order or
            sort by title, inventory, or product age. Sold-out products remain
            at the end.
          </s-text>
          <s-text>
            Pro and Unlimited plans can evaluate stock using any or every
            selected Shopify inventory location. Inventory and product webhooks
            re-run the same server-side rule engine.
          </s-text>
        </s-stack>
      </s-section>
    </s-page>
  );
}
