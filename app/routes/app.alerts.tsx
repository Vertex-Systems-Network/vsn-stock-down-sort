import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import {
  useActionData,
  useLoaderData,
  useNavigation,
} from "react-router";
import { authenticate } from "../shopify.server";
import { getCurrentSubscriptionPlan } from "../services/billing.server";
import {
  ALERT_COOLDOWN_MINUTES,
  PHASE6_OPTION_IDS,
} from "../services/alerts";
import {
  getAlertSetting,
  saveAlertSetting,
} from "../services/alerts.server";
import { BrandBadge, BrandButton, BrandNotice, PageShell } from "../components/BrandUi";

export async function loader({ request }: LoaderFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);
  const current = await getCurrentSubscriptionPlan(admin);
  const setting = await getAlertSetting(session.shop);
  const optionIds = current?.plan.option_ids ?? [];

  return {
    currentPlan: current
      ? { id: current.plan.id, name: current.plan.name }
      : null,
    canEmail: optionIds.includes(PHASE6_OPTION_IDS.lowStockEmail),
    canSlack: optionIds.includes(PHASE6_OPTION_IDS.slackAlerts),
    setting,
  };
}

export async function action({ request }: ActionFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);
  const current = await getCurrentSubscriptionPlan(admin);

  if (!current) {
    return {
      ok: false,
      message:
        "An active VSN Stock Down Sort subscription is required to manage alerts.",
    };
  }

  const formData = await request.formData();

  try {
    const setting = await saveAlertSetting(
      session.shop,
      {
        threshold: String(formData.get("threshold") || "5"),
        cooldownMinutes: String(
          formData.get("cooldownMinutes") || "360",
        ),
        emailEnabled: formData.get("emailEnabled") === "on",
        emailRecipients: String(
          formData.get("emailRecipients") || "",
        ),
        slackEnabled: formData.get("slackEnabled") === "on",
      },
      current.plan.option_ids,
      formData.get("slackWebhookUrl"),
      formData.get("clearSlackWebhook") === "on",
    );

    return {
      ok: true,
      message: "Low-stock alert settings saved.",
      setting,
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error ? error.message : "Unable to save alert settings.",
    };
  }
}

function cooldownLabel(minutes: number) {
  if (minutes === 60) return "1 hour";
  if (minutes === 360) return "6 hours";
  if (minutes === 720) return "12 hours";
  if (minutes === 1440) return "24 hours";
  return `${minutes} minutes`;
}

export default function AlertsPage() {
  const { currentPlan, canEmail, canSlack, setting } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const busy = navigation.state !== "idle";

  const visibleSetting =
    actionData?.ok && actionData.setting
      ? actionData.setting
      : setting;

  return (
    <PageShell heading="Low-stock alerts">
      <s-section heading="Overview">
        <s-stack gap="base">
          <s-text>
            Notify your team when a tracked Shopify product reaches or falls
            below the configured inventory threshold. Repeated alerts are
            deduplicated by channel using the selected cooldown.
          </s-text>

          <s-stack direction="inline" gap="base">
            {currentPlan ? (
              <BrandBadge tone="info">{currentPlan.name} plan</BrandBadge>
            ) : null}
            <BrandBadge tone={canEmail ? "success" : "warning"}>
              {canEmail ? "Email available" : "Email locked"}
            </BrandBadge>
            <BrandBadge tone={canSlack ? "success" : "info"}>
              {canSlack ? "Slack available" : "Slack locked"}
            </BrandBadge>
          </s-stack>

          <s-text color="subdued">
            External delivery runs only in hosted environments. Cloudflare Email
            Service requires an onboarded sending domain and ALERT_FROM_EMAIL.
            Local development evaluates alert state without claiming external
            email or Slack delivery.
          </s-text>
        </s-stack>
      </s-section>

      {actionData?.message ? (
        <BrandNotice
          tone={actionData.ok ? "success" : "critical"}
          heading={actionData.ok ? "Settings saved" : "Unable to save"}
          dismissible
        >
          {actionData.message}
        </BrandNotice>
      ) : null}

      <s-section heading="Alert rules">
        <form method="post">
          <s-stack gap="large-200">
            <s-grid
              gridTemplateColumns="repeat(auto-fit, minmax(220px, 1fr))"
              gap="base"
            >
              <s-number-field
                label="Low-stock threshold"
                name="threshold"
                min={0}
                max={1000000}
                defaultValue={String(visibleSetting.threshold)}
                details="An alert is eligible when tracked total inventory is at or below this value."
              />

              <s-select
                label="Repeat cooldown"
                name="cooldownMinutes"
                details="Each channel has its own last-attempt timestamp."
              >
                {ALERT_COOLDOWN_MINUTES.map((minutes) => (
                  <s-option
                    key={minutes}
                    value={String(minutes)}
                    defaultSelected={minutes === visibleSetting.cooldownMinutes}
                  >
                    {cooldownLabel(minutes)}
                  </s-option>
                ))}
              </s-select>
            </s-grid>

            <s-box border="base base solid" borderRadius="large" padding="base">
              <s-stack gap="base">
                <s-heading>Email alerts</s-heading>

                <s-checkbox
                  name="emailEnabled"
                  label="Enable low-stock email alerts"
                  defaultChecked={visibleSetting.emailEnabled}
                  disabled={!canEmail}
                />

                <s-text-area
                  label="Recipients"
                  name="emailRecipients"
                  defaultValue={visibleSetting.emailRecipients}
                  disabled={!canEmail}
                  placeholder="ops@example.com&#10;inventory@example.com"
                  details="Enter one recipient per line."
                />

                {!canEmail ? (
                  <s-text color="subdued">
                    Low-stock email alerts are not included in the current plan.
                  </s-text>
                ) : null}
              </s-stack>
            </s-box>

            <s-box border="base base solid" borderRadius="large" padding="base">
              <s-stack gap="base">
                <s-heading>Slack alerts</s-heading>

                <s-checkbox
                  name="slackEnabled"
                  label="Enable Slack incoming-webhook alerts"
                  defaultChecked={visibleSetting.slackEnabled}
                  disabled={!canSlack}
                />

                <s-password-field
                  label="Slack incoming webhook"
                  name="slackWebhookUrl"
                  autocomplete="off"
                  disabled={!canSlack}
                  placeholder={
                    visibleSetting.slackWebhookConfigured
                      ? "Configured — enter a new URL only to replace it"
                      : "https://hooks.slack.com/services/..."
                  }
                />

                <s-checkbox
                  name="clearSlackWebhook"
                  label="Remove the stored Slack webhook"
                  disabled={!canSlack || !visibleSetting.slackWebhookConfigured}
                />

                <s-text color="subdued">
                  Stored Slack webhook:{" "}
                  {visibleSetting.slackWebhookConfigured
                    ? "configured and encrypted"
                    : "not configured"}. The secret is never returned to this page.
                </s-text>

                {!canSlack ? (
                  <s-text color="subdued">
                    Slack alerts require a plan that includes Slack notifications.
                  </s-text>
                ) : null}
              </s-stack>
            </s-box>

            <BrandButton
              type="submit"
              variant="primary"
              loading={busy}
              disabled={busy}
            >
              Save alert settings
            </BrandButton>
          </s-stack>
        </form>
      </s-section>

      <s-section heading="Delivery behavior">
        <s-stack gap="base">
          <s-text>
            Inventory and product webhooks enqueue low-stock evaluation beside
            the existing sorting and visibility work. Notification delivery
            errors are recorded separately and do not fail collection sorting.
          </s-text>
          <s-text>
            A product that remains below the threshold can alert again only
            after the channel cooldown. Restocking above the threshold resets
            the next low-stock crossing.
          </s-text>
        </s-stack>
      </s-section>
    </PageShell>
  );
}
