export const PHASE5_OPTION_IDS = Object.freeze({
  scheduledAutomation: "OPT-SCHEDULED-AUTOMATION",
  ruleBuilder: "OPT-RULE-BUILDER",
} as const);

export const AUTOMATION_SCHEDULE_MINUTES = Object.freeze([
  60,
  360,
  720,
  1440,
] as const);

export type AutomationRuleInput = {
  name: string;
  collectionId: string;
  enabled: boolean;
  scheduleMinutes: number | null;
  minSoldOutProducts: number | null;
  minSoldOutPercent: number | null;
  minTotalProducts: number | null;
};

function optionalInteger(
  value: string | number | null | undefined,
  min: number,
  max: number,
) {
  if (value == null || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`Expected an integer between ${min} and ${max}.`);
  }
  return parsed;
}

export function normalizeAutomationRuleInput(
  input: Partial<Record<keyof AutomationRuleInput, unknown>>,
): AutomationRuleInput {
  const name = String(input.name ?? "").trim().slice(0, 120);
  const collectionId = String(input.collectionId ?? "").trim();
  const rawSchedule = input.scheduleMinutes;

  if (!name) throw new Error("Rule name is required.");
  if (!collectionId.startsWith("gid://shopify/Collection/")) {
    throw new Error("A valid Shopify collection is required.");
  }

  const scheduleMinutes =
    rawSchedule == null || rawSchedule === ""
      ? null
      : optionalInteger(
          rawSchedule as string | number,
          AUTOMATION_SCHEDULE_MINUTES[0],
          AUTOMATION_SCHEDULE_MINUTES[AUTOMATION_SCHEDULE_MINUTES.length - 1],
        );

  if (
    scheduleMinutes !== null &&
    !AUTOMATION_SCHEDULE_MINUTES.includes(
      scheduleMinutes as (typeof AUTOMATION_SCHEDULE_MINUTES)[number],
    )
  ) {
    throw new Error("Unsupported automation schedule interval.");
  }

  return {
    name,
    collectionId,
    enabled: input.enabled !== false,
    scheduleMinutes,
    minSoldOutProducts: optionalInteger(
      input.minSoldOutProducts as string | number | null | undefined,
      0,
      1000000,
    ),
    minSoldOutPercent: optionalInteger(
      input.minSoldOutPercent as string | number | null | undefined,
      0,
      100,
    ),
    minTotalProducts: optionalInteger(
      input.minTotalProducts as string | number | null | undefined,
      0,
      1000000,
    ),
  };
}

export function hasAdvancedAutomationConditions(
  input: Pick<
    AutomationRuleInput,
    "minSoldOutProducts" | "minSoldOutPercent" | "minTotalProducts"
  >,
) {
  return (
    input.minSoldOutProducts !== null ||
    input.minSoldOutPercent !== null ||
    input.minTotalProducts !== null
  );
}

export function assertAutomationRuleEntitlements(
  input: AutomationRuleInput,
  optionIds: readonly string[],
) {
  if (!optionIds.includes(PHASE5_OPTION_IDS.scheduledAutomation)) {
    throw new Error(
      "Your current plan does not include scheduled automation.",
    );
  }

  if (
    hasAdvancedAutomationConditions(input) &&
    !optionIds.includes(PHASE5_OPTION_IDS.ruleBuilder)
  ) {
    throw new Error(
      "Your current plan does not include the advanced rule builder.",
    );
  }
}

export function describeAutomationConditions(
  input: Pick<
    AutomationRuleInput,
    "minSoldOutProducts" | "minSoldOutPercent" | "minTotalProducts"
  >,
) {
  const parts: string[] = [];

  if (input.minSoldOutProducts !== null) {
    parts.push(`sold-out products ≥ ${input.minSoldOutProducts}`);
  }
  if (input.minSoldOutPercent !== null) {
    parts.push(`sold-out percentage ≥ ${input.minSoldOutPercent}%`);
  }
  if (input.minTotalProducts !== null) {
    parts.push(`total products ≥ ${input.minTotalProducts}`);
  }

  return parts.length ? parts.join(" AND ") : "Always";
}
