export const PHASE7_OPTION_IDS = Object.freeze({
  markets: "OPT-MARKETS",
  b2bCatalogs: "OPT-B2B-CATALOGS",
  salesChannelRules: "OPT-SALES-CHANNEL-RULES",
} as const);

export const CONTEXT_TARGET_TYPES = Object.freeze([
  "MARKET",
  "COMPANY_LOCATION",
  "SALES_CHANNEL",
] as const);

export type ContextTargetType =
  (typeof CONTEXT_TARGET_TYPES)[number];

export type ContextRuleInput = {
  targetType: ContextTargetType;
  publicationId: string;
  targetTitle: string;
  enabled: boolean;
  autoRestore: boolean;
};

export function optionIdForTargetType(targetType: ContextTargetType) {
  if (targetType === "MARKET") return PHASE7_OPTION_IDS.markets;
  if (targetType === "COMPANY_LOCATION") {
    return PHASE7_OPTION_IDS.b2bCatalogs;
  }
  return PHASE7_OPTION_IDS.salesChannelRules;
}

export function normalizeContextTargetType(value: unknown): ContextTargetType {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (
    CONTEXT_TARGET_TYPES.includes(
      normalized as ContextTargetType,
    )
  ) {
    return normalized as ContextTargetType;
  }
  throw new Error("Unsupported commerce context type.");
}

export function normalizeContextRuleInput(
  input: Partial<Record<keyof ContextRuleInput, unknown>>,
): ContextRuleInput {
  const targetType = normalizeContextTargetType(input.targetType);
  const publicationId = String(input.publicationId ?? "").trim();
  const targetTitle = String(input.targetTitle ?? "").trim().slice(0, 180);

  if (!publicationId.startsWith("gid://shopify/Publication/")) {
    throw new Error("A valid Shopify publication is required.");
  }
  if (!targetTitle) {
    throw new Error("Commerce context title is required.");
  }

  return {
    targetType,
    publicationId,
    targetTitle,
    enabled: input.enabled !== false,
    autoRestore: input.autoRestore !== false,
  };
}

export function assertContextRuleEntitlement(
  targetType: ContextTargetType,
  optionIds: readonly string[],
) {
  const optionId = optionIdForTargetType(targetType);
  if (!optionIds.includes(optionId)) {
    throw new Error(
      "Your current plan does not include this commerce context rule.",
    );
  }
}
