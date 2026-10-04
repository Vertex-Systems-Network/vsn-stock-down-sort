import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import {
  Link,
  useActionData,
  useLoaderData,
  useNavigation,
  useSubmit,
} from "react-router";
import { useMemo, useState } from "react";
import { PageIntro } from "../components/Workspace";
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
import { BrandButton } from "../components/BrandUi";

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
          : `Collection sorted. ${result.movedProducts} product position${result.movedProducts === 1 ? "" : "s"} changed.`,
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
          message: `Queued auto-sort enablement for ${collections.length} collection${collections.length === 1 ? "" : "s"}.`,
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
            : `Finished with ${failed} collection${failed === 1 ? "" : "s"} needing attention.`,
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
            : `Auto-sort disabled for ${result.count} collection${result.count === 1 ? "" : "s"}.`,
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
    <div className="vsn-page-wide">
      <PageIntro
        eyebrow="Your collection workspace"
        title="Keep available products where shoppers see them first."
        description="Automate collection order, protect priority products, and keep merchandising aligned with live inventory."
      >
        <Link className="vsn-button" to="/app/support">
          Need help? ↗
        </Link>
      </PageIntro>

      <div className="vsn-hero">
        <div>
          <div className="vsn-eyebrow">Stock-aware merchandising</div>
          <h2>Available first. Sold out last. Automatically.</h2>
          <p>
            Apply stock-aware sorting across your collections, keep pinned
            products in place, exclude selected items, and re-sort when
            inventory changes.
          </p>
          <div className="vsn-hero-actions">
            <button
              className="vsn-button primary"
              type="button"
              onClick={() => runAction("enableAll")}
              disabled={busy}
            >
              {busy && submittedIntent === "enableAll"
                ? "Enabling collections…"
                : "Enable all collections"}
            </button>
            <button
              className="vsn-button"
              type="button"
              onClick={() => runAction("disableAll")}
              disabled={busy || enabledCount === 0}
            >
              {busy && submittedIntent === "disableAll"
                ? "Disabling collections…"
                : "Disable all collections"}
            </button>
            <Link className="vsn-button" to="/app/automation">
              Configure automation ↗
            </Link>
          </div>
        </div>

        <div className="vsn-hero-status">
          <strong>{currentPlan?.name ?? "Choose a plan"}</strong>
          <span>
            {currentPlan
              ? "Shopify subscription verified"
              : "A subscription is required to enable sorting"}
          </span>
          <div className="vsn-hero-metrics">
            <div className="vsn-hero-metric">
              <span>Collections</span>
              <strong>{collections.length}</strong>
            </div>
            <div className="vsn-hero-metric">
              <span>Enabled</span>
              <strong>{enabledCount}</strong>
            </div>
            <div className="vsn-hero-metric">
              <span>Attention</span>
              <strong>{attentionCount}</strong>
            </div>
          </div>
        </div>
      </div>

      <div className="vsn-task-grid">
        <div className="vsn-task-card">
          <span className="vsn-task-number">01</span>
          <h3>Choose collections</h3>
          <p>Enable automatic stock sorting only where it fits your storefront.</p>
        </div>
        <div className="vsn-task-card">
          <span className="vsn-task-number">02</span>
          <h3>Fine-tune the rules</h3>
          <p>Pin, exclude and choose how available products should be ordered.</p>
        </div>
        <div className="vsn-task-card">
          <span className="vsn-task-number">03</span>
          <h3>Let inventory drive updates</h3>
          <p>Use webhooks and schedules to keep collection order current.</p>
        </div>
      </div>

      <nav className="vsn-filter-links" aria-label="Collection workspace sections">
        <a href="#collections-table">Collections</a>
        <a href="#collection-rules">Rules</a>
        <Link to="/app/automation">Automation</Link>
        <Link to="/app/analytics">Activity</Link>
      </nav>

      <s-section heading="Collections">
        <s-stack gap="base">
          <s-text>
            Keep available products first, pin priority products, exclude
            products from automation, and choose how in-stock products are
            ordered in each Shopify collection.
          </s-text>

          <div className="vsn-summary-badges">
            <span className="vsn-summary-badge blue">
              {collections.length} collections
            </span>
            <span className="vsn-summary-badge teal">
              {enabledCount} enabled
            </span>
            {currentPlan ? (
              <span className="vsn-summary-badge purple">
                {currentPlan.name} plan
              </span>
            ) : null}
            {attentionCount > 0 ? (
              <span className="vsn-summary-badge attention">
                {attentionCount} need attention
              </span>
            ) : (
              <span className="vsn-summary-badge neutral">0 errors</span>
            )}
          </div>
        </s-stack>
      </s-section>

      {actionData?.message ? (
        <div
          className={[
            "vsn-action-banner",
            actionData.ok ? "success" : "error",
          ].join(" ")}
          role={actionData.ok ? "status" : "alert"}
        >
          <strong>{actionData.ok ? "Update complete" : "Action failed"}</strong>
          <span>{actionData.message}</span>
        </div>
      ) : null}

      <div id="collections-table" />
      <section className="vsn-collection-table-card" aria-busy={busy}>
        <div className="vsn-collection-filters">
          <label className="vsn-filter-field">
            <span>Search collections</span>
            <input
              type="search"
              placeholder="Search collections"
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
            />
          </label>

          <label className="vsn-filter-field">
            <span>Status</span>
            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.currentTarget.value as StatusFilter)
              }
            >
              <option value="all">All statuses</option>
              <option value="enabled">Enabled</option>
              <option value="disabled">Disabled</option>
              <option value="attention">Needs attention</option>
            </select>
          </label>
        </div>

        <div className="vsn-table-scroll">
          <table className="vsn-collections-table">
            <thead>
              <tr>
                <th scope="col">Collection</th>
                <th scope="col">Auto-sort</th>
                <th scope="col">Products</th>
                <th scope="col">Shopify sort</th>
                <th scope="col">Last sorted</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredCollections.map((collection) => {
                const enabled = Boolean(collection.setting?.enabled);
                const error = collection.setting?.lastError;
                const rowBusy =
                  busy && submittedCollectionId === collection.id;

                return (
                  <tr key={collection.id}>
                    <td>
                      <div className="vsn-collection-name">
                        <strong>{collection.title}</strong>
                        <span>/{collection.handle}</span>
                        {error ? (
                          <small className="vsn-row-error">{error}</small>
                        ) : null}
                      </div>
                    </td>
                    <td>
                      <span
                        className={[
                          "vsn-status-badge",
                          error
                            ? "attention"
                            : enabled
                              ? "enabled"
                              : "disabled",
                        ].join(" ")}
                      >
                        {error ? "Attention" : enabled ? "Enabled" : "Disabled"}
                      </span>
                    </td>
                    <td>{collection.productsCount.count}</td>
                    <td>
                      <span className="vsn-sort-code">{collection.sortOrder}</span>
                    </td>
                    <td>{formatDate(collection.setting?.lastSortedAt)}</td>
                    <td>
                      <div className="vsn-row-actions">
                        {enabled ? (
                          <button
                            className="vsn-row-action toggle"
                            type="button"
                            onClick={() =>
                              runAction("disable", collection.id, false)
                            }
                            disabled={busy}
                          >
                            {rowBusy && submittedIntent === "disable"
                              ? "Disabling…"
                              : "Disable"}
                          </button>
                        ) : (
                          <button
                            className="vsn-row-action primary"
                            type="button"
                            onClick={() => runAction("enable", collection.id)}
                            disabled={busy}
                          >
                            {rowBusy && submittedIntent === "enable"
                              ? "Enabling…"
                              : "Enable"}
                          </button>
                        )}

                        {enabled ? (
                          <button
                            className="vsn-row-action"
                            type="button"
                            onClick={() => runAction("sort", collection.id)}
                            disabled={busy}
                          >
                            {rowBusy && submittedIntent === "sort"
                              ? "Sorting…"
                              : "Sort now"}
                          </button>
                        ) : null}

                        {enabled && collection.setting?.previousSortOrder ? (
                          <button
                            className="vsn-row-action ghost"
                            type="button"
                            onClick={() =>
                              runAction("disable", collection.id, true)
                            }
                            disabled={busy}
                          >
                            Disable & restore
                          </button>
                        ) : null}

                        <button
                          className="vsn-row-action"
                          type="button"
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
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {filteredCollections.length === 0 ? (
          <div className="vsn-empty-table">
            <strong>No collections found</strong>
            <span>Try a different search term or status filter.</span>
          </div>
        ) : null}
      </section>

      {editingCollection ? (
        <s-section heading={`Rules — ${editingCollection.title}`}>
          <form
            key={`${editingCollection.id}:${String(
              editingCollection.setting?.updatedAt ?? "new",
            )}`}
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
                <s-text-area
                  label="Excluded tags"
                  name="excludedTags"
                  defaultValue={editingCollection.setting?.excludedTags ?? ""}
                  disabled={!canUseExclusions}
                  placeholder="clearance, preorder"
                  details="One value per line or comma separated. Starter and above."
                />

                <s-text-area
                  label="Excluded vendors"
                  name="excludedVendors"
                  defaultValue={
                    editingCollection.setting?.excludedVendors ?? ""
                  }
                  disabled={!canUseExclusions}
                  placeholder="Vendor A, Vendor B"
                  details="Matching is case-insensitive."
                />

                <s-text-area
                  label="Excluded products"
                  name="excludedProducts"
                  defaultValue={
                    editingCollection.setting?.excludedProducts ?? ""
                  }
                  disabled={!canUseExclusions}
                  placeholder="product-handle or gid://shopify/Product/..."
                  details="Use product handles or Shopify product GIDs."
                />

                <s-text-area
                  label="Pinned products"
                  name="pinnedProducts"
                  defaultValue={
                    editingCollection.setting?.pinnedProducts ?? ""
                  }
                  disabled={!canUsePinnedProducts}
                  placeholder={"first-product\nsecond-product"}
                  details="Order in this list is pin priority. Growth and above."
                />
              </s-grid>

              <s-select
                label="In-stock product order"
                name="availableSortMode"
                disabled={!canUseAdvancedSort}
                details="Advanced sorting is available on Growth and above."
              >
                {AVAILABLE_SORT_MODES.map((mode) => (
                  <s-option
                    key={mode}
                    value={mode}
                    defaultSelected={
                      (editingCollection.setting?.availableSortMode ??
                        "PRESERVE") === mode
                    }
                  >
                    {SORT_MODE_LABELS[mode]}
                  </s-option>
                ))}
              </s-select>

              <s-select
                label="Inventory rule"
                name="inventoryMode"
                disabled={!canUseMultiLocation}
                details="Selected-location rules are available on Pro and Unlimited. Aggregate inventory remains the default for every plan."
              >
                {INVENTORY_MODES.map((mode) => (
                  <s-option
                    key={mode}
                    value={mode}
                    defaultSelected={
                      (editingCollection.setting?.inventoryMode ??
                        "ALL_LOCATIONS") === mode
                    }
                  >
                    {INVENTORY_MODE_LABELS[mode]}
                  </s-option>
                ))}
              </s-select>

              {canUseMultiLocation ? (
                <s-box
                  border="base base solid"
                  borderRadius="large"
                  padding="base"
                >
                  <s-stack gap="small-300">
                    <s-text type="strong">Inventory locations</s-text>
                    {locations.length ? (
                      <s-grid
                        gridTemplateColumns="repeat(auto-fit, minmax(220px, 1fr))"
                        gap="small"
                      >
                        {locations.map((location) => (
                          <s-checkbox
                            key={location.id}
                            name="inventoryLocationIds"
                            value={location.id}
                            label={location.name}
                            defaultChecked={selectedLocationIds.has(location.id)}
                          />
                        ))}
                      </s-grid>
                    ) : (
                      <s-text>No active Shopify locations were returned.</s-text>
                    )}
                  </s-stack>
                </s-box>
              ) : null}

              <s-stack direction="inline" gap="base">
                <BrandButton
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
                </BrandButton>
                <s-text>
                  Saved rules are re-applied automatically when an enabled
                  collection receives inventory/product webhooks.
                </s-text>
              </s-stack>
            </s-stack>
          </form>
        </s-section>
      ) : null}

      <s-section heading="How sorting works">
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
    </div>
  );
}
