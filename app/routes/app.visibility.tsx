import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import {
  useActionData,
  useLoaderData,
  useNavigation,
} from "react-router";
import { authenticate } from "../shopify.server";
import { getCurrentSubscriptionPlan } from "../services/billing.server";
import {
  PHASE3_OPTION_IDS,
  getVisibilitySetting,
  parseProductVisibilityMode,
  saveVisibilitySetting,
} from "../services/product-visibility.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);
  const [current, setting] = await Promise.all([
    getCurrentSubscriptionPlan(admin),
    getVisibilitySetting(session.shop),
  ]);

  return {
    currentPlan: current
      ? { id: current.plan.id, name: current.plan.name }
      : null,
    optionIds: current?.plan.option_ids ?? [],
    setting: {
      productMode: parseProductVisibilityMode(setting.productMode),
      autoRepublish: setting.autoRepublish,
    },
  };
}

export async function action({ request }: ActionFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);
  const current = await getCurrentSubscriptionPlan(admin);

  if (!current) {
    return {
      ok: false,
      message: "An active subscription is required to manage visibility automation.",
    };
  }

  const formData = await request.formData();
  const productMode = parseProductVisibilityMode(
    String(formData.get("productMode") || "OFF"),
  );
  const autoRepublish = formData.get("autoRepublish") === "on";

  try {
    const setting = await saveVisibilitySetting(
      session.shop,
      { productMode, autoRepublish },
      current.plan.option_ids,
    );

    return {
      ok: true,
      message: "Product visibility automation settings saved.",
      setting: {
        productMode: setting.productMode,
        autoRepublish: setting.autoRepublish,
      },
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Unable to save settings.",
    };
  }
}

export default function VisibilityPage() {
  const { currentPlan, optionIds, setting } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const busy = navigation.state !== "idle";

  const canAutoHide = optionIds.includes(PHASE3_OPTION_IDS.autoHideProducts);
  const canSeoSafe = optionIds.includes(PHASE3_OPTION_IDS.seoSafeHide);
  const canAutoRepublish = optionIds.includes(PHASE3_OPTION_IDS.autoRepublish);

  return (
    <s-page heading="Product visibility">
      <s-section>
        <s-stack gap="base">
          <s-text>
            Automatically hide tracked sold-out products and restore only products
            that VSN changed itself. Merchant-owned Draft or Archived states are
            never overwritten.
          </s-text>

          {currentPlan ? (
            <s-badge tone="info">{currentPlan.name} plan</s-badge>
          ) : null}

          {actionData ? (
            <s-banner tone={actionData.ok ? "success" : "critical"}>
              {actionData.message}
            </s-banner>
          ) : null}

          <form method="post">
            <s-stack gap="large-200">
              <label>
                <strong>Sold-out product behavior</strong>
                <select
                  name="productMode"
                  defaultValue={setting.productMode}
                  disabled={busy}
                  style={{
                    display: "block",
                    width: "100%",
                    marginTop: 8,
                    padding: "10px 12px",
                  }}
                >
                  <option value="OFF">Off</option>
                  <option value="DRAFT" disabled={!canAutoHide}>
                    Unpublish as Draft
                  </option>
                  <option value="UNLISTED" disabled={!canSeoSafe}>
                    SEO-safe soft hide (Unlisted)
                  </option>
                </select>
              </label>

              <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  type="checkbox"
                  name="autoRepublish"
                  defaultChecked={setting.autoRepublish}
                  disabled={busy || !canAutoRepublish}
                />
                Automatically restore products when inventory returns
              </label>

              <s-text color="subdued">
                SEO-safe mode uses Shopify Unlisted product status, keeping the
                direct product URL available while removing the product from
                Shopify-powered collections, search, recommendations and sitemap
                discovery.
              </s-text>

              {!canAutoHide ? (
                <s-banner tone="warning">
                  Your current plan does not include automatic product hiding.
                </s-banner>
              ) : null}

              <s-button type="submit" variant="primary" loading={busy}>
                Save visibility settings
              </s-button>
            </s-stack>
          </form>
        </s-stack>
      </s-section>

      <s-section heading="Variant visibility">
        <s-stack gap="small-200">
          <s-badge tone="warning">PHASE-03 WU-03 pending certification</s-badge>
          <s-text>
            Sold-out variant hiding is intentionally not marked implemented yet.
            It requires a real storefront mechanism in addition to Admin API
            state, so this control remains unavailable until that mechanism is
            certified.
          </s-text>
        </s-stack>
      </s-section>
    </s-page>
  );
}
