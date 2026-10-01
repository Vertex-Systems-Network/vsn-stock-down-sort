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
import { getCurrentSubscription } from "../services/billing.server";
import {
  disableCollection,
  enableCollection,
  listAllCollections,
  sortCollection,
} from "../services/collection-sorter.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);
  const collections = await listAllCollections(admin);

  const settings = await withPrismaClient((db) =>
    db.collectionSetting.findMany({
      where: { shop: session.shop },
    }),
  );

  const settingsMap = Object.fromEntries(
    settings.map((setting) => [setting.collectionId, setting]),
  );

  return {
    collections: collections.map((collection) => ({
      ...collection,
      setting: settingsMap[collection.id] ?? null,
    })),
  };
}

export async function action({ request, context }: ActionFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);
  const subscription = await getCurrentSubscription(admin);

  if (!subscription) {
    return {
      ok: false,
      message: "An active VSN Stock Down Sort subscription is required to manage collection sorting.",
    };
  }

  const formData = await request.formData();
  const intent = String(formData.get("intent") || "");
  const collectionId = String(formData.get("collectionId") || "");

  try {
    if (intent === "enable" && collectionId) {
      const result = await enableCollection(admin, session.shop, collectionId);
      return {
        ok: true,
        message: "Collection enabled. Sold-out products are being moved to the end.",
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
      const result = await sortCollection(admin, session.shop, collectionId);
      return {
        ok: true,
        message: result.alreadySorted
          ? "This collection is already correctly sorted."
          : "Collection sorting started.",
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
            await enableCollection(admin, session.shop, collection.id),
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

export default function AppIndex() {
  const { collections } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const submit = useSubmit();

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const busy = navigation.state !== "idle";
  const submittedIntent = navigation.formData?.get("intent");
  const submittedCollectionId = navigation.formData?.get("collectionId");

  const enabledCount = collections.filter(
    (collection) => collection.setting?.enabled,
  ).length;

  const attentionCount = collections.filter(
    (collection) => Boolean(collection.setting?.lastError),
  ).length;

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
            Keep available products first and automatically push sold-out
            products to the end of selected Shopify collections.
          </s-text>

          <s-stack direction="inline" gap="base">
            <s-badge tone="info">{collections.length} collections</s-badge>
            <s-badge tone="success">{enabledCount} enabled</s-badge>
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
                    {enabled ? (
                      <s-button-group>
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
                      </s-button-group>
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

      <s-section heading="How it works">
        <s-stack gap="base">
          <s-text>
            Enabling a collection stores its previous Shopify sort order,
            changes the collection to Manual, preserves the relative order of
            available products, and moves sold-out products to the end.
          </s-text>
          <s-text>
            Inventory and product webhooks keep enabled collections updated
            after the initial sort.
          </s-text>
        </s-stack>
      </s-section>
    </s-page>
  );
}
