import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import {
  useActionData,
  useLoaderData,
  useNavigation,
} from "react-router";
import { authenticate } from "../shopify.server";
import { withPrismaClient } from "../db.server";
import { getCurrentSubscriptionPlan } from "../services/billing.server";
import { listAllCollections } from "../services/collection-sorter.server";
import {
  AUTOMATION_SCHEDULE_MINUTES,
  PHASE5_OPTION_IDS,
  describeAutomationConditions,
} from "../services/automation";
import {
  deleteAutomationRule,
  executeAutomationRule,
  listAutomationRules,
  saveAutomationRule,
  setAutomationRuleEnabled,
} from "../services/automation.server";
import { PageShell } from "../components/BrandUi";

export async function loader({ request }: LoaderFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);
  const current = await getCurrentSubscriptionPlan(admin);
  const optionIds = current?.plan.option_ids ?? [];

  const [collections, enabledSettings, rules] = await Promise.all([
    listAllCollections(admin),
    withPrismaClient((db) =>
      db.collectionSetting.findMany({
        where: { shop: session.shop, enabled: true },
        select: { collectionId: true },
      }),
    ),
    listAutomationRules(session.shop),
  ]);

  const enabledIds = new Set(
    enabledSettings.map((setting) => setting.collectionId),
  );

  return {
    currentPlan: current
      ? {
          id: current.plan.id,
          name: current.plan.name,
        }
      : null,
    canSchedule: optionIds.includes(PHASE5_OPTION_IDS.scheduledAutomation),
    canUseRuleBuilder: optionIds.includes(PHASE5_OPTION_IDS.ruleBuilder),
    collections: collections
      .filter((collection) => enabledIds.has(collection.id))
      .map((collection) => ({
        id: collection.id,
        title: collection.title,
        handle: collection.handle,
      })),
    rules: rules.map((rule) => ({
      ...rule,
      conditionSummary: describeAutomationConditions(rule),
    })),
  };
}

export async function action({ request }: ActionFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);
  const current = await getCurrentSubscriptionPlan(admin);

  if (!current) {
    return {
      ok: false,
      message:
        "An active VSN Stock Down Sort subscription is required to manage automation.",
    };
  }

  const formData = await request.formData();
  const intent = String(formData.get("intent") || "");
  const ruleId = String(formData.get("ruleId") || "").trim();

  try {
    if (intent === "save") {
      const rule = await saveAutomationRule(
        admin,
        session.shop,
        ruleId || null,
        {
          name: String(formData.get("name") || ""),
          collectionId: String(formData.get("collectionId") || ""),
          enabled: formData.get("enabled") === "on",
          scheduleMinutes: String(formData.get("scheduleMinutes") || ""),
          minSoldOutProducts: String(
            formData.get("minSoldOutProducts") || "",
          ),
          minSoldOutPercent: String(
            formData.get("minSoldOutPercent") || "",
          ),
          minTotalProducts: String(formData.get("minTotalProducts") || ""),
        },
        current.plan.option_ids,
      );

      return {
        ok: true,
        message: ruleId
          ? "Automation rule updated."
          : "Automation rule created.",
        ruleId: rule.id,
      };
    }

    if (intent === "toggle" && ruleId) {
      const enabled = formData.get("enabled") === "true";
      await setAutomationRuleEnabled(
        admin,
        session.shop,
        ruleId,
        enabled,
        current.plan.option_ids,
      );

      return {
        ok: true,
        message: enabled
          ? "Automation rule enabled."
          : "Automation rule paused.",
        ruleId,
      };
    }

    if (intent === "run" && ruleId) {
      const result = await executeAutomationRule(
        admin,
        session.shop,
        ruleId,
        current.plan.option_ids,
        "manual",
      );

      if (result.outcome === "SUCCESS") {
        return {
          ok: true,
          message: "Rule conditions matched and collection sorting ran.",
          ruleId,
        };
      }

      if (result.outcome === "SKIPPED") {
        return {
          ok: true,
          message:
            "Rule checked live stock but conditions did not match, so sorting was skipped.",
          ruleId,
        };
      }

      return {
        ok: false,
        message:
          result.error ||
          "The automation rule could not run.",
        ruleId,
      };
    }

    if (intent === "delete" && ruleId) {
      await deleteAutomationRule(session.shop, ruleId);
      return {
        ok: true,
        message: "Automation rule deleted.",
        ruleId,
      };
    }

    return { ok: false, message: "Unknown automation action." };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error ? error.message : "Automation action failed.",
      ruleId: ruleId || null,
    };
  }
}

function formatDate(value: string | Date | null | undefined) {
  if (!value) return "Never";
  return new Date(value).toLocaleString();
}

function scheduleLabel(value: number | null) {
  if (value === null) return "Manual only";
  if (value === 60) return "Every hour";
  if (value === 360) return "Every 6 hours";
  if (value === 720) return "Every 12 hours";
  if (value === 1440) return "Every day";
  return `Every ${value} minutes`;
}

type CollectionOption = {
  id: string;
  title: string;
  handle: string;
};

function RuleFields({
  collections,
  canUseRuleBuilder,
  defaults,
}: {
  collections: CollectionOption[];
  canUseRuleBuilder: boolean;
  defaults?: {
    name?: string;
    collectionId?: string;
    enabled?: boolean;
    scheduleMinutes?: number | null;
    minSoldOutProducts?: number | null;
    minSoldOutPercent?: number | null;
    minTotalProducts?: number | null;
  };
}) {
  return (
    <s-stack gap="base">
      <s-text-field
        label="Rule name"
        name="name"
        required
        maxLength={120}
        defaultValue={defaults?.name ?? ""}
        placeholder="Daily stock cleanup"
      />

      <s-select
        label="Enabled collection"
        name="collectionId"
        required
        details="Only collections currently enabled in VSN Stock Down Sort can be targeted."
      >
        <s-option
          value=""
          disabled
          defaultSelected={!defaults?.collectionId}
        >
          Select a collection
        </s-option>
        {collections.map((collection) => (
          <s-option
            key={collection.id}
            value={collection.id}
            defaultSelected={defaults?.collectionId === collection.id}
          >
            {collection.title} /{collection.handle}
          </s-option>
        ))}
      </s-select>

      <s-select
        label="Schedule"
        name="scheduleMinutes"
        details="Hosted schedules are checked hourly by the Cloudflare Worker. Local development supports manual Run now only."
      >
        <s-option
          value=""
          defaultSelected={defaults?.scheduleMinutes == null}
        >
          Manual only
        </s-option>
        {AUTOMATION_SCHEDULE_MINUTES.map((minutes) => (
          <s-option
            key={minutes}
            value={String(minutes)}
            defaultSelected={defaults?.scheduleMinutes === minutes}
          >
            {scheduleLabel(minutes)}
          </s-option>
        ))}
      </s-select>

      <s-checkbox
        name="enabled"
        label="Enable this rule"
        defaultChecked={defaults?.enabled ?? true}
      />

      <s-box background="subdued" borderRadius="large" padding="base">
        <s-stack gap="small-200">
          <s-text type="strong">IF / AND conditions</s-text>
          <s-text>
            Leave every condition blank to run whenever the schedule is due.
            Advanced conditions require Pro or Unlimited.
          </s-text>

          <s-grid
            gridTemplateColumns="repeat(auto-fit, minmax(190px, 1fr))"
            gap="base"
          >
            <s-number-field
              label="Sold-out products ≥"
              min={0}
              max={1000000}
              name="minSoldOutProducts"
              defaultValue={
                defaults?.minSoldOutProducts == null
                  ? ""
                  : String(defaults.minSoldOutProducts)
              }
              disabled={!canUseRuleBuilder}
            />

            <s-number-field
              label="Sold-out percentage ≥"
              min={0}
              max={100}
              name="minSoldOutPercent"
              defaultValue={
                defaults?.minSoldOutPercent == null
                  ? ""
                  : String(defaults.minSoldOutPercent)
              }
              disabled={!canUseRuleBuilder}
              suffix="%"
            />

            <s-number-field
              label="Total products ≥"
              min={0}
              max={1000000}
              name="minTotalProducts"
              defaultValue={
                defaults?.minTotalProducts == null
                  ? ""
                  : String(defaults.minTotalProducts)
              }
              disabled={!canUseRuleBuilder}
            />
          </s-grid>

          {!canUseRuleBuilder ? (
            <s-text color="subdued">
              Your current plan includes scheduling but not the advanced rule
              builder. The rule therefore runs without stock predicates.
            </s-text>
          ) : null}
        </s-stack>
      </s-box>
    </s-stack>
  );
}

export default function AutomationPage() {
  const {
    currentPlan,
    canSchedule,
    canUseRuleBuilder,
    collections,
    rules,
  } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const busy = navigation.state !== "idle";
  const submittedRuleId = String(
    navigation.formData?.get("ruleId") || "",
  );
  const submittedIntent = String(
    navigation.formData?.get("intent") || "",
  );

  return (
    <PageShell heading="Automation">
      <s-section heading="Overview">
        <s-stack gap="base">
          <s-text>
            Schedule the existing VSN collection sorting engine and optionally
            add IF/AND stock conditions evaluated from live Shopify inventory.
          </s-text>

          <s-stack direction="inline" gap="base">
            {currentPlan ? (
              <s-badge tone="info">{currentPlan.name} plan</s-badge>
            ) : null}
            <s-badge tone={canSchedule ? "success" : "warning"}>
              {canSchedule ? "Scheduling available" : "Scheduling locked"}
            </s-badge>
            <s-badge tone={canUseRuleBuilder ? "success" : "info"}>
              {canUseRuleBuilder ? "Rule builder available" : "Basic schedule"}
            </s-badge>
          </s-stack>

          <s-text color="subdued">
            Hosted Staging/Production Workers check due rules hourly. A due
            rule uses a database lease before execution to prevent duplicate
            concurrent runs. Local development only supports manual Run now.
          </s-text>
        </s-stack>
      </s-section>

      {actionData?.message ? (
        <s-banner
          tone={actionData.ok ? "success" : "critical"}
          heading={actionData.ok ? "Automation updated" : "Automation failed"}
          dismissible
        >
          {actionData.message}
        </s-banner>
      ) : null}

      {!canSchedule ? (
        <s-section>
          <s-banner tone="warning">
            Your current plan does not include scheduled automation.
          </s-banner>
        </s-section>
      ) : collections.length === 0 ? (
        <s-section>
          <s-banner tone="warning">
            Enable at least one collection on the Collections page before
            creating an automation rule.
          </s-banner>
        </s-section>
      ) : (
        <s-section heading="Create automation rule">
          <form method="post">
            <input type="hidden" name="intent" value="save" />
            <RuleFields
              collections={collections}
              canUseRuleBuilder={canUseRuleBuilder}
            />
            <s-button
                type="submit"
                variant="primary"
                loading={busy && submittedIntent === "save" && !submittedRuleId}
                disabled={busy}
              >
                Create rule
              </s-button>
          </form>
        </s-section>
      )}

      <s-section heading="Existing rules">
        {rules.length === 0 ? (
          <s-text color="subdued">No automation rules have been created yet.</s-text>
        ) : (
          <s-stack gap="large-200">
            {rules.map((rule) => {
              const rowBusy = busy && submittedRuleId === rule.id;
              const target = collections.find(
                (collection) => collection.id === rule.collectionId,
              );

              return (
                <s-box
                  key={rule.id}
                  border="base base solid"
                  borderRadius="large"
                  padding="base"
                >
                  <s-stack gap="base">
                    <s-stack direction="inline" gap="base">
                      <s-heading>{rule.name}</s-heading>
                      <s-badge tone={rule.enabled ? "success" : "warning"}>
                        {rule.enabled ? "Enabled" : "Paused"}
                      </s-badge>
                      <s-badge>{scheduleLabel(rule.scheduleMinutes)}</s-badge>
                    </s-stack>

                    <s-text>
                      Collection:{" "}
                      {target
                        ? `${target.title} /${target.handle}`
                        : rule.collectionId}
                    </s-text>
                    <s-text>Conditions: {rule.conditionSummary}</s-text>
                    <s-text color="subdued">
                      Next run: {formatDate(rule.nextRunAt)} · Last run:{" "}
                      {formatDate(rule.lastRunAt)} · Last outcome:{" "}
                      {rule.lastOutcome ?? "Never"}
                    </s-text>

                    {rule.lastError ? (
                      <s-banner tone="critical">{rule.lastError}</s-banner>
                    ) : null}

                    {target && canSchedule ? (
                      <form method="post">
                        <input type="hidden" name="intent" value="save" />
                        <input type="hidden" name="ruleId" value={rule.id} />
                        <RuleFields
                          collections={collections}
                          canUseRuleBuilder={canUseRuleBuilder}
                          defaults={{
                            name: rule.name,
                            collectionId: rule.collectionId,
                            enabled: rule.enabled,
                            scheduleMinutes: rule.scheduleMinutes,
                            minSoldOutProducts: rule.minSoldOutProducts,
                            minSoldOutPercent: rule.minSoldOutPercent,
                            minTotalProducts: rule.minTotalProducts,
                          }}
                        />
                        <s-button
                          type="submit"
                          variant="secondary"
                          loading={rowBusy && submittedIntent === "save"}
                          disabled={busy}
                        >
                          Save changes
                        </s-button>
                      </form>
                    ) : target ? null : (
                      <s-banner tone="warning">
                        This rule&apos;s collection is no longer enabled. Re-enable
                        the collection or delete the rule.
                      </s-banner>
                    )}

                    <s-button-group>
                      <form method="post">
                        <input type="hidden" name="intent" value="run" />
                        <input type="hidden" name="ruleId" value={rule.id} />
                        <s-button
                          type="submit"
                          variant="primary"
                          loading={rowBusy && submittedIntent === "run"}
                          disabled={busy || !target}
                        >
                          Run now
                        </s-button>
                      </form>

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
                          loading={rowBusy && submittedIntent === "toggle"}
                          disabled={busy || (!target && !rule.enabled)}
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
                          loading={rowBusy && submittedIntent === "delete"}
                          disabled={busy}
                        >
                          Delete
                        </s-button>
                      </form>
                    </s-button-group>
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
