import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import {
  useActionData,
  useLoaderData,
  useNavigation,
} from "react-router";
import { authenticate } from "../shopify.server";
import { getCurrentSubscriptionPlan } from "../services/billing.server";
import {
  ENTERPRISE_OPTIONAL_SCOPES,
  PHASE7_OPTION_IDS,
  targetValue,
  type CommerceTargetType,
} from "../services/commerce-visibility";
import {
  getCommerceVisibilitySetting,
  listCommercePublicationTargets,
  saveCommerceVisibilitySetting,
} from "../services/commerce-visibility.server";

const SCOPE_GROUPS = Object.freeze({
  channels: [ENTERPRISE_OPTIONAL_SCOPES.publications],
  markets: [
    ENTERPRISE_OPTIONAL_SCOPES.publications,
    ENTERPRISE_OPTIONAL_SCOPES.markets,
  ],
  b2b: [
    ENTERPRISE_OPTIONAL_SCOPES.publications,
    ENTERPRISE_OPTIONAL_SCOPES.companies,
  ],
} as const);

function entitlementForScopeGroup(group: keyof typeof SCOPE_GROUPS) {
  return group === "markets"
    ? PHASE7_OPTION_IDS.markets
    : group === "b2b"
      ? PHASE7_OPTION_IDS.b2bCatalogs
      : PHASE7_OPTION_IDS.salesChannelRules;
}

export async function loader({ request }: LoaderFunctionArgs) {
  const { admin, session, scopes } = await authenticate.admin(request);

  const [current, setting, scopeDetail] = await Promise.all([
    getCurrentSubscriptionPlan(admin),
    getCommerceVisibilitySetting(session.shop),
    scopes.query(),
  ]);

  const optionIds = current?.plan.option_ids ?? [];
  const discovery = scopeDetail.granted.includes(
    ENTERPRISE_OPTIONAL_SCOPES.publications,
  )
    ? await listCommercePublicationTargets(admin, scopeDetail.granted)
    : {
        targets: [],
        warnings: [],
        missingBaseScope: true,
      };

  return {
    currentPlan: current
      ? { id: current.plan.id, name: current.plan.name }
      : null,
    optionIds,
    grantedScopes: scopeDetail.granted,
    optionalScopes: scopeDetail.optional,
    setting,
    targets: discovery.targets,
    warnings: discovery.warnings,
  };
}

export async function action({ request }: ActionFunctionArgs) {
  const { admin, session, scopes } = await authenticate.admin(request);
  const current = await getCurrentSubscriptionPlan(admin);

  if (!current) {
    return {
      ok: false,
      message:
        "An active VSN Stock Down Sort subscription is required to manage enterprise visibility.",
    };
  }

  const formData = await request.formData();
  const intent = String(formData.get("intent") || "");

  try {
    if (intent === "requestScopes") {
      const group = String(
        formData.get("scopeGroup") || "",
      ) as keyof typeof SCOPE_GROUPS;
      const requested = SCOPE_GROUPS[group];

      if (!requested) {
        return { ok: false, message: "Unknown permission group." };
      }

      const requiredOption = entitlementForScopeGroup(group);
      if (!current.plan.option_ids.includes(requiredOption)) {
        return {
          ok: false,
          message:
            "Your current plan does not include this enterprise visibility capability.",
        };
      }

      await scopes.request([...requested]);

      return {
        ok: true,
        message:
          "The requested Shopify permissions are already granted.",
      };
    }

    if (intent === "save") {
      const scopeDetail = await scopes.query();
      const discovery = await listCommercePublicationTargets(
        admin,
        scopeDetail.granted,
      );

      const setting = await saveCommerceVisibilitySetting(
        session.shop,
        {
          enabled: formData.get("enabled") === "on",
          autoRepublish: formData.get("autoRepublish") === "on",
          targetValues: formData.getAll("targets"),
        },
        current.plan.option_ids,
        scopeDetail.granted,
        discovery.targets,
      );

      return {
        ok: true,
        message: "Enterprise publication visibility settings saved.",
        setting,
      };
    }

    return { ok: false, message: "Unknown enterprise visibility action." };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "Unable to update enterprise visibility.",
    };
  }
}

function typeLabel(type: CommerceTargetType) {
  if (type === "MARKET") return "Shopify Markets";
  if (type === "B2B") return "B2B catalogs";
  return "Sales channels";
}

function permissionStatus(
  grantedScopes: readonly string[],
  requiredScopes: readonly string[],
) {
  return requiredScopes.every((scope) => grantedScopes.includes(scope));
}

export default function CommerceVisibilityPage() {
  const {
    currentPlan,
    optionIds,
    grantedScopes,
    optionalScopes,
    setting,
    targets,
    warnings,
  } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const busy = navigation.state !== "idle";

  const canMarkets = optionIds.includes(PHASE7_OPTION_IDS.markets);
  const canB2B = optionIds.includes(PHASE7_OPTION_IDS.b2bCatalogs);
  const canChannels = optionIds.includes(
    PHASE7_OPTION_IDS.salesChannelRules,
  );
  const canUseEnterpriseRules = canMarkets || canB2B || canChannels;

  const selected = new Set(
    setting.targets.map((target) => targetValue(target)),
  );

  const grouped = {
    CHANNEL: targets.filter((target) => target.type === "CHANNEL"),
    MARKET: targets.filter((target) => target.type === "MARKET"),
    B2B: targets.filter((target) => target.type === "B2B"),
  } satisfies Record<CommerceTargetType, typeof targets>;

  const channelScopes = SCOPE_GROUPS.channels;
  const marketScopes = SCOPE_GROUPS.markets;
  const b2bScopes = SCOPE_GROUPS.b2b;

  return (
    <s-page heading="Enterprise visibility" inlineSize="large">
      <s-section>
        <s-stack gap="base">
          <s-text>
            Control sold-out product publication in selected Shopify Markets,
            B2B catalog publications, and sales-channel publications. Only
            publication states changed by VSN are eligible for automatic
            restoration.
          </s-text>

          <s-stack direction="inline" gap="base">
            {currentPlan ? (
              <s-badge tone="info">{currentPlan.name} plan</s-badge>
            ) : null}
            <s-badge tone={canUseEnterpriseRules ? "success" : "warning"}>
              {canUseEnterpriseRules
                ? "Enterprise rules available"
                : "Unlimited plan required"}
            </s-badge>
          </s-stack>

          <s-text color="subdued">
            These permissions are optional and requested only when you enable
            the related capability. Repository configuration does not claim
            that a Shopify app version has been deployed or that any merchant
            has granted the optional scopes.
          </s-text>
        </s-stack>
      </s-section>

      {actionData?.message ? (
        <s-banner
          tone={actionData.ok ? "success" : "critical"}
          heading={actionData.ok ? "Enterprise visibility updated" : "Action failed"}
          dismissible
        >
          {actionData.message}
        </s-banner>
      ) : null}

      <s-section heading="Shopify permissions">
        <s-stack gap="base">
          <s-box border="base base solid" borderRadius="large" padding="base">
            <s-stack gap="small-200">
              <s-stack direction="inline" gap="base">
                <s-heading>Sales-channel publications</s-heading>
                <s-badge
                  tone={
                    permissionStatus(grantedScopes, channelScopes)
                      ? "success"
                      : "warning"
                  }
                >
                  {permissionStatus(grantedScopes, channelScopes)
                    ? "Granted"
                    : "Permission required"}
                </s-badge>
              </s-stack>
              <s-text>
                Requires Shopify's optional write_publications scope.
              </s-text>
              <form method="post">
                <input type="hidden" name="intent" value="requestScopes" />
                <input type="hidden" name="scopeGroup" value="channels" />
                <s-button
                  type="submit"
                  variant="secondary"
                  disabled={
                    busy ||
                    !canChannels ||
                    permissionStatus(grantedScopes, channelScopes)
                  }
                >
                  Grant sales-channel permission
                </s-button>
              </form>
            </s-stack>
          </s-box>

          <s-box border="base base solid" borderRadius="large" padding="base">
            <s-stack gap="small-200">
              <s-stack direction="inline" gap="base">
                <s-heading>Shopify Markets</s-heading>
                <s-badge
                  tone={
                    permissionStatus(grantedScopes, marketScopes)
                      ? "success"
                      : "warning"
                  }
                >
                  {permissionStatus(grantedScopes, marketScopes)
                    ? "Granted"
                    : "Permission required"}
                </s-badge>
              </s-stack>
              <s-text>
                Requires optional write_publications and read_markets scopes.
              </s-text>
              <form method="post">
                <input type="hidden" name="intent" value="requestScopes" />
                <input type="hidden" name="scopeGroup" value="markets" />
                <s-button
                  type="submit"
                  variant="secondary"
                  disabled={
                    busy ||
                    !canMarkets ||
                    permissionStatus(grantedScopes, marketScopes)
                  }
                >
                  Grant Markets permissions
                </s-button>
              </form>
            </s-stack>
          </s-box>

          <s-box border="base base solid" borderRadius="large" padding="base">
            <s-stack gap="small-200">
              <s-stack direction="inline" gap="base">
                <s-heading>B2B catalogs</s-heading>
                <s-badge
                  tone={
                    permissionStatus(grantedScopes, b2bScopes)
                      ? "success"
                      : "warning"
                  }
                >
                  {permissionStatus(grantedScopes, b2bScopes)
                    ? "Granted"
                    : "Permission required"}
                </s-badge>
              </s-stack>
              <s-text>
                Requires optional write_publications and read_companies scopes.
                B2B targets are available only when Shopify returns company
                location catalogs for this store.
              </s-text>
              <form method="post">
                <input type="hidden" name="intent" value="requestScopes" />
                <input type="hidden" name="scopeGroup" value="b2b" />
                <s-button
                  type="submit"
                  variant="secondary"
                  disabled={
                    busy ||
                    !canB2B ||
                    permissionStatus(grantedScopes, b2bScopes)
                  }
                >
                  Grant B2B permissions
                </s-button>
              </form>
            </s-stack>
          </s-box>

          <s-text color="subdued">
            Declared optional scopes visible to this installation:{" "}
            {optionalScopes.length ? optionalScopes.join(", ") : "none"}.
          </s-text>
        </s-stack>
      </s-section>

      {warnings.length ? (
        <s-section heading="Discovery warnings">
          <s-stack gap="small-200">
            {warnings.map((warning) => (
              <s-banner key={warning} tone="warning">
                {warning}
              </s-banner>
            ))}
          </s-stack>
        </s-section>
      ) : null}

      <s-section heading="Publication rules">
        {!canUseEnterpriseRules ? (
          <s-banner tone="warning">
            Enterprise publication rules require the Unlimited plan.
          </s-banner>
        ) : (
          <form method="post">
            <input type="hidden" name="intent" value="save" />
            <s-stack gap="large-200">
              <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  type="checkbox"
                  name="enabled"
                  defaultChecked={setting.enabled}
                  disabled={busy}
                />
                Enable enterprise sold-out publication rules
              </label>

              <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  type="checkbox"
                  name="autoRepublish"
                  defaultChecked={setting.autoRepublish}
                  disabled={busy}
                />
                Restore VSN-managed publications when inventory returns
              </label>

              {(["CHANNEL", "MARKET", "B2B"] as CommerceTargetType[]).map(
                (type) => {
                  const entries = grouped[type];
                  const typeAllowed =
                    type === "CHANNEL"
                      ? canChannels
                      : type === "MARKET"
                        ? canMarkets
                        : canB2B;

                  return (
                    <s-box
                      key={type}
                      border="base base solid"
                      borderRadius="large"
                      padding="base"
                    >
                      <s-stack gap="small-300">
                        <s-heading>{typeLabel(type)}</s-heading>

                        {!typeAllowed ? (
                          <s-text color="subdued">
                            This capability is not included in the current plan.
                          </s-text>
                        ) : entries.length === 0 ? (
                          <s-text color="subdued">
                            No selectable publications are currently available.
                            Grant the related optional permissions and confirm
                            that Shopify has this commerce context configured.
                          </s-text>
                        ) : (
                          entries.map((target) => (
                            <label
                              key={target.publicationId}
                              style={{
                                display: "flex",
                                gap: 8,
                                alignItems: "flex-start",
                              }}
                            >
                              <input
                                type="checkbox"
                                name="targets"
                                value={targetValue(target)}
                                defaultChecked={selected.has(
                                  targetValue(target),
                                )}
                                disabled={busy}
                              />
                              <span>
                                <strong>{target.label}</strong>
                                {target.autoPublish
                                  ? " — auto-publish publication"
                                  : ""}
                              </span>
                            </label>
                          ))
                        )}
                      </s-stack>
                    </s-box>
                  );
                },
              )}

              <s-button
                type="submit"
                variant="primary"
                loading={busy}
                disabled={busy}
              >
                Save enterprise visibility rules
              </s-button>
            </s-stack>
          </form>
        )}
      </s-section>

      <s-section heading="Safety behavior">
        <s-stack gap="base">
          <s-text>
            When a tracked product is sold out, VSN can unpublish it only from
            selected and authorized publication targets. A merchant manual
            republish is treated as an override and is not repeatedly undone
            while the product remains sold out.
          </s-text>
          <s-text>
            When inventory returns, VSN restores only publication states it
            previously changed itself. Core sorting and product visibility
            processing continue even if enterprise publication permissions are
            revoked or Shopify rejects a publication mutation.
          </s-text>
        </s-stack>
      </s-section>
    </s-page>
  );
}
