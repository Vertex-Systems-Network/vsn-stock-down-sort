import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import {
  useActionData,
  useLoaderData,
  useNavigation,
} from "react-router";
import { authenticate } from "../shopify.server";
import { getCurrentSubscriptionPlan } from "../services/billing.server";
import {
  PHASE7_OPTION_IDS,
  type ContextTargetType,
} from "../services/context-visibility";
import {
  deleteContextVisibilityRule,
  listContextVisibilityRules,
  listPublicationTargets,
  saveContextVisibilityRule,
  setContextVisibilityRuleEnabled,
} from "../services/context-visibility.server";
import { PageShell } from "../components/BrandUi";

async function safeTargets(
  admin: Parameters<typeof listPublicationTargets>[0],
  targetType: ContextTargetType,
  enabled: boolean,
) {
  if (!enabled) {
    return { items: [], error: null as string | null };
  }

  try {
    return {
      items: await listPublicationTargets(admin, targetType),
      error: null as string | null,
    };
  } catch (error) {
    return {
      items: [],
      error:
        error instanceof Error
          ? error.message
          : "Unable to read Shopify publications for this context.",
    };
  }
}

export async function loader({ request }: LoaderFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);
  const current = await getCurrentSubscriptionPlan(admin);
  const optionIds = current?.plan.option_ids ?? [];

  const canMarkets = optionIds.includes(PHASE7_OPTION_IDS.markets);
  const canB2b = optionIds.includes(PHASE7_OPTION_IDS.b2bCatalogs);
  const canSalesChannels = optionIds.includes(
    PHASE7_OPTION_IDS.salesChannelRules,
  );

  const [rules, markets, b2b, salesChannels] = await Promise.all([
    listContextVisibilityRules(session.shop),
    safeTargets(admin, "MARKET", canMarkets),
    safeTargets(admin, "COMPANY_LOCATION", canB2b),
    safeTargets(admin, "SALES_CHANNEL", canSalesChannels),
  ]);

  return {
    currentPlan: current
      ? { id: current.plan.id, name: current.plan.name }
      : null,
    canMarkets,
    canB2b,
    canSalesChannels,
    rules,
    targets: {
      MARKET: markets,
      COMPANY_LOCATION: b2b,
      SALES_CHANNEL: salesChannels,
    },
  };
}

export async function action({ request }: ActionFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);
  const current = await getCurrentSubscriptionPlan(admin);

  if (!current) {
    return {
      ok: false,
      message:
        "An active VSN Stock Down Sort subscription is required to manage commerce contexts.",
    };
  }

  const formData = await request.formData();
  const intent = String(formData.get("intent") || "");
  const ruleId = String(formData.get("ruleId") || "").trim();

  try {
    if (intent === "save") {
      const rule = await saveContextVisibilityRule(
        admin,
        session.shop,
        ruleId || null,
        {
          targetType: String(formData.get("targetType") || ""),
          publicationId: String(formData.get("publicationId") || ""),
          targetTitle: "",
          enabled: formData.get("enabled") === "on",
          autoRestore: formData.get("autoRestore") === "on",
        },
        current.plan.option_ids,
      );

      return {
        ok: true,
        message: ruleId
          ? "Commerce context rule updated."
          : "Commerce context rule created.",
        ruleId: rule.id,
      };
    }

    if (intent === "toggle" && ruleId) {
      const enabled = formData.get("enabled") === "true";
      await setContextVisibilityRuleEnabled(
        session.shop,
        ruleId,
        enabled,
        current.plan.option_ids,
      );

      return {
        ok: true,
        message: enabled
          ? "Commerce context rule enabled."
          : "Commerce context rule paused.",
        ruleId,
      };
    }

    if (intent === "delete" && ruleId) {
      await deleteContextVisibilityRule(session.shop, ruleId);
      return {
        ok: true,
        message: "Commerce context rule deleted.",
        ruleId,
      };
    }

    return {
      ok: false,
      message: "Unknown commerce context action.",
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "Commerce context action failed.",
      ruleId: ruleId || null,
    };
  }
}

function targetTypeLabel(targetType: string) {
  if (targetType === "MARKET") return "Shopify Market";
  if (targetType === "COMPANY_LOCATION") return "B2B catalog";
  return "Sales channel";
}

export default function CommerceContextsPage() {
  const {
    currentPlan,
    canMarkets,
    canB2b,
    canSalesChannels,
    rules,
    targets,
  } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const busy = navigation.state !== "idle";
  const submittedRuleId = String(
    navigation.formData?.get("ruleId") || "",
  );

  const targetGroups = [
    {
      type: "MARKET" as const,
      label: "Shopify Markets",
      entitled: canMarkets,
      data: targets.MARKET,
    },
    {
      type: "COMPANY_LOCATION" as const,
      label: "B2B catalogs",
      entitled: canB2b,
      data: targets.COMPANY_LOCATION,
    },
    {
      type: "SALES_CHANNEL" as const,
      label: "Sales channels",
      entitled: canSalesChannels,
      data: targets.SALES_CHANNEL,
    },
  ];

  return (
    <PageShell heading="Commerce contexts">
      <s-section heading="Overview">
        <s-stack gap="base">
          <s-text>
            Automatically remove sold-out products from selected Shopify
            publications and restore only VSN-managed removals after restock.
          </s-text>

          <s-stack direction="inline" gap="base">
            {currentPlan ? (
              <s-badge tone="info">{currentPlan.name} plan</s-badge>
            ) : null}
            <s-badge
              tone={
                canMarkets && canB2b && canSalesChannels
                  ? "success"
                  : "warning"
              }
            >
              {canMarkets && canB2b && canSalesChannels
                ? "Unlimited context rules available"
                : "Unlimited plan required"}
            </s-badge>
          </s-stack>

          <s-banner tone="info">
            This feature needs Shopify read_publications and
            write_publications access. Existing installs may require scope
            reauthorization, and the merchant user must have permission to
            manage the relevant catalogs/publications.
          </s-banner>

          <s-text color="subdued">
            VSN does not create Markets, B2B catalogs, or sales channels here.
            It only manages product membership in publications that already
            exist in Shopify.
          </s-text>
        </s-stack>
      </s-section>

      {actionData?.message ? (
        <s-banner
          tone={actionData.ok ? "success" : "critical"}
          heading={actionData.ok ? "Context rule updated" : "Context rule failed"}
          dismissible
        >
          {actionData.message}
        </s-banner>
      ) : null}

      {targetGroups.map((group) => (
        <s-section key={group.type} heading={group.label}>
          {!group.entitled ? (
            <s-text color="subdued">
              This capability is not included in the current plan.
            </s-text>
          ) : group.data.error ? (
            <s-banner tone="warning">
              Shopify publication discovery is not currently available for this
              context: {group.data.error}
            </s-banner>
          ) : group.data.items.length === 0 ? (
            <s-text color="subdued">
              No existing Shopify publications were found for this context.
            </s-text>
          ) : (
            <form method="post">
              <input type="hidden" name="intent" value="save" />
              <input type="hidden" name="targetType" value={group.type} />

              <s-stack gap="base">
                <s-select
                  label="Existing Shopify publication"
                  name="publicationId"
                  required
                  placeholder="Select a publication"
                >
                  {group.data.items.map((target) => (
                    <s-option
                      key={target.publicationId}
                      value={target.publicationId}
                    >
                      {target.title}
                    </s-option>
                  ))}
                </s-select>

                <s-checkbox
                  name="enabled"
                  label="Enable sold-out visibility automation"
                  defaultChecked
                />

                <s-checkbox
                  name="autoRestore"
                  label="Restore VSN-managed removals after restock"
                  defaultChecked
                />

                <s-button type="submit" variant="primary" disabled={busy}>
                  Add {group.label} rule
                </s-button>
              </s-stack>
            </form>
          )}
        </s-section>
      ))}

      <s-section heading="Managed context rules">
        {rules.length === 0 ? (
          <s-text color="subdued">
            No commerce context visibility rules have been created yet.
          </s-text>
        ) : (
          <s-stack gap="large-200">
            {rules.map((rule) => {
              const rowBusy =
                busy && submittedRuleId === rule.id;
              return (
                <s-box
                  key={rule.id}
                  border="base base solid"
                  borderRadius="large"
                  padding="base"
                >
                  <s-stack gap="base">
                    <s-stack direction="inline" gap="base">
                      <s-heading>{rule.targetTitle}</s-heading>
                      <s-badge>
                        {targetTypeLabel(rule.targetType)}
                      </s-badge>
                      <s-badge tone={rule.enabled ? "success" : "warning"}>
                        {rule.enabled ? "Enabled" : "Paused"}
                      </s-badge>
                    </s-stack>

                    <s-text color="subdued">
                      Publication: {rule.publicationId}
                    </s-text>
                    <s-text>
                      Restock behavior:{" "}
                      {rule.autoRestore
                        ? "Restore VSN-managed removals"
                        : "Keep removed until merchant action"}
                    </s-text>

                    <s-button-group>
                      <form method="post">
                        <input type="hidden" name="intent" value="toggle" />
                        <input type="hidden" name="ruleId" value={rule.id} />
                        <input
                          type="hidden"
                          name="enabled"
                          value={rule.enabled ? "false" : "true"}
                        />
                        <s-button
                          type="submit"
                          variant="secondary"
                          disabled={busy}
                          loading={rowBusy}
                        >
                          {rule.enabled ? "Pause" : "Enable"}
                        </s-button>
                      </form>

                      <form method="post">
                        <input type="hidden" name="intent" value="delete" />
                        <input type="hidden" name="ruleId" value={rule.id} />
                        <s-button
                          type="submit"
                          variant="tertiary"
                          tone="critical"
                          disabled={busy}
                          loading={rowBusy}
                        >
                          Delete
                        </s-button>
                      </form>
                    </s-button-group>

                    <s-text color="subdued">
                      Pause/delete is blocked while this rule still owns hidden
                      product states, preventing stranded publication changes.
                    </s-text>
                  </s-stack>
                </s-box>
              );
            })}
          </s-stack>
        )}
      </s-section>
    </PageShell>
  );
}
