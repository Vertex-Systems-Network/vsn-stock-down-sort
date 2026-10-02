export const PHASE4_OPTION_IDS = Object.freeze({
  analytics: "OPT-ANALYTICS",
  activityHistory: "OPT-ACTIVITY-HISTORY",
  csvExport: "OPT-CSV-EXPORT",
} as const);

export type Phase4OptionId =
  (typeof PHASE4_OPTION_IDS)[keyof typeof PHASE4_OPTION_IDS];

export function hasPhase4Entitlement(
  optionIds: readonly string[],
  optionId: Phase4OptionId,
) {
  return optionIds.includes(optionId);
}

export function assertPhase4Entitlement(
  optionIds: readonly string[],
  optionId: Phase4OptionId,
  label: string,
) {
  if (!hasPhase4Entitlement(optionIds, optionId)) {
    throw new Error(`Your current plan does not include ${label}.`);
  }
}
